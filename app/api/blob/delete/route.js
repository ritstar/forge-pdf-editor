import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { isAllowedBlobUrl } from '@/lib/server/blob-security';
import { getClientIp, takeRateLimitToken } from '@/lib/server/rate-limit';
import { verifyUserSession } from '@/lib/server/session';

export async function POST(request) {
  try {
    const rateLimit = takeRateLimitToken({
      bucket: 'blob-delete',
      key: getClientIp(request),
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const session = await verifyUserSession(request);
    if (!session?.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await request.json();
    if (typeof url !== 'string' || !isAllowedBlobUrl(url)) {
      return NextResponse.json({ error: 'Invalid blob URL' }, { status: 400 });
    }

    const adminDb = getAdminDb();

    const [documentSnap, signatureSnap] = await Promise.all([
      adminDb.collection('documents').where('file_path', '==', url).limit(1).get(),
      adminDb.collection('signatures').where('image_path', '==', url).limit(1).get(),
    ]);

    const ownedDocument = !documentSnap.empty && documentSnap.docs[0].data().user_id === session.uid;
    const ownedSignature = !signatureSnap.empty && signatureSnap.docs[0].data().user_id === session.uid;

    if (!ownedDocument && !ownedSignature) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await del(url);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    );
  }
}
