'use client';

import { useEffect } from 'react';

/** Registers the offline-shell service worker (production builds only). */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* offline support is best-effort */
    });
  }, []);
  return null;
}
