// Element model for the editor. Every position and size is normalized to the displayed page
// (0..1 of its width/height); font sizes and stroke widths are fractions of the page width,
// so elements keep their place at any zoom and on export.

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const makeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const TEXT_COLORS = ['#111827', '#1d4ed8', '#b91c1c', '#047857'];
export const INK_COLORS = ['#111827', '#1d4ed8', '#dc2626', '#047857', '#7c3aed'];
export const HIGHLIGHT_COLORS = ['#fde047', '#86efac', '#f9a8d4', '#93c5fd', '#fdba74'];

export const FONT_FAMILIES = [
  { value: 'sans', label: 'Sans', css: 'Helvetica, Arial, sans-serif' },
  { value: 'serif', label: 'Serif', css: '"Times New Roman", Times, serif' },
  { value: 'mono', label: 'Mono', css: '"Courier New", Courier, monospace' },
];

export const fontCss = (family) => (FONT_FAMILIES.find((f) => f.value === family) || FONT_FAMILIES[0]).css;

// Starting styles for each drawing tool; the user's last choice replaces them.
export const DEFAULT_TOOL_STYLES = {
  pen: { color: '#111827', strokeWidth: 0.0032, opacity: 1 },
  highlight: { fill: '#fde047', opacity: 0.4 },
  rect: { stroke: '#dc2626', fill: null, strokeWidth: 0.003, opacity: 1 },
  ellipse: { stroke: '#dc2626', fill: null, strokeWidth: 0.003, opacity: 1 },
  line: { stroke: '#dc2626', strokeWidth: 0.003, opacity: 1 },
  arrow: { stroke: '#dc2626', strokeWidth: 0.003, opacity: 1 },
  whiteout: { fill: '#ffffff' },
  mark: { color: '#111827' },
};

export const SHAPE_KINDS = ['rect', 'ellipse', 'line', 'arrow', 'highlight', 'whiteout'];
export const MARK_KINDS = ['check', 'cross', 'dot'];
export const isLine = (item) => item?.type === 'shape' && (item.kind === 'line' || item.kind === 'arrow');

/** Images, signatures, marks and drawings keep their proportions when resized (Shift frees them). */
export const keepsRatio = (item) => item.type === 'image' || item.type === 'mark' || item.type === 'ink';

export function createText(pageIndex, overrides = {}) {
  return {
    id: makeId(),
    type: 'text',
    pageIndex,
    x: 0.12,
    y: 0.12,
    width: 0.35,
    height: 0.05,
    text: '',
    fontSize: 0.022,
    color: '#111827',
    bold: false,
    italic: false,
    fontFamily: 'sans',
    align: 'left',
    opacity: 1,
    quickFillKey: null,
    ...overrides,
  };
}

export function createImage({ pageIndex, isSignature = false, file, url, storagePath, assetBucket, mimeType, signatureId, box }) {
  const objectUrl = !url && file ? URL.createObjectURL(file) : null;
  return {
    id: makeId(),
    type: 'image',
    pageIndex,
    x: box?.x ?? 0.1,
    y: box?.y ?? 0.1,
    width: box?.width ?? (isSignature ? 0.26 : 0.3),
    height: box?.height ?? (isSignature ? 0.12 : 0.2),
    file: file || null,
    url: url || objectUrl,
    objectUrl,
    isSignature,
    storagePath: storagePath || null,
    assetBucket: assetBucket || null,
    mimeType: mimeType || file?.type || null,
    signatureId: signatureId || null,
    opacity: 1,
  };
}

const num = (value, fallback) => (Number.isFinite(value) ? value : fallback);
const color = (value, fallback) => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);
const optionalColor = (value) => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null);

function box(item) {
  return {
    pageIndex: num(item.pageIndex, 0),
    x: num(item.x, 0.1),
    y: num(item.y, 0.1),
    width: num(item.width, 0.3),
    height: num(item.height, 0.1),
  };
}

// Edits of text already in the PDF: the line's box is fixed, only its content and style change.
export function serializeTextEdit(item) {
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

/** Elements as stored in the draft (no File objects or object URLs; no nested arrays). */
export function serializeElements(elements = []) {
  return elements
    .map((item) => {
      const base = { id: item.id, type: item.type, ...box(item) };
      switch (item.type) {
        case 'textEdit':
          return serializeTextEdit(item);
        case 'text':
          return {
            ...base,
            text: item.text ?? '',
            fontSize: item.fontSize,
            color: item.color,
            bold: Boolean(item.bold),
            italic: Boolean(item.italic),
            fontFamily: item.fontFamily || 'sans',
            align: item.align || 'left',
            opacity: num(item.opacity, 1),
            quickFillKey: item.quickFillKey || null,
          };
        case 'image':
          return {
            ...base,
            isSignature: Boolean(item.isSignature),
            storagePath: item.storagePath || null,
            assetBucket: item.assetBucket || null,
            mimeType: item.mimeType || null,
            signatureId: item.signatureId || null,
            url: item.storagePath ? null : item.url,
            opacity: num(item.opacity, 1),
          };
        case 'shape':
          return {
            ...base,
            kind: item.kind,
            stroke: optionalColor(item.stroke),
            fill: optionalColor(item.fill),
            strokeWidth: num(item.strokeWidth, 0.003),
            opacity: num(item.opacity, 1),
            flipX: Boolean(item.flipX),
            flipY: Boolean(item.flipY),
          };
        case 'ink':
          return {
            ...base,
            // Firestore can't store nested arrays, so each stroke is an object.
            strokes: (item.strokes || []).map((stroke) => ({ points: stroke.points.map((v) => Math.round(v * 10000) / 10000) })),
            color: item.color,
            strokeWidth: item.strokeWidth,
            opacity: num(item.opacity, 1),
          };
        case 'mark':
          return { ...base, kind: item.kind, color: item.color };
        case 'redact':
          return base;
        default:
          return null;
      }
    })
    .filter(Boolean);
}

export function hydrateElements(serialized = []) {
  if (!Array.isArray(serialized)) return [];
  return serialized
    .filter((item) => item && item.type)
    .map((item) => {
      const id = item.id || makeId();
      switch (item.type) {
        case 'text':
          return createText(num(item.pageIndex, 0), {
            id,
            ...box(item),
            text: item.text ?? '',
            fontSize: num(item.fontSize, 0.03),
            color: color(item.color, '#111827'),
            bold: Boolean(item.bold),
            italic: Boolean(item.italic),
            fontFamily: ['sans', 'serif', 'mono'].includes(item.fontFamily) ? item.fontFamily : 'sans',
            align: ['left', 'center', 'right'].includes(item.align) ? item.align : 'left',
            opacity: num(item.opacity, 1),
            quickFillKey: item.quickFillKey || null,
          });
        case 'textEdit':
          return item.original ? { ...serializeTextEdit(item), id } : null;
        case 'image':
          return {
            id,
            type: 'image',
            ...box(item),
            file: null,
            url: item.url || item.storagePath || null,
            objectUrl: null,
            isSignature: Boolean(item.isSignature),
            storagePath: item.storagePath || null,
            assetBucket: item.assetBucket || null,
            mimeType: item.mimeType || null,
            signatureId: item.signatureId || null,
            opacity: num(item.opacity, 1),
          };
        case 'shape':
          if (!SHAPE_KINDS.includes(item.kind)) return null;
          return {
            id,
            type: 'shape',
            kind: item.kind,
            ...box(item),
            stroke: optionalColor(item.stroke),
            fill: optionalColor(item.fill),
            strokeWidth: num(item.strokeWidth, 0.003),
            opacity: num(item.opacity, 1),
            flipX: Boolean(item.flipX),
            flipY: Boolean(item.flipY),
          };
        case 'ink':
          return {
            id,
            type: 'ink',
            ...box(item),
            strokes: (Array.isArray(item.strokes) ? item.strokes : [])
              .filter((stroke) => Array.isArray(stroke?.points))
              .map((stroke) => ({ points: stroke.points.filter(Number.isFinite) })),
            color: color(item.color, '#111827'),
            strokeWidth: num(item.strokeWidth, 0.003),
            opacity: num(item.opacity, 1),
          };
        case 'mark':
          return MARK_KINDS.includes(item.kind) ? { id, type: 'mark', kind: item.kind, ...box(item), color: color(item.color, '#111827') } : null;
        case 'redact':
          return { id, type: 'redact', ...box(item) };
        default:
          return null;
      }
    })
    .filter(Boolean);
}

/**
 * Resizes a box by dragging one corner. `keepRatio` scales uniformly about the opposite
 * corner; everything stays inside the page.
 */
export function resizeBox(start, handle, dx, dy, { keepRatio = false, minW = 0.02, minH = 0.02 } = {}) {
  const west = handle.includes('w');
  const north = handle.includes('n');
  const anchorX = west ? start.x + start.width : start.x;
  const anchorY = north ? start.y + start.height : start.y;

  if (keepRatio && start.width > 0 && start.height > 0) {
    const w = start.width + (west ? -dx : dx);
    const h = start.height + (north ? -dy : dy);
    let scale = Math.max(w / start.width, h / start.height);
    const maxW = west ? anchorX : 1 - anchorX;
    const maxH = north ? anchorY : 1 - anchorY;
    scale = Math.min(scale, maxW / start.width, maxH / start.height);
    scale = Math.max(scale, minW / start.width, minH / start.height);
    const width = start.width * scale;
    const height = start.height * scale;
    return {
      x: west ? anchorX - width : anchorX,
      y: north ? anchorY - height : anchorY,
      width,
      height,
    };
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (west) left = clamp(left + dx, 0, right - minW);
  if (handle.includes('e')) right = clamp(right + dx, left + minW, 1);
  if (north) top = clamp(top + dy, 0, bottom - minH);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + minH, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Moves one end of a line/arrow; the box and flips are derived from the two ends. */
export function moveLineEnd(start, which, point) {
  const fromX = start.flipX ? start.x + start.width : start.x;
  const fromY = start.flipY ? start.y + start.height : start.y;
  const toX = start.flipX ? start.x : start.x + start.width;
  const toY = start.flipY ? start.y : start.y + start.height;
  const a = which === 'p1' ? { x: point.x, y: point.y } : { x: fromX, y: fromY };
  const b = which === 'p2' ? { x: point.x, y: point.y } : { x: toX, y: toY };
  return lineFromPoints(a, b);
}

export function lineFromPoints(a, b) {
  const ax = clamp(a.x, 0, 1);
  const ay = clamp(a.y, 0, 1);
  const bx = clamp(b.x, 0, 1);
  const by = clamp(b.y, 0, 1);
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
    flipX: ax > bx,
    flipY: ay > by,
  };
}

/** Snaps the end of a line to 45° steps around its start (aspect = page width / height). */
export function snapAngle(a, b, aspect) {
  const dx = (b.x - a.x) * aspect;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: a.x + (Math.cos(angle) * length) / aspect, y: a.y + Math.sin(angle) * length };
}

export function describeElement(item) {
  switch (item.type) {
    case 'textEdit':
      return item.text || 'Removed text';
    case 'text':
      return item.text || 'Empty text';
    case 'image':
      return item.isSignature ? 'Signature' : 'Image';
    case 'shape':
      return { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', highlight: 'Highlight', whiteout: 'Whiteout' }[item.kind] || 'Shape';
    case 'ink':
      return 'Drawing';
    case 'mark':
      return { check: 'Check mark', cross: 'Cross mark', dot: 'Dot' }[item.kind] || 'Mark';
    case 'redact':
      return 'Redaction';
    default:
      return 'Item';
  }
}
