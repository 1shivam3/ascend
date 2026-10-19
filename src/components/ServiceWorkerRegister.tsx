'use client';

import { useEffect } from 'react';
import { startLocalReminderScheduler } from '@/lib/local-reminder-scheduler';

/**
 * Registers the PWA service worker on the client after initial load.
 * Extracted from the previous inline script to comply with strict CSP
 * (no 'unsafe-inline' in script-src).
 * Also starts the client-side reminder scheduler (local notifications
 * for meal/workout/water reminders — no server needed).
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
    // Start local reminder scheduler — fires due reminders while the app
    // is open, even if server push (VAPID/QStash) isn't configured.
    startLocalReminderScheduler();
  }, []);

  return null;
}
