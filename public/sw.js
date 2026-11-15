/* Nirapod service worker — offline shell.
 * - Precaches the app shell (both locales + their static chunks) and an offline fallback page.
 * - Navigations: network first, fall back to cache, then the offline page.
 * - Static assets and on-device models: cache first.
 * - /api/*: never cached (nothing about the user is stored server-side or in the SW cache).
 */
const VERSION = 'v1';
const SHELL_CACHE = `nirapod-shell-${VERSION}`;
const ASSET_CACHE = `nirapod-assets-${VERSION}`;
const SHELL_PAGES = ['/bn', '/en', '/bn/emergency', '/en/emergency'];
const SHELL_FILES = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL_FILES);
      const assets = new Set();
      for (const page of SHELL_PAGES) {
        try {
          const res = await fetch(page, { credentials: 'same-origin' });
          if (!res.ok) continue;
          await cache.put(page, res.clone());
          const html = await res.text();
          for (const m of html.matchAll(/\/_next\/static\/[^"'\s)]+/g)) assets.add(m[0]);
        } catch {
          /* offline during install — skip */
        }
      }
      const assetCache = await caches.open(ASSET_CACHE);
      await Promise.all([...assets].map((u) => assetCache.add(u).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          const locale = url.pathname.startsWith('/en') ? '/en' : '/bn';
          return (
            (await cache.match(url.pathname)) ||
            (await cache.match(locale)) ||
            (await cache.match('/offline.html')) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/models/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:woff2?|png|svg|wasm|json|onnx)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
