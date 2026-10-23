import { NextResponse } from 'next/server';

// Defence against cross-site request forgery for routes that change state. Browsers send an
// Origin header with every POST/DELETE and Sec-Fetch-Site on modern versions, so a request
// another site makes a visitor's browser send is recognisable. Requests without either header
// come from non-browser clients, which can't ride on a visitor's cookies.
function isCrossSite(request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true;

  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const { host } = new URL(origin);
    const allowed = new Set([request.headers.get('host'), request.headers.get('x-forwarded-host')]);
    if (process.env.NEXT_PUBLIC_APP_URL) {
      allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).host);
    }
    return !allowed.has(host);
  } catch {
    return true;
  }
}

/**
 * Returns an error response for forged cross-site requests, or for bodies that aren't JSON
 * when `json` is set (an HTML form can only send form encodings or text/plain), else null.
 */
export function rejectForgedRequest(request, { json = false } = {}) {
  if (isCrossSite(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (json && !(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 415 });
  }
  return null;
}
