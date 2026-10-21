import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { isBlobOwnedBy } from '@/lib/server/blob-security';
import { getClientIp, takeRateLimitToken } from '@/lib/server/rate-limit';
import { verifyUserSession } from '@/lib/server/session';

const MAX_URLS_PER_REQUEST = 50;

export async function POST(request) {
  try {
    const rateLimit = takeRateLimitToken({
      bucket: 'blob-delete',
      key: getClientIp(request),
      limit: 60,
      windowMs: 10 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const session = await verifyUserSession(request);
    if (!session?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const urls = Array.isArray(body.urls) ? body.urls : [body.url];

    if (!urls.length || urls.length > MAX_URLS_PER_REQUEST || urls.some((url) => typeof url !== 'string')) {
      return NextResponse.json({ error: 'Invalid blob URL' }, { status: 400 });
    }

    if (!urls.every((url) => isBlobOwnedBy(url, session.uid))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await del(urls);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Blob delete failed:', error);
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    );
  }
}
