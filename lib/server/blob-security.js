const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SAFE_PATH_REGEX = /^[a-zA-Z0-9/_-]+(?:\.[a-zA-Z0-9]+)?$/;
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

const ALLOWED_UPLOADS = {
  documents: {
    mimeTypes: new Set(['application/pdf']),
    extensions: new Set(['pdf']),
    maxBytes: MAX_PDF_BYTES,
  },
  signatures: {
    mimeTypes: new Set(['image/png', 'image/jpeg', 'image/webp']),
    extensions: new Set(['png', 'jpg', 'jpeg', 'webp']),
    maxBytes: MAX_IMAGE_BYTES,
  },
  draft_assets: {
    mimeTypes: new Set(['image/png', 'image/jpeg', 'image/webp']),
    extensions: new Set(['png', 'jpg', 'jpeg', 'webp']),
    maxBytes: MAX_IMAGE_BYTES,
  },
};

function fileExtension(name) {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function validateBlobPath(path, userId) {
  if (typeof path !== 'string') {
    return { ok: false, error: 'Invalid upload path.' };
  }

  const trimmed = path.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('..') || !SAFE_PATH_REGEX.test(trimmed)) {
    return { ok: false, error: 'Invalid upload path.' };
  }

  const parts = trimmed.split('/');
  if (parts.length < 3) {
    return { ok: false, error: 'Invalid upload path.' };
  }

  const [bucket, owner] = parts;
  if (!Object.hasOwn(ALLOWED_UPLOADS, bucket) || owner !== userId) {
    return { ok: false, error: 'Upload path is not allowed.' };
  }

  return { ok: true, bucket, normalizedPath: trimmed };
}

export function validateUploadFile(file, bucket) {
  const rules = ALLOWED_UPLOADS[bucket];
  if (!rules) {
    return { ok: false, error: 'Unsupported upload bucket.' };
  }

  const extension = fileExtension(file.name || '');
  if (!rules.mimeTypes.has(file.type) || !rules.extensions.has(extension)) {
    return { ok: false, error: 'Unsupported file type.' };
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > rules.maxBytes) {
    return { ok: false, error: 'File is too large.' };
  }

  return { ok: true };
}

export function isAllowedBlobUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'public.blob.vercel-storage.com' ||
      parsed.hostname.endsWith(BLOB_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}
