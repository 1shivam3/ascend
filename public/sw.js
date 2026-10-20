// ASCEND Service Worker - Offline Resilience & Cache Management
const CACHE_NAME = 'ascend-v2.0.0-cache';

const STATIC_PRECACHE = [
  '/',
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

// Install Event: Precaches the core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE).catch((err) => {
        // Non-blocking in dev / test environments
        console.warn('[SW] Core precache partial fail:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Purges previous obsolete cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-while-revalidate for static assets, Network-first for navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Skip browser-extension or chrome-extension URLs
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API calls are network-only to prevent stale response caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline', message: 'Network unavailable in gym mode' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Navigation requests (HTML documents) - Network first with Cache fallback.
  // The network fetch is raced against a 3s timeout: on slow 4G a hanging
  // (not failing) connection previously left users on a blank screen
  // forever even though a cached shell was available.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
          const response = await fetch(request, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          clearTimeout(timeoutId);
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const root = await cache.match('/');
          if (root) {
            return root;
          }
          return new Response(
            '<!doctype html><html><body style="font-family:sans-serif;padding:2rem;text-align:center"><h1>You are offline</h1><p>ASCEND could not load. Check your connection and reopen the app.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }

  // Static Assets (_next/static, images, styles, fonts) - Stale While Revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

// ── Web Push Event: Incoming Push Delivery ───────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'ASCEND', body: event.data.text() };
    }
  }

  const title = data.title || 'ASCEND Training';
  const options = {
    body: data.body || 'You have a training or nutrition reminder.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'ascend-reminder',
    renotify: true,
    data: {
      url: data.url || '/',
      tab: data.tab || 'home',
      timestamp: Date.now(),
      ...(data.data || {}),
    },
    actions: data.actions || [
      { action: 'open', title: 'Open ASCEND' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click Event: Focus Tab or Open Window ──────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetTab = event.notification.data?.tab || 'home';
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. Focus existing window client if already running
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE_TAB', tab: targetTab });
          return client.focus();
        }
      }
      // 2. Open new window client if none found
      if (clients.openWindow) {
        const fullUrl = targetTab && targetTab !== 'home' ? `/?tab=${targetTab}` : targetUrl;
        return clients.openWindow(fullUrl);
      }
    })
  );
});

