import {
  BlendMode,
  degrees,
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineJoin,
} from '@cantoo/pdf-lib';
import { applyFormValuesToPdfDoc } from './pdfForms';
import { getPageFrame, placeAt, visualToPdf } from './pdfCoords';
import { createFontKit, wrapText } from './pdfFonts';
import { ellipsePath, inkPath, linePaths, MARK_PATHS, MARK_VIEWBOX, rectPath } from './vectorPaths';

export const LINE_HEIGHT = 1.25; // Matches .text-content line-height in the editor.
// Inner padding of text boxes as a fraction of the font size (the editor uses the same).
export const TEXT_INSET = 0.15;

export function hexToRgb(hex, fallback = rgb(0.07, 0.09, 0.15)) {
  const normalized = String(hex || '').replace('#', '');
  const value = normalized.length === 3
    ? normalized
      .split('')
      .map((c) => c + c)
      .join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return fallback;
  }

  const int = Number.parseInt(value, 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  return rgb(r, g, b);
}

async function readImageBytes(element) {
  if (element.file) {
    return new Uint8Array(await element.file.arrayBuffer());
  }

  if (element.url) {
    const response = await fetch(element.url);
    if (!response.ok) throw new Error('Failed to load image asset');
    return new Uint8Array(await response.arrayBuffer());
  }

  throw new Error('No image source available');
}

async function embedImage(pdfDoc, element) {
  const data = await readImageBytes(element);
  const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
  const isJpg = data[0] === 0xff && data[1] === 0xd8;
  if (isPng) return pdfDoc.embedPng(data);
  if (isJpg) return pdfDoc.embedJpg(data);

  // WebP/GIF/etc: let the browser decode and re-encode as PNG.
  const bitmap = await createImageBitmap(new Blob([data]));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Unsupported image'))), 'image/png'),
  );
  return pdfDoc.embedPng(new Uint8Array(await png.arrayBuffer()));
}

/**
 * Draws SVG path data whose origin is the visual point (left, top) of the displayed page,
 * x to the right and y down, so it appears upright even on rotated pages.
 */
function drawVector(page, frame, left, top, d, options, { roundJoin = false, scale = 1 } = {}) {
  if (!d) return;
  const at = visualToPdf(frame, left, top);
  if (roundJoin) page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
  page.drawSvgPath(d, { x: at.x, y: at.y, rotate: degrees(frame.rotation), scale, ...options });
  if (roundJoin) page.pushOperators(popGraphicsState());
}

function drawShape(page, frame, element, box) {
  const { left, top, width, height } = box;
  const opacity = element.opacity ?? 1;

  if (element.type === 'redact') {
    // The content underneath was already removed by the server; this keeps the black box in
    // its place in the stacking order of the other additions.
    drawVector(page, frame, left, top, rectPath(width, height), { color: rgb(0, 0, 0) });
    return;
  }

  if (element.type === 'mark') {
    const mark = MARK_PATHS[element.kind] || MARK_PATHS.check;
    const scale = Math.min(width, height) / MARK_VIEWBOX;
    const x = left + (width - MARK_VIEWBOX * scale) / 2;
    const y = top + (height - MARK_VIEWBOX * scale) / 2;
    const color = hexToRgb(element.color);
    const options = mark.fill
      ? { color }
      : { borderColor: color, borderWidth: mark.stroke, borderLineCap: LineCapStyle.Round };
    drawVector(page, frame, x, y, mark.d, options, { roundJoin: true, scale });
    return;
  }

  if (element.type === 'ink') {
    const strokeWidth = Math.max(0.3, element.strokeWidth * frame.width);
    drawVector(
      page,
      frame,
      left,
      top,
      inkPath(element.strokes, width, height),
      { borderColor: hexToRgb(element.color), borderWidth: strokeWidth, borderOpacity: opacity, borderLineCap: LineCapStyle.Round },
      { roundJoin: true },
    );
    return;
  }

  const strokeWidth = element.stroke ? Math.max(0.3, element.strokeWidth * frame.width) : 0;

  if (element.kind === 'line' || element.kind === 'arrow') {
    const color = hexToRgb(element.stroke);
    const { line, head } = linePaths(element, width, height, strokeWidth);
    drawVector(page, frame, left, top, line, { borderColor: color, borderWidth: strokeWidth, borderOpacity: opacity, borderLineCap: LineCapStyle.Round });
    if (head) {
      drawVector(
        page,
        frame,
        left,
        top,
        head,
        { color, opacity, borderColor: color, borderWidth: strokeWidth * 0.5, borderOpacity: opacity },
        { roundJoin: true },
      );
    }
    return;
  }

  const d = element.kind === 'ellipse' ? ellipsePath(width, height, strokeWidth / 2) : rectPath(width, height, strokeWidth / 2);
  const options = {};
  if (element.fill) {
    options.color = hexToRgb(element.fill);
    options.opacity = opacity;
  }
  if (element.stroke && strokeWidth) {
    options.borderColor = hexToRgb(element.stroke);
    options.borderWidth = strokeWidth;
    options.borderOpacity = opacity;
  }
  if (element.kind === 'highlight') options.blendMode = BlendMode.Multiply;
  if (!options.color && !options.borderColor) return;
  drawVector(page, frame, left, top, d, options);
}

async function drawTextBox(page, frame, element, box, fonts) {
  const { left, top, width } = box;
  const fontSize = Math.max(4, element.fontSize * frame.width);
  const lineHeight = fontSize * LINE_HEIGHT;
  const inset = fontSize * TEXT_INSET;
  const color = hexToRgb(element.color || '#111827');
  const layout = await fonts.forText(element.text, {
    bold: element.bold,
    italic: element.italic,
    family: element.fontFamily || 'sans',
  });
  const innerWidth = Math.max(width - inset * 2, fontSize);
  const lines = wrapText(layout.text, layout.widthOf, fontSize, innerWidth);

  // First baseline sits roughly one ascent below the top of the box, like the editor.
  let baseline = top + inset + fontSize * 0.95;
  for (const line of lines) {
    if (baseline > frame.height) break;
    const lineWidth = layout.widthOf(line, fontSize);
    const offset = element.align === 'center' ? (innerWidth - lineWidth) / 2 : element.align === 'right' ? innerWidth - lineWidth : 0;
    // Mixed-script lines are drawn run by run, each with a font that has its glyphs.
    let cursor = left + inset + Math.max(0, offset);
    for (const run of layout.runsOf(line)) {
      if (run.text.trim()) {
        page.drawText(run.text, {
          ...placeAt(frame, cursor, baseline),
          size: fontSize,
          font: run.font,
          color,
          opacity: element.opacity ?? 1,
          ...(layout.skew ? { xSkew: degrees(layout.skew) } : {}),
        });
      }
      cursor += run.font.widthOfTextAtSize(run.text, fontSize);
    }
    baseline += lineHeight;
  }
}

export async function generatePdf({ pdfBytes, elements = [], formValues = {}, flattenForm = false, onWarning }) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  await applyFormValuesToPdfDoc(pdfDoc, formValues);
  if (flattenForm) {
    try {
      pdfDoc.getForm().flatten();
    } catch (error) {
      onWarning?.(`Form fields could not be flattened (${error.message}).`);
    }
  }
  const pages = pdfDoc.getPages();
  const fonts = await createFontKit(pdfDoc);

  const imageCache = new Map();
  const frames = new Map();

  for (const element of elements) {
    const page = pages[element.pageIndex];
    if (!page) continue;

    let frame = frames.get(page);
    if (!frame) {
      frame = getPageFrame(page);
      frames.set(page, frame);
    }

    const box = {
      left: element.x * frame.width,
      top: element.y * frame.height,
      width: element.width * frame.width,
      height: element.height * frame.height,
    };

    if (element.type === 'image') {
      if (!element.file && !element.url) continue;

      const cacheKey = element.storagePath || element.url || element.file;
      let image = imageCache.get(cacheKey);
      if (image === undefined) {
        try {
          image = await embedImage(pdfDoc, element);
        } catch (error) {
          // A deleted signature or expired asset should not block exporting everything else.
          image = null;
          onWarning?.(`Skipped an image that could not be loaded (${error.message}).`);
        }
        imageCache.set(cacheKey, image);
      }
      if (!image) continue;

      page.drawImage(image, {
        ...placeAt(frame, box.left, box.top + box.height),
        width: box.width,
        height: box.height,
        opacity: element.opacity ?? 1,
      });
      continue;
    }

    if (element.type === 'text') {
      if (element.text) await drawTextBox(page, frame, element, box, fonts);
      continue;
    }

    if (element.type === 'shape' || element.type === 'ink' || element.type === 'mark' || element.type === 'redact') {
      drawShape(page, frame, element, box);
    }
  }

  pdfDoc.setProducer('Forge PDF');
  pdfDoc.setCreator('Forge PDF');
  return pdfDoc.save();
}
