'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  FileImage,
  ImagePlus,
  Italic,
  Layers,
  Loader2,
  LogOut,
  Maximize,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  ScanText,
  Signature,
  SlidersHorizontal,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Document, Page } from 'react-pdf';
import { PDFDocument } from '@cantoo/pdf-lib';
import LazyPage from './ui/LazyPage';
import Menu from './ui/Menu';
import '../utils/pdfWorker';
import { convertPdfToImage } from '../utils/pdfToImage';
import { removeWhiteBackground } from '../utils/imageProcessing';
import { generatePdf } from '../utils/pdfGenerator';
import { extractFormFieldsFromPdfBytes, getInitialsFromName } from '../utils/pdfForms';
import { downloadBlob, downloadPdfBytes, stripExtension } from '../utils/files';
import {
  applyTextEdits,
  createTextEdit,
  fetchTextLayout,
  fontDisplayName,
  groupFonts,
  isChangedTextEdit,
  keepsOriginalStyle,
  previewFontFamily,
} from '../utils/textEditing';

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

      if (item.type === 'textEdit' && item.original) {
        return { ...serializeTextEdit(item), id: item.id || makeId() };
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

// Edits of text already in the PDF: the line's box is fixed, only its content and style change.
function serializeTextEdit(item) {
  return {
    id: item.id,
    type: 'textEdit',
    pageIndex: item.pageIndex ?? 0,
    lineId: item.lineId,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    text: item.text ?? '',
    size: item.size,
    color: item.color || '#000000',
    bold: Boolean(item.bold),
    italic: Boolean(item.italic),
    family: item.family || 'sans',
    fontFamily: item.fontFamily || '',
    pageWidth: item.pageWidth,
    original: { ...item.original },
  };
}

function serializeElements(elements = []) {
  return elements.map((item) => {
    if (item.type === 'textEdit') {
      return serializeTextEdit(item);
    }

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
  const [leftTab, setLeftTab] = useState('pages');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
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

  // "Edit text" mode: detected lines per page index ({ status, lines, source, ... }).
  const [textMode, setTextMode] = useState(false);
  const [layouts, setLayouts] = useState({});
  const [exportNotice, setExportNotice] = useState('');

  const imageInputRef = useRef(null);
  const signatureInputRef = useRef(null);
  const layoutRequestsRef = useRef(new Set());
  const sourceDocRef = useRef(null);
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

  const loadLayout = useCallback(
    async (pageIndex) => {
      if (!pdfFile || layoutRequestsRef.current.has(pageIndex)) return;
      layoutRequestsRef.current.add(pageIndex);
      setLayouts((prev) => ({ ...prev, [pageIndex]: { status: 'loading' } }));
      try {
        if (!sourceDocRef.current) {
          sourceDocRef.current = pdfFile.arrayBuffer().then((bytes) => PDFDocument.load(bytes));
        }
        const sourceDoc = await sourceDocRef.current.catch((error) => {
          sourceDocRef.current = null;
          throw error;
        });
        const layout = await fetchTextLayout({
          sourceDoc,
          pageIndex,
          onWaking: (seconds) => setLayouts((prev) => ({ ...prev, [pageIndex]: { status: 'loading', waking: seconds } })),
        });
        setLayouts((prev) => ({ ...prev, [pageIndex]: { ...layout, status: 'ready' } }));
      } catch (error) {
        // Allow a retry.
        layoutRequestsRef.current.delete(pageIndex);
        setLayouts((prev) => ({
          ...prev,
          [pageIndex]: { status: 'error', error: error.message || 'Could not read the text on this page.' },
        }));
      }
    },
    [pdfFile],
  );

  useEffect(() => {
    if (textMode) loadLayout(currentPage - 1);
  }, [currentPage, loadLayout, textMode]);

  const pageLayout = layouts[currentPage - 1];
  // Every layout response lists the same installed fonts; any loaded page will do.
  const fontGroups = useMemo(() => groupFonts(Object.values(layouts).find((layout) => layout?.fonts)?.fonts), [layouts]);
  const editedLineIds = useMemo(
    () => new Set(pageElements.filter((item) => item.type === 'textEdit').map((item) => item.lineId)),
    [pageElements],
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
    // The canvas mounts only after the PDF loads, so re-run when the page count arrives.
    if (!shellRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(shellRef.current);
    return () => observer.disconnect();
  }, [numPages]);

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
          if (item.id !== interaction.id || item.type === 'textEdit') return item;

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDraftNowRef.current();
        return;
      }
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

      // Edited lines keep the original line's position.
      if (!selectedId || elementsRef.current.find((item) => item.id === selectedId)?.type === 'textEdit') return;

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
    if (event.target.closest?.('textarea, input')) {
      event.stopPropagation();
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    setSelectedId(id);
    setEditingId(null);

    const target = elementsRef.current.find((item) => item.id === id);
    if (!target || target.type === 'textEdit') return;

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

  const startLineEdit = (line) => {
    const pageIndex = currentPage - 1;
    const item = createTextEdit({ id: makeId(), line, pageIndex, pageWidth: layouts[pageIndex]?.width || 612 });
    applyChange((prev) => [...prev, item]);
    setSelectedId(item.id);
    setEditingId(item.id);
  };

  // Opening a line without changing it is not an edit, but it stays while selected so the
  // inspector (color, size, font) can still change it after the inline input loses focus.
  useEffect(() => {
    const isStale = (item) =>
      item.type === 'textEdit' && item.id !== selectedId && item.id !== editingId && !isChangedTextEdit(item);
    if (elementsRef.current.some(isStale)) {
      applyChange((prev) => prev.filter((item) => !isStale(item)), { track: false });
    }
  }, [applyChange, editingId, selectedId]);

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
    const onWarning = (message) => warnings.add(message);
    // Text already in the PDF is rewritten by the backend first; overlays go on top of that.
    const textEdits = elements.filter((item) => item.type === 'textEdit' && isChangedTextEdit(item));
    let pdfBytes;
    if (textEdits.length) {
      setExportNotice('Applying text edits…');
      try {
        pdfBytes = await applyTextEdits({ pdfFile, edits: textEdits, onWarning });
      } finally {
        setExportNotice('');
      }
    } else {
      pdfBytes = await pdfFile.arrayBuffer();
    }
    const modified = await generatePdf({
      pdfBytes,
      elements: elements.filter((item) => item.type !== 'textEdit'),
      formValues,
      onWarning,
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
  // Fit the page to the available canvas width (minus padding), then apply zoom.
  const canvasPadding = containerWidth < 640 ? 24 : 64;
  const fitWidth = clamp(containerWidth - canvasPadding, 280, 900);
  const targetWidth = Math.floor(fitWidth * zoom);
  const countByPage = elements.reduce((acc, item) => {
    acc[item.pageIndex] = (acc[item.pageIndex] || 0) + 1;
    return acc;
  }, {});

  const goToPage = (page) => {
    setCurrentPage(clamp(page, 1, numPages || 1));
    setSelectedId(null);
    setEditingId(null);
    setLeftOpen(false);
  };

  const openSignatures = () => {
    setLeftTab('signatures');
    setLeftOpen(true);
  };

  const saveLabel = {
    saved: 'Saved',
    saving: 'Saving…',
    dirty: 'Unsaved changes',
    error: 'Save failed — retry',
  }[saveStatus];

  const TEXT_COLORS = ['#111827', '#1d4ed8', '#b91c1c', '#047857'];

  return (
    <div className="editor">
      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleImageInput} />
      <input ref={signatureInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleSignatureInput} />

      <header className="editor-bar">
        <div className="editor-bar-left">
          <button type="button" className="btn btn-ghost btn-icon" onClick={leaveAfterSave(onBackToDashboard)} aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeft size={18} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon drawer-only" onClick={() => setLeftOpen((v) => !v)} aria-label="Pages and signatures">
            <PanelLeft size={18} />
          </button>
          <div className="editor-title">
            <h1 title={documentTitle}>{documentTitle}</h1>
            <button
              type="button"
              className={`save-state ${saveStatus}`}
              onClick={saveStatus === 'error' || saveStatus === 'dirty' ? saveDraftNow : undefined}
              title={saveError || 'Changes are saved automatically'}
            >
              {saveStatus === 'saving' ? <Loader2 size={12} className="spin" /> : saveStatus === 'saved' ? <Check size={12} /> : <span className="status-dot" />}
              {saveLabel}
            </button>
          </div>
        </div>

        <div className="editor-bar-center">
          <div className="tool-group" role="toolbar" aria-label="Insert">
            <button
              type="button"
              className={`btn btn-ghost ${textMode ? 'is-active' : ''}`}
              onClick={() => setTextMode((value) => !value)}
              aria-pressed={textMode}
              title="Edit text already in the PDF"
            >
              <ScanText size={16} /> <span className="hide-sm">Edit text</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={addText} title="Add text">
              <Type size={16} /> <span className="hide-sm">Text</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => imageInputRef.current?.click()} disabled={busy} title="Add image">
              <ImagePlus size={16} /> <span className="hide-sm">Image</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={openSignatures} disabled={busy} title="Add signature">
              <Signature size={16} /> <span className="hide-sm">Sign</span>
            </button>
          </div>
          <span className="bar-sep" />
          <button type="button" className="btn btn-ghost btn-icon" onClick={undo} disabled={!historyFlags.canUndo} aria-label="Undo" title="Undo (⌘Z)">
            <Undo2 size={17} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={redo} disabled={!historyFlags.canRedo} aria-label="Redo" title="Redo (⇧⌘Z)">
            <Redo2 size={17} />
          </button>
        </div>

        <div className="editor-bar-right">
          <div className="zoom-control hide-sm">
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setZoom((z) => clamp(Math.round((z - 0.1) * 10) / 10, 0.5, 2))} aria-label="Zoom out">
              <ZoomOut size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setZoom((z) => clamp(Math.round((z + 0.1) * 10) / 10, 0.5, 2))} aria-label="Zoom in">
              <ZoomIn size={16} />
            </button>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setZoom(1)} aria-label="Fit to width" title="Fit to width">
              <Maximize size={15} />
            </button>
          </div>

          <Menu
            trigger={({ toggle, ...aria }) => (
              <button type="button" className="btn btn-primary" onClick={toggle} disabled={busy} {...aria}>
                {busy ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                <span className="hide-sm">Download</span>
                <ChevronDown size={15} />
              </button>
            )}
          >
            <div className="menu-label">Export</div>
            <button type="button" role="menuitem" className="menu-item" onClick={exportPdf}>
              <Download size={16} /> PDF document
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => exportImage('png')}>
              <FileImage size={16} /> PNG image <small>page {currentPage}</small>
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => exportImage('jpeg')}>
              <FileImage size={16} /> JPG image <small>page {currentPage}</small>
            </button>
          </Menu>

          <Menu
            trigger={({ toggle, ...aria }) => (
              <button type="button" className="btn btn-ghost btn-icon" onClick={toggle} aria-label="More options" {...aria}>
                <MoreHorizontal size={18} />
              </button>
            )}
          >
            <button type="button" role="menuitem" className="menu-item" onClick={saveDraftNow}>
              <Save size={16} /> Save now
            </button>
            <div className="menu-sep" />
            <button type="button" role="menuitem" className="menu-item" onClick={clearPage} disabled={!pageElements.length}>
              <Eraser size={16} /> Clear this page
            </button>
            <button type="button" role="menuitem" className="menu-item danger" onClick={clearAll} disabled={!hasElements}>
              <Trash2 size={16} /> Remove all edits
            </button>
            <div className="menu-sep" />
            <button type="button" role="menuitem" className="menu-item" onClick={leaveAfterSave(onSignOut)}>
              <LogOut size={16} /> Sign out
            </button>
          </Menu>

          <button type="button" className="btn btn-ghost btn-icon drawer-only" onClick={() => setRightOpen((v) => !v)} aria-label="Properties">
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </header>

      <Document
        file={pdfFile}
        className="editor-body"
        onLoadSuccess={({ numPages: loaded }) => {
          setNumPages(loaded);
          setCurrentPage((prev) => clamp(prev, 1, loaded));
        }}
        loading={
          <div className="editor-loading">
            <Loader2 size={22} className="spin" />
            <span>Opening document…</span>
          </div>
        }
        error={<div className="editor-loading">This PDF could not be opened.</div>}
      >
        <div className={`drawer-backdrop ${leftOpen || rightOpen ? 'is-open' : ''}`} onClick={() => { setLeftOpen(false); setRightOpen(false); }} />

        <aside className={`editor-rail ${leftOpen ? 'is-open' : ''}`} aria-label="Pages and signatures">
          <div className="panel-tabs" role="tablist">
            <button type="button" role="tab" className="panel-tab" aria-selected={leftTab === 'pages'} onClick={() => setLeftTab('pages')}>
              Pages
            </button>
            <button type="button" role="tab" className="panel-tab" aria-selected={leftTab === 'signatures'} onClick={() => setLeftTab('signatures')}>
              Signatures
            </button>
          </div>

          <div className="panel-scroll">
            {leftTab === 'pages' ? (
              <div className="thumb-list">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className="thumb" aria-current={n === currentPage} onClick={() => goToPage(n)}>
                    <span className="thumb-sheet">
                      <LazyPage pageNumber={n} width={150} />
                      {countByPage[n - 1] ? <span className="badge badge-accent thumb-count">{countByPage[n - 1]}</span> : null}
                    </span>
                    <span>{n}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="panel-section panel-stack">
                <div className="field">
                  <label className="field-label" htmlFor="signature-name">New signature</label>
                  <input
                    id="signature-name"
                    className="input"
                    value={signatureName}
                    onChange={(event) => setSignatureName(event.target.value)}
                    placeholder="Name (optional)"
                  />
                  <span className="field-hint">Upload a photo or scan; white backgrounds are removed automatically.</span>
                </div>
                <button type="button" className="btn btn-secondary btn-block" onClick={() => signatureInputRef.current?.click()} disabled={busy}>
                  <Upload size={16} /> Upload signature
                </button>
                <div className="divider" />
                {signatures.length ? (
                  <div className="sig-grid">
                    {signatures.map((signature) => (
                      <div key={signature.id} className="sig-item">
                        <button
                          type="button"
                          onClick={() => {
                            addSavedSignature(signature);
                            setLeftOpen(false);
                          }}
                          style={{ display: 'grid', gap: 4, padding: 0, border: 0, background: 'none', textAlign: 'left' }}
                          title="Place on current page"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={signature.url} alt={signature.name || 'Signature'} />
                          <span>{signature.name || 'Saved signature'}</span>
                        </button>
                        <button
                          type="button"
                          className="tile-btn danger"
                          aria-label={`Delete ${signature.name || 'signature'}`}
                          onClick={async () => {
                            try {
                              await onDeleteSignature(signature);
                              setSaveError('');
                            } catch (error) {
                              setSaveError(error.message || 'Failed to delete signature.');
                            }
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="small muted">Saved signatures appear here so you can reuse them on any document.</p>
                )}
              </div>
            )}
          </div>
        </aside>

        <div className="editor-canvas" ref={shellRef} onPointerDown={() => setSelectedId(null)}>
          <div className="editor-canvas-inner">
            <div className="pdf-stage" ref={canvasRef} style={{ width: renderSize.width, height: renderSize.height }}>
              <Page
                pageNumber={currentPage}
                width={targetWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onRenderSuccess={(page) => {
                  setRenderSize({ width: page.width, height: page.height });
                }}
              />

              <div className="overlay">
                {textMode && pageLayout?.status === 'ready'
                  ? pageLayout.lines
                    .filter((line) => !editedLineIds.has(line.id))
                    .map((line) => (
                      <button
                        key={line.id}
                        type="button"
                        className="text-line"
                        style={{
                          left: `${line.x * 100}%`,
                          top: `${line.y * 100}%`,
                          width: `${line.width * 100}%`,
                          height: `${line.height * 100}%`,
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => startLineEdit(line)}
                        aria-label={`Edit text: ${line.text}`}
                        title="Click to edit"
                      />
                    ))
                  : null}

                {pageElements.map((item) => {
                  const isSelected = selectedId === item.id;
                  if (item.type === 'textEdit') {
                    const isEditing = editingId === item.id;
                    const changed = isChangedTextEdit(item);
                    const fontPx = (item.size / item.pageWidth) * renderSize.width;
                    const textStyle = {
                      left: (item.original.originX - item.x) * renderSize.width,
                      // line-height 1 puts the baseline about 0.78em below the top for most fonts.
                      top: (item.original.baseline - item.y) * renderSize.height - fontPx * 0.78,
                      color: item.color,
                      fontSize: `${fontPx}px`,
                      fontWeight: item.bold ? 700 : 400,
                      fontStyle: item.italic ? 'italic' : 'normal',
                      fontFamily: previewFontFamily(item),
                    };
                    return (
                      <div
                        key={item.id}
                        className={`item text-edit ${isSelected ? 'selected' : ''}`}
                        style={{
                          left: `${item.x * 100}%`,
                          top: `${item.y * 100}%`,
                          width: `${item.width * 100}%`,
                          height: `${item.height * 100}%`,
                          background: changed || isEditing ? item.original.background : 'transparent',
                        }}
                        onPointerDown={(event) => startInteraction(event, item.id, 'drag')}
                        onDoubleClick={() => {
                          setSelectedId(item.id);
                          setEditingId(item.id);
                        }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={item.text}
                            onChange={(event) => updateSelected({ text: event.target.value })}
                            onBlur={() => setEditingId(null)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                            }}
                            className="text-edit-input"
                            style={textStyle}
                            aria-label="Edit text"
                          />
                        ) : changed ? (
                          <span className="text-edit-text" style={textStyle}>{item.text}</span>
                        ) : null}

                        {isSelected && !isEditing ? (
                          <div className="item-toolbar" onPointerDown={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => setEditingId(item.id)} aria-label="Edit text" title="Edit text">
                              <Type size={14} />
                            </button>
                            <button type="button" onClick={removeSelected} aria-label="Revert to original" title="Revert to original">
                              <RotateCcw size={14} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={item.id}
                      className={`item ${isSelected ? 'selected' : ''} ${item.type === 'text' ? 'text-item' : 'image-item'}`}
                      style={{
                        left: `${item.x * 100}%`,
                        top: `${item.y * 100}%`,
                        width: `${item.width * 100}%`,
                        height: `${item.height * 100}%`,
                      }}
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
                            style={{
                              color: item.color,
                              fontWeight: item.bold ? 700 : 400,
                              fontSize: `${Math.max(item.fontSize * renderSize.width, 8)}px`,
                            }}
                          />
                        ) : (
                          <div
                            className="text-content"
                            style={{
                              color: item.color,
                              fontWeight: item.bold ? 700 : 400,
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

                      {isSelected && editingId !== item.id ? (
                        <div className="item-toolbar" onPointerDown={(event) => event.stopPropagation()}>
                          {item.type === 'text' ? (
                            <button type="button" onClick={() => setEditingId(item.id)} aria-label="Edit text" title="Edit text">
                              <Type size={14} />
                            </button>
                          ) : null}
                          <button type="button" onClick={duplicateSelected} aria-label="Duplicate" title="Duplicate">
                            <Copy size={14} />
                          </button>
                          <button type="button" onClick={removeSelected} aria-label="Delete" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ) : null}

                      {isSelected || (item.type === 'image' && hoverId === item.id) ? (
                        <>
                          <button type="button" className="resize-handle nw" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'nw')} aria-label="Resize" />
                          <button type="button" className="resize-handle ne" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'ne')} aria-label="Resize" />
                          <button type="button" className="resize-handle sw" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'sw')} aria-label="Resize" />
                          <button type="button" className="resize-handle se" onPointerDown={(event) => startInteraction(event, item.id, 'resize', 'se')} aria-label="Resize" />
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {exportNotice || textMode ? (
            <div className="text-mode-status" role="status" onPointerDown={(event) => event.stopPropagation()}>
              {exportNotice ? (
                <>
                  <Loader2 size={14} className="spin" /> {exportNotice}
                </>
              ) : !pageLayout || pageLayout.status === 'loading' ? (
                <>
                  <Loader2 size={14} className="spin" />
                  {pageLayout?.waking
                    ? `Starting the text engine… ${pageLayout.waking}s`
                    : 'Finding text… scanned pages take a few seconds longer'}
                </>
              ) : pageLayout.status === 'error' ? (
                <>
                  <span>{pageLayout.error}</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadLayout(currentPage - 1)}>
                    Retry
                  </button>
                </>
              ) : pageLayout.ocrUnavailable ? (
                <span>This page is a scan and text recognition isn&apos;t available right now.</span>
              ) : !pageLayout.lines.length ? (
                <span>No editable text found on this page.</span>
              ) : (
                <span>
                  {pageLayout.source === 'ocr' ? 'Scanned page: text recognised with OCR. ' : ''}
                  Click any line to edit it.
                </span>
              )}
              {textMode && !exportNotice ? (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setTextMode(false)} aria-label="Close edit text mode">
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ) : null}

          {numPages > 1 ? (
            <div className="page-pager" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
                <ChevronLeft size={16} />
              </button>
              <span>{currentPage} / {numPages}</span>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} aria-label="Next page">
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
        </div>

        <aside className={`editor-inspector ${rightOpen ? 'is-open' : ''}`} aria-label="Properties" onPointerDown={(event) => event.stopPropagation()}>
          <div className="panel-scroll">
            {saveError ? (
              <div className="panel-section">
                <div className="alert alert-error" role="alert">{saveError}</div>
              </div>
            ) : null}

            <section className="panel-section">
              <h3>
                {selectedElement
                  ? selectedElement.type === 'textEdit'
                    ? 'Edited text'
                    : selectedElement.type === 'text'
                      ? 'Text'
                      : selectedElement.isSignature
                        ? 'Signature'
                        : 'Image'
                  : 'Properties'}
              </h3>
              {!selectedElement ? (
                <div className="panel-stack">
                  <p className="small muted">Select an item on the page to edit it, or add something new. Use Edit text to change words already in the PDF.</p>
                  <div className="panel-row">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addText}><Plus size={14} /> Text</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => imageInputRef.current?.click()} disabled={busy}><Plus size={14} /> Image</button>
                  </div>
                  {/* The toolbar is hidden on phones, so this is how small screens reach Edit text. */}
                  <div className="panel-row">
                    <button
                      type="button"
                      className={`btn btn-secondary btn-sm ${textMode ? 'is-active' : ''}`}
                      onClick={() => {
                        setTextMode((value) => !value);
                        setRightOpen(false);
                      }}
                      aria-pressed={textMode}
                    >
                      <ScanText size={14} /> {textMode ? 'Stop editing text' : 'Edit text'}
                    </button>
                  </div>
                  <p className="small muted">
                    Tip: <span className="kbd">⌘Z</span> undo · <span className="kbd">Del</span> remove · arrows nudge
                  </p>
                </div>
              ) : (
                <div className="panel-stack">
                  {selectedElement.type === 'textEdit' ? (
                    <>
                      <div className="field">
                        <label className="field-label" htmlFor="text-edit-field">Content</label>
                        <input
                          id="text-edit-field"
                          className="input"
                          value={selectedElement.text}
                          onChange={(event) => updateSelected({ text: event.target.value })}
                        />
                        <span className="field-hint">Was: {selectedElement.original.text}</span>
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor="text-edit-size">Size · {selectedElement.size.toFixed(1)} pt</label>
                        <input
                          id="text-edit-size"
                          type="range"
                          min={Math.max(4, Math.round(selectedElement.original.size * 0.5))}
                          max={Math.round(selectedElement.original.size * 2)}
                          step={0.5}
                          value={selectedElement.size}
                          onChange={(event) => updateSelected({ size: Number(event.target.value) })}
                        />
                      </div>
                      <div className="field">
                        <span className="field-label">Font</span>
                        <div className="panel-row">
                          <select
                            className="select"
                            value={selectedElement.fontFamily || ''}
                            onChange={(event) => {
                              const name = event.target.value;
                              const category = fontGroups.flatMap((group) => group.fonts).find((font) => font.name === name)?.category;
                              updateSelected({
                                fontFamily: name,
                                // Picking "Original" restores its kind; a library font sets its own.
                                family: !name
                                  ? selectedElement.original.family
                                  : ['sans', 'serif', 'mono'].includes(category)
                                    ? category
                                    : selectedElement.family,
                              });
                            }}
                            aria-label="Font"
                          >
                            <option value="">
                              {selectedElement.original.font
                                ? `Original (${fontDisplayName(selectedElement.original.font)})`
                                : `Automatic${selectedElement.original.match ? ` (${selectedElement.original.match})` : ''}`}
                            </option>
                            {fontGroups.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.fonts.map((font) => (
                                  <option key={font.name} value={font.name}>{font.name}</option>
                                ))}
                              </optgroup>
                            ))}
                            {selectedElement.fontFamily && !fontGroups.some((group) => group.fonts.some((font) => font.name === selectedElement.fontFamily)) ? (
                              <option value={selectedElement.fontFamily}>{selectedElement.fontFamily}</option>
                            ) : null}
                          </select>
                          <button
                            type="button"
                            className={`btn btn-secondary btn-icon btn-sm ${selectedElement.bold ? 'is-active' : ''}`}
                            onClick={() => updateSelected({ bold: !selectedElement.bold })}
                            aria-pressed={selectedElement.bold}
                            aria-label="Bold"
                            style={{ flex: '0 0 auto' }}
                          >
                            <Bold size={15} />
                          </button>
                          <button
                            type="button"
                            className={`btn btn-secondary btn-icon btn-sm ${selectedElement.italic ? 'is-active' : ''}`}
                            onClick={() => updateSelected({ italic: !selectedElement.italic })}
                            aria-pressed={selectedElement.italic}
                            aria-label="Italic"
                            style={{ flex: '0 0 auto' }}
                          >
                            <Italic size={15} />
                          </button>
                        </div>
                        <span className="field-hint">
                          {(() => {
                            const { original } = selectedElement;
                            const name = fontDisplayName(original.font);
                            const fallback = original.match
                              ? original.matchExact
                                ? `another copy of ${original.match}`
                                : `${original.match}, a close match`
                              : 'a similar font';
                            if (selectedElement.fontFamily) return `Drawn in ${selectedElement.fontFamily}.`;
                            if (original.source === 'ocr') {
                              return `Recognised from a scan, so ${original.match || 'a similar font'} is used. Pick another font if it looks different.`;
                            }
                            if (!keepsOriginalStyle(selectedElement)) {
                              return `Style changed, so ${original.match && !original.matchExact ? `${original.match} (like ${name})` : name || 'a similar font'} will be used in that style.`;
                            }
                            return name
                              ? `Keeps ${name} when it has every character you type; otherwise ${fallback}.`
                              : `${original.match || 'A similar font'} will be used.`;
                          })()}
                        </span>
                      </div>
                      <div className="field">
                        <span className="field-label">Color</span>
                        <div className="color-swatches">
                          {[selectedElement.original.color, ...TEXT_COLORS.filter((hex) => hex !== selectedElement.original.color)].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              className="swatch"
                              style={{ background: hex }}
                              aria-label={hex === selectedElement.original.color ? 'Original color' : `Color ${hex}`}
                              aria-pressed={selectedElement.color === hex}
                              onClick={() => updateSelected({ color: hex })}
                            />
                          ))}
                          <input
                            type="color"
                            value={selectedElement.color}
                            onChange={(event) => updateSelected({ color: event.target.value })}
                            className="color-input"
                            aria-label="Custom color"
                          />
                        </div>
                      </div>
                      <div className="panel-row">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={removeSelected}>
                          <RotateCcw size={14} /> Revert to original
                        </button>
                      </div>
                    </>
                  ) : selectedElement.type === 'text' ? (
                    <>
                      <div className="field">
                        <label className="field-label" htmlFor="text-content-field">Content</label>
                        <textarea
                          id="text-content-field"
                          value={selectedElement.text}
                          onChange={(event) => updateSelected({ text: event.target.value })}
                          rows={3}
                          className="textarea"
                        />
                      </div>
                      <div className="field">
                        <label className="field-label" htmlFor="font-size-field">
                          Size · {Math.round(selectedElement.fontSize * 612)} pt
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
                      </div>
                      <div className="field">
                        <span className="field-label">Style</span>
                        <div className="panel-row" style={{ justifyContent: 'space-between' }}>
                          <div className="color-swatches">
                            {TEXT_COLORS.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                className="swatch"
                                style={{ background: hex }}
                                aria-label={`Color ${hex}`}
                                aria-pressed={selectedElement.color === hex}
                                onClick={() => updateSelected({ color: hex })}
                              />
                            ))}
                            <input
                              type="color"
                              value={selectedElement.color}
                              onChange={(event) => updateSelected({ color: event.target.value })}
                              className="color-input"
                              aria-label="Custom color"
                            />
                          </div>
                          <button
                            type="button"
                            className={`btn btn-secondary btn-icon btn-sm ${selectedElement.bold ? 'is-active' : ''}`}
                            onClick={() => updateSelected({ bold: !selectedElement.bold })}
                            aria-pressed={selectedElement.bold}
                            aria-label="Bold"
                            style={{ flex: '0 0 auto' }}
                          >
                            <Bold size={15} />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="small muted">Drag to move. Use the corner handles to resize.</p>
                  )}
                  {selectedElement.type !== 'textEdit' ? (
                    <div className="panel-row">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={duplicateSelected}><Copy size={14} /> Duplicate</button>
                      <button type="button" className="btn btn-danger-ghost btn-sm" onClick={removeSelected}><Trash2 size={14} /> Delete</button>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            <section className="panel-section">
              <h3>Fill &amp; sign</h3>
              {formLoading ? (
                <div className="skeleton" style={{ height: 80 }} />
              ) : formFields.length ? (
                <div className="panel-stack">
                  {formFields.map((field) => {
                    const value = formValues[field.name];
                    const controlId = `form-field-${field.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                    if (field.type === 'checkbox') {
                      return (
                        <label key={field.name} className="check-row" htmlFor={controlId}>
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
                        <div key={field.name} className="field">
                          <label className="field-label" htmlFor={controlId}>{field.label}</label>
                          <select
                            id={controlId}
                            className="select"
                            value={value ?? ''}
                            onChange={(event) => updateFormValue(field.name, event.target.value)}
                          >
                            <option value="">Select…</option>
                            {(field.options || []).map((option) => (
                              <option key={`${field.name}-${option}`} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    return (
                      <div key={field.name} className="field">
                        <label className="field-label" htmlFor={controlId}>{field.label}</label>
                        <div className="input-group">
                          <input
                            id={controlId}
                            type="text"
                            className="input"
                            value={value ?? ''}
                            onChange={(event) => updateFormValue(field.name, event.target.value)}
                          />
                          <Menu
                            trigger={({ toggle, ...aria }) => (
                              <button type="button" className="btn btn-secondary btn-icon" onClick={toggle} aria-label={`Quick fill ${field.label}`} {...aria}>
                                <ChevronDown size={15} />
                              </button>
                            )}
                          >
                            <button type="button" role="menuitem" className="menu-item" onClick={() => applyQuickFormValue(field.name, 'date')}>Today&apos;s date</button>
                            <button type="button" role="menuitem" className="menu-item" onClick={() => applyQuickFormValue(field.name, 'initials')} disabled={!initialsValue}>
                              My initials <small>{initialsValue}</small>
                            </button>
                          </Menu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="panel-stack">
                  <p className="small muted">No form fields found. Insert your details as text on page {currentPage}:</p>
                  {[
                    ['name', 'Name', 'quickfill-name', undefined],
                    ['email', 'Email', 'quickfill-email', 0.44],
                    ['address', 'Address', 'quickfill-address', 0.48],
                    ['mobile', 'Phone', 'quickfill-mobile', undefined],
                  ].map(([key, label, fillKey, width]) => (
                    <div key={key} className="field">
                      <label className="field-label" htmlFor={`quick-fill-${key}`}>{label}</label>
                      <div className="input-group">
                        <input
                          id={`quick-fill-${key}`}
                          className="input"
                          value={quickFill[key]}
                          onChange={(event) => setQuickFill((prev) => ({ ...prev, [key]: event.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          onClick={() => insertQuickFillText(quickFill[key], { key: fillKey, width })}
                          disabled={!String(quickFill[key] || '').trim()}
                          aria-label={`Insert ${label}`}
                          title={`Insert ${label}`}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="panel-row">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => insertQuickFillText(new Date().toLocaleDateString(), { key: 'quickfill-date' })}>
                      Date
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => insertQuickFillText(initialsValue, { key: 'quickfill-initials' })} disabled={!initialsValue}>
                      Initials
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="panel-section">
              <h3>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Layers size={13} /> Page {currentPage} layers</span>
                <span className="badge">{pageElements.length}</span>
              </h3>
              {pageElements.length ? (
                <div className="layer-list">
                  {[...pageElements].reverse().map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`layer-row ${item.id === selectedId ? 'active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.type === 'textEdit' ? <ScanText size={14} /> : item.type === 'text' ? <Type size={14} /> : item.isSignature ? <Signature size={14} /> : <ImagePlus size={14} />}
                      <span>
                        {item.type === 'textEdit'
                          ? item.text || 'Removed text'
                          : item.type === 'text'
                            ? item.text || 'Empty text'
                            : item.isSignature
                              ? 'Signature'
                              : 'Image'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small muted">Nothing added to this page yet.</p>
              )}
            </section>
          </div>
        </aside>
      </Document>
    </div>
  );
}
