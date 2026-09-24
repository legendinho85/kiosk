// Offline support (optional: registration failures are ignored).
//
// - Page loads (navigations): network first, so a new version shows up
//   straight away; the cached page is used when offline or very slow.
// - Everything else from our own origin (app code, styles, books, the name
//   dictionary): cache first for speed, refreshed quietly in the background
//   so the next visit gets any update.
// - Other origins (Google Fonts, CDNs) are left to the browser.
// Bump VERSION to drop old caches.

const VERSION = 'v0.1.0-1';
const CACHE = `tiffin-${VERSION}`;
const NAV_TIMEOUT_MS = 4000;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/reader.css',
  'css/ar.css',
  'js/main.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'books/index.json',
  'data/names.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One by one, so a single missing file doesn't fail the install.
      await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('tiffin-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function cacheable(response) {
  return response && response.ok && response.type === 'basic';
}

async function put(request, response) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  } catch {
    /* storage full or blocked: fine */
  }
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

async function networkFirst(event) {
  const { request } = event;
  const network = fetch(request)
    .then((res) => {
      if (cacheable(res)) event.waitUntil(put(new URL('./', self.registration.scope).href, res.clone()));
      return res;
    })
    .catch(() => null);
  const res = await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
  if (res) return res;
  const cached = (await caches.match(request, { ignoreSearch: true })) ?? (await caches.match(new URL('./', self.registration.scope).href)) ?? (await caches.match('index.html'));
  if (cached) return cached;
  // Nothing cached yet: wait for the network after all.
  return (await network) ?? new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><p style="font:18px system-ui;padding:2em">You’re offline. Connect to the internet and try again.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function cacheFirst(event) {
  const { request } = event;
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then((res) => {
      if (cacheable(res)) event.waitUntil(put(request, res.clone()));
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const res = await refresh;
  return res ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fonts, CDNs: the browser's own cache
  if (request.headers.has('range')) return; // media seeking: let the network handle it
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event));
    return;
  }
  event.respondWith(cacheFirst(event));
});
