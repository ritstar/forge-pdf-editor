import { PDFDocument } from '@cantoo/pdf-lib';
import { submitToolRequest } from './backendTools';
import { waitForBackend } from './useBackendStatus';

// Editing text that is already in the PDF. The backend finds the lines (OCR for scans) and,
// on export, removes the originals and redraws them in the original font when it can.
// Line boxes are normalized to the displayed page, like every other editor element.

const STATUS_MESSAGES = {
  401: 'Your session has expired. Please sign in again.',
  413: 'This PDF is too large to edit text in (50 MB max).',
  429: 'Too many requests. Please wait a minute and try again.',
  502: 'The text engine is unavailable. It may be starting up; try again in a moment.',
  504: 'Reading this page took too long.',
};

async function toolError(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || STATUS_MESSAGES[res.status] || fallback);
}

async function ensureBackend(onWaking) {
  const status = await waitForBackend({ onWaking });
  if (status === 'unavailable') {
    throw new Error('The text engine did not start. Please try again in a minute.');
  }
}

/** Copies one page into its own PDF so only that page is uploaded for analysis. */
async function extractPage(sourceDoc, pageIndex) {
  const single = await PDFDocument.create();
  const [page] = await single.copyPages(sourceDoc, [pageIndex]);
  single.addPage(page);
  return single.save();
}

export async function fetchTextLayout({ sourceDoc, pageIndex, onWaking }) {
  await ensureBackend(onWaking);
  const bytes = await extractPage(sourceDoc, pageIndex);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), `page-${pageIndex + 1}.pdf`);
  form.append('page', '0');
  const res = await submitToolRequest('text-layout', form);
  if (!res.ok) throw await toolError(res, 'Could not read the text on this page.');
  return res.json();
}

function familyOf(line) {
  if (line.mono) return 'mono';
  return line.serif ? 'serif' : 'sans';
}

export function createTextEdit({ id, line, pageIndex, pageWidth }) {
  return {
    id,
    type: 'textEdit',
    pageIndex,
    lineId: line.id,
    x: line.x,
    y: line.y,
    width: line.width,
    height: line.height,
    text: line.text,
    size: line.size,
    color: line.color,
    bold: Boolean(line.bold),
    italic: Boolean(line.italic),
    family: familyOf(line),
    pageWidth,
    original: {
      text: line.text,
      font: line.font || '',
      size: line.size,
      color: line.color,
      background: line.background || '#ffffff',
      originX: line.originX,
      baseline: line.baseline,
      source: line.source === 'ocr' ? 'ocr' : 'pdf',
      bold: Boolean(line.bold),
      italic: Boolean(line.italic),
      family: familyOf(line),
    },
  };
}

/** The original font can only be reused when the user kept its weight, slant and family. */
export function keepsOriginalStyle(edit) {
  const { original } = edit;
  return edit.bold === original.bold && edit.italic === original.italic && edit.family === original.family;
}

export function isChangedTextEdit(edit) {
  const { original } = edit;
  return (
    edit.text !== original.text ||
    edit.size !== original.size ||
    edit.color.toLowerCase() !== original.color.toLowerCase() ||
    !keepsOriginalStyle(edit)
  );
}

const GENERIC_FAMILY = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };

/** CSS stack for previews: the PDF's font if this device has it, else the same kind of font. */
export function previewFontFamily(edit) {
  const generic = GENERIC_FAMILY[edit.family] || GENERIC_FAMILY.sans;
  const font = keepsOriginalStyle(edit) ? edit.original.font.replace(/["\\]/g, '') : '';
  if (!font) return generic;
  const base = font.split(/[-,]/)[0].replace(/(MT|PS)$/, '').trim();
  return `"${font}", "${base}", ${generic}`;
}

function toBackendEdit(edit) {
  const { original } = edit;
  return {
    page: edit.pageIndex,
    text: edit.text,
    x: edit.x,
    y: edit.y,
    width: edit.width,
    height: edit.height,
    originX: original.originX,
    baseline: original.baseline,
    size: edit.size,
    font: keepsOriginalStyle(edit) ? original.font : '',
    color: edit.color,
    background: original.background,
    source: original.source,
    bold: edit.bold,
    italic: edit.italic,
    serif: edit.family === 'serif',
    mono: edit.family === 'mono',
  };
}

/** Returns the PDF bytes with the text edits applied, reporting font fallbacks via onWarning. */
export async function applyTextEdits({ pdfFile, edits, onWarning }) {
  await ensureBackend();
  const form = new FormData();
  form.append('file', pdfFile, pdfFile.name || 'document.pdf');
  form.append('edits', JSON.stringify(edits.map(toBackendEdit)));
  const res = await submitToolRequest('edit-text', form);
  if (!res.ok) throw await toolError(res, 'Could not apply the text edits.');

  try {
    JSON.parse(res.headers.get('x-forge-warnings') || '[]').forEach((message) => onWarning?.(message));
  } catch {
    // Warnings are informational only.
  }
  return new Uint8Array(await res.arrayBuffer());
}
