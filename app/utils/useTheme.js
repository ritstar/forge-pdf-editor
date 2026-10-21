'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'forge-theme';
const listeners = new Set();

function readTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// public/theme-init.js sets data-theme before hydration, so reading it here is accurate on the
// client while the server snapshot stays 'light' — no hydration mismatch, and no effect that
// overwrites the stored preference on mount.
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light');

  const toggleTheme = useCallback(() => {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the theme still applies for this page.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [theme, toggleTheme];
}
