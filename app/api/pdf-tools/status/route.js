import { NextResponse } from 'next/server';
import { getClientIp, takeRateLimitToken } from '@/lib/server/rate-limit';
import { verifyUserSession } from '@/lib/server/session';
import { backendUrl } from '@/lib/server/pdfTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Short on purpose: a sleeping Render instance holds the request until it boots, so the
// client polls this endpoint instead of keeping one long request open.
const PING_TIMEOUT_MS = 8000;

/**
 * Pings the conversion backend. Any request wakes a sleeping free-tier instance, so calling
 * this early (dashboard, tool pages) hides most of the cold start from users.
 * Responds { status: 'ready' | 'waking' }.
 */
export async function GET(request) {
  const rateLimit = takeRateLimitToken({
    bucket: 'pdf-tools-status',
    key: getClientIp(request),
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ status: 'waking' }, { status: 429 });
  }

  const session = await verifyUserSession(request);
  if (!session?.uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  let status = 'waking';
  try {
    const res = await fetch(`${backendUrl()}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    if (res.ok) status = 'ready';
  } catch {
    // Timeout or connection refused while the instance boots: still waking.
  }

  return NextResponse.json(
    { status, latencyMs: Date.now() - started },
    { headers: { 'cache-control': 'no-store' } },
  );
}
