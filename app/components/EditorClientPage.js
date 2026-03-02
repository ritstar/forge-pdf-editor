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
import dynamic from 'next/dynamic';

const ForgeEditor = dynamic(() => import('./ForgeEditor'), {
  ssr: false,
  loading: () => (
    <main className="dashboard-page">
      <p className="muted">Loading editor interface...</p>
    </main>
  ),
});

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
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

    setLoading(true);
    setError('');

    // Fetch document from Firestore
    const docSnap = await getDoc(doc(db, 'documents', documentId));

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

    // Fetch draft from Firestore subcollection
    const draftSnap = await getDoc(doc(db, 'documents', documentId, 'drafts', 'current'));
    const rawDraft = draftSnap.exists() ? draftSnap.data().editor_state || null : null;
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

    // Fetch signatures
    const sigQuery = query(
      collection(db, 'signatures'),
      where('user_id', '==', activeUser.uid),
      orderBy('updated_at', 'desc'),
    );
    const sigSnap = await getDocs(sigQuery);

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
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);

      const res = await fetch('/api/blob/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to upload image');
      const blob = await res.json();

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

      const path = `signatures/${user.uid}/${crypto.randomUUID()}-${sanitizeName(label || 'signature')}.png`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);

      const res = await fetch('/api/blob/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to upload signature');
      const blob = await res.json();

      const sigDocRef = await addDoc(collection(db, 'signatures'), {
        user_id: user.uid,
        name: label || `Signature ${new Date().toLocaleDateString()}`,
        image_path: blob.url,
        mime_type: file.type || 'image/png',
        is_default: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const inserted = { id: sigDocRef.id, user_id: user.uid, name: label || `Signature ${new Date().toLocaleDateString()}`, image_path: blob.url, mime_type: file.type || 'image/png', url: blob.url };
      setSignatures((prev) => [inserted, ...prev]);
      return inserted;
    },
    [user],
  );

  const handleDeleteSignature = useCallback(
    async (signature) => {
      await firestoreDeleteDoc(doc(db, 'signatures', signature.id));
      
      if (signature.image_path && signature.image_path.includes('public.blob.vercel-storage.com')) {
        try {
          await fetch('/api/blob/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: signature.image_path }),
          });
        } catch (err) {
          console.error('Failed to delete blob signature:', err);
        }
      }
      
      setSignatures((prev) => prev.filter((item) => item.id !== signature.id));
    },
    [],
  );

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    await fetch('/api/session', { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }, [router]);

  if (loading) {
    return (
      <main className="dashboard-page">
        <p className="muted">Loading editor workspace...</p>
      </main>
    );
  }

  if (error || !documentRow || !initialPdfFile) {
    return (
      <main className="dashboard-page">
        <p className="error-text">{error || 'Unable to load document.'}</p>
      </main>
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
