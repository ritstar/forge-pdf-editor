import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = '__session';

export async function middleware(request) {
  const path = request.nextUrl.pathname;
  const isProtectedRoute = path.startsWith('/app') || path.startsWith('/editor') || path.startsWith('/tools');
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/signup');

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (isProtectedRoute && !sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && sessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/app';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/session|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
