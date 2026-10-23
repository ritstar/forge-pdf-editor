// Some platforms (notably Windows without a PDF reader) report an empty MIME type for PDFs,
// so fall back to the extension.
export function isPdfFile(file) {
  if (!file) return false;
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

export function stripExtension(name, fallback = 'document') {
  const base = String(name || '').replace(/\.[^./\\]+$/, '');
  return base || fallback;
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

// Revoking the object URL synchronously after click() cancels the download in some browsers
// (Firefox/Safari), so give the download a moment to start first.
export function downloadBlob(blob, filename) {
  // With its real type (a PDF, an image), Safari and some mobile browsers ignore `download` and
  // open the file in their viewer, leaving the user on a blob: page. Labelled as a generic
  // file it is saved under `filename`, whose extension still tells the OS what it is.
  const file = blob.type === 'application/octet-stream' ? blob : new Blob([blob], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadPdfBytes(bytes, filename) {
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename);
}
