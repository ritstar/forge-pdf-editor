'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FilePlus2,
  FileText,
  LogOut,
  Moon,
  PenTool,
  RefreshCw,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ForgeLogo from './ForgeLogo';

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
  const [deletingDocId, setDeletingDocId] = useState('');
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.getAttribute('data-theme') || 'light';
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('forge-theme', theme);
    }
  }, [theme]);

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
        .select('id, title, status, updated_at, created_at, file_path')
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

  const removeDraftAssets = async (ownerId, docId) => {
    const prefix = `${ownerId}/${docId}`;
    const { data: files, error: listError } = await supabase.storage.from('draft_assets').list(prefix, {
      limit: 1000,
    });
    if (listError || !files?.length) return;

    const paths = files.map((file) => `${prefix}/${file.name}`);
    await supabase.storage.from('draft_assets').remove(paths);
  };

  const handleDeleteDocument = async (doc) => {
    if (!user?.id) {
      setError('Missing user session. Please sign in again.');
      return;
    }

    setError('');
    setDeletingDocId(doc.id);

    try {
      if (doc.file_path) {
        await supabase.storage.from('documents').remove([doc.file_path]);
      }

      await removeDraftAssets(user.id, doc.id);

      const { error: deleteError } = await supabase.from('documents').delete().eq('id', doc.id);
      if (deleteError) throw deleteError;

      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
      setPendingDeleteDoc(null);
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete draft.');
    } finally {
      setDeletingDocId('');
    }
  };

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'there';
  const latestDoc = documents[0] || null;
  const activeThisWeek = documents.filter((doc) => {
    const updatedAt = new Date(doc.updated_at).getTime();
    return Date.now() - updatedAt < 7 * 24 * 60 * 60 * 1000;
  }).length;
  const draftCount = documents.filter((doc) => (doc.status || '').toLowerCase() === 'draft').length;
  const checklist = [
    {
      id: 'upload',
      label: 'Upload your first PDF',
      done: documents.length > 0,
    },
    {
      id: 'draft',
      label: 'Create at least one draft',
      done: draftCount > 0,
    },
    {
      id: 'return',
      label: 'Return and resume a draft',
      done: documents.length > 1 || activeThisWeek > 0,
    },
  ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <ForgeLogo href="/app" className="dashboard-logo" />
          <p className="eyebrow">Workspace</p>
          <h1>Hi {displayName}</h1>
          <p className="muted">
            This is your PDF editor workspace. Upload a PDF, edit with text/images/signatures, and resume drafts anytime.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="ghost-btn"
            type="button"
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
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
          <p className="muted small">PDF files in workspace</p>
          <h3>{documents.length}</h3>
        </article>
        <article className="stat-card">
          <p className="muted small">PDF drafts in progress</p>
          <h3>{draftCount}</h3>
        </article>
        <article className="stat-card">
          <p className="muted small">Active this week</p>
          <h3>{activeThisWeek}</h3>
        </article>
        <article className="stat-card">
          <p className="muted small">Continue editing</p>
          {latestDoc ? (
            <Link href={`/editor/${latestDoc.id}`} className="ghost-btn">
              Open latest PDF draft
            </Link>
          ) : (
            <p className="muted small">No PDF draft yet</p>
          )}
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-panel">
          <h2>
            <Sparkles size={18} /> What You Can Do
          </h2>
          <div className="capability-list">
            <span className="capability-chip">Fill & Sign forms</span>
            <span className="capability-chip">Quick Fill for non-form PDFs</span>
            <span className="capability-chip">Saved signatures per user</span>
            <span className="capability-chip">Autosaved drafts</span>
            <span className="capability-chip">Export PDF / PNG / JPG</span>
            <span className="capability-chip">Drag, resize, duplicate layers</span>
          </div>
        </article>

        <article className="dashboard-panel">
          <h2>
            <CheckCircle2 size={18} /> Getting Started
          </h2>
          <ul className="checklist">
            {checklist.map((item) => (
              <li key={item.id} className={item.done ? 'done' : ''}>
                <CheckCircle2 size={16} />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
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
        <p className="muted small">
          Upload a PDF to start editing. Your changes are autosaved as a private draft in your account.
        </p>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="docs-grid">
        <div className="docs-header">
          <h2>Recent Documents</h2>
          <p className="muted small">Open, continue, or delete drafts from here.</p>
        </div>
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
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => setPendingDeleteDoc(doc)}
                  disabled={deletingDocId === doc.id}
                >
                  <Trash2 size={16} /> {deletingDocId === doc.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="muted">No PDFs yet. Upload your first PDF and start editing.</p>
        )}
      </section>

      {pendingDeleteDoc ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPendingDeleteDoc(null)}>
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-draft-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="delete-draft-title">Delete Draft?</h3>
            <p className="muted">
              This will permanently remove <strong>{pendingDeleteDoc.title}</strong> and all associated draft data.
            </p>
            <div className="stack">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setPendingDeleteDoc(null)}
                disabled={deletingDocId === pendingDeleteDoc.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => handleDeleteDocument(pendingDeleteDoc)}
                disabled={deletingDocId === pendingDeleteDoc.id}
              >
                <Trash2 size={16} /> {deletingDocId === pendingDeleteDoc.id ? 'Deleting...' : 'Delete Draft'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
