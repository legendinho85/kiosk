// Offline support (optional: registration failures are ignored).
//
// - Page loads (navigations): network first, so a new version shows up
//   straight away; the cached page is used when offline or very slow.
// - Everything else from our own origin (app code, styles, books, the name
//   dictionary): cache first for speed, refreshed quietly in the background
//   so the next visit gets any update.
// - Other origins (CDNs for optional extras) are left to the browser.
// The fonts are our own files (css/fonts.css), precached (Latin and Latin
// Extended) so an offline visit looks right for names like Łucja or Siobhán.
// Bump VERSION whenever a release changes files, to drop old caches.

const VERSION = 'v0.3.0-1';
const CACHE = `tiffin-${VERSION}`;
const NAV_TIMEOUT_MS = 4000;

// Everything the app can load, so a family that has opened it once can read
// offline — including the parts only loaded when used (the letter game, name
// stickers, family packs, the magic window). Keep in step with the files on
// disk: tests/unit/app-sw.test.mjs checks every entry exists and that every
// module, stylesheet and book file is listed.
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  // Styles and fonts (our own files: no requests to font services)
  'css/app.css',
  'css/reader.css',
  'css/ar.css',
  'css/fonts.css',
  'css/activities.css',
  'css/stickers.css',
  'fonts/andika-latin-400-normal.woff2',
  'fonts/andika-latin-700-normal.woff2',
  'fonts/andika-latin-ext-400-normal.woff2',
  'fonts/andika-latin-ext-700-normal.woff2',
  'fonts/fredoka-latin-wght-normal.woff2',
  'fonts/fredoka-latin-ext-wght-normal.woff2',
  // App shell
  'js/main.js',
  'js/app/boot.js',
  'js/app/chrome.js',
  'js/app/cover.js',
  'js/app/family-ui.js',
  'js/app/parent-gate.js',
  'js/app/pron-picker.js',
  'js/app/router.js',
  'js/app/services.js',
  'js/app/ui.js',
  'js/app/screens/gift.js',
  'js/app/screens/home.js',
  'js/app/screens/landing.js',
  'js/app/screens/letters.js',
  'js/app/screens/magic.js',
  'js/app/screens/name.js',
  'js/app/screens/open.js',
  'js/app/screens/print.js',
  'js/app/screens/pronunciation.js',
  'js/app/screens/qr.js',
  'js/app/screens/read.js',
  'js/app/screens/ready.js',
  'js/app/screens/record.js',
  'js/app/screens/settings.js',
  'js/app/screens/stickers.js',
  // Engine
  'js/core/book.js',
  'js/core/clash.js',
  'js/core/env.js',
  'js/core/personalise.js',
  'js/core/storage.js',
  'js/pronounce/index.js',
  'js/pronounce/lexicon.js',
  'js/pronounce/respell.js',
  'js/pronounce/rules.js',
  'js/narrator/narrator.js',
  'js/narrator/plan.js',
  'js/narrator/voices.js',
  'js/audio/mix.js',
  'js/audio/recognise.js',
  'js/audio/recorder.js',
  'js/audio/sfx.js',
  'js/reader/clip.js',
  'js/reader/controls.js',
  'js/reader/drive.js',
  'js/reader/name-fit.js',
  'js/reader/reader.js',
  'js/reader/scene.js',
  'js/reader/timeline.js',
  'js/activities/letter-trace.js',
  'js/ar/magic-window.js',
  'js/ar/print.js',
  'js/ar/qr.js',
  'js/ar/stickers.js',
  'js/family/drafts.js',
  'js/family/family.js',
  'js/family/pack.js',
  'js/vendor/qrcode.js',
  // Icons, the name dictionary and the books
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'data/names.json',
  'books/index.json',
  // Book 1
  'books/tiffin-football/book.json',
  'books/tiffin-football/defs.svg',
  'books/tiffin-football/scenes/p1.svg',
  'books/tiffin-football/scenes/p2.svg',
  'books/tiffin-football/scenes/p3.svg',
  'books/tiffin-football/scenes/p4.svg',
  'books/tiffin-football/scenes/p5.svg',
  'books/tiffin-football/scenes/p6.svg',
  'books/tiffin-football/scenes/p7.svg',
  'books/tiffin-football/scenes/p8.svg',
  // Book 2
  'books/tiffin-digger/book.json',
  'books/tiffin-digger/defs.svg',
  'books/tiffin-digger/scenes/p1.svg',
  'books/tiffin-digger/scenes/p2.svg',
  'books/tiffin-digger/scenes/p3.svg',
  'books/tiffin-digger/scenes/p4.svg',
  'books/tiffin-digger/scenes/p5.svg',
  'books/tiffin-digger/scenes/p6.svg',
  'books/tiffin-digger/scenes/p7.svg',
  'books/tiffin-digger/scenes/p8.svg',
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
  if (url.origin !== self.location.origin) return; // CDNs: the browser's own cache
  if (request.headers.has('range')) return; // media seeking: let the network handle it
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(event));
    return;
  }
  event.respondWith(cacheFirst(event));
});
