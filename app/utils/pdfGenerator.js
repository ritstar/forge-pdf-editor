import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { applyFormValuesToPdfDoc } from './pdfForms';
import { getPageFrame, placeAt } from './pdfCoords';

const LINE_HEIGHT = 1.25; // Matches .text-content line-height in the editor.

function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '');
  const value = normalized.length === 3
    ? normalized
      .split('')
      .map((c) => c + c)
      .join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    return rgb(0.07, 0.09, 0.15);
  }

  const int = Number.parseInt(value, 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  return rgb(r, g, b);
}

// Standard fonts only cover WinAnsi; drawing anything else throws and aborts the whole export.
export function makeTextEncoder(font) {
  const supported = new Set(font.getCharacterSet());
  return (text) =>
    Array.from(String(text).replace(/\t/g, '    '))
      .map((char) => (supported.has(char.codePointAt(0)) ? char : '?'))
      .join('');
}

export function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    const words = paragraph.split(/(\s+)/).filter((part) => part.length);
    let line = '';

    for (const word of words) {
      const candidate = line + word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line.trimEnd());
      line = word.trimStart();
    }

    // Hard-break any single word that is wider than the box.
    const pending = [line];
    while (pending.length) {
      let current = pending.shift();
      if (font.widthOfTextAtSize(current, size) <= maxWidth || current.length <= 1) {
        lines.push(current);
        continue;
      }
      let cut = current.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
      pending.unshift(current);
    }
  }
  return lines;
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

export async function generatePdf({ pdfBytes, elements = [], formValues = {}, onWarning }) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  await applyFormValuesToPdfDoc(pdfDoc, formValues);
  const pages = pdfDoc.getPages();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const encoders = new Map([
    [regularFont, makeTextEncoder(regularFont)],
    [boldFont, makeTextEncoder(boldFont)],
  ]);

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

    const left = element.x * frame.width;
    const top = element.y * frame.height;
    const boxWidth = element.width * frame.width;
    const boxHeight = element.height * frame.height;

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
        ...placeAt(frame, left, top + boxHeight),
        width: boxWidth,
        height: boxHeight,
      });
      continue;
    }

    if (element.type === 'text' && element.text) {
      const font = element.bold ? boldFont : regularFont;
      const fontSize = Math.max(7, element.fontSize * frame.width);
      const lineHeight = fontSize * LINE_HEIGHT;
      const inset = fontSize * 0.15;
      const color = hexToRgb(element.color || '#111827');
      const text = encoders.get(font)(element.text);
      const lines = wrapText(text, font, fontSize, Math.max(boxWidth - inset * 2, fontSize));

      // First baseline sits roughly one ascent below the top of the box, like the editor.
      let baseline = top + inset + fontSize * 0.95;
      for (const line of lines) {
        if (baseline > frame.height) break;
        if (line) {
          page.drawText(line, {
            ...placeAt(frame, left + inset, baseline),
            size: fontSize,
            font,
            color,
          });
        }
        baseline += lineHeight;
      }
    }
  }

  return pdfDoc.save();
}
