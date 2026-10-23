import { createHmac } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getClientIp, takeRateLimitToken } from '@/lib/server/rate-limit';
import { verifyUserSession } from '@/lib/server/session';
import { backendApiSecret, backendUrl, publicBackendUrl } from '@/lib/server/pdfTools';

export const runtime = 'nodejs';
export const maxDuration = 120;

const API_KEY_HEADER = 'x-api-key';
const TOKEN_TTL_SECONDS = 10 * 60;
const UPSTREAM_TIMEOUT_MS = 115_000;

const ALLOWED_TOOL_IDS = new Set([
  'compress-pdf',
  'pdf-to-word',
  'pdf-to-powerpoint',
  'pdf-to-excel',
  'word-to-pdf',
  'powerpoint-to-pdf',
  'excel-to-pdf',
  'html-to-pdf',
  'unlock-pdf',
  'protect-pdf',
  'pdf-to-pdfa',
  'repair-pdf',
  'text-layout',
  'edit-text',
]);

// Must match _verify_tool_token in backend/app/main.py.
function signToolToken({ uid, toolId, secret }) {
  const payload = Buffer.from(
    JSON.stringify({ uid, tool: toolId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

async function guard(request, params, bucket, limit) {
  const { toolId } = await params;

  if (!ALLOWED_TOOL_IDS.has(toolId)) {
    return { error: NextResponse.json({ error: 'Unsupported tool.' }, { status: 404 }) };
  }

  const rateLimit = takeRateLimitToken({ bucket, key: getClientIp(request), limit, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return { error: NextResponse.json({ error: 'Too many requests' }, { status: 429 }) };
  }

  const session = await verifyUserSession(request);
  if (!session?.uid) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const apiSecret = backendApiSecret();
  if (!apiSecret) {
    return { error: NextResponse.json({ error: 'Backend API secret is not configured.' }, { status: 500 }) };
  }

  return { toolId, uid: session.uid, apiSecret };
}

// Issues a short-lived token so the browser can upload straight to the backend.
export async function GET(request, { params }) {
  const ctx = await guard(request, params, 'pdf-tools-token', 30);
  if (ctx.error) return ctx.error;

  return NextResponse.json(
    {
      endpoint: `${publicBackendUrl()}/tools/${ctx.toolId}`,
      token: signToolToken({ uid: ctx.uid, toolId: ctx.toolId, secret: ctx.apiSecret }),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

// Fallback path: proxies the request through this function (subject to platform body limits).
export async function POST(request, { params }) {
  const ctx = await guard(request, params, 'pdf-tools-proxy', 20);
  if (ctx.error) return ctx.error;

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart form data.' }, { status: 400 });
  }

  try {
    // Stream the multipart body through untouched rather than parsing and re-encoding it.
    const upstream = await fetch(`${backendUrl()}/tools/${ctx.toolId}`, {
      method: 'POST',
      headers: {
        [API_KEY_HEADER]: ctx.apiSecret,
        'content-type': contentType,
        'x-forge-user': ctx.uid,
        'x-forge-client-ip': getClientIp(request),
      },
      body: request.body,
      duplex: 'half',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const upstreamType = upstream.headers.get('content-type') || 'application/octet-stream';

    if (!upstream.ok) {
      if (upstreamType.includes('application/json')) {
        const json = await upstream.json().catch(() => ({}));
        return NextResponse.json({ error: json.error || 'Backend tool request failed.' }, { status: upstream.status });
      }
      return NextResponse.json({ error: 'Backend tool request failed.' }, { status: upstream.status });
    }

    const headers = new Headers({ 'content-type': upstreamType, 'cache-control': 'no-store' });
    const contentDisposition = upstream.headers.get('content-disposition');
    if (contentDisposition) {
      headers.set('content-disposition', contentDisposition);
    }
    const warnings = upstream.headers.get('x-forge-warnings');
    if (warnings) {
      headers.set('x-forge-warnings', warnings);
    }

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError';
    console.error('PDF tool proxy failed:', error);
    return NextResponse.json(
      { error: timedOut ? 'The conversion took too long. Try a smaller file.' : 'Failed to reach the PDF tools service.' },
      { status: timedOut ? 504 : 502 },
    );
  }
}
