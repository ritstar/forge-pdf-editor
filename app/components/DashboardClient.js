'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import AppHeader, { AppFooter } from './AppHeader';
import DashboardView from './DashboardView';
import { sanitizeName } from '@/lib/sanitize';
import { deleteBlobs, uploadToBlob } from '@/lib/blobClient';
import { isPdfFile } from '@/app/utils/files';

export default function DashboardClient() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState('');
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(null);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (activeUser) => {
    setLoading(true);
    setError('');

    try {
      // Independent queries: run them in parallel.
      const [docsSnap, historySnap] = await Promise.all([
        getDocs(query(
          collection(db, 'documents'),
          where('user_id', '==', activeUser.uid),
          orderBy('updated_at', 'desc'),
        )),
        getDocs(query(
          collection(db, 'tool_history'),
          where('user_id', '==', activeUser.uid),
          orderBy('created_at', 'desc'),
          limit(10),
        )),
      ]);
      setDocuments(docsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setHistory(historySnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError('Failed to load your documents. Please try refreshing.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (activeUser) => {
      if (!activeUser) {
        router.replace('/login');
        return;
      }

      setUser(activeUser);
      loadDashboard(activeUser);
    });

    return () => unsubscribe();
  }, [loadDashboard, router]);

  const uploadDocument = async (file) => {
    if (!user || !file) return;
    if (!isPdfFile(file)) {
      setError('Please upload a PDF file.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const cleanName = sanitizeName(file.name.replace(/\.pdf$/i, '')) + '.pdf';
      const blobPath = `documents/${user.uid}/${crypto.randomUUID()}-${cleanName}`;
      const blob = await uploadToBlob(blobPath, file, 'application/pdf');

      const docRef = await addDoc(collection(db, 'documents'), {
        user_id: user.uid,
        title: file.name,
        file_path: blob.url,
        file_size: file.size,
        mime_type: 'application/pdf',
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Clear state before routing
      setUploading(false);
      router.push(`/editor/${docRef.id}`);
    } catch (err) {
      console.error('Upload Error:', err);
      setUploading(false);
      setError(err.message || 'Failed to upload document. Check console for details.');
    }
  };

  const handleDeleteDocument = async (docItem) => {
    if (!user?.uid) {
      setError('Missing user session. Please sign in again.');
      return;
    }

    setError('');
    setDeletingDocId(docItem.id);

    try {
      // The draft must go before its parent: its security rule reads the parent document.
      const draftRef = doc(db, 'documents', docItem.id, 'drafts', 'current');
      const draftSnap = await getDoc(draftRef).catch(() => null);
      const draftAssetUrls = (draftSnap?.data()?.editor_state?.elements || [])
        .filter((item) => item?.type === 'image' && item.assetBucket === 'draft_assets')
        .map((item) => item.storagePath || item.url);
      if (draftSnap?.exists()) await deleteDoc(draftRef);

      await deleteDoc(doc(db, 'documents', docItem.id));

      // Storage cleanup is best-effort; the document is already gone for the user.
      deleteBlobs([docItem.file_path, ...draftAssetUrls]).catch((err) => {
        console.error('Failed to delete stored files:', err);
      });

      setDocuments((prev) => prev.filter((item) => item.id !== docItem.id));
      setPendingDeleteDoc(null);
    } catch (deleteError) {
      console.error('Delete error:', deleteError);
      setError(deleteError.message || 'Failed to delete draft.');
    } finally {
      setDeletingDocId('');
    }
  };

  return (
    <div className="app-page">
      <AppHeader />
      <main className="app-main">
        <DashboardView
          user={user}
          documents={documents}
          history={history}
          loading={loading}
          uploading={uploading}
          error={error}
          deletingDocId={deletingDocId}
          pendingDeleteDoc={pendingDeleteDoc}
          onUpload={uploadDocument}
          onRequestDelete={setPendingDeleteDoc}
          onCancelDelete={() => setPendingDeleteDoc(null)}
          onConfirmDelete={handleDeleteDocument}
        />
      </main>
      <AppFooter />
    </div>
  );
}
