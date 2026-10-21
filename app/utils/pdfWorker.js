'use client';

import { pdfjs } from 'react-pdf';

// Serve the worker from our own origin. Loading it from a CDN is blocked by the production
// CSP (worker-src 'self' blob:) and forces pdf.js onto the slow main-thread fallback.
// pdfjs-dist is pinned to the exact version react-pdf uses so the worker and API match.
if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
}

export { pdfjs };
