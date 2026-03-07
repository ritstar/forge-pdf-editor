import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = '__session';

async function hasValidSession(request, sessionCookie) {
  try {
    const verifyUrl = new URL('/api/session/verify', request.url);
    const response = await fetch(verifyUrl, {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
      },
      cache: 'no-store',
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function middleware(request) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = path.startsWith('/app') || path.startsWith('/editor') || path.startsWith('/tools');
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/signup');

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let isValidSession = false;

  if (sessionCookie) {
    isValidSession = await hasValidSession(request, sessionCookie);
  }

  if (isProtectedRoute && !isValidSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    const response = NextResponse.redirect(url);
    if (sessionCookie) {
      response.cookies.set(SESSION_COOKIE_NAME, '', {
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
      });
    }
    return response;
  }

  if (isAuthRoute && isValidSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  if ((isAuthRoute || isProtectedRoute) && sessionCookie && !isValidSession) {
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/session|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
