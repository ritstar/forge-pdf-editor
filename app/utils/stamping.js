import { degrees, PDFArray, PDFName } from '@cantoo/pdf-lib';
import { getPageFrame, visualToPdf } from './pdfCoords';
import { createFontKit } from './pdfFonts';
import { hexToRgb } from './pdfGenerator';

// Watermarks and page numbers, shared by the tools' live previews and their downloads.

const GRID = {
  'top-left': [0, 0],
  'top-center': [1, 0],
  'top-right': [2, 0],
  'middle-left': [0, 1],
  center: [1, 1],
  'middle-right': [2, 1],
  'bottom-left': [0, 2],
  'bottom-center': [1, 2],
  'bottom-right': [2, 2],
};

/** Moves everything just drawn on the page underneath its existing content. */
function sendDrawingBehind(page) {
  const contents = page.node.get(PDFName.of('Contents'));
  const array = contents instanceof PDFArray ? contents : page.node.context.lookupMaybe(contents, PDFArray);
  if (!array || array.size() < 2) return;
  const last = array.get(array.size() - 1);
  array.remove(array.size() - 1);
  array.insert(0, last);
}

/** Size of a w×h box rotated by `deg` degrees. */
function rotatedBounds(w, h, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { width: w * cos + h * sin, height: w * sin + h * cos };
}

/** Bottom-left corner (PDF space) for a w×h box rotated by `angle` and centered on `center`. */
function anchorFor(center, w, h, angle) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: center.x - (w / 2) * Math.cos(rad) + (h / 2) * Math.sin(rad),
    y: center.y - (w / 2) * Math.sin(rad) - (h / 2) * Math.cos(rad),
  };
}

/** Centers (visual coordinates) for one stamp of the given rotated size, or a tiled grid. */
function stampCenters(frame, box, { layout, position, margin }) {
  if (layout === 'tile') {
    const gapX = Math.max(box.width * 0.6, 48);
    const gapY = Math.max(box.height * 1.6, 48);
    const stepX = box.width + gapX;
    const stepY = box.height + gapY;
    const centers = [];
    const rows = Math.ceil(frame.height / stepY) + 1;
    const cols = Math.ceil(frame.width / stepX) + 1;
    for (let r = -1; r < rows; r += 1) {
      // Every other row is offset by half a step, like bricks.
      const shift = r % 2 ? stepX / 2 : 0;
      for (let c = -1; c < cols; c += 1) {
        centers.push({ u: c * stepX + shift + stepX / 2, v: r * stepY + stepY / 2 });
      }
    }
    return centers;
  }
  const [col, row] = GRID[position] || GRID.center;
  const u = [margin + box.width / 2, frame.width / 2, frame.width - margin - box.width / 2][col];
  const v = [margin + box.height / 2, frame.height / 2, frame.height - margin - box.height / 2][row];
  return [{ u, v }];
}

/**
 * Stamps a text or image watermark on the given pages.
 * options: { kind: 'text'|'image', text, family, bold, color, opacity, size ('auto' | points),
 *   rotation ('diagonal' | degrees), layout ('single'|'tile'), position, behind, image: { bytes, type },
 *   imageScale (0..1 of page width) }
 */
export async function applyWatermark(pdfDoc, pageIndices, options) {
  const pages = pdfDoc.getPages();
  const opacity = Number(options.opacity ?? 0.3);
  let textLayout = null;
  let image = null;
  if (options.kind === 'image') {
    if (!options.image?.bytes) return;
    image = options.image.type === 'png' ? await pdfDoc.embedPng(options.image.bytes) : await pdfDoc.embedJpg(options.image.bytes);
  } else {
    const text = String(options.text || '').trim();
    if (!text) return;
    const fonts = await createFontKit(pdfDoc);
    textLayout = await fonts.forText(text, { bold: options.bold, family: options.family });
  }
  const color = hexToRgb(options.color || '#808080');

  for (const index of pageIndices) {
    const page = pages[index];
    if (!page) continue;
    const frame = getPageFrame(page);
    const visualAngle = options.rotation === 'diagonal'
      ? (Math.atan2(frame.height, frame.width) * 180) / Math.PI
      : Number(options.rotation) || 0;
    // pdf-lib angles are counter-clockwise in PDF space; add /Rotate so it reads as displayed.
    const angle = visualAngle + frame.rotation;
    const margin = Math.min(36, frame.width * 0.06);

    if (image) {
      const width = Math.max(8, frame.width * (options.imageScale || 0.4));
      const height = width * (image.height / image.width);
      const bounds = rotatedBounds(width, height, visualAngle);
      for (const { u, v } of stampCenters(frame, bounds, { ...options, margin })) {
        const anchor = anchorFor(visualToPdf(frame, u, v), width, height, angle);
        page.drawImage(image, { ...anchor, width, height, rotate: degrees(angle), opacity });
      }
    } else {
      const { text } = textLayout;
      const widthAtOne = textLayout.widthOf(text, 1);
      const runs = textLayout.runsOf(text);
      let size = Number(options.size);
      if (!size || options.size === 'auto') {
        const span = options.layout === 'tile'
          ? frame.width * 0.32
          : options.rotation === 'diagonal' ? Math.hypot(frame.width, frame.height) * 0.65 : frame.width * 0.7;
        size = Math.max(8, Math.min(options.layout === 'tile' ? 36 : 96, span / widthAtOne));
      }
      const textWidth = widthAtOne * size;
      const capHeight = runs[0].font.heightAtSize(size, { descender: false });
      const bounds = rotatedBounds(textWidth, capHeight, visualAngle);
      const rad = (angle * Math.PI) / 180;
      for (const { u, v } of stampCenters(frame, bounds, { ...options, margin })) {
        let { x, y } = anchorFor(visualToPdf(frame, u, v), textWidth, capHeight, angle);
        // Mixed-script text is drawn run by run along the rotated baseline.
        for (const run of runs) {
          page.drawText(run.text, { x, y, size, font: run.font, color, opacity, rotate: degrees(angle) });
          const advance = run.font.widthOfTextAtSize(run.text, size);
          x += advance * Math.cos(rad);
          y += advance * Math.sin(rad);
        }
      }
    }
    if (options.behind) sendDrawingBehind(page);
  }
}

export const NUMBER_FORMATS = [
  { value: '{n}', label: '1' },
  { value: 'Page {n}', label: 'Page 1' },
  { value: '{n} of {total}', label: '1 of 9' },
  { value: 'Page {n} of {total}', label: 'Page 1 of 9' },
  { value: '{n} / {total}', label: '1 / 9' },
  { value: '- {n} -', label: '- 1 -' },
];

export function formatNumber(template, n, total) {
  return String(template || '{n}').replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total));
}

/**
 * Adds page numbers. options: { template, position ('top-left'… 'bottom-right'), first (number),
 *   family, bold, size (pt), color, margin (pt), mirror (swap left/right on even pages) }.
 * `numbered` lists the 0-based pages that get a number, in order. For previews of a single
 * copied page, `numberOf(i)`, `sourceIndexOf(i)` and `total` give the number, original page
 * index and last number as they are in the whole document.
 */
export async function applyPageNumbers(pdfDoc, numbered, options, { numberOf, sourceIndexOf, total: totalOverride } = {}) {
  const pages = pdfDoc.getPages();
  const fonts = await createFontKit(pdfDoc);
  const color = hexToRgb(options.color || '#111827');
  const first = Number(options.first) || 1;
  const total = totalOverride ?? first + numbered.length - 1;
  const [vertical, horizontal] = String(options.position || 'bottom-center').split('-');

  for (let i = 0; i < numbered.length; i += 1) {
    const page = pages[numbered[i]];
    if (!page) continue;
    const frame = getPageFrame(page);
    const n = numberOf ? numberOf(i) : first + i;
    const label = formatNumber(options.template, n, total);
    const layout = await fonts.forText(label, { bold: options.bold, family: options.family });
    const size = Number(options.size) || 11;
    const width = layout.widthOf(layout.text, size);
    const margin = Math.min(Number(options.margin) || 28, frame.height * 0.2);

    let side = horizontal;
    // Book layout: outer edge on both sides of a spread (page 2 is a left-hand page).
    const sourcePage = sourceIndexOf ? sourceIndexOf(i) : numbered[i];
    if (options.mirror && side !== 'center' && (sourcePage + 1) % 2 === 0) side = side === 'left' ? 'right' : 'left';
    let u = (frame.width - width) / 2;
    if (side === 'left') u = margin;
    if (side === 'right') u = frame.width - width - margin;
    // v is the baseline measured from the top of the visible page.
    const v = vertical === 'top' ? margin + size * 0.75 : frame.height - margin;

    let cursor = u;
    for (const run of layout.runsOf(layout.text)) {
      const point = visualToPdf(frame, cursor, v);
      page.drawText(run.text, { ...point, rotate: degrees(frame.rotation), size, font: run.font, color, ...(layout.skew ? { xSkew: degrees(layout.skew) } : {}) });
      cursor += run.font.widthOfTextAtSize(run.text, size);
    }
  }
}
