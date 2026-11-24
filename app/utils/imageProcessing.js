// Signature images: photographed or scanned signatures get a transparent background with soft,
// anti-aliased edges, and every signature is trimmed to its ink so it can be placed precisely.

const MAX_SIDE = 1600;

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export async function imageSize(src) {
  const img = await loadImage(src);
  return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))), type, quality);
  });
}

/** Crops a canvas to its non-transparent pixels plus `padding`; returns the canvas itself if empty. */
export function trimCanvas(canvas, padding = 8) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (data[row + x * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return canvas;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  const out = document.createElement('canvas');
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext('2d').drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function hasInk(canvas) {
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) return true;
  return false;
}

/**
 * Makes the paper of a photographed signature transparent. The paper brightness is measured
 * (photos are rarely pure white), and pixels fade out smoothly between ink and paper so edges
 * stay anti-aliased instead of jagged. Images that already have transparency are kept as is.
 */
export async function removeWhiteBackground(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;

    let transparent = 0;
    const histogram = new Uint32Array(256);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 250) transparent += 1;
      const lum = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      histogram[lum] += 1;
    }
    const pixels = data.length / 4;

    if (transparent < pixels * 0.02) {
      // Paper: the brightness most of the image is at least as bright as (85th percentile).
      let seen = 0;
      let paper = 255;
      for (let lum = 0; lum < 256; lum += 1) {
        seen += histogram[lum];
        if (seen >= pixels * 0.85) {
          paper = lum;
          break;
        }
      }
      paper = Math.max(paper, 90);
      const solid = paper * 0.55; // Fully opaque ink below this brightness.
      const fade = paper * 0.9; // Fully transparent paper above this brightness.
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        let alpha;
        if (lum <= solid) alpha = 1;
        else if (lum >= fade) alpha = 0;
        else {
          const t = (fade - lum) / (fade - solid);
          alpha = t * t * (3 - 2 * t);
        }
        data[i + 3] = Math.round(data[i + 3] * alpha);
        // Deepen the ink a little so a grey pencil-on-paper photo reads as a signature.
        if (alpha > 0) {
          const k = 0.75;
          data[i] *= k;
          data[i + 1] *= k;
          data[i + 2] *= k;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const trimmed = trimCanvas(canvas, 6);
    const blob = await canvasToBlob(trimmed);
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const SIGNATURE_FONTS = [
  { family: 'Forge Signature Dancing', label: 'Dancing Script', size: 1 },
  { family: 'Forge Signature Vibes', label: 'Great Vibes', size: 1.12 },
  { family: 'Forge Signature Sacramento', label: 'Sacramento', size: 1.18 },
  { family: 'Forge Signature Caveat', label: 'Caveat', size: 1 },
];

/** Renders typed text in a handwriting font as a trimmed, transparent PNG canvas. */
export async function renderTypedSignature(text, font, color) {
  const size = Math.round(96 * (font.size || 1));
  const spec = `${size}px "${font.family}"`;
  try {
    await document.fonts.load(spec, text);
  } catch {
    // Falls back to the browser's cursive font below.
  }
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${spec}, cursive`;
  const width = Math.ceil(measure.measureText(text).width + size);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.ceil(size * 1.8);
  const ctx = canvas.getContext('2d');
  ctx.font = `${spec}, cursive`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, canvas.height / 2);
  return trimCanvas(canvas, Math.round(size * 0.08));
}

const UPLOADABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_UPLOAD_BYTES = 9.5 * 1024 * 1024;
const MAX_UPLOAD_SIDE = 4000;

/**
 * Images the workspace can store: PNG, JPEG or WebP under 10 MB. Anything else (GIF, BMP,
 * HEIC that the browser can decode, huge photos) is redrawn, downscaled if needed.
 */
export async function prepareImageForUpload(file) {
  if (UPLOADABLE.has(file.type) && file.size <= MAX_UPLOAD_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Photos stay JPEG; graphics (with possible transparency) become PNG.
    const asJpeg = file.type === 'image/jpeg' || file.size > MAX_UPLOAD_BYTES;
    let blob = await canvasToBlob(canvas, asJpeg ? 'image/jpeg' : 'image/png', 0.9);
    if (blob.size > MAX_UPLOAD_BYTES) blob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
    const extension = blob.type === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'image'}.${extension}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
