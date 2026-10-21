// Reads the EXIF orientation tag from a JPEG (1 = upright). Returns 1 when absent/unreadable.
export function readJpegOrientation(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i += 1) {
        const entry = ifd + 2 + i * 12;
        if (entry + 10 > view.byteLength) break;
        if (view.getUint16(entry, little) === 0x0112) {
          return view.getUint16(entry + 8, little);
        }
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    offset += 2 + size;
  }
  return 1;
}

// Returns bytes pdf-lib can embed as-is. Upright JPEGs and PNGs pass through untouched
// (no recompression); rotated JPEGs and other formats are redrawn upright by the browser.
export async function toEmbeddableImage(file) {
  const buffer = await file.arrayBuffer();
  const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';

  if (file.type === 'image/png') return { kind: 'png', bytes: buffer };
  if (isJpeg && readJpegOrientation(buffer) === 1) return { kind: 'jpg', bytes: buffer };

  // createImageBitmap applies EXIF orientation by default.
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();

  const kind = isJpeg ? 'jpg' : 'png';
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error(`Could not read ${file.name}`))),
      kind === 'jpg' ? 'image/jpeg' : 'image/png',
      0.92,
    ),
  );
  canvas.width = 0;
  canvas.height = 0;
  return { kind, bytes: await blob.arrayBuffer() };
}
