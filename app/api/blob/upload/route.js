import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getClientIp, takeRateLimitToken } from '@/lib/server/rate-limit';
import { rejectForgedRequest } from '@/lib/server/request-guard';
import { verifyUserSession } from '@/lib/server/session';
import { getUploadConstraints, validateBlobPath } from '@/lib/server/blob-security';

// Issues short-lived client upload tokens. The browser then uploads straight to Vercel Blob,
// which avoids the 4.5 MB serverless request body limit and a second copy through this function.
export async function POST(request) {
  const forged = rejectForgedRequest(request, { json: true });
  if (forged) return forged;

  const rateLimit = takeRateLimitToken({
    bucket: 'blob-upload',
    key: getClientIp(request),
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const session = await verifyUserSession(request);
  if (!session?.uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (body?.type !== 'blob.generate-client-token') {
    return NextResponse.json({ error: 'Unsupported request' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const pathCheck = validateBlobPath(pathname, session.uid);
        if (!pathCheck.ok) {
          throw new Error(pathCheck.error);
        }
        return {
          ...getUploadConstraints(pathCheck.bucket),
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Upload not allowed' }, { status: 400 });
  }
}
