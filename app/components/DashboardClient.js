'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  CheckCircle2,
  FilePlus2,
  FileText,
  LogOut,
  Moon,
  PenTool,
  RefreshCw,
  Sun,
  Trash2,
  MoreVertical,
  Activity
} from 'lucide-react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
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
import ForgeLogo from './ForgeLogo';
import { TOOLS } from '@/lib/toolsData';
import Footer from './Footer';
import { sanitizeName } from '@/lib/sanitize';
import { deleteBlobs, uploadToBlob } from '@/lib/blobClient';
import { isPdfFile } from '@/app/utils/files';
import { useTheme } from '@/app/utils/useTheme';

export default function DashboardClient() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState('');
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [refreshIconKey, setRefreshIconKey] = useState(0);
  const dropdownRef = useRef(null);
  const [theme, toggleTheme] = useTheme();
  const [error, setError] = useState('');

  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleSignOut = async () => {
    await Promise.allSettled([signOut(auth), fetch('/api/session', { method: 'DELETE' })]);
    router.push('/');
    router.refresh();
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

  const displayName =
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'there';
  const availableTools = TOOLS.filter((tool) => tool.id !== 'sign-edit-pdf');

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
            className="ghost-btn theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span className="theme-toggle-label">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
          <button
            className="ghost-btn"
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
            onClick={() => {
              setRefreshIconKey((prev) => prev + 1);
              if (user) loadDashboard(user);
            }}
          >
            <RefreshCw key={refreshIconKey} size={16} className="refresh-spin-once" />
            <span className="action-btn-label">Refresh</span>
          </button>
          <button
            className="ghost-btn"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={16} />
            <span className="action-btn-label">Sign out</span>
          </button>
          <div className="dropdown-container" ref={dropdownRef}>
            <button
              className="ghost-btn"
              onClick={() => setShowHistory(!showHistory)}
              aria-label="Activity History"
              title="Activity History"
            >
              <MoreVertical size={16} />
            </button>
            {showHistory && (
              <div className="dropdown-menu">
                <h3><Activity size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px' }} /> Activity History</h3>
                <div className="dropdown-history-list">
                  {loading ? (
                    <p className="muted small" style={{ margin: '8px 0' }}>Loading history...</p>
                  ) : history.length ? (
                    history.map((item) => (
                      <div key={item.id} className="dropdown-item">
                        <CheckCircle2 size={16} color="var(--accent)" style={{ flexShrink: 0 }} />
                        <div>
                          <p>Used <strong>{item.tool_name}</strong></p>
                          <small>on {item.file_name}</small><br />
                          <small>{new Date(item.created_at).toLocaleString()}</small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted small" style={{ margin: '8px 0' }}>No recent activity.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="dashboard-upload-card" style={{ marginTop: '30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '260px' }}>
          <div style={{ color: '#805AD5', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#805AD515', padding: '10px', borderRadius: '10px' }}>
            <PenTool size={20} />
          </div>
          <div style={{ display: 'grid', gap: '6px' }}>
            <p style={{ margin: 0, fontWeight: 600 }}>Sign/Edit PDF</p>
            <p className="muted small" style={{ margin: 0 }}>
              Upload a PDF to start editing. Your changes are autosaved as a private draft in your account.
            </p>
          </div>
        </div>
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
          documents.map((docItem) => (
            <article className="doc-card" key={docItem.id}>
              <div className="doc-meta">
                <FileText size={18} />
                <div>
                  <h3>{docItem.title}</h3>
                  <p className="muted small">Updated {new Date(docItem.updated_at).toLocaleString()}</p>
                </div>
              </div>
              <div className="doc-actions">
                <span className="chip">{docItem.status || 'draft'}</span>
                <Link href={`/editor/${docItem.id}`} className="action-btn">
                  <PenTool size={16} /> Open Editor
                </Link>
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => setPendingDeleteDoc(docItem)}
                  disabled={deletingDocId === docItem.id}
                >
                  <Trash2 size={16} /> {deletingDocId === docItem.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="muted">No PDFs yet. Upload your first PDF and start editing.</p>
        )}
      </section>

      <section className="tools-grid-wrapper" style={{ marginTop: '50px', paddingTop: '40px', borderTop: '1px solid var(--line)' }}>
        <h2 style={{ marginBottom: '20px', fontSize: '1.4rem' }}>Explore All Tools</h2>
        <div className="landing-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {availableTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                href={tool.href}
                key={tool.id}
                className="dashboard-panel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textDecoration: 'none',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  padding: '16px',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = ''; }}
              >
                <div style={{ color: tool.color, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${tool.color}15`, padding: '12px', borderRadius: '12px' }}>
                  <Icon size={24} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--ink)' }}>{tool.name}</h3>
                  <p className="muted" style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {tool.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>

      </section>

      {
        pendingDeleteDoc ? (
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
        ) : null
      }
      <Footer />
    </main >
  );
}
