'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Activity, FilePlus2, MoreHorizontal, PenLine, Search, Trash2 } from 'lucide-react';
import Dropzone from './ui/Dropzone';
import Menu from './ui/Menu';
import ToolCard from './ui/ToolCard';
import { Alert } from './ToolShell';
import { CATEGORIES, TOOLS } from '@/lib/toolsData';
import { formatFileSize } from '@/app/utils/files';
import { greeting, timeAgo } from '@/app/utils/format';

function DocumentRows({ documents, loading, query, onDelete, deletingDocId }) {
  if (loading) {
    return (
      <div className="doc-list">
        {[0, 1, 2].map((n) => (
          <div key={n} className="doc-row">
            <div className="doc-name"><div className="skeleton" style={{ width: 34, height: 40 }} /><div className="skeleton" style={{ width: '60%', height: 14 }} /></div>
            <div className="skeleton" style={{ height: 12 }} />
            <div className="skeleton" style={{ height: 12 }} />
            <span />
          </div>
        ))}
      </div>
    );
  }

  const filtered = query
    ? documents.filter((d) => (d.title || '').toLowerCase().includes(query.toLowerCase()))
    : documents;

  if (!documents.length) {
    return (
      <div className="empty-state">
        <span className="icon-tile lg" style={{ '--tile': 'var(--cat-edit)' }}><FilePlus2 size={24} /></span>
        <h3>No documents yet</h3>
        <p>Upload a PDF above to edit, fill or sign it. Your drafts will appear here so you can pick up anytime.</p>
      </div>
    );
  }

  if (!filtered.length) {
    return (
      <div className="empty-state">
        <h3>No matches</h3>
        <p>No documents match “{query}”.</p>
      </div>
    );
  }

  return (
    <div className="doc-list" role="table" aria-label="Documents">
      <div className="doc-row head" role="row">
        <span role="columnheader">Name</span>
        <span role="columnheader">Last edited</span>
        <span role="columnheader">Size</span>
        <span />
      </div>
      {filtered.map((docItem) => (
        <div key={docItem.id} className="doc-row" role="row">
          <div className="doc-name" role="cell">
            <span className="doc-icon">PDF</span>
            <Link href={`/editor/${docItem.id}`} title={docItem.title}>{docItem.title}</Link>
          </div>
          <span className="doc-meta" role="cell">{timeAgo(docItem.updated_at)}</span>
          <span className="doc-meta" role="cell">{docItem.file_size ? formatFileSize(docItem.file_size) : '—'}</span>
          <div className="doc-actions" role="cell">
            <Link href={`/editor/${docItem.id}`} className="btn btn-secondary btn-sm">
              <PenLine size={14} /> Open
            </Link>
            <Menu
              trigger={({ toggle, ...aria }) => (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={toggle} aria-label={`More actions for ${docItem.title}`} disabled={deletingDocId === docItem.id} {...aria}>
                  <MoreHorizontal size={16} />
                </button>
              )}
            >
              <Link href={`/editor/${docItem.id}`} role="menuitem" className="menu-item"><PenLine size={15} /> Open in editor</Link>
              <div className="menu-sep" />
              <button type="button" role="menuitem" className="menu-item danger" onClick={() => onDelete(docItem)}>
                <Trash2 size={15} /> Delete
              </button>
            </Menu>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardView({
  user,
  documents,
  history,
  loading,
  uploading,
  error,
  deletingDocId,
  pendingDeleteDoc,
  onUpload,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}) {
  const [query, setQuery] = useState('');
  const firstName = (user?.displayName || user?.email?.split('@')[0] || '').split(' ')[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
          <p>Edit and sign PDFs, or pick any tool to get work done.</p>
        </div>
      </div>

      <div className="dash-upload">
        <Dropzone
          compact
          accept="application/pdf,.pdf"
          onFiles={([file]) => onUpload(file)}
          disabled={uploading}
          icon={FilePlus2}
          title={uploading ? 'Uploading your PDF…' : 'Edit or sign a PDF'}
          hint="Drop a PDF here or choose one — add text, images, signatures and fill forms"
          buttonLabel={uploading ? 'Uploading…' : 'Upload PDF'}
        />
        {error ? <div style={{ marginTop: 12 }}><Alert>{error}</Alert></div> : null}
      </div>

      <div className="dash-grid">
        <section className="card" aria-labelledby="docs-title">
          <div className="card-header">
            <h2 id="docs-title">Recent documents</h2>
            <label className="search">
              <Search size={15} />
              <span className="sr-only">Search documents</span>
              <input className="input" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          <DocumentRows documents={documents} loading={loading} query={query} onDelete={onRequestDelete} deletingDocId={deletingDocId} />
        </section>

        <aside className="card" aria-labelledby="activity-title">
          <div className="card-header">
            <h2 id="activity-title">Recent activity</h2>
            <Activity size={16} className="muted" />
          </div>
          {loading ? (
            <div className="card-body" style={{ display: 'grid', gap: 12 }}>
              {[0, 1, 2].map((n) => <div key={n} className="skeleton" style={{ height: 36 }} />)}
            </div>
          ) : history.length ? (
            <ul className="activity-list">
              {history.map((item) => {
                const tool = TOOLS.find((t) => t.id === item.tool_id);
                const Icon = tool?.icon || Activity;
                return (
                  <li key={item.id} className="activity-item">
                    <span className="icon-tile sm" style={{ '--tile': tool?.color || 'var(--muted)' }}><Icon size={15} /></span>
                    <div style={{ minWidth: 0 }}>
                      <p><strong>{item.tool_name}</strong></p>
                      <span className="small file" title={item.file_name}>{item.file_name}</span>
                      <small>{timeAgo(item.created_at)}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state" style={{ padding: '32px 20px' }}>
              <p>Tools you use will show up here.</p>
            </div>
          )}
        </aside>
      </div>

      <section id="tools" style={{ scrollMarginTop: 'calc(var(--header-h) + 16px)' }}>
        <div className="section-title">
          <h2>All tools</h2>
        </div>
        {CATEGORIES.map((category) => {
          const tools = TOOLS.filter((t) => t.category === category.id);
          return (
            <div key={category.id} className="category-block">
              <div className="category-label"><i style={{ background: category.color }} /> {category.name}</div>
              <div className="tool-grid">
                {tools.map((tool) => <ToolCard key={tool.id} tool={tool} compact />)}
              </div>
            </div>
          );
        })}
      </section>

      {pendingDeleteDoc ? (
        <div className="modal-backdrop" role="presentation" onClick={onCancelDelete}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="delete-title">Delete this document?</h3>
            <p className="muted">
              <strong style={{ color: 'var(--ink)' }}>{pendingDeleteDoc.title}</strong> and its draft will be permanently deleted. This can&apos;t be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onCancelDelete} disabled={deletingDocId === pendingDeleteDoc.id}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => onConfirmDelete(pendingDeleteDoc)} disabled={deletingDocId === pendingDeleteDoc.id}>
                <Trash2 size={15} /> {deletingDocId === pendingDeleteDoc.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
