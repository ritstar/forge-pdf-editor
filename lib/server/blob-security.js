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

  if (!ALLOWED_UPLOADS[bucket].extensions.has(fileExtension(trimmed))) {
    return { ok: false, error: 'Unsupported file type.' };
  }

  return { ok: true, bucket, normalizedPath: trimmed };
}

// Constraints baked into a client upload token; Vercel Blob enforces them at upload time.
export function getUploadConstraints(bucket) {
  const rules = ALLOWED_UPLOADS[bucket];
  return {
    allowedContentTypes: [...rules.mimeTypes],
    maximumSizeInBytes: rules.maxBytes,
  };
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

// Uploads are only ever authorized under `<bucket>/<uid>/...`, so the URL path itself proves
// ownership. This works for every bucket (including draft assets) and does not depend on the
// Firestore record still existing.
export function isBlobOwnedBy(url, userId) {
  if (!userId || !isAllowedBlobUrl(url)) return false;
  const { pathname } = new URL(url);
  // Paths we issue only contain [a-zA-Z0-9/_.-]; reject anything encoded (e.g. %2F tricks).
  if (pathname.includes('%')) return false;
  const [bucket, owner] = pathname.replace(/^\/+/, '').split('/');
  return Object.hasOwn(ALLOWED_UPLOADS, bucket) && owner === userId;
}
