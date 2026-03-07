import { getAdminAuth } from '@/lib/firebase/admin';

export const SESSION_COOKIE_NAME = '__session';

export function getSessionCookie(request) {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value || '';
}

export async function verifyUserSession(request) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) return null;

  try {
    return await getAdminAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}
