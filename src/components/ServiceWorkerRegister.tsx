'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Registers the PWA service worker on the client after initial load.
 * Extracted from the previous inline script to comply with strict CSP
 * (no 'unsafe-inline' in script-src).
 *
 * P0-2/D6: when a newer deploy's worker installs while this page is
 * already controlled, show a one-time "New version available" banner
 * with a Refresh button. Never auto-reload: activation alone never
 * reloads the page, and a forced reload could interrupt a workout.
 * Ignoring (or dismissing) the banner is safe — the new shell loads
 * on next navigation anyway.
 *
 * Note: this component renders outside ToastProvider (see layout.tsx),
 * and useToast() degrades to a no-op without a provider, so the prompt
 * is a minimal fixed banner instead of a toast.
 */
export default function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !window.location.protocol.startsWith('http')
    ) {
      return;
    }

    const promptOnce = () => {
      if (promptedRef.current) return;
      promptedRef.current = true;
      setUpdateAvailable(true);
    };

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => {
          // A waiting worker found at registration time (the browser
          // already discovered the update before we attached listeners).
          if (registration.waiting && navigator.serviceWorker.controller) {
            promptOnce();
          }
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              // Installed while a controller exists = a newer deploy
              // is ready. (First install has no controller: no prompt.)
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                promptOnce();
              }
            });
          });
        })
        .catch(function (err) {
          console.warn('[PWA] ServiceWorker registration notice:', err);
        });
    };

    // PWA3 (audit): if the component mounts after window load already
    // fired (layout placement mounts on first paint today, so this is
    // latent, not live), the listener above would never run and the
    // worker would never register. Run immediately when already loaded.
    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad);
    }
    return () => window.removeEventListener('load', onLoad);
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      className="fixed bottom-24 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3 text-accent-on shadow-lg"
    >
      <span className="text-sm font-semibold">New version available</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="cursor-pointer rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/30"
        >
          Refresh
        </button>
        <button
          type="button"
          aria-label="Dismiss update notice"
          onClick={() => setUpdateAvailable(false)}
          className="cursor-pointer rounded-lg px-2 py-1.5 text-sm font-semibold text-accent-on"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
