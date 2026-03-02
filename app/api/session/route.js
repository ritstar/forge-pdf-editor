import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';

const SESSION_COOKIE_NAME = '__session';
const EXPIRES_IN = 60 * 60 * 24 * 5 * 1000; // 5 days

export async function POST(request) {
    try {
        const { idToken } = await request.json();
        if (!idToken) {
            return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
        }

        const adminAuth = getAdminAuth();
        const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRES_IN });

        const response = NextResponse.json({ status: 'ok' });
        response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
            maxAge: EXPIRES_IN / 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            sameSite: 'lax',
        });

        return response;
    } catch (error) {
        console.error('Session creation failed:', error.message);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}

export async function DELETE() {
    const response = NextResponse.json({ status: 'ok' });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        sameSite: 'lax',
    });
    return response;
}
