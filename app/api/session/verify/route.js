import { NextResponse } from 'next/server';
import { verifyUserSession } from '@/lib/server/session';

export async function GET(request) {
  const session = await verifyUserSession(request);
  if (!session?.uid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ uid: session.uid });
}
