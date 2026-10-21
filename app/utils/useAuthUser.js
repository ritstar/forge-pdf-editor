'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';

// status: 'loading' until Firebase reports, then 'signed-in' | 'signed-out'.
export function useAuthUser() {
  const [state, setState] = useState({ user: null, status: auth ? 'loading' : 'signed-out' });

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (user) => {
      setState({ user, status: user ? 'signed-in' : 'signed-out' });
    });
  }, []);

  return state;
}

export async function signOutEverywhere() {
  const { signOut } = await import('firebase/auth');
  await Promise.allSettled([signOut(auth), fetch('/api/session', { method: 'DELETE' })]);
}
