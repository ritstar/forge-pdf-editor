'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 4000;
const GIVE_UP_MS = 3 * 60 * 1000;
// Render's free tier sleeps after ~15 minutes idle; trust a recent success for a bit less.
const FRESH_MS = 10 * 60 * 1000;

let lastReadyAt = 0;
let inflight = null;

async function ping() {
  if (!inflight) {
    inflight = fetch('/api/pdf-tools/status', { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 401) return 'unknown';
        const data = await res.json().catch(() => ({}));
        return data.status === 'ready' ? 'ready' : 'waking';
      })
      .catch(() => 'waking')
      .then((status) => {
        if (status === 'ready') lastReadyAt = Date.now();
        return status;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Fire-and-forget wake-up, e.g. when the dashboard opens. */
export function warmBackend() {
  if (Date.now() - lastReadyAt > FRESH_MS) ping();
}

/**
 * Resolves once the backend answers ('ready'), or with 'unavailable' after giving up. For
 * actions outside a component that shows status; onWaking fires while it boots.
 */
export async function waitForBackend({ onWaking } = {}) {
  if (Date.now() - lastReadyAt < FRESH_MS) return 'ready';
  const started = Date.now();
  for (;;) {
    const result = await ping();
    if (result === 'ready' || result === 'unknown') return result;
    if (Date.now() - started > GIVE_UP_MS) return 'unavailable';
    onWaking?.(Math.round((Date.now() - started) / 1000));
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * Tracks whether the conversion backend is awake, polling while it boots.
 * status: 'ready' | 'checking' | 'waking' | 'unavailable' | 'unknown'
 */
export function useBackendStatus() {
  const [status, setStatus] = useState(() => (Date.now() - lastReadyAt < FRESH_MS ? 'ready' : 'checking'));
  const [elapsed, setElapsed] = useState(0);
  const statusRef = useRef(status);
  const waiters = useRef([]);
  const startedRef = useRef(0);

  useEffect(() => {
    statusRef.current = status;
    if (status !== 'checking' && status !== 'waking') {
      waiters.current.forEach((resolve) => resolve(status));
      waiters.current = [];
    }
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const started = Date.now();
    startedRef.current = started;
    // A warm server answers in well under a second; if not, tell the user what's going on.
    const slowTimer = setTimeout(() => {
      if (!cancelled && statusRef.current === 'checking') setStatus('waking');
    }, 1500);

    const poll = async () => {
      const result = await ping();
      if (cancelled) return;
      if (result === 'ready' || result === 'unknown') {
        setStatus(result);
        return;
      }
      if (Date.now() - started > GIVE_UP_MS) {
        setStatus('unavailable');
        return;
      }
      setStatus('waking');
      timer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(slowTimer);
    };
  }, []);

  useEffect(() => {
    if (status !== 'waking') return undefined;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Resolves once the backend is ready (or polling has given up), so actions can queue.
  const waitUntilReady = useCallback(() => {
    if (statusRef.current !== 'checking' && statusRef.current !== 'waking') {
      return Promise.resolve(statusRef.current);
    }
    return new Promise((resolve) => waiters.current.push(resolve));
  }, []);

  return { status, elapsed, waitUntilReady };
}
