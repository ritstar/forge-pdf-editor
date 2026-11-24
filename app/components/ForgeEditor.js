'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eraser,
  FileCheck2,
  FileImage,
  Files,
  Keyboard,
  Layers,
  Loader2,
  LogOut,
  Maximize,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RotateCcw,
  Save,
  ScanText,
  SlidersHorizontal,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Document, Page } from 'react-pdf';
import { PDFDocument } from '@cantoo/pdf-lib';
import LazyPage from './ui/LazyPage';
import Menu from './ui/Menu';
import ElementGraphic from './editor/ElementGraphic';
import FindRedactPanel from './editor/FindRedactPanel';
import Inspector from './editor/Inspector';
import SignatureDialog from './editor/SignatureDialog';
import Toolstrip, { TOOL_KEYS } from './editor/Toolstrip';
import {
  clamp,
  createImage,
  createText,
  DEFAULT_TOOL_STYLES,
  describeElement,
  fontCss,
  hydrateElements,
  isLine,
  keepsRatio,
  lineFromPoints,
  makeId,
  moveLineEnd,
  resizeBox,
  serializeElements,
  snapAngle,
} from './editor/model';
import '../utils/pdfWorker';
import { convertPdfToImage } from '../utils/pdfToImage';
import { imageSize, prepareImageForUpload } from '../utils/imageProcessing';
import { generatePdf, LINE_HEIGHT, TEXT_INSET } from '../utils/pdfGenerator';
import { extractFormFieldsFromPdfBytes, getInitialsFromName } from '../utils/pdfForms';
import { downloadBlob, downloadPdfBytes, stripExtension } from '../utils/files';
import { simplifyPoints } from '../utils/vectorPaths';
import { applyServerEdits, createTextEdit, fetchTextLayout, groupFonts, isChangedTextEdit, previewFontFamily } from '../utils/textEditing';

const HISTORY_LIMIT = 80;
const COALESCE_MS = 1000;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
// Tools that create something by clicking or dragging on the page.
const CREATE_TOOLS = new Set(['text', 'pen', 'highlight', 'rect', 'ellipse', 'line', 'arrow', 'whiteout', 'redact', 'check', 'cross', 'dot', 'place']);
// Tools that stay active after use, for marking several things in a row.
const STICKY_TOOLS = new Set(['pen', 'highlight', 'whiteout', 'redact', 'check', 'cross', 'dot']);
// Pen strokes this close together in time become one drawing (a handwritten word).
const INK_MERGE_MS = 1600;
const CLIP_MARKER = '⁣forge-element';
const TOOL_STYLE_KEY = 'forge-tool-styles';

const SHORTCUTS = [
  ['V', 'Select'],
  ['E', 'Edit existing text'],
  ['T', 'Add text'],
  ['S', 'Add signature'],
  ['D', 'Draw'],
  ['H', 'Highlight'],
  ['R / O / L / A', 'Rectangle, ellipse, line, arrow'],
  ['K', 'Check mark'],
  ['W', 'Whiteout'],
  ['X', 'Redact'],
  ['⌘C / ⌘V / ⌘D', 'Copy, paste, duplicate'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['Del', 'Delete selection'],
  ['Arrows', 'Nudge (Shift: further)'],
  ['Shift + drag', 'Keep proportions / straight lines'],
  ['PgUp / PgDn', 'Previous / next page'],
  ['⌘+ / ⌘− / ⌘0', 'Zoom in, out, fit'],
  ['⌘S', 'Save now'],
  ['Esc', 'Back to Select'],
];

function isEditableTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
}

function loadToolStyles() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOOL_STYLE_KEY) || '{}');
    return Object.fromEntries(Object.entries(DEFAULT_TOOL_STYLES).map(([key, value]) => [key, { ...value, ...(stored[key] || {}) }]));
  } catch {
    return DEFAULT_TOOL_STYLES;
  }
}

/**
 * A text box that grows to fit its content. A hidden copy of the text is measured after
 * every render, so the box (and its selection frame) always matches what is exported.
 */
function TextBox({ item, editing, size, onText, onAutoHeight, onDone }) {
  const mirrorRef = useRef(null);
  const fontPx = Math.max(item.fontSize * size.width, 4);
  const style = {
    color: item.color,
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? 'italic' : 'normal',
    fontFamily: fontCss(item.fontFamily),
    fontSize: `${fontPx}px`,
    textAlign: item.align || 'left',
    padding: `${fontPx * TEXT_INSET}px`,
    lineHeight: LINE_HEIGHT,
  };

  useLayoutEffect(() => {
    const node = mirrorRef.current;
    if (!node || !size.height) return;
    const needed = Math.min(node.offsetHeight / size.height, 1 - item.y);
    if (Math.abs(needed - item.height) * size.height > 0.5) onAutoHeight(item.id, Math.max(needed, 0.005));
  });

  return (
    <>
      <div ref={mirrorRef} className="text-mirror" style={style} aria-hidden="true">
        {`${item.text || 'Type here'}​`}
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={item.text}
          placeholder="Type here"
          onChange={(event) => onText(event.target.value)}
          onBlur={onDone}
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
          className="inline-editor"
          style={style}
          aria-label="Text"
        />
      ) : (
        <div className="text-content" style={{ ...style, opacity: item.opacity ?? 1 }}>
          {item.text}
        </div>
      )}
    </>
  );
}

function ShortcutsDialog({ onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' || event.key === '?') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="sig-dialog-head">
          <h3 id="shortcuts-title">Keyboard shortcuts</h3>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close" autoFocus>
            <X size={16} />
          </button>
        </div>
        <dl className="shortcut-list">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys}>
              <dt>{label}</dt>
              <dd><span className="kbd">{keys}</span></dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export default function ForgeEditor({
  userEmail,
  userName,
  documentTitle,
  initialPdfFile,
  initialDraft,
  initialTool,
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
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState(initialDraft?.zoom || 1);
  const [busy, setBusy] = useState(false);
  const [tool, setToolState] = useState(initialTool === 'redact' || initialTool === 'edit-text' ? initialTool : 'select');
  const [toolStyles, setToolStyles] = useState(loadToolStyles);
  const [draft, setDraft] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [signatureDialog, setSignatureDialog] = useState(initialTool === 'sign' ? 'signature' : null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [leftTab, setLeftTab] = useState(initialTool === 'redact' ? 'redact' : 'pages');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  const [renderSize, setRenderSize] = useState({ width: 680, height: 900 });
  const [containerWidth, setContainerWidth] = useState(980);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [saveError, setSaveError] = useState('');
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
  const textMode = tool === 'edit-text';
  const [layouts, setLayouts] = useState({});
  const [exportNotice, setExportNotice] = useState('');

  const imageInputRef = useRef(null);
  const layoutRequestsRef = useRef(new Set());
  const sourceDocRef = useRef(null);
  const shellRef = useRef(null);
  const canvasRef = useRef(null);
  const interactionRef = useRef(null);
  const drawRef = useRef(null);
  const lastInkRef = useRef(null);
  const clipboardRef = useRef(null);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef(null);
  const lastSavedPayloadRef = useRef(null);
  const resetBaselineRef = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const saveStatusRef = useRef('saved');
  const elementsRef = useRef(elements);
  const keyHandlerRef = useRef(null);
  const clipboardHandlersRef = useRef(null);
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
    try {
      window.localStorage.setItem(TOOL_STYLE_KEY, JSON.stringify(toolStyles));
    } catch {
      // Storage is a convenience only.
    }
  }, [toolStyles]);

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
  const redactionCount = useMemo(() => elements.filter((item) => item.type === 'redact').length, [elements]);
  // Page width / height as displayed, to keep things square on screen.
  const aspect = renderSize.width / (renderSize.height || 1);

  const setTool = useCallback((next) => {
    setToolState(next);
    if (next !== 'place') {
      setPlacement(null);
      setHoverPoint(null);
    }
    if (CREATE_TOOLS.has(next)) {
      setSelectedId(null);
      setEditingId(null);
    }
    lastInkRef.current = null;
  }, []);

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

  const zoomBy = useCallback((delta) => {
    setZoom((z) => clamp(Math.round((z + delta) * 10) / 10, ZOOM_MIN, ZOOM_MAX));
  }, []);

  useEffect(() => {
    // The canvas mounts only after the PDF loads, so re-run when the page count arrives.
    const shell = shellRef.current;
    if (!shell) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(shell);
    // Ctrl/⌘ + wheel (and trackpad pinch, which browsers report the same way) zooms the page.
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY < 0 ? 0.1 : -0.1);
    };
    shell.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      shell.removeEventListener('wheel', onWheel);
    };
  }, [numPages, zoomBy]);

  const pointFromEvent = useCallback((event) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  }, []);

  // Moving and resizing elements with mouse, touch or pen.
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
        if (Math.abs(event.clientX - interaction.startClient.x) < 3 && Math.abs(event.clientY - interaction.startClient.y) < 3) {
          return;
        }
        interaction.moved = true;
        pushHistory(elementsRef.current);
      }

      const start = interaction.startItem;
      setElements(
        elementsRef.current.map((item) => {
          if (item.id !== interaction.id) return item;

          if (interaction.mode === 'drag') {
            return {
              ...item,
              x: clamp(start.x + dx, 0, 1 - start.width),
              y: clamp(start.y + dy, 0, 1 - start.height),
            };
          }

          if (interaction.mode === 'resize') {
            const keepRatio = keepsRatio(item) !== event.shiftKey;
            const minW = item.type === 'text' ? 0.06 : 0.01;
            return { ...item, ...resizeBox(start, interaction.handle, dx, dy, { keepRatio, minW, minH: 0.005 }) };
          }

          if (interaction.mode === 'endpoint') {
            let point = { x: interaction.startPoint.x + dx, y: interaction.startPoint.y + dy };
            if (event.shiftKey) point = snapAngle(interaction.otherPoint, point, rect.width / rect.height);
            return { ...item, ...moveLineEnd(start, interaction.handle, point) };
          }

          return item;
        }),
      );
    };

    const onUp = () => {
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
    if (editingId !== id) setEditingId(null);

    const target = elementsRef.current.find((item) => item.id === id);
    if (!target || target.type === 'textEdit') return;

    let startPoint = null;
    let otherPoint = null;
    if (mode === 'endpoint') {
      const p1 = { x: target.flipX ? target.x + target.width : target.x, y: target.flipY ? target.y + target.height : target.y };
      const p2 = { x: target.flipX ? target.x : target.x + target.width, y: target.flipY ? target.y : target.y + target.height };
      startPoint = handle === 'p1' ? p1 : p2;
      otherPoint = handle === 'p1' ? p2 : p1;
    }

    interactionRef.current = {
      id,
      mode,
      handle,
      moved: false,
      startClient: { x: event.clientX, y: event.clientY },
      startItem: { ...target },
      startPoint,
      otherPoint,
    };
  };

  const updateElement = useCallback((id, updates, { track = true } = {}) => {
    // Typing or dragging a slider produces one undo step per burst, not per keystroke.
    const coalesceKey = `${id}:${Object.keys(updates).sort().join(',')}`;
    applyChange((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)), { coalesceKey, track });
  }, [applyChange]);

  const updateSelected = (updates) => {
    if (!selectedId) return;
    updateElement(selectedId, updates);
    // The next element drawn with the same tool uses the style the user just chose.
    const item = elementsRef.current.find((el) => el.id === selectedId);
    const toolKey = item?.type === 'ink' ? 'pen' : item?.type === 'mark' ? 'mark' : item?.type === 'shape' ? item.kind : null;
    const styleKeys = ['color', 'stroke', 'fill', 'strokeWidth', 'opacity'];
    const styleUpdates = Object.fromEntries(Object.entries(updates).filter(([key]) => styleKeys.includes(key)));
    if (toolKey && toolStyles[toolKey] && Object.keys(styleUpdates).length) {
      setToolStyles((prev) => ({ ...prev, [toolKey]: { ...prev[toolKey], ...styleUpdates } }));
    }
  };

  const autoHeight = useCallback((id, height) => {
    applyChange((prev) => prev.map((item) => (item.id === id ? { ...item, height } : item)), { track: false });
  }, [applyChange]);

  const updateFormValue = (name, value) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const addElement = useCallback((item, { edit = false } = {}) => {
    applyChange((prev) => [...prev, item]);
    setSelectedId(item.id);
    setEditingId(edit ? item.id : null);
  }, [applyChange]);

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

    addElement(createText(currentPage - 1, {
      text,
      x: 0.12,
      y,
      width: options.width ?? 0.36,
      height: 0.04,
      quickFillKey,
    }), { edit: true });
  };

  const applyQuickFormValue = (name, kind) => {
    if (kind === 'date') {
      updateFormValue(name, new Date().toLocaleDateString());
      return;
    }
    if (kind === 'initials') {
      updateFormValue(name, initialsValue);
    }
  };

  const removeElement = useCallback((id, { track = true } = {}) => {
    applyChange((prev) => prev.filter((item) => item.id !== id), { track });
    setEditingId(null);
    setSelectedId((prev) => (prev === id ? null : prev));
  }, [applyChange]);

  const removeSelected = () => {
    if (selectedId) removeElement(selectedId);
  };

  const cloneElement = (source, overrides = {}) => ({
    ...source,
    id: makeId(),
    file: null,
    objectUrl: null,
    quickFillKey: null,
    ...overrides,
  });

  const duplicateSelected = () => {
    if (!selectedElement || selectedElement.type === 'textEdit') return;
    const copy = cloneElement(selectedElement, {
      x: clamp(selectedElement.x + 0.02, 0, 1 - selectedElement.width),
      y: clamp(selectedElement.y + 0.02, 0, 1 - selectedElement.height),
    });
    addElement(copy);
  };

  const copyToAllPages = () => {
    if (!selectedElement || selectedElement.type === 'textEdit' || numPages < 2) return;
    const copies = [];
    for (let page = 0; page < numPages; page += 1) {
      if (page !== selectedElement.pageIndex) copies.push(cloneElement(selectedElement, { pageIndex: page }));
    }
    applyChange((prev) => [...prev, ...copies]);
  };

  const reorderSelected = (direction) => {
    if (!selectedId) return;
    applyChange((prev) => {
      const item = prev.find((el) => el.id === selectedId);
      if (!item) return prev;
      const rest = prev.filter((el) => el.id !== selectedId);
      return direction === 'front' ? [...rest, item] : [item, ...rest];
    });
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

  const startLineEdit = (line) => {
    const pageIndex = currentPage - 1;
    const item = createTextEdit({ id: makeId(), line, pageIndex, pageWidth: layouts[pageIndex]?.width || 612 });
    addElement(item, { edit: true });
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

  /** Box for an image of the given proportions (height / width), centered on `at` or the page. */
  const imageBox = useCallback((ratio, width, at) => {
    let w = width;
    let h = w * ratio * aspect;
    if (h > 0.85) {
      w *= 0.85 / h;
      h = 0.85;
    }
    const cx = at?.x ?? 0.5;
    const cy = at?.y ?? 0.45;
    return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), width: w, height: h };
  }, [aspect]);

  const placeImage = useCallback((payload, at) => {
    const item = createImage({
      ...payload,
      pageIndex: currentPage - 1,
      box: imageBox(payload.ratio || 0.4, payload.isSignature ? 0.24 : 0.34, at),
    });
    addElement(item);
  }, [addElement, currentPage, imageBox]);

  /** Signatures and images are placed by clicking on the page (or "Place in center"). */
  const beginPlacement = useCallback(async (payload) => {
    let ratio = 0.4;
    try {
      const { width, height } = await imageSize(payload.url);
      if (width && height) ratio = height / width;
    } catch {
      // Keep the default proportions.
    }
    setPlacement({ ...payload, ratio });
    setToolState('place');
    setSelectedId(null);
    setEditingId(null);
    setLeftOpen(false);
  }, []);

  const persistImage = async (original) => {
    const file = await prepareImageForUpload(original);
    const persisted = await onUploadOverlay(file);
    return {
      file,
      url: persisted?.url,
      storagePath: persisted?.storagePath,
      assetBucket: persisted?.assetBucket,
      mimeType: persisted?.mimeType || file.type,
    };
  };

  const insertImageFile = async (file, at) => {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const payload = await persistImage(file);
      if (at === undefined) {
        await beginPlacement(payload);
      } else {
        const { width, height } = await imageSize(payload.url).catch(() => ({ width: 10, height: 4 }));
        placeImage({ ...payload, ratio: height / width }, at);
      }
      setSaveError('');
    } catch (error) {
      setSaveError(error.message || 'Failed to upload image.');
    } finally {
      setBusy(false);
    }
  };

  const handleImageInput = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    insertImageFile(file);
  };

  const openSignature = (mode) => {
    if (mode === 'saved') {
      setLeftTab('signatures');
      setLeftOpen(true);
      return;
    }
    setSignatureDialog(mode);
  };

  const createSignature = async ({ file, name, save, kind }) => {
    let payload;
    if (save) {
      const saved = await onCreateSignature(file, name, kind);
      payload = {
        isSignature: true,
        url: saved.url,
        storagePath: saved.image_path,
        assetBucket: 'signatures',
        mimeType: saved.mime_type,
        signatureId: saved.id,
      };
    } else {
      payload = { ...(await persistImage(file)), isSignature: true };
    }
    setSignatureDialog(null);
    await beginPlacement(payload);
  };

  const placeSavedSignature = (signature) => {
    beginPlacement({
      isSignature: true,
      url: signature.url,
      storagePath: signature.image_path,
      assetBucket: 'signatures',
      mimeType: signature.mime_type,
      signatureId: signature.id,
    });
  };

  const markRedactions = (matches) => {
    const pad = 0.002;
    const items = matches.map((match) => ({
      id: makeId(),
      type: 'redact',
      pageIndex: match.page,
      x: clamp(match.x - pad, 0, 1),
      y: clamp(match.y - pad, 0, 1),
      width: Math.min(match.width + pad * 2, 1),
      height: Math.min(match.height + pad * 2, 1),
    }));
    applyChange((prev) => [...prev, ...items]);
    if (items[0]) setCurrentPage(items[0].pageIndex + 1);
    setLeftOpen(false);
  };

  // ---------- Creating things by clicking or dragging on the page ----------

  const finishDrawing = (stroke, shiftKey) => {
    const { tool: active, start, current, points } = stroke;
    const pageIndex = currentPage - 1;
    const dxPx = Math.abs(current.x - start.x) * renderSize.width;
    const dyPx = Math.abs(current.y - start.y) * renderSize.height;
    const tiny = dxPx < 4 && dyPx < 4;

    if (active === 'pen') {
      const style = toolStyles.pen;
      const px = points.map((p) => [p.x * renderSize.width, p.y * renderSize.height]);
      const simplified = simplifyPoints(px, 0.5).map(([x, y]) => ({ x: x / renderSize.width, y: y / renderSize.height }));
      const now = Date.now();
      const last = lastInkRef.current;
      const previous = last && now - last.at < INK_MERGE_MS ? elementsRef.current.find((el) => el.id === last.id && el.pageIndex === pageIndex) : null;

      // Absolute page points of every stroke, so a merged drawing gets one box around all.
      const strokes = [];
      if (previous) {
        for (const s of previous.strokes) {
          const abs = [];
          for (let i = 0; i < s.points.length; i += 2) {
            abs.push({ x: previous.x + s.points[i] * previous.width, y: previous.y + s.points[i + 1] * previous.height });
          }
          strokes.push(abs);
        }
      }
      strokes.push(simplified);
      const all = strokes.flat();
      const padX = style.strokeWidth / 2;
      const padY = padX * aspect;
      const minX = clamp(Math.min(...all.map((p) => p.x)) - padX, 0, 1);
      const minY = clamp(Math.min(...all.map((p) => p.y)) - padY, 0, 1);
      const maxX = clamp(Math.max(...all.map((p) => p.x)) + padX, 0, 1);
      const maxY = clamp(Math.max(...all.map((p) => p.y)) + padY, 0, 1);
      const width = Math.max(maxX - minX, 0.002);
      const height = Math.max(maxY - minY, 0.002);
      const relative = strokes.map((s) => ({ points: s.flatMap((p) => [(p.x - minX) / width, (p.y - minY) / height]) }));
      const box = { x: minX, y: minY, width, height, strokes: relative };

      if (previous) {
        applyChange((prev) => prev.map((el) => (el.id === previous.id ? { ...el, ...box } : el)));
        lastInkRef.current = { id: previous.id, at: now };
      } else {
        const item = { id: makeId(), type: 'ink', pageIndex, ...box, color: style.color, strokeWidth: style.strokeWidth, opacity: style.opacity ?? 1 };
        applyChange((prev) => [...prev, item]);
        lastInkRef.current = { id: item.id, at: now };
      }
      return;
    }

    if (active === 'place') {
      setTool('select');
      if (placement) placeImage(placement, current);
      return;
    }

    if (active === 'text') {
      const width = tiny ? Math.min(0.34, 1 - current.x) : Math.max(Math.abs(current.x - start.x), 0.08);
      const x = tiny ? clamp(current.x - 0.004, 0, 1 - Math.max(width, 0.08)) : Math.min(start.x, current.x);
      const y = clamp(tiny ? current.y - 0.015 : Math.min(start.y, current.y), 0, 0.97);
      // Switching back to Select keeps the new box selected and in typing mode.
      setTool('select');
      addElement(createText(pageIndex, { x, y, width: Math.max(width, 0.08), height: 0.04 }), { edit: true });
      return;
    }

    // Sticky tools keep marking; the rest hand over to Select with the new item selected.
    const commit = (item) => {
      addElement(item);
      if (STICKY_TOOLS.has(active)) setSelectedId(null);
      else setTool('select');
    };

    if (active === 'check' || active === 'cross' || active === 'dot') {
      const width = 0.032;
      const height = width * aspect;
      commit({
        id: makeId(),
        type: 'mark',
        kind: active,
        pageIndex,
        x: clamp(current.x - width / 2, 0, 1 - width),
        y: clamp(current.y - height / 2, 0, 1 - height),
        width,
        height,
        color: toolStyles.mark.color,
      });
      return;
    }

    if (active === 'line' || active === 'arrow') {
      let end = current;
      if (tiny) end = { x: clamp(start.x + 0.2, 0, 1), y: start.y };
      else if (shiftKey) end = snapAngle(start, current, aspect);
      const style = toolStyles[active];
      commit({ id: makeId(), type: 'shape', kind: active, pageIndex, ...lineFromPoints(start, end), stroke: style.stroke, fill: null, strokeWidth: style.strokeWidth, opacity: style.opacity ?? 1 });
      return;
    }

    // Box tools: rectangle, ellipse, highlight, whiteout, redact.
    let box;
    if (tiny) {
      if (active !== 'rect' && active !== 'ellipse') return;
      const w = 0.18;
      const h = active === 'ellipse' ? w * aspect : 0.1;
      box = { x: clamp(current.x - w / 2, 0, 1 - w), y: clamp(current.y - h / 2, 0, 1 - h), width: w, height: h };
    } else {
      let w = Math.abs(current.x - start.x);
      let h = Math.abs(current.y - start.y);
      if (shiftKey && (active === 'rect' || active === 'ellipse')) {
        const side = Math.max(w, h * aspect);
        w = side;
        h = side / aspect;
      }
      const x = current.x < start.x ? start.x - w : start.x;
      const y = current.y < start.y ? start.y - h : start.y;
      box = { x: clamp(x, 0, 1), y: clamp(y, 0, 1), width: Math.min(w, 1 - clamp(x, 0, 1)), height: Math.min(h, 1 - clamp(y, 0, 1)) };
    }

    if (active === 'redact') {
      commit({ id: makeId(), type: 'redact', pageIndex, ...box });
      return;
    }
    const style = toolStyles[active === 'highlight' ? 'highlight' : active === 'whiteout' ? 'whiteout' : active];
    const item = {
      id: makeId(),
      type: 'shape',
      kind: active,
      pageIndex,
      ...box,
      stroke: active === 'rect' || active === 'ellipse' ? style.stroke : null,
      fill: style.fill ?? null,
      strokeWidth: style.strokeWidth ?? 0.003,
      opacity: active === 'whiteout' ? 1 : style.opacity ?? 1,
      flipX: false,
      flipY: false,
    };
    commit(item);
  };

  const onDrawStart = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    drawRef.current = { tool, start: point, current: point, points: [point], pointerId: event.pointerId };
    setDraft({ ...drawRef.current });
  };

  const onDrawMove = (event) => {
    const stroke = drawRef.current;
    if (!stroke) {
      if (tool === 'place') setHoverPoint(pointFromEvent(event));
      return;
    }
    if (stroke.tool === 'pen') {
      const events = event.nativeEvent.getCoalescedEvents?.() || [event.nativeEvent];
      for (const e of events) stroke.points.push(pointFromEvent(e));
    }
    stroke.current = pointFromEvent(event);
    setDraft({ ...stroke, shiftKey: event.shiftKey });
  };

  const onDrawEnd = (event) => {
    const stroke = drawRef.current;
    drawRef.current = null;
    setDraft(null);
    if (!stroke) return;
    stroke.current = pointFromEvent(event);
    finishDrawing(stroke, event.shiftKey);
  };

  const cancelDrawing = () => {
    drawRef.current = null;
    setDraft(null);
  };

  /** What the in-progress stroke or box would become, for the live preview. */
  const draftPreview = useMemo(() => {
    if (!draft) return null;
    const { tool: active, start, current, points, shiftKey } = draft;
    if (active === 'pen') {
      return { kind: 'pen', points };
    }
    if (active === 'line' || active === 'arrow') {
      const end = shiftKey ? snapAngle(start, current, aspect) : current;
      return { kind: 'shape', item: { type: 'shape', kind: active, ...lineFromPoints(start, end), stroke: toolStyles[active].stroke, strokeWidth: toolStyles[active].strokeWidth, opacity: 1 } };
    }
    if (['rect', 'ellipse', 'highlight', 'whiteout', 'redact', 'text'].includes(active)) {
      let w = Math.abs(current.x - start.x);
      let h = Math.abs(current.y - start.y);
      if (shiftKey && (active === 'rect' || active === 'ellipse')) {
        const side = Math.max(w, h * aspect);
        w = side;
        h = side / aspect;
      }
      const box = { x: current.x < start.x ? start.x - w : start.x, y: current.y < start.y ? start.y - h : start.y, width: w, height: h };
      if (active === 'text') return { kind: 'box', box };
      if (active === 'redact') return { kind: 'shape', item: { type: 'redact', ...box } };
      const style = toolStyles[active];
      return {
        kind: 'shape',
        item: {
          type: 'shape',
          kind: active,
          ...box,
          stroke: active === 'rect' || active === 'ellipse' ? style.stroke : null,
          fill: style.fill ?? null,
          strokeWidth: style.strokeWidth ?? 0.003,
          opacity: active === 'whiteout' ? 1 : style.opacity ?? 1,
        },
      };
    }
    return null;
  }, [aspect, draft, toolStyles]);

  // ---------- Export ----------

  const baseName = stripExtension(documentTitle);

  const renderEditedPdf = async ({ flattenForm = false } = {}) => {
    const warnings = new Set();
    const onWarning = (message) => warnings.add(message);
    // Text already in the PDF is rewritten, and redacted content removed, by the server first;
    // additions go on top of that.
    const textEdits = elements.filter((item) => item.type === 'textEdit' && isChangedTextEdit(item));
    const redactions = elements.filter((item) => item.type === 'redact');
    let pdfBytes;
    if (textEdits.length || redactions.length) {
      setExportNotice(redactions.length ? 'Removing redacted content…' : 'Applying text edits…');
      try {
        pdfBytes = await applyServerEdits({ pdfFile, edits: textEdits, redactions, onWarning });
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
      flattenForm,
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
      setRightOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = (options) =>
    runExport(async () => {
      downloadPdfBytes(await renderEditedPdf(options), `${baseName}${redactionCount ? '-redacted' : '-edited'}.pdf`);
    });

  const exportImage = (format) =>
    runExport(async () => {
      const image = await convertPdfToImage(await renderEditedPdf(), currentPage, format);
      downloadBlob(image, `${baseName}-page-${currentPage}.${format === 'jpeg' ? 'jpg' : format}`);
    });

  const hasElements = elements.length > 0;
  // Fit the page to the available canvas width (minus padding), then apply zoom.
  const canvasPadding = containerWidth < 640 ? 24 : 64;
  const fitWidth = clamp(containerWidth - canvasPadding, 260, 900);
  const targetWidth = Math.floor(fitWidth * zoom);
  const countByPage = elements.reduce((acc, item) => {
    acc[item.pageIndex] = (acc[item.pageIndex] || 0) + 1;
    return acc;
  }, {});

  const goToPage = useCallback((page) => {
    setCurrentPage(clamp(page, 1, numPages || 1));
    setSelectedId(null);
    setEditingId(null);
    setLeftOpen(false);
    lastInkRef.current = null;
  }, [numPages]);

  // ---------- Keyboard and clipboard ----------

  const pasteElement = () => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const sameSpot = clip.pageIndex !== currentPage - 1;
    const copy = cloneElement(clip.item, {
      pageIndex: currentPage - 1,
      x: sameSpot ? clip.item.x : clamp(clip.item.x + 0.02, 0, 1 - clip.item.width),
      y: sameSpot ? clip.item.y : clamp(clip.item.y + 0.02, 0, 1 - clip.item.height),
    });
    clipboardRef.current = { item: copy, pageIndex: currentPage - 1 };
    addElement(copy);
  };

  useEffect(() => {
    keyHandlerRef.current = (event) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === 's') {
        event.preventDefault();
        saveDraftNowRef.current();
        return;
      }
      if (mod && (key === '=' || key === '+')) {
        event.preventDefault();
        zoomBy(0.1);
        return;
      }
      if (mod && key === '-') {
        event.preventDefault();
        zoomBy(-0.1);
        return;
      }
      if (mod && key === '0') {
        event.preventDefault();
        setZoom(1);
        return;
      }
      if (isEditableTarget(event.target) || signatureDialog || shortcutsOpen) return;

      if (mod && (key === 'z' || key === 'y')) {
        event.preventDefault();
        if (key === 'y' || event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'd') {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (event.key === 'Escape') {
        if (drawRef.current) cancelDrawing();
        else if (tool !== 'select') setTool('select');
        else {
          setSelectedId(null);
          setEditingId(null);
        }
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeSelected();
        return;
      }
      if (event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault();
        goToPage(currentPage + (event.key === 'PageDown' ? 1 : -1));
        return;
      }
      if (event.key === '?') {
        setShortcutsOpen(true);
        return;
      }
      if (!mod && !event.altKey && !event.shiftKey && key.length === 1) {
        if (TOOL_KEYS[key]) {
          setTool(TOOL_KEYS[key]);
          return;
        }
        if (key === 's') {
          openSignature('signature');
          return;
        }
      }

      // Edited lines keep the original line's position.
      if (!selectedId || selectedElement?.type === 'textEdit') return;
      const step = event.shiftKey ? 0.01 : 0.002;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        applyChange(
          (prev) =>
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

    clipboardHandlersRef.current = {
      copy: (event, cut) => {
        if (isEditableTarget(event.target) || !selectedElement || selectedElement.type === 'textEdit') return;
        clipboardRef.current = { item: { ...selectedElement }, pageIndex: selectedElement.pageIndex };
        event.clipboardData?.setData('text/plain', CLIP_MARKER);
        event.preventDefault();
        if (cut) removeSelected();
      },
      paste: (event) => {
        if (isEditableTarget(event.target) || signatureDialog) return;
        const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
        if (files.length) {
          event.preventDefault();
          insertImageFile(files[0], null);
          return;
        }
        const text = event.clipboardData?.getData('text/plain') || '';
        if (text === CLIP_MARKER && clipboardRef.current) {
          event.preventDefault();
          pasteElement();
          return;
        }
        if (text.trim()) {
          event.preventDefault();
          addElement(createText(currentPage - 1, { text: text.slice(0, 5000), x: 0.12, y: 0.12, width: 0.5 }));
        }
      },
    };
  });

  useEffect(() => {
    const onKeyDown = (event) => keyHandlerRef.current?.(event);
    const onCopy = (event) => clipboardHandlersRef.current?.copy(event, false);
    const onCut = (event) => clipboardHandlersRef.current?.copy(event, true);
    const onPaste = (event) => clipboardHandlersRef.current?.paste(event);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  const saveLabel = {
    saved: 'Saved',
    saving: 'Saving…',
    dirty: 'Unsaved changes',
    error: 'Save failed — retry',
  }[saveStatus];

  const toolHint = {
    text: 'Click where the text should go, or drag to set its width.',
    pen: 'Draw on the page. Strokes made in quick succession join into one drawing.',
    highlight: 'Drag across text to highlight it.',
    rect: 'Drag to draw a rectangle. Hold Shift for a square.',
    ellipse: 'Drag to draw an ellipse. Hold Shift for a circle.',
    line: 'Drag to draw a line. Hold Shift for straight angles.',
    arrow: 'Drag to draw an arrow. Hold Shift for straight angles.',
    whiteout: 'Drag over content to cover it with white.',
    redact: 'Drag over anything to remove it for good when you download.',
    check: 'Click to place a check mark.',
    cross: 'Click to place a cross.',
    dot: 'Click to place a dot.',
    place: placement?.isSignature ? 'Click where your signature goes.' : 'Click where the image goes.',
  }[tool];

  const showCanvasStatus = Boolean(exportNotice || textMode || toolHint);
  const drawCursor = tool === 'text' ? 'text' : tool === 'place' ? 'copy' : 'crosshair';

  const renderItem = (item) => {
    const isSelected = selectedId === item.id;
    const style = {
      left: `${item.x * 100}%`,
      top: `${item.y * 100}%`,
      width: `${item.width * 100}%`,
      height: `${item.height * 100}%`,
    };

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
          style={{ ...style, background: changed || isEditing ? item.original.background : 'transparent' }}
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
              onChange={(event) => updateElement(item.id, { text: event.target.value })}
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

    const line = isLine(item);
    const kindClass = item.type === 'text' ? 'text-item' : item.type === 'image' ? 'image-item' : `vector-item ${item.type}-item ${item.kind ? `kind-${item.kind}` : ''}`;
    const editing = editingId === item.id;
    const widthPx = item.width * renderSize.width;
    const heightPx = item.height * renderSize.height;

    return (
      <div
        key={item.id}
        className={`item ${isSelected ? 'selected' : ''} ${kindClass} ${line ? 'line-item' : ''}`}
        style={style}
        onPointerDown={(event) => startInteraction(event, item.id, 'drag')}
        onDoubleClick={() => {
          if (item.type === 'text') {
            setSelectedId(item.id);
            setEditingId(item.id);
          }
        }}
      >
        {item.type === 'text' ? (
          <TextBox
            item={item}
            editing={editing}
            size={renderSize}
            onText={(text) => updateElement(item.id, { text })}
            onAutoHeight={autoHeight}
            onDone={() => {
              setEditingId(null);
              const current = elementsRef.current.find((el) => el.id === item.id);
              if (current && !current.text.trim()) removeElement(item.id, { track: false });
            }}
          />
        ) : item.type === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.isSignature ? 'Signature' : 'Image'} draggable={false} style={{ opacity: item.opacity ?? 1 }} />
        ) : (
          <ElementGraphic item={item} width={widthPx} height={heightPx} pageWidth={renderSize.width} />
        )}
        {item.type === 'redact' ? <span className="redact-label" aria-hidden="true">Redact</span> : null}

        {isSelected && !editing ? (
          <div className="item-toolbar" onPointerDown={(event) => event.stopPropagation()}>
            {item.type === 'text' ? (
              <button type="button" onClick={() => setEditingId(item.id)} aria-label="Edit text" title="Edit text">
                <Type size={14} />
              </button>
            ) : null}
            <button type="button" onClick={duplicateSelected} aria-label="Duplicate" title="Duplicate (⌘D)">
              <Copy size={14} />
            </button>
            {numPages > 1 ? (
              <button type="button" onClick={copyToAllPages} aria-label="Copy to all pages" title="Copy to all pages">
                <Files size={14} />
              </button>
            ) : null}
            <button type="button" onClick={removeSelected} aria-label="Delete" title="Delete (Del)">
              <Trash2 size={14} />
            </button>
          </div>
        ) : null}

        {isSelected && !line
          ? ['nw', 'ne', 'sw', 'se'].map((handle) => (
            <button
              key={handle}
              type="button"
              className={`resize-handle ${handle}`}
              onPointerDown={(event) => startInteraction(event, item.id, 'resize', handle)}
              aria-label="Resize"
            />
          ))
          : null}
        {isSelected && line
          ? ['p1', 'p2'].map((handle) => {
            const atEnd = handle === 'p2';
            const right = atEnd !== Boolean(item.flipX);
            const bottom = atEnd !== Boolean(item.flipY);
            return (
              <button
                key={handle}
                type="button"
                className="endpoint-handle"
                style={{ left: right ? '100%' : '0%', top: bottom ? '100%' : '0%' }}
                onPointerDown={(event) => startInteraction(event, item.id, 'endpoint', handle)}
                aria-label={atEnd ? 'Move end point' : 'Move start point'}
              />
            );
          })
          : null}
      </div>
    );
  };

  return (
    <div className="editor">
      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleImageInput} />

      <header className="editor-bar">
        <div className="editor-bar-left">
          <button type="button" className="btn btn-ghost btn-icon" onClick={leaveAfterSave(onBackToDashboard)} aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeft size={18} />
          </button>
          <button type="button" className="btn btn-ghost btn-icon drawer-only" onClick={() => setLeftOpen((v) => !v)} aria-label="Pages, signatures and redaction">
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

        <div className="editor-bar-right">
          <div className="zoom-control hide-sm">
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => zoomBy(-0.1)} aria-label="Zoom out" title="Zoom out (⌘−)">
              <ZoomOut size={16} />
            </button>
            <button type="button" className="zoom-value" onClick={() => setZoom(1)} title="Fit to width (⌘0)">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => zoomBy(0.1)} aria-label="Zoom in" title="Zoom in (⌘+)">
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
            <button type="button" role="menuitem" className="menu-item" onClick={() => exportPdf()}>
              <Download size={16} /> PDF document
            </button>
            {formFields.length ? (
              <button type="button" role="menuitem" className="menu-item" onClick={() => exportPdf({ flattenForm: true })}>
                <FileCheck2 size={16} /> PDF, form locked <small>flattened</small>
              </button>
            ) : null}
            <button type="button" role="menuitem" className="menu-item" onClick={() => exportImage('png')}>
              <FileImage size={16} /> PNG image <small>page {currentPage}</small>
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => exportImage('jpeg')}>
              <FileImage size={16} /> JPG image <small>page {currentPage}</small>
            </button>
            {redactionCount ? (
              <p className="menu-note">{redactionCount} {redactionCount === 1 ? 'area is' : 'areas are'} permanently redacted in every download.</p>
            ) : null}
          </Menu>

          <Menu
            trigger={({ toggle, ...aria }) => (
              <button type="button" className="btn btn-ghost btn-icon" onClick={toggle} aria-label="More options" {...aria}>
                <MoreHorizontal size={18} />
              </button>
            )}
          >
            <button type="button" role="menuitem" className="menu-item" onClick={saveDraftNow}>
              <Save size={16} /> Save now <small>⌘S</small>
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => setShortcutsOpen(true)}>
              <Keyboard size={16} /> Keyboard shortcuts <small>?</small>
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

      <Toolstrip
        tool={tool}
        onTool={setTool}
        onImage={() => imageInputRef.current?.click()}
        onSignature={openSignature}
        styles={toolStyles}
        onStyle={(key, updates) => setToolStyles((prev) => ({ ...prev, [key]: { ...prev[key], ...updates } }))}
        busy={busy}
        history={historyFlags}
        onUndo={undo}
        onRedo={redo}
      />

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

        <aside className={`editor-rail ${leftOpen ? 'is-open' : ''}`} aria-label="Pages, signatures and redaction">
          <div className="panel-tabs" role="tablist">
            {[
              ['pages', 'Pages'],
              ['signatures', 'Signatures'],
              ['redact', 'Redact'],
            ].map(([id, label]) => (
              <button key={id} type="button" role="tab" className="panel-tab" aria-selected={leftTab === id} onClick={() => setLeftTab(id)}>
                {label}
              </button>
            ))}
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
            ) : leftTab === 'signatures' ? (
              <div className="panel-section panel-stack">
                <div className="panel-row">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => openSignature('signature')} disabled={busy}>
                    <Plus size={15} /> Signature
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => openSignature('initials')} disabled={busy}>
                    <Plus size={15} /> Initials
                  </button>
                </div>
                <span className="field-hint">Draw, type or upload. Saved signatures can be reused on any document.</span>
                <div className="divider" />
                {signatures.length ? (
                  <div className="sig-grid">
                    {signatures.map((signature) => (
                      <div key={signature.id} className="sig-item">
                        <button type="button" className="sig-use" onClick={() => placeSavedSignature(signature)} title="Place on the page">
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
            ) : (
              <FindRedactPanel pdfFile={pdfFile} numPages={numPages} onMark={markRedactions} onGoToPage={goToPage} />
            )}
          </div>
        </aside>

        <div
          className="editor-canvas"
          ref={shellRef}
          onPointerDown={() => {
            if (tool === 'select' || tool === 'edit-text') {
              setSelectedId(null);
              setEditingId(null);
            }
          }}
          onDragOver={(event) => {
            if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
          }}
          onDrop={(event) => {
            const file = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
            if (!file) return;
            event.preventDefault();
            insertImageFile(file, canvasRef.current?.contains(event.target) ? pointFromEvent(event) : null);
          }}
        >
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

                {pageElements.map(renderItem)}

                {CREATE_TOOLS.has(tool) ? (
                  <div
                    className="draw-layer"
                    style={{ cursor: drawCursor }}
                    onPointerDown={onDrawStart}
                    onPointerMove={onDrawMove}
                    onPointerUp={onDrawEnd}
                    onPointerCancel={cancelDrawing}
                    onPointerLeave={() => setHoverPoint(null)}
                  >
                    {draftPreview?.kind === 'pen' ? (
                      <svg className="draft-ink" width="100%" height="100%" aria-hidden="true">
                        <polyline
                          points={draftPreview.points.map((p) => `${p.x * renderSize.width},${p.y * renderSize.height}`).join(' ')}
                          fill="none"
                          stroke={toolStyles.pen.color}
                          strokeWidth={Math.max(0.5, toolStyles.pen.strokeWidth * renderSize.width)}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                    {draftPreview?.kind === 'shape' ? (
                      <div
                        className={`draft-shape ${draftPreview.item.type === 'redact' ? 'redact-item' : ''}`}
                        style={{
                          left: `${draftPreview.item.x * 100}%`,
                          top: `${draftPreview.item.y * 100}%`,
                          width: `${draftPreview.item.width * 100}%`,
                          height: `${draftPreview.item.height * 100}%`,
                        }}
                      >
                        <ElementGraphic
                          item={draftPreview.item}
                          width={draftPreview.item.width * renderSize.width}
                          height={draftPreview.item.height * renderSize.height}
                          pageWidth={renderSize.width}
                        />
                      </div>
                    ) : null}
                    {draftPreview?.kind === 'box' ? (
                      <div
                        className="draft-box"
                        style={{
                          left: `${draftPreview.box.x * 100}%`,
                          top: `${draftPreview.box.y * 100}%`,
                          width: `${draftPreview.box.width * 100}%`,
                          height: `${draftPreview.box.height * 100}%`,
                        }}
                      />
                    ) : null}
                    {tool === 'place' && placement && hoverPoint ? (() => {
                      const box = imageBox(placement.ratio, placement.isSignature ? 0.24 : 0.34, hoverPoint);
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="place-ghost"
                          src={placement.url}
                          alt=""
                          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
                        />
                      );
                    })() : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {showCanvasStatus ? (
            <div className="text-mode-status" role="status" onPointerDown={(event) => event.stopPropagation()}>
              {exportNotice ? (
                <>
                  <Loader2 size={14} className="spin" /> {exportNotice}
                </>
              ) : textMode ? (
                !pageLayout || pageLayout.status === 'loading' ? (
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
                )
              ) : (
                <>
                  <span>{toolHint}</span>
                  {tool === 'place' && placement ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setTool('select');
                        placeImage(placement, null);
                      }}
                    >
                      Place in center
                    </button>
                  ) : null}
                  {tool === 'redact' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setLeftTab('redact');
                        setLeftOpen(true);
                      }}
                    >
                      Find text
                    </button>
                  ) : null}
                </>
              )}
              {!exportNotice ? (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setTool('select')} aria-label="Done, back to Select">
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
              <h3>{selectedElement ? (selectedElement.type === 'textEdit' ? 'Edited text' : describeElement(selectedElement).replace(/^Empty text$/, 'Text')) : 'Properties'}</h3>
              {selectedElement ? (
                <Inspector
                  element={selectedElement}
                  fontGroups={fontGroups}
                  numPages={numPages}
                  onChange={updateSelected}
                  onDuplicate={duplicateSelected}
                  onDelete={removeSelected}
                  onCopyToAllPages={copyToAllPages}
                  onLayer={reorderSelected}
                />
              ) : (
                <div className="panel-stack">
                  <p className="small muted">
                    {toolHint || 'Select an item on the page to change it, or pick a tool above. Edit text changes words already in the PDF.'}
                  </p>
                  <div className="panel-row">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setTool('text'); setRightOpen(false); }}><Plus size={14} /> Text</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openSignature('signature')} disabled={busy}><Plus size={14} /> Signature</button>
                  </div>
                  <div className="panel-row">
                    <button
                      type="button"
                      className={`btn btn-secondary btn-sm ${textMode ? 'is-active' : ''}`}
                      onClick={() => {
                        setTool(textMode ? 'select' : 'edit-text');
                        setRightOpen(false);
                      }}
                      aria-pressed={textMode}
                    >
                      <ScanText size={14} /> {textMode ? 'Stop editing text' : 'Edit text'}
                    </button>
                  </div>
                  <p className="small muted">
                    Tip: press <span className="kbd">?</span> for keyboard shortcuts. Paste or drop images straight onto the page.
                  </p>
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
                      onClick={() => {
                        setTool('select');
                        setSelectedId(item.id);
                      }}
                    >
                      <i className={`layer-dot type-${item.type}`} aria-hidden="true" />
                      <span>{describeElement(item)}</span>
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

      {signatureDialog ? (
        <SignatureDialog
          mode={signatureDialog}
          defaultText={signatureDialog === 'initials' ? initialsValue : userName || ''}
          onClose={() => setSignatureDialog(null)}
          onCreate={createSignature}
        />
      ) : null}
      {shortcutsOpen ? <ShortcutsDialog onClose={() => setShortcutsOpen(false)} /> : null}
    </div>
  );
}
