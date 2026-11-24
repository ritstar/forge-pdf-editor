'use client';

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

/** Shows a rendered preview of one page of a tool's output, with page navigation. */
export default function PagePreview({ preview, page, pageCount, onPage, width = 420, note }) {
  return (
    <div className="page-preview">
      <div className="page-preview-sheet" style={{ width: `min(${width}px, 100%)` }}>
        {preview.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={`Preview of page ${page + 1}`} />
        ) : (
          <div className="skeleton" style={{ width: '100%', aspectRatio: '1 / 1.3' }} />
        )}
        {preview.busy ? (
          <span className="page-preview-busy" aria-hidden="true"><Loader2 size={16} className="spin" /></span>
        ) : null}
      </div>
      {preview.error ? <p className="error-text">{preview.error}</p> : null}
      <div className="page-preview-nav">
        {pageCount > 1 ? (
          <>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onPage(page - 1)} disabled={page <= 0} aria-label="Previous page">
              <ChevronLeft size={16} />
            </button>
            <span>Page {page + 1} of {pageCount}</span>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onPage(page + 1)} disabled={page >= pageCount - 1} aria-label="Next page">
              <ChevronRight size={16} />
            </button>
          </>
        ) : (
          <span>Preview</span>
        )}
      </div>
      {note ? <p className="small muted" style={{ textAlign: 'center' }}>{note}</p> : null}
    </div>
  );
}
