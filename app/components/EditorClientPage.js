'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc as firestoreDeleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { sanitizeName } from '@/lib/sanitize';
import { deleteBlobs, uploadToBlob } from '@/lib/blobClient';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { FileWarning, Loader2 } from 'lucide-react';

const ForgeEditor = dynamic(() => import('./ForgeEditor'), {
  ssr: false,
  loading: () => <EditorSplash />,
});

function EditorSplash({ children }) {
  return (
    <main className="editor" style={{ gridTemplateRows: '1fr' }}>
      <div className="editor-loading">
        {children || (
          <>
            <Loader2 size={22} className="spin" />
            <span>Opening editor…</span>
          </>
        )}
      </div>
    </main>
  );
}

export default function EditorClientPage({ documentId }) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [documentRow, setDocumentRow] = useState(null);
  const [initialPdfFile, setInitialPdfFile] = useState(null);
  const [initialDraft, setInitialDraft] = useState(null);
  const [signatures, setSignatures] = useState([]);

  const isValidDocumentId = typeof documentId === 'string' && documentId.length > 0;

  const loadData = useCallback(async (activeUser) => {
    if (!isValidDocumentId) {
      setError('Invalid document id. Please return to dashboard and reopen the document.');
      setLoading(false);
      return;
    }

    const loadWorkspace = async (activeUser) => {
      // Fetch the document, draft and signatures in parallel; they are independent.
      const [docSnap, draftSnap, sigSnap] = await Promise.all([
        getDoc(doc(db, 'documents', documentId)),
        getDoc(doc(db, 'documents', documentId, 'drafts', 'current')).catch(() => null),
        getDocs(query(
          collection(db, 'signatures'),
          where('user_id', '==', activeUser.uid),
          orderBy('updated_at', 'desc'),
        )),
      ]);

      if (!docSnap.exists()) {
        setError('Document not found');
        setLoading(false);
        return;
      }

      const docData = { id: docSnap.id, ...docSnap.data() };

      // Get PDF download URL from Vercel Blob (saved directly in file_path)
      const pdfUrl = docData.file_path;
      if (!pdfUrl) {
        setError('Could not access the source PDF.');
        setLoading(false);
        return;
      }

      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        setError('Could not download the source PDF.');
        setLoading(false);
        return;
      }

      const pdfBlob = await pdfResponse.blob();
      const pdfFile = new File([pdfBlob], docData.title || 'document.pdf', {
        type: docData.mime_type || 'application/pdf',
      });

      const rawDraft = draftSnap?.exists() ? draftSnap.data().editor_state || null : null;
      const draftElements = Array.isArray(rawDraft?.elements) ? rawDraft.elements : [];

      // Hydrate draft elements (URLs are already public Vercel Blob URLs, so no mapping needed)
      const hydratedDraft = rawDraft
        ? {
          ...rawDraft,
          elements: draftElements.map((item) => {
            if (item.type !== 'image') return item;
            return {
              ...item,
              url: item.storagePath || item.url, // Fallback for backward compatibility
            };
          }),
        }
        : null;

      const enrichedSignatures = sigSnap.docs.map((s) => {
        const sigData = { id: s.id, ...s.data() };
        return { ...sigData, url: sigData.image_path }; // image_path is now the direct URL
      });

      setUser(activeUser);
      setDocumentRow(docData);
      setInitialPdfFile(pdfFile);
      setInitialDraft(hydratedDraft);
      setSignatures(enrichedSignatures.filter((item) => Boolean(item.url)));
      setLoading(false);
    };

    setLoading(true);
    setError('');

    try {
      await loadWorkspace(activeUser);
    } catch (err) {
      console.error('Failed to load editor workspace:', err);
      setError(
        err?.code === 'permission-denied'
          ? 'This document does not exist or you do not have access to it.'
          : 'Could not load this document. Check your connection and try again.',
      );
      setLoading(false);
    }
  }, [documentId, isValidDocumentId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (activeUser) => {
      if (!activeUser) {
        router.replace('/login');
        return;
      }
      loadData(activeUser);
    });

    return () => unsubscribe();
  }, [loadData, router]);

  const handleSaveDraft = useCallback(
    async (snapshot) => {
      if (!user) return;
      await setDoc(doc(db, 'documents', documentId, 'drafts', 'current'), {
        document_id: documentId,
        user_id: user.uid,
        editor_state: snapshot,
        updated_at: new Date().toISOString(),
      });

      // Update parent document timestamp
      await setDoc(doc(db, 'documents', documentId), {
        status: 'draft',
        updated_at: new Date().toISOString(),
      }, { merge: true });
    },
    [documentId, user],
  );

  const handleUploadOverlay = useCallback(
    async (file) => {
      if (!user) throw new Error('No active user');

      const storagePath = `draft_assets/${user.uid}/${documentId}/${crypto.randomUUID()}-${sanitizeName(file.name)}`;
      const blob = await uploadToBlob(storagePath, file);

      return {
        assetBucket: 'draft_assets',
        storagePath: blob.url,
        url: blob.url,
        mimeType: file.type || 'image/png',
      };
    },
    [documentId, user],
  );

  const handleCreateSignature = useCallback(
    async (file, label) => {
      if (!user) throw new Error('No active user');

      const isPng = file.type === 'image/png';
      const extension = isPng ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `signatures/${user.uid}/${crypto.randomUUID()}-${sanitizeName(label || 'signature')}.${extension}`;
      const blob = await uploadToBlob(path, file);

      const now = new Date().toISOString();
      const record = {
        user_id: user.uid,
        name: label || `Signature ${new Date().toLocaleDateString()}`,
        image_path: blob.url,
        mime_type: file.type || 'image/png',
        is_default: false,
        created_at: now,
        updated_at: now,
      };
      const sigDocRef = await addDoc(collection(db, 'signatures'), record);

      const inserted = { id: sigDocRef.id, ...record, url: blob.url };
      setSignatures((prev) => [inserted, ...prev]);
      return inserted;
    },
    [user],
  );

  const handleDeleteSignature = useCallback(
    async (signature) => {
      await firestoreDeleteDoc(doc(db, 'signatures', signature.id));

      try {
        await deleteBlobs([signature.image_path]);
      } catch (err) {
        console.error('Failed to delete blob signature:', err);
      }

      setSignatures((prev) => prev.filter((item) => item.id !== signature.id));
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    await Promise.allSettled([signOut(auth), fetch('/api/session', { method: 'DELETE' })]);
    router.push('/');
    router.refresh();
  }, [router]);

  if (loading) {
    return <EditorSplash />;
  }

  if (error || !documentRow || !initialPdfFile) {
    return (
      <EditorSplash>
        <div className="empty-state">
          <span className="icon-tile lg" style={{ '--tile': 'var(--danger)' }}><FileWarning size={24} /></span>
          <h3>Can&apos;t open this document</h3>
          <p>{error || 'Unable to load document.'}</p>
          <Link href="/app" className="btn btn-primary">Back to dashboard</Link>
        </div>
      </EditorSplash>
    );
  }

  return (
    <ForgeEditor
      userEmail={user?.email || ''}
      userName={user?.displayName || ''}
      documentTitle={documentRow.title}
      initialPdfFile={initialPdfFile}
      initialDraft={initialDraft}
      signatures={signatures}
      onSaveDraft={handleSaveDraft}
      onUploadOverlay={handleUploadOverlay}
      onCreateSignature={handleCreateSignature}
      onDeleteSignature={handleDeleteSignature}
      onBackToDashboard={() => router.push('/app')}
      onSignOut={handleSignOut}
    />
  );
}
