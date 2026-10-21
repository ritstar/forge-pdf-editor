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
import { Document, Page } from 'react-pdf';
import '../utils/pdfWorker';
import { convertPdfToImage } from '../utils/pdfToImage';
import { removeWhiteBackground } from '../utils/imageProcessing';
import { generatePdf } from '../utils/pdfGenerator';
import { extractFormFieldsFromPdfBytes, getInitialsFromName } from '../utils/pdfForms';
import { downloadBlob, downloadPdfBytes, stripExtension } from '../utils/files';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const HISTORY_LIMIT = 60;
const COALESCE_MS = 1000;

function isEditableTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
}

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
    quickFillKey: null,
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
          quickFillKey: item.quickFillKey || null,
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
        quickFillKey: item.quickFillKey || null,
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
  userName,
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
  const pdfFile = initialPdfFile || null;
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialDraft?.currentPage || 1);
  const [elements, setElementsState] = useState(() => hydrateElements(initialDraft?.elements || []));
  const [selectedId, setSelectedId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState(initialDraft?.zoom || 1);
  const [busy, setBusy] = useState(false);
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  const [renderSize, setRenderSize] = useState({ width: 680, height: 900 });
  const [containerWidth, setContainerWidth] = useState(980);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [formFields, setFormFields] = useState([]);
  const [formValues, setFormValues] = useState(() => initialDraft?.formValues || {});
  const [formLoading, setFormLoading] = useState(false);
  const [quickFill, setQuickFill] = useState(() => ({
    name: userName || '',
    address: '',
    email: userEmail || '',
    mobile: '',
  }));

  const imageInputRef = useRef(null);
  const signatureInputRef = useRef(null);
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const lastSavedPayloadRef = useRef(null);
  const resetBaselineRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const saveStatusRef = useRef('saved');
  const elementsRef = useRef(elements);
  // Snapshots are the previous immutable arrays themselves; every edit produces new objects,
  // so there is no need to deep-clone (which also copied File blobs on every keystroke).
  const historyRef = useRef({ past: [], future: [], lastKey: null, lastAt: 0 });

  const setElements = useCallback((next) => {
    elementsRef.current = next;
    setElementsState(next);
  }, []);

  const syncHistoryFlags = useCallback(() => {
    const { past, future } = historyRef.current;
    setHistoryFlags({ canUndo: past.length > 0, canRedo: future.length > 0 });
  }, []);

  const pushHistory = useCallback((snapshot, coalesceKey = null) => {
    const state = historyRef.current;
    const now = Date.now();
    const coalesce = coalesceKey && state.lastKey === coalesceKey && now - state.lastAt < COALESCE_MS;
    state.lastKey = coalesceKey;
    state.lastAt = now;
    if (coalesce) return;
    state.past = [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshot];
    state.future = [];
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);

  useEffect(() => {
    setQuickFill((prev) => ({
      ...prev,
      name: prev.name || userName || '',
      email: prev.email || userEmail || '',
    }));
  }, [userEmail, userName]);

  const selectedElement = useMemo(
    () => elements.find((item) => item.id === selectedId) ?? null,
    [elements, selectedId],
  );
  const initialsValue = useMemo(
    () => getInitialsFromName(userName || userEmail),
    [userEmail, userName],
  );

  const pageElements = useMemo(
    () => elements.filter((item) => item.pageIndex === currentPage - 1),
    [elements, currentPage],
  );

  useEffect(() => {
    let active = true;

    const loadFormFields = async () => {
      if (!pdfFile) {
        setFormFields([]);
        return;
      }

      setFormLoading(true);
      try {
        const pdfBytes = await pdfFile.arrayBuffer();
        const detected = await extractFormFieldsFromPdfBytes(pdfBytes);
        if (!active) return;

        setFormFields(detected);
        // The PDF's own default values are not a user edit; don't autosave because of them.
        resetBaselineRef.current = true;
        setFormValues((prev) => {
          const next = { ...prev };
          for (const field of detected) {
            if (!(field.name in next)) {
              next[field.name] = field.value;
            }
          }
          return next;
        });
      } catch {
        if (active) setFormFields([]);
      } finally {
        if (active) setFormLoading(false);
      }
    };

    loadFormFields();
    return () => {
      active = false;
    };
  }, [pdfFile]);

  const applyChange = useCallback(
    (updater, { track = true, coalesceKey = null } = {}) => {
      const prev = elementsRef.current;
      const next = updater(prev);
      if (next === prev) return;
      if (track) pushHistory(prev, coalesceKey);
      setElements(next);
    },
    [pushHistory, setElements],
  );

  const undo = useCallback(() => {
    const state = historyRef.current;
    if (!state.past.length) return;
    state.future = [...state.future, elementsRef.current];
    setElements(state.past[state.past.length - 1]);
    state.past = state.past.slice(0, -1);
    state.lastKey = null;
    syncHistoryFlags();
    setSelectedId(null);
    setEditingId(null);
  }, [setElements, syncHistoryFlags]);

  const redo = useCallback(() => {
    const state = historyRef.current;
    if (!state.future.length) return;
    state.past = [...state.past, elementsRef.current];
    setElements(state.future[state.future.length - 1]);
    state.future = state.future.slice(0, -1);
    state.lastKey = null;
    syncHistoryFlags();
    setSelectedId(null);
    setEditingId(null);
  }, [setElements, syncHistoryFlags]);

  useEffect(() => {
    return () => {
      // Read the ref so URLs created after mount are released too (undo can resurrect items,
      // so only revoke on unmount).
      elementsRef.current.forEach((item) => {
        if (item.type === 'image' && item.objectUrl) {
          URL.revokeObjectURL(item.objectUrl);
        }
      });
    };
  }, []);

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

      // Record undo history on the first real movement, not on every click-to-select.
      if (!interaction.moved) {
        if (Math.abs(event.clientX - interaction.startClient.x) < 2 && Math.abs(event.clientY - interaction.startClient.y) < 2) {
          return;
        }
        interaction.moved = true;
        pushHistory(elementsRef.current);
      }

      setElements(
        elementsRef.current.map((item) => {
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

    // Pointer events cover mouse, touch and pen.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [pushHistory, setElements]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && (key === 'z' || key === 'y')) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) redo();
        else undo();
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
          { coalesceKey: `nudge:${selectedId}` },
        );
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyChange, redo, selectedId, undo]);

  const buildSnapshot = useCallback(
    () => ({
      currentPage,
      zoom,
      elements: serializeElements(elements),
      formValues,
    }),
    [currentPage, elements, formValues, zoom],
  );

  const saveDraftNow = useCallback(() => {
    if (!onSaveDraft || !pdfFile) return Promise.resolve();
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const snapshot = buildSnapshot();
    const payload = JSON.stringify(snapshot);

    // Serialize saves so an older snapshot can never land after a newer one.
    saveQueueRef.current = saveQueueRef.current.then(async () => {
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
    });
    return saveQueueRef.current;
  }, [buildSnapshot, onSaveDraft, pdfFile]);

  const saveDraftNowRef = useRef(saveDraftNow);
  useEffect(() => {
    saveDraftNowRef.current = saveDraftNow;
  }, [saveDraftNow]);

  useEffect(() => {
    const payload = JSON.stringify(buildSnapshot());
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSavedPayloadRef.current = payload;
      return undefined;
    }
    if (resetBaselineRef.current) {
      resetBaselineRef.current = false;
      if (saveStatusRef.current === 'saved') {
        lastSavedPayloadRef.current = payload;
        return undefined;
      }
    }
    if (payload === lastSavedPayloadRef.current) {
      setSaveStatus('saved');
      return undefined;
    }

    setSaveStatus('dirty');
    saveTimerRef.current = setTimeout(() => {
      saveDraftNow();
    }, 1800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [buildSnapshot, saveDraftNow]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveDraftNowRef.current();
      }
    };
    const onBeforeUnload = (event) => {
      if (saveStatusRef.current === 'saved') return;
      saveDraftNowRef.current();
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Flush pending edits when navigating away inside the app (the debounce would drop them).
      if (saveStatusRef.current === 'dirty') saveDraftNowRef.current();
    };
  }, []);

  const leaveAfterSave = (callback) => async () => {
    await saveDraftNow();
    callback?.();
  };

  const startInteraction = (event, id, mode, handle = null) => {
    if (!canvasRef.current) return;
    // Let clicks inside the inline editor place the caret instead of starting a drag.
    if (event.target.closest?.('textarea')) {
      event.stopPropagation();
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    setEditingId(null);

    const target = elementsRef.current.find((item) => item.id === id);
    if (!target) return;

    interactionRef.current = {
      id,
      mode,
      handle,
      moved: false,
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
    // Typing or dragging a slider produces one undo step per burst, not per keystroke.
    const coalesceKey = `${selectedId}:${Object.keys(updates).sort().join(',')}`;
    applyChange(
      (prev) => prev.map((item) => (item.id === selectedId ? { ...item, ...updates } : item)),
      { coalesceKey },
    );
  };

  const updateFormValue = (name, value) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const insertQuickFillText = (value, options = {}) => {
    const text = String(value || '').trim();
    if (!text) return;
    const quickFillKey = options.key || null;

    if (quickFillKey) {
      const existing = elements.find(
        (item) =>
          item.type === 'text' &&
          item.pageIndex === currentPage - 1 &&
          item.quickFillKey === quickFillKey,
      );

      if (existing) {
        applyChange((prev) =>
          prev.map((item) => (item.id === existing.id ? { ...item, text } : item)),
        );
        setSelectedId(existing.id);
        setEditingId(existing.id);
        return;
      }
    }

    const pageItemCount = elements.filter((item) => item.pageIndex === currentPage - 1).length;
    const y = clamp(0.12 + pageItemCount * 0.045, 0.08, 0.9);

    const item = {
      ...createTextElement(currentPage - 1),
      text,
      x: options.x ?? 0.12,
      y: options.y ?? y,
      width: options.width ?? 0.36,
      height: options.height ?? 0.07,
      fontSize: options.fontSize ?? 0.026,
      quickFillKey,
    };
    applyChange((prev) => [...prev, item]);
    setSelectedId(item.id);
    setEditingId(item.id);
  };

  const applyQuickFormValue = (name, kind) => {
    if (kind === 'date') {
      const dateValue = new Date().toLocaleDateString();
      updateFormValue(name, dateValue);
      return;
    }
    if (kind === 'initials') {
      updateFormValue(name, initialsValue);
    }
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

  const baseName = stripExtension(documentTitle);

  const renderEditedPdf = async () => {
    const warnings = new Set();
    const pdfBytes = await pdfFile.arrayBuffer();
    const modified = await generatePdf({
      pdfBytes,
      elements,
      formValues,
      onWarning: (message) => warnings.add(message),
    });
    setSaveError(warnings.size ? [...warnings].join(' ') : '');
    return modified;
  };

  const runExport = async (task) => {
    if (!pdfFile) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      console.error('Export failed:', error);
      setSaveError(`Export failed: ${error.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = () =>
    runExport(async () => {
      downloadPdfBytes(await renderEditedPdf(), `${baseName}-edited.pdf`);
    });

  const exportImage = (format) =>
    runExport(async () => {
      const image = await convertPdfToImage(await renderEditedPdf(), currentPage, format);
      downloadBlob(image, `${baseName}-page-${currentPage}.${format === 'jpeg' ? 'jpg' : format}`);
    });

  const hasElements = elements.length > 0;
  // Fit the page to the available width (minus .canvas-scroll padding), then apply zoom.
  // Clamping after zooming made zoom-in a no-op on wide screens.
  const fitWidth = clamp(containerWidth - 32, 280, 980);
  const targetWidth = Math.floor(fitWidth * zoom);

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
          <button className="ghost-btn" onClick={leaveAfterSave(onBackToDashboard)}>Back to Dashboard</button>
          <button className="ghost-btn" onClick={saveDraftNow}>
            <Save size={16} /> Save Now
          </button>
          <button className="ghost-btn" onClick={leaveAfterSave(onSignOut)}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </section>

      <section className="workspace" onPointerDown={() => setSelectedId(null)}>
        <div className="topbar">
          <div className="file-info">
            <h3>{documentTitle}</h3>
            <span>
              Page {currentPage} / {numPages || '--'}
            </span>
          </div>

          <div className="topbar-actions">
            <button className="ghost-btn" onClick={undo} disabled={!historyFlags.canUndo}>
              <Undo2 size={16} /> Undo
            </button>
            <button className="ghost-btn" onClick={redo} disabled={!historyFlags.canRedo}>
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
                disabled={numPages <= 1}
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
                        onPointerDown={(event) => startInteraction(event, item.id, 'drag')}
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
                            <button className="resize-handle nw" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'nw')} aria-label="Resize" />
                            <button className="resize-handle ne" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'ne')} aria-label="Resize" />
                            <button className="resize-handle sw" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'sw')} aria-label="Resize" />
                            <button className="resize-handle se" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'se')} aria-label="Resize" />
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <aside className="right-panel" onPointerDown={(event) => event.stopPropagation()}>
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
              <h4>Fill &amp; Sign Fields</h4>
              {formLoading ? (
                <p className="muted">Detecting fillable fields...</p>
              ) : formFields.length ? (
                <div className="form-field-list">
                  {formFields.map((field) => {
                    const value = formValues[field.name];
                    const controlId = `form-field-${field.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                    if (field.type === 'checkbox') {
                      return (
                        <label key={field.name} className="form-field-row checkbox-row" htmlFor={controlId}>
                          <input
                            id={controlId}
                            type="checkbox"
                            checked={Boolean(value)}
                            onChange={(event) => updateFormValue(field.name, event.target.checked)}
                          />
                          <span>{field.label}</span>
                        </label>
                      );
                    }

                    if (field.type === 'radio' || field.type === 'dropdown' || field.type === 'list') {
                      return (
                        <div key={field.name} className="form-field-row">
                          <label className="field-label" htmlFor={controlId}>{field.label}</label>
                          <select
                            id={controlId}
                            className="field"
                            value={value ?? ''}
                            onChange={(event) => updateFormValue(field.name, event.target.value)}
                          >
                            <option value="">Select...</option>
                            {(field.options || []).map((option) => (
                              <option key={`${field.name}-${option}`} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    return (
                      <div key={field.name} className="form-field-row">
                        <label className="field-label" htmlFor={controlId}>{field.label}</label>
                        <input
                          id={controlId}
                          type="text"
                          className="field"
                          value={value ?? ''}
                          onChange={(event) => updateFormValue(field.name, event.target.value)}
                        />
                        <div className="stack">
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => applyQuickFormValue(field.name, 'date')}
                          >
                            Insert Date
                          </button>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => applyQuickFormValue(field.name, 'initials')}
                            disabled={!initialsValue}
                          >
                            Insert Initials
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="quick-fill-panel">
                  <p className="muted">
                    No interactive form fields were detected. Use Quick Fill to insert text on this page.
                  </p>
                  <label className="field-label" htmlFor="quick-fill-name">Name</label>
                  <div className="quick-fill-row">
                    <input
                      id="quick-fill-name"
                      className="field"
                      value={quickFill.name}
                      onChange={(event) => setQuickFill((prev) => ({ ...prev, name: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => insertQuickFillText(quickFill.name, { key: 'quickfill-name' })}
                    >
                      Insert
                    </button>
                  </div>

                  <label className="field-label" htmlFor="quick-fill-address">Address</label>
                  <div className="quick-fill-row">
                    <input
                      id="quick-fill-address"
                      className="field"
                      value={quickFill.address}
                      onChange={(event) => setQuickFill((prev) => ({ ...prev, address: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() =>
                        insertQuickFillText(quickFill.address, { key: 'quickfill-address', width: 0.48 })
                      }
                    >
                      Insert
                    </button>
                  </div>

                  <label className="field-label" htmlFor="quick-fill-email">Email</label>
                  <div className="quick-fill-row">
                    <input
                      id="quick-fill-email"
                      className="field"
                      value={quickFill.email}
                      onChange={(event) => setQuickFill((prev) => ({ ...prev, email: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() =>
                        insertQuickFillText(quickFill.email, { key: 'quickfill-email', width: 0.44 })
                      }
                    >
                      Insert
                    </button>
                  </div>

                  <label className="field-label" htmlFor="quick-fill-mobile">Mobile</label>
                  <div className="quick-fill-row">
                    <input
                      id="quick-fill-mobile"
                      className="field"
                      value={quickFill.mobile}
                      onChange={(event) => setQuickFill((prev) => ({ ...prev, mobile: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => insertQuickFillText(quickFill.mobile, { key: 'quickfill-mobile' })}
                    >
                      Insert
                    </button>
                  </div>

                  <div className="stack">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() =>
                        insertQuickFillText(new Date().toLocaleDateString(), { key: 'quickfill-date' })
                      }
                    >
                      Insert Date
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => insertQuickFillText(initialsValue, { key: 'quickfill-initials' })}
                      disabled={!initialsValue}
                    >
                      Insert Initials
                    </button>
                  </div>
                </div>
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
