'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker on the client after initial load.
 * Extracted from the previous inline script to comply with strict CSP
 * (no 'unsafe-inline' in script-src).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      window.location.protocol.startsWith('http')
    ) {
      window.addEventListener('load', function () {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .catch(function (err) {
            console.warn('[PWA] ServiceWorker registration notice:', err);
          });
      });
    }
  }, []);

  return null;
}
