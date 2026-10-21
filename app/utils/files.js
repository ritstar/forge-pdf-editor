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
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Revoking the object URL synchronously after click() cancels the download in some browsers
// (Firefox/Safari), so give the download a moment to start first.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
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
