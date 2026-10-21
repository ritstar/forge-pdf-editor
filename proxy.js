import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/server/session';

const COOKIE_CLEAR_OPTIONS = {
  maxAge: 0,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  sameSite: 'lax',
};

// Runs on the Node.js runtime, so the cookie is verified in-process instead of via an HTTP
// round-trip to our own API. Signature/expiry checks use cached Google keys; revocation is
// checked by the API routes that actually touch data.
async function hasValidSession(sessionCookie) {
  try {
    await getAdminAuth().verifySessionCookie(sessionCookie, false);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = path.startsWith('/app') || path.startsWith('/editor') || path.startsWith('/tools');
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/signup');

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValidSession = sessionCookie ? await hasValidSession(sessionCookie) : false;

  if (isProtectedRoute && !isValidSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', `${path}${request.nextUrl.search}`);
    const response = NextResponse.redirect(url);
    if (sessionCookie) {
      response.cookies.set(SESSION_COOKIE_NAME, '', COOKIE_CLEAR_OPTIONS);
    }
    return response;
  }

  if (isAuthRoute && isValidSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if (sessionCookie && !isValidSession) {
    response.cookies.set(SESSION_COOKIE_NAME, '', COOKIE_CLEAR_OPTIONS);
  }
  return response;
}

export const config = {
  // Only routes that depend on auth state; marketing and legal pages skip verification entirely.
  matcher: ['/app/:path*', '/editor/:path*', '/tools/:path*', '/login', '/signup'],
};
