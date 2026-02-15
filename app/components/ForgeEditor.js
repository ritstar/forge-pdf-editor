'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eraser,
  FileImage,
  ImagePlus,
  LogOut,
  Move,
  RotateCcw,
  RotateCw,
  Save,
  Signature,
  Trash2,
  Type,
  Undo2,
  User,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { convertPdfToImage } from '../utils/pdfToImage';
import { removeWhiteBackground } from '../utils/imageProcessing';
import { generatePdf } from '../utils/pdfGenerator';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const makeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function createTextElement(pageIndex) {
  return {
    id: makeId(),
    type: 'text',
    pageIndex,
    x: 0.12,
    y: 0.12,
    width: 0.35,
    height: 0.09,
    text: 'Double-click to edit',
    fontSize: 0.03,
    color: '#111827',
    bold: false,
  };
}

function createImageElement({ pageIndex, isSignature = false, file, url, storagePath, assetBucket, mimeType, signatureId }) {
  const objectUrl = !url && file ? URL.createObjectURL(file) : null;
  return {
    id: makeId(),
    type: 'image',
    pageIndex,
    x: 0.1,
    y: 0.1,
    width: isSignature ? 0.26 : 0.3,
    height: isSignature ? 0.12 : 0.2,
    file: file || null,
    url: url || objectUrl,
    objectUrl,
    isSignature,
    storagePath: storagePath || null,
    assetBucket: assetBucket || null,
    mimeType: mimeType || file?.type || null,
    signatureId: signatureId || null,
  };
}

function hydrateElements(serialized = []) {
  if (!Array.isArray(serialized)) return [];
  return serialized
    .filter((item) => item && item.type)
    .map((item) => {
      if (item.type === 'text') {
        return {
          id: item.id || makeId(),
          type: 'text',
          pageIndex: item.pageIndex ?? 0,
          x: item.x ?? 0.1,
          y: item.y ?? 0.1,
          width: item.width ?? 0.3,
          height: item.height ?? 0.1,
          text: item.text ?? '',
          fontSize: item.fontSize ?? 0.03,
          color: item.color || '#111827',
          bold: Boolean(item.bold),
        };
      }

      if (item.type === 'image') {
        return {
          id: item.id || makeId(),
          type: 'image',
          pageIndex: item.pageIndex ?? 0,
          x: item.x ?? 0.1,
          y: item.y ?? 0.1,
          width: item.width ?? 0.3,
          height: item.height ?? 0.2,
          file: null,
          url: item.url || null,
          objectUrl: null,
          isSignature: Boolean(item.isSignature),
          storagePath: item.storagePath || null,
          assetBucket: item.assetBucket || null,
          mimeType: item.mimeType || null,
          signatureId: item.signatureId || null,
        };
      }

      return null;
    })
    .filter(Boolean);
}

function serializeElements(elements = []) {
  return elements.map((item) => {
    if (item.type === 'text') {
      return {
        id: item.id,
        type: 'text',
        pageIndex: item.pageIndex,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        text: item.text,
        fontSize: item.fontSize,
        color: item.color,
        bold: Boolean(item.bold),
      };
    }

    return {
      id: item.id,
      type: 'image',
      pageIndex: item.pageIndex,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      isSignature: Boolean(item.isSignature),
      storagePath: item.storagePath || null,
      assetBucket: item.assetBucket || null,
      mimeType: item.mimeType || null,
      signatureId: item.signatureId || null,
      url: item.storagePath ? null : item.url,
    };
  });
}

export default function ForgeEditor({
  userEmail,
  documentTitle,
  initialPdfFile,
  initialDraft,
  signatures,
  onSaveDraft,
  onUploadOverlay,
  onCreateSignature,
  onDeleteSignature,
  onBackToDashboard,
  onSignOut,
}) {
  const [pdfFile, setPdfFile] = useState(initialPdfFile || null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialDraft?.currentPage || 1);
  const [elements, setElements] = useState(() => hydrateElements(initialDraft?.elements || []));
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState(initialDraft?.zoom || 1);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [renderSize, setRenderSize] = useState({ width: 680, height: 900 });
  const [containerWidth, setContainerWidth] = useState(980);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState('');
  const [signatureName, setSignatureName] = useState('');

  const imageInputRef = useRef(null);
  const signatureInputRef = useRef(null);
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const lastSavedPayloadRef = useRef(JSON.stringify(initialDraft || {}));

  useEffect(() => {
    setPdfFile(initialPdfFile || null);
  }, [initialPdfFile]);

  const selectedElement = useMemo(
    () => elements.find((item) => item.id === selectedId) ?? null,
    [elements, selectedId],
  );

  const pageElements = useMemo(
    () => elements.filter((item) => item.pageIndex === currentPage - 1),
    [elements, currentPage],
  );

  const trackHistory = useCallback((snapshot) => {
    setHistory((prev) => [...prev.slice(-59), snapshot]);
    setFuture([]);
  }, []);

  const applyChange = useCallback(
    (updater, options = { track: true }) => {
      setElements((prev) => {
        const next = updater(prev);
        if (next === prev) return prev;
        if (options.track) {
          trackHistory(structuredClone(prev));
        }
        return next;
      });
    },
    [trackHistory],
  );

  useEffect(() => {
    return () => {
      elements.forEach((item) => {
        if (item.type === 'image' && item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl);
        }
      });
    };
  }, [elements]);

  useEffect(() => {
    if (!shellRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(shellRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (event) => {
      const interaction = interactionRef.current;
      if (!interaction || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dx = (event.clientX - interaction.startClient.x) / rect.width;
      const dy = (event.clientY - interaction.startClient.y) / rect.height;

      setElements((prev) =>
        prev.map((item) => {
          if (item.id !== interaction.id) return item;

          if (interaction.mode === 'drag') {
            const nextX = clamp(interaction.startBox.x + dx, 0, 1 - item.width);
            const nextY = clamp(interaction.startBox.y + dy, 0, 1 - item.height);
            return { ...item, x: nextX, y: nextY };
          }

          if (interaction.mode === 'resize') {
            const minW = item.type === 'text' ? 0.16 : 0.06;
            const minH = item.type === 'text' ? 0.05 : 0.06;
            let nextX = interaction.startBox.x;
            let nextY = interaction.startBox.y;
            let nextW = interaction.startBox.width;
            let nextH = interaction.startBox.height;

            if (interaction.handle.includes('e')) {
              nextW = clamp(interaction.startBox.width + dx, minW, 1 - interaction.startBox.x);
            }
            if (interaction.handle.includes('s')) {
              nextH = clamp(interaction.startBox.height + dy, minH, 1 - interaction.startBox.y);
            }
            if (interaction.handle.includes('w')) {
              const maxLeftShift = interaction.startBox.width - minW;
              const raw = clamp(dx, -interaction.startBox.x, maxLeftShift);
              nextX = interaction.startBox.x + raw;
              nextW = interaction.startBox.width - raw;
            }
            if (interaction.handle.includes('n')) {
              const maxTopShift = interaction.startBox.height - minH;
              const raw = clamp(dy, -interaction.startBox.y, maxTopShift);
              nextY = interaction.startBox.y + raw;
              nextH = interaction.startBox.height - raw;
            }

            nextW = clamp(nextW, minW, 1 - nextX);
            nextH = clamp(nextH, minH, 1 - nextY);
            return { ...item, x: nextX, y: nextY, width: nextW, height: nextH };
          }

          return item;
        }),
      );
    };

    const onUp = () => {
      if (!interactionRef.current) return;
      interactionRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          if (!future.length) return;
          setFuture((prevFuture) => {
            const next = structuredClone(prevFuture[prevFuture.length - 1]);
            setHistory((prevHistory) => [...prevHistory, structuredClone(elements)]);
            setElements(next);
            return prevFuture.slice(0, -1);
          });
        } else {
          if (!history.length) return;
          setHistory((prevHistory) => {
            const previous = structuredClone(prevHistory[prevHistory.length - 1]);
            setFuture((prevFuture) => [...prevFuture, structuredClone(elements)]);
            setElements(previous);
            return prevHistory.slice(0, -1);
          });
        }
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        applyChange((prev) => prev.filter((item) => item.id !== selectedId));
        setSelectedId(null);
        setEditingId(null);
      }

      if (!selectedId) return;

      const step = event.shiftKey ? 0.01 : 0.003;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        applyChange((prev) =>
          prev.map((item) => {
            if (item.id !== selectedId) return item;
            const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
            const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
            return {
              ...item,
              x: clamp(item.x + dx, 0, 1 - item.width),
              y: clamp(item.y + dy, 0, 1 - item.height),
            };
          }),
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyChange, elements, future, history, selectedId]);

  const saveDraftNow = useCallback(async () => {
    if (!onSaveDraft || !pdfFile) return;

    const snapshot = {
      currentPage,
      zoom,
      elements: serializeElements(elements),
    };
    const payload = JSON.stringify(snapshot);

    if (payload === lastSavedPayloadRef.current) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    setSaveError('');

    try {
      await onSaveDraft(snapshot);
      lastSavedPayloadRef.current = payload;
      setSaveStatus('saved');
    } catch (error) {
      setSaveStatus('error');
      setSaveError(error.message || 'Failed to save draft.');
    }
  }, [currentPage, elements, onSaveDraft, pdfFile, zoom]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    setSaveStatus('dirty');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveDraftNow();
    }, 1800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [elements, currentPage, zoom, saveDraftNow]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveDraftNow();
      }
    };

    window.addEventListener('visibilitychange', onVisibility);
    return () => window.removeEventListener('visibilitychange', onVisibility);
  }, [saveDraftNow]);

  const startInteraction = (event, id, mode, handle = null) => {
    if (!canvasRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    setEditingId(null);

    const target = elements.find((item) => item.id === id);
    if (!target) return;

    trackHistory(structuredClone(elements));

    interactionRef.current = {
      id,
      mode,
      handle,
      startClient: { x: event.clientX, y: event.clientY },
      startBox: {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
      },
    };
  };

  const updateSelected = (updates) => {
    if (!selectedId) return;
    applyChange((prev) => prev.map((item) => (item.id === selectedId ? { ...item, ...updates } : item)));
  };

  const removeSelected = () => {
    if (!selectedId) return;
    applyChange((prev) => prev.filter((item) => item.id !== selectedId));
    setEditingId(null);
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selectedElement) return;
    const copy = {
      ...selectedElement,
      id: makeId(),
      file: null,
      objectUrl: null,
      x: clamp(selectedElement.x + 0.02, 0, 1 - selectedElement.width),
      y: clamp(selectedElement.y + 0.02, 0, 1 - selectedElement.height),
    };
    applyChange((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const clearPage = () => {
    applyChange((prev) => prev.filter((item) => item.pageIndex !== currentPage - 1));
    setSelectedId(null);
    setEditingId(null);
  };

  const clearAll = () => {
    applyChange(() => []);
    setSelectedId(null);
    setEditingId(null);
  };

  const undo = () => {
    if (!history.length) return;
    const previous = structuredClone(history[history.length - 1]);
    setHistory((prev) => prev.slice(0, -1));
    setFuture((prev) => [...prev, structuredClone(elements)]);
    setElements(previous);
    setSelectedId(null);
    setEditingId(null);
  };

  const redo = () => {
    if (!future.length) return;
    const next = structuredClone(future[future.length - 1]);
    setFuture((prev) => prev.slice(0, -1));
    setHistory((prev) => [...prev, structuredClone(elements)]);
    setElements(next);
    setSelectedId(null);
    setEditingId(null);
  };

  const addText = () => {
    const item = createTextElement(currentPage - 1);
    applyChange((prev) => [...prev, item]);
    setSelectedId(item.id);
    setEditingId(item.id);
  };

  const addImage = async ({ file, isSignature = false, url, storagePath, assetBucket, mimeType, signatureId }) => {
    const item = createImageElement({
      pageIndex: currentPage - 1,
      isSignature,
      file,
      url,
      storagePath,
      assetBucket,
      mimeType,
      signatureId,
    });
    applyChange((prev) => [...prev, item]);
    setSelectedId(item.id);
  };

  const handleImageInput = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;

    setBusy(true);
    try {
      const persisted = await onUploadOverlay(file);
      await addImage({
        file,
        isSignature: false,
        url: persisted?.url,
        storagePath: persisted?.storagePath,
        assetBucket: persisted?.assetBucket,
        mimeType: persisted?.mimeType,
      });
      setSaveError('');
    } catch (error) {
      setSaveError(error.message || 'Failed to upload image asset.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignatureInput = async (event) => {
    const rawFile = event.target.files?.[0];
    event.target.value = '';
    if (!rawFile) return;

    setBusy(true);
    try {
      const processed = await removeWhiteBackground(rawFile).catch(() => rawFile);
      const saved = await onCreateSignature(processed, signatureName.trim() || undefined);
      setSignatureName('');
      await addImage({
        isSignature: true,
        url: saved.url,
        storagePath: saved.image_path,
        assetBucket: 'signatures',
        mimeType: saved.mime_type,
        signatureId: saved.id,
      });
      setSaveError('');
    } catch (error) {
      setSaveError(error.message || 'Failed to save signature.');
    } finally {
      setBusy(false);
    }
  };

  const addSavedSignature = async (signature) => {
    await addImage({
      isSignature: true,
      url: signature.url,
      storagePath: signature.image_path,
      assetBucket: 'signatures',
      mimeType: signature.mime_type,
      signatureId: signature.id,
    });
  };

  const exportPdf = async () => {
    if (!pdfFile) return;
    setBusy(true);
    try {
      const pdfBytes = await pdfFile.arrayBuffer();
      const modified = await generatePdf({ pdfBytes, elements });
      const blob = new Blob([modified], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${documentTitle?.replace(/\.pdf$/i, '') || 'document'}-edited.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const exportImage = async (format) => {
    if (!pdfFile) return;
    setBusy(true);
    try {
      const pdfBytes = await pdfFile.arrayBuffer();
      const modified = await generatePdf({ pdfBytes, elements });
      const dataUrl = await convertPdfToImage(modified, currentPage, format);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${documentTitle?.replace(/\.pdf$/i, '') || 'document'}-page-${currentPage}.${format === 'jpeg' ? 'jpg' : format}`;
      link.click();
    } finally {
      setBusy(false);
    }
  };

  const hasElements = elements.length > 0;
  const targetWidth = Math.max(320, Math.min(980, Math.floor((containerWidth - 24) * zoom)));

  return (
    <main className="app-shell">
      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleImageInput} />
      <input ref={signatureInputRef} type="file" accept="image/*" hidden onChange={handleSignatureInput} />

      <section className="hero app-hero-row">
        <div>
          <h1>{documentTitle}</h1>
          <p>
            Signed in as {userEmail}. Draft status: <strong>{saveStatus}</strong>
          </p>
          {saveError ? <p className="error-text">{saveError}</p> : null}
        </div>
        <div className="stack">
          <button className="ghost-btn" onClick={onBackToDashboard}>Back to Dashboard</button>
          <button className="ghost-btn" onClick={saveDraftNow}>
            <Save size={16} /> Save Now
          </button>
          <button className="ghost-btn" onClick={onSignOut}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </section>

      <section className="workspace" onMouseDown={() => setSelectedId(null)}>
        <div className="topbar">
          <div className="file-info">
            <h3>{documentTitle}</h3>
            <span>
              Page {currentPage} / {numPages || '--'}
            </span>
          </div>

          <div className="topbar-actions">
            <button className="ghost-btn" onClick={undo} disabled={!history.length}>
              <Undo2 size={16} /> Undo
            </button>
            <button className="ghost-btn" onClick={redo} disabled={!future.length}>
              <RotateCw size={16} /> Redo
            </button>
            <button className="ghost-btn" onClick={() => setZoom(1)}>
              <RotateCcw size={16} /> Reset Zoom
            </button>
          </div>
        </div>

        <div className="tool-row">
          <button className="action-btn" onClick={addText}>
            <Type size={16} /> Add Text
          </button>
          <button className="action-btn" onClick={() => imageInputRef.current?.click()} disabled={busy}>
            <ImagePlus size={16} /> Add Image
          </button>
          <button className="action-btn" onClick={() => signatureInputRef.current?.click()} disabled={busy}>
            <Signature size={16} /> New Signature
          </button>
          <div className="zoom-box">
            <button className="ghost-btn" onClick={() => setZoom((z) => clamp(z - 0.1, 0.6, 1.8))}>
              <ZoomOut size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="ghost-btn" onClick={() => setZoom((z) => clamp(z + 0.1, 0.6, 1.8))}>
              <ZoomIn size={16} />
            </button>
          </div>
          <button className="danger-btn" onClick={clearPage} disabled={!pageElements.length}>
            <Eraser size={16} /> Clear Page
          </button>
          <button className="danger-btn" onClick={clearAll} disabled={!hasElements}>
            <Trash2 size={16} /> Clear All
          </button>
        </div>

        <div className="content-grid">
          <aside className="left-panel">
            <div className="panel-section">
              <h4>Pages</h4>
              <div className="page-nav">
                <button
                  className="ghost-btn"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>
                <button
                  className="ghost-btn"
                  onClick={() => setCurrentPage((p) => Math.min(numPages || 1, p + 1))}
                  disabled={currentPage >= numPages}
                >
                  Next
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(1, numPages)}
                value={currentPage}
                onChange={(event) => setCurrentPage(Number(event.target.value))}
              />
            </div>

            <div className="panel-section">
              <h4>Saved Signatures</h4>
              <label className="field-label" htmlFor="signature-name">Name for new upload</label>
              <input
                id="signature-name"
                className="field"
                value={signatureName}
                onChange={(event) => setSignatureName(event.target.value)}
                placeholder="e.g. Ritesh Personal"
              />
              <div className="signature-list">
                {signatures.length ? (
                  signatures.map((signature) => (
                    <div className="signature-row" key={signature.id}>
                      <button className="ghost-btn signature-preview" onClick={() => addSavedSignature(signature)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signature.url} alt={signature.name || 'Signature'} />
                        <span>{signature.name || 'Saved signature'}</span>
                      </button>
                      <button
                        className="danger-btn"
                        onClick={async () => {
                          try {
                            await onDeleteSignature(signature);
                            setSaveError('');
                          } catch (error) {
                            setSaveError(error.message || 'Failed to delete signature.');
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">Upload your first signature to reuse it anytime.</p>
                )}
              </div>
            </div>

            <div className="panel-section">
              <h4>Layers on this page</h4>
              <div className="layer-list">
                {pageElements.length ? (
                  [...pageElements].reverse().map((item) => (
                    <button
                      key={item.id}
                      className={`layer-row ${item.id === selectedId ? 'active' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(item.id);
                      }}
                    >
                      <span>{item.type === 'text' ? 'Text' : item.isSignature ? 'Signature' : 'Image'}</span>
                      <small>
                        {Math.round(item.x * 100)}%, {Math.round(item.y * 100)}%
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="muted">No elements on this page yet.</p>
                )}
              </div>
            </div>
          </aside>

          <div className="canvas-shell" ref={shellRef}>
            <div className="canvas-scroll">
              <div className="pdf-stage" ref={canvasRef} style={{ width: renderSize.width, height: renderSize.height }}>
                <Document
                  file={pdfFile}
                  onLoadSuccess={({ numPages: loaded }) => {
                    setNumPages(loaded);
                    setCurrentPage((prev) => clamp(prev, 1, loaded));
                  }}
                  loading={<div className="loading">Loading PDF...</div>}
                >
                  <Page
                    pageNumber={currentPage}
                    width={targetWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onRenderSuccess={(page) => {
                      setRenderSize({ width: page.width, height: page.height });
                    }}
                  />
                </Document>

                <div className="overlay" style={{ width: renderSize.width, height: renderSize.height }}>
                  {pageElements.map((item) => {
                    const style = {
                      left: `${item.x * 100}%`,
                      top: `${item.y * 100}%`,
                      width: `${item.width * 100}%`,
                      height: `${item.height * 100}%`,
                    };

                    return (
                      <div
                        key={item.id}
                        className={`item ${selectedId === item.id ? 'selected' : ''} ${item.type === 'text' ? 'text-item' : 'image-item'}`}
                        style={style}
                        onMouseEnter={() => setHoverId(item.id)}
                        onMouseLeave={() => setHoverId((prev) => (prev === item.id ? null : prev))}
                        onMouseDown={(event) => startInteraction(event, item.id, 'drag')}
                        onDoubleClick={() => {
                          if (item.type === 'text') {
                            setSelectedId(item.id);
                            setEditingId(item.id);
                          }
                        }}
                      >
                        {item.type === 'text' ? (
                          editingId === item.id ? (
                            <textarea
                              autoFocus
                              value={item.text}
                              onChange={(event) => updateSelected({ text: event.target.value })}
                              onBlur={() => setEditingId(null)}
                              className="inline-editor"
                            />
                          ) : (
                            <div
                              className="text-content"
                              style={{
                                color: item.color,
                                fontWeight: item.bold ? 700 : 500,
                                fontSize: `${Math.max(item.fontSize * renderSize.width, 8)}px`,
                              }}
                            >
                              {item.text}
                            </div>
                          )
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.url} alt={item.isSignature ? 'Signature' : 'Overlay'} draggable={false} />
                        )}

                        {selectedId === item.id || (item.type === 'image' && hoverId === item.id) ? (
                          <>
                            <button className="resize-handle nw" onMouseDown={(event) => startInteraction(event, item.id, 'resize', 'nw')} />
                            <button className="resize-handle ne" onMouseDown={(event) => startInteraction(event, item.id, 'resize', 'ne')} />
                            <button className="resize-handle sw" onMouseDown={(event) => startInteraction(event, item.id, 'resize', 'sw')} />
                            <button className="resize-handle se" onMouseDown={(event) => startInteraction(event, item.id, 'resize', 'se')} />
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <aside className="right-panel" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-section">
              <h4>Selection</h4>
              {!selectedElement ? (
                <p className="muted">Pick an element to edit its properties.</p>
              ) : (
                <>
                  <p className="muted">
                    {selectedElement.type === 'text'
                      ? 'Text block'
                      : selectedElement.isSignature
                        ? 'Signature image'
                        : 'Image overlay'}
                  </p>

                  {selectedElement.type === 'text' ? (
                    <>
                      <label className="field-label" htmlFor="text-content-field">Text</label>
                      <textarea
                        id="text-content-field"
                        value={selectedElement.text}
                        onChange={(event) => updateSelected({ text: event.target.value })}
                        rows={4}
                        className="field"
                      />

                      <label className="field-label" htmlFor="font-size-field">
                        Font Size ({Math.round(selectedElement.fontSize * 1000) / 10}%)
                      </label>
                      <input
                        id="font-size-field"
                        type="range"
                        min={0.012}
                        max={0.09}
                        step={0.002}
                        value={selectedElement.fontSize}
                        onChange={(event) => updateSelected({ fontSize: Number(event.target.value) })}
                      />

                      <label className="field-label" htmlFor="text-color-field">Color</label>
                      <input
                        id="text-color-field"
                        type="color"
                        value={selectedElement.color}
                        onChange={(event) => updateSelected({ color: event.target.value })}
                        className="color-input"
                      />

                      <button className="ghost-btn" onClick={() => updateSelected({ bold: !selectedElement.bold })}>
                        <Move size={16} /> {selectedElement.bold ? 'Bold On' : 'Bold Off'}
                      </button>
                    </>
                  ) : (
                    <p className="muted">Drag or use the corner handles to resize image overlays.</p>
                  )}

                  <div className="stack">
                    <button className="ghost-btn" onClick={duplicateSelected}>Duplicate</button>
                    <button className="danger-btn" onClick={removeSelected}>Delete</button>
                  </div>
                </>
              )}
            </div>

            <div className="panel-section">
              <h4>Export</h4>
              <div className="stack">
                <button className="primary-btn" onClick={exportPdf} disabled={busy}>
                  <Download size={16} /> Download PDF
                </button>
                <button className="ghost-btn" onClick={() => exportImage('png')} disabled={busy}>
                  <FileImage size={16} /> Export PNG (Current Page)
                </button>
                <button className="ghost-btn" onClick={() => exportImage('jpeg')} disabled={busy}>
                  <FileImage size={16} /> Export JPG (Current Page)
                </button>
              </div>
            </div>

            <div className="panel-section user-block">
              <h4>
                <User size={16} /> Account
              </h4>
              <p className="muted small">{userEmail}</p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
