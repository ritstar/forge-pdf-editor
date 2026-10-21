import { upload } from '@vercel/blob/client';

const MULTIPART_THRESHOLD = 8 * 1024 * 1024;

// Uploads directly from the browser to Vercel Blob; /api/blob/upload only authorizes the path.
export async function uploadToBlob(pathname, file, contentType = file.type) {
  try {
    return await upload(pathname, file, {
      access: 'public',
      handleUploadUrl: '/api/blob/upload',
      contentType,
      multipart: file.size > MULTIPART_THRESHOLD,
    });
  } catch (error) {
    throw new Error(error?.message || 'Upload failed');
  }
}

export async function deleteBlobs(urls) {
  const owned = urls.filter((url) => typeof url === 'string' && url.includes('.blob.vercel-storage.com'));
  if (!owned.length) return;

  const res = await fetch('/api/blob/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: owned }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete stored files');
  }
}
