'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ForgeEditor from './ForgeEditor';

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

async function signedUrl(supabase, bucket, path, expiresIn = 60 * 60) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export default function EditorClientPage({ documentId }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [documentRow, setDocumentRow] = useState(null);
  const [initialPdfFile, setInitialPdfFile] = useState(null);
  const [initialDraft, setInitialDraft] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const isValidDocumentId =
    typeof documentId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId);

  const loadData = useCallback(async () => {
    if (!isValidDocumentId) {
      setError('Invalid document id. Please return to dashboard and reopen the document.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const {
      data: { user: activeUser },
    } = await supabase.auth.getUser();

    if (!activeUser) {
      router.replace('/login');
      return;
    }

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      setError(docError?.message || 'Document not found');
      setLoading(false);
      return;
    }

    const pdfUrl = await signedUrl(supabase, 'documents', doc.file_path, 60 * 30);
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
    const pdfFile = new File([pdfBlob], doc.title || 'document.pdf', {
      type: doc.mime_type || 'application/pdf',
    });

    const { data: draftRow } = await supabase
      .from('document_drafts')
      .select('editor_state, updated_at')
      .eq('document_id', documentId)
      .maybeSingle();

    const rawDraft = draftRow?.editor_state || null;
    const draftElements = Array.isArray(rawDraft?.elements) ? rawDraft.elements : [];

    const assetPaths = [...new Set(
      draftElements
        .filter((item) => item.type === 'image' && item.storagePath && item.assetBucket)
        .map((item) => `${item.assetBucket}::${item.storagePath}`),
    )];

    const urlMap = new Map();
    await Promise.all(
      assetPaths.map(async (key) => {
        const [bucket, path] = key.split('::');
        const url = await signedUrl(supabase, bucket, path, 60 * 60 * 24);
        if (url) urlMap.set(key, url);
      }),
    );

    const hydratedDraft = rawDraft
      ? {
          ...rawDraft,
          elements: draftElements.map((item) => {
            if (item.type !== 'image') return item;
            const key = item.storagePath && item.assetBucket ? `${item.assetBucket}::${item.storagePath}` : '';
            return {
              ...item,
              url: key ? urlMap.get(key) || item.url : item.url,
            };
          }),
        }
      : null;

    const { data: sigRows, error: sigError } = await supabase
      .from('signatures')
      .select('*')
      .order('updated_at', { ascending: false });

    if (sigError) {
      setError(sigError.message);
      setLoading(false);
      return;
    }

    const enrichedSignatures = await Promise.all(
      (sigRows || []).map(async (sig) => ({
        ...sig,
        url: await signedUrl(supabase, 'signatures', sig.image_path, 60 * 60 * 24),
      })),
    );

    setUser(activeUser);
    setDocumentRow(doc);
    setInitialPdfFile(pdfFile);
    setInitialDraft(hydratedDraft);
    setSignatures(enrichedSignatures.filter((item) => Boolean(item.url)));
    setLoading(false);
  }, [documentId, isValidDocumentId, router, supabase]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleSaveDraft = useCallback(
    async (snapshot) => {
      if (!user) return;
      const payload = {
        document_id: documentId,
        user_id: user.id,
        editor_state: snapshot,
      };

      const { error: saveError } = await supabase
        .from('document_drafts')
        .upsert(payload, { onConflict: 'document_id' });

      if (saveError) {
        throw saveError;
      }

      await supabase
        .from('documents')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', documentId);
    },
    [documentId, supabase, user],
  );

  const handleUploadOverlay = useCallback(
    async (file) => {
      if (!user) throw new Error('No active user');

      const storagePath = `${user.id}/${documentId}/${crypto.randomUUID()}-${sanitizeName(file.name)}`;

      const { error: uploadError } = await supabase.storage.from('draft_assets').upload(storagePath, file, {
        contentType: file.type || 'image/png',
        upsert: false,
      });

      if (uploadError) {
        throw uploadError;
      }

      const url = await signedUrl(supabase, 'draft_assets', storagePath, 60 * 60 * 24);

      return {
        assetBucket: 'draft_assets',
        storagePath,
        url,
        mimeType: file.type || 'image/png',
      };
    },
    [documentId, supabase, user],
  );

  const handleCreateSignature = useCallback(
    async (file, label) => {
      if (!user) throw new Error('No active user');

      const path = `${user.id}/${crypto.randomUUID()}-${sanitizeName(label || 'signature')}.png`;

      const { error: uploadError } = await supabase.storage.from('signatures').upload(path, file, {
        contentType: file.type || 'image/png',
        upsert: false,
      });

      if (uploadError) {
        throw uploadError;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('signatures')
        .insert({
          user_id: user.id,
          name: label || `Signature ${new Date().toLocaleDateString()}`,
          image_path: path,
          mime_type: file.type || 'image/png',
        })
        .select('*')
        .single();

      if (insertError || !inserted) {
        throw insertError || new Error('Failed to save signature row');
      }

      const url = await signedUrl(supabase, 'signatures', inserted.image_path, 60 * 60 * 24);
      const next = { ...inserted, url };
      setSignatures((prev) => [next, ...prev]);
      return next;
    },
    [supabase, user],
  );

  const handleDeleteSignature = useCallback(
    async (signature) => {
      const { error: deleteRowError } = await supabase.from('signatures').delete().eq('id', signature.id);
      if (deleteRowError) throw deleteRowError;

      await supabase.storage.from('signatures').remove([signature.image_path]);
      setSignatures((prev) => prev.filter((item) => item.id !== signature.id));
    },
    [supabase],
  );

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }, [router, supabase]);

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
