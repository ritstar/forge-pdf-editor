'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { FilePlus2, FileText, LogOut, PenTool, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
}

export default function DashboardClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError('');

      const {
        data: { user: activeUser },
      } = await supabase.auth.getUser();

      if (!activeUser) {
        router.replace('/login');
        return;
      }

      const { data, error: docsError } = await supabase
        .from('documents')
        .select('id, title, status, updated_at, created_at')
        .order('updated_at', { ascending: false });

      if (!mounted) return;

      setUser(activeUser);
      if (docsError) {
        setError(docsError.message);
      } else {
        setDocuments(data ?? []);
      }
      setLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  const uploadDocument = async (file) => {
    if (!user || !file) return;
    if (!user.id) {
      setError('Your session is missing a user id. Please sign out and sign in again.');
      return;
    }
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }

    setUploading(true);
    setError('');

    const cleanName = sanitizeName(file.name);
    const storagePath = `${user.id}/${crypto.randomUUID()}-${cleanName}`;

    const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        status: 'draft',
      })
      .select('id')
      .single();

    setUploading(false);

    if (insertError || !inserted?.id) {
      setError(insertError?.message || 'Failed to create document entry.');
      return;
    }

    router.push(`/editor/${inserted.id}`);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'there';
  const latestDoc = documents[0] || null;
  const draftCount = documents.filter((doc) => (doc.status || '').toLowerCase() === 'draft').length;

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Hi {displayName}</h1>
          <p className="muted">Upload PDFs, resume drafts, and reuse saved signatures.</p>
        </div>
        <div className="header-actions">
          <button className="ghost-btn" onClick={() => router.refresh()}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button className="ghost-btn" onClick={handleSignOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <p className="muted small">Total documents</p>
          <h3>{documents.length}</h3>
        </article>
        <article className="stat-card">
          <p className="muted small">Drafts in progress</p>
          <h3>{draftCount}</h3>
        </article>
        <article className="stat-card">
          <p className="muted small">Quick continue</p>
          {latestDoc ? (
            <Link href={`/editor/${latestDoc.id}`} className="ghost-btn">
              Open latest draft
            </Link>
          ) : (
            <p className="muted small">No draft yet</p>
          )}
        </article>
      </section>

      <section className="dashboard-upload-card">
        <label className="primary-btn" htmlFor="dashboard-pdf-upload" aria-disabled={uploading}>
          <FilePlus2 size={16} /> {uploading ? 'Uploading...' : 'Upload New PDF'}
        </label>
        <input
          id="dashboard-pdf-upload"
          type="file"
          accept="application/pdf"
          hidden
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            uploadDocument(file);
          }}
        />
        <p className="muted small">Every upload becomes a private draft linked to your account.</p>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="docs-grid">
        {loading ? (
          <p className="muted">Loading documents...</p>
        ) : documents.length ? (
          documents.map((doc) => (
            <article className="doc-card" key={doc.id}>
              <div className="doc-meta">
                <FileText size={18} />
                <div>
                  <h3>{doc.title}</h3>
                  <p className="muted small">Updated {new Date(doc.updated_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="doc-actions">
                <span className="chip">{doc.status || 'draft'}</span>
                <Link href={`/editor/${doc.id}`} className="action-btn">
                  <PenTool size={16} /> Open Editor
                </Link>
              </div>
            </article>
          ))
        ) : (
          <p className="muted">No documents yet. Upload your first PDF to begin.</p>
        )}
      </section>
    </main>
  );
}
