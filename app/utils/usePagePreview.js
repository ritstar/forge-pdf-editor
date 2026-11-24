'use client';

import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from '@cantoo/pdf-lib';
import { pdfjs } from './pdfWorker';
import { renderPdfPageToBlob } from './pdfToImage';

/**
 * Live preview of a tool's real output: copies one page of `file` into a scratch PDF, lets
 * `apply(doc, [0], sourcePageIndex)` change it exactly like the download does, and renders the
 * result to an image. Re-runs (debounced) whenever `key` changes.
 */
export function usePagePreview({ file, pageIndex, key, apply, width = 420 }) {
  const [state, setState] = useState({ url: null, busy: false, error: '' });
  const sourceRef = useRef({ file: null, doc: null });
  const applyRef = useRef(apply);
  const urlRef = useRef(null);

  useEffect(() => {
    applyRef.current = apply;
  });

  useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), []);

  useEffect(() => {
    if (!file) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState((prev) => ({ ...prev, busy: true }));
      let pdf;
      try {
        if (sourceRef.current.file !== file) {
          sourceRef.current = { file, doc: await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }) };
        }
        const source = sourceRef.current.doc;
        const index = Math.min(Math.max(pageIndex, 0), source.getPageCount() - 1);
        const scratch = await PDFDocument.create();
        const [page] = await scratch.copyPages(source, [index]);
        scratch.addPage(page);
        await applyRef.current(scratch, [0], index);
        const bytes = await scratch.save();
        if (cancelled) return;
        pdf = await pdfjs.getDocument({ data: bytes }).promise;
        const first = await pdf.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        const scale = (width / viewport.width) * Math.min(window.devicePixelRatio || 1, 2);
        const blob = await renderPdfPageToBlob(pdf, 1, { scale, format: 'png' });
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setState({ url: urlRef.current, busy: false, error: '' });
      } catch (error) {
        if (!cancelled) setState((prev) => ({ ...prev, busy: false, error: error.message || 'Preview failed.' }));
      } finally {
        pdf?.destroy();
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [file, pageIndex, key, width]);

  return state;
}
