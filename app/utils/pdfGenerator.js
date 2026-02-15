import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
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

  try {
    const isPng = data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
    if (isPng) return await pdfDoc.embedPng(data);
    return await pdfDoc.embedJpg(data);
  } catch {
    try {
      return await pdfDoc.embedPng(data);
    } catch {
      return await pdfDoc.embedJpg(data);
    }
  }
}

export async function generatePdf({ pdfBytes, elements = [] }) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const imageCache = new Map();

  for (const element of elements) {
    const page = pages[element.pageIndex];
    if (!page) continue;

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const x = element.x * pageWidth;
    const yTop = element.y * pageHeight;
    const elementWidth = element.width * pageWidth;
    const elementHeight = element.height * pageHeight;
    const y = pageHeight - yTop - elementHeight;

    if (element.type === 'image') {
      if (!element.file && !element.url) continue;

      const cacheKey = element.storagePath || element.url || element.file;
      let image = imageCache.get(cacheKey);
      if (!image) {
        image = await embedImage(pdfDoc, element);
        imageCache.set(cacheKey, image);
      }

      page.drawImage(image, {
        x,
        y,
        width: elementWidth,
        height: elementHeight,
        rotate: degrees(0),
      });
      continue;
    }

    if (element.type === 'text' && element.text) {
      const lines = element.text.split(/\r?\n/);
      const font = element.bold ? boldFont : regularFont;
      const fontSize = Math.max(7, element.fontSize * pageWidth);
      const lineHeight = fontSize * 1.18;
      const color = hexToRgb(element.color || '#111827');

      let cursorY = pageHeight - yTop - fontSize;
      for (const line of lines) {
        if (cursorY < 0) break;
        page.drawText(line, {
          x,
          y: cursorY,
          size: fontSize,
          font,
          color,
          maxWidth: elementWidth,
        });
        cursorY -= lineHeight;
      }
    }
  }

  return await pdfDoc.save();
}
