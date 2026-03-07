import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getClientIp, takeRateLimitToken } from '@/lib/server/rate-limit';
import { verifyUserSession } from '@/lib/server/session';
import { validateBlobPath, validateUploadFile } from '@/lib/server/blob-security';

export async function POST(request) {
  try {
    const rateLimit = takeRateLimitToken({
      bucket: 'blob-upload',
      key: getClientIp(request),
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const session = await verifyUserSession(request);
    if (!session?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const path = form.get('path');

    if (!(file instanceof File) || typeof path !== 'string') {
      return NextResponse.json({ error: 'File or path missing' }, { status: 400 });
    }

    const pathCheck = validateBlobPath(path, session.uid);
    if (!pathCheck.ok) {
      return NextResponse.json({ error: pathCheck.error }, { status: 400 });
    }

    const fileCheck = validateUploadFile(file, pathCheck.bucket);
    if (!fileCheck.ok) {
      return NextResponse.json({ error: fileCheck.error }, { status: 400 });
    }

    const blob = await put(pathCheck.normalizedPath, file, { access: 'public' });
    
    return NextResponse.json(blob);
  } catch (error) {
    console.error('Vercel Blob Direct Upload Error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
}
