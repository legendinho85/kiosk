// Boot: test hooks, the QR entry URL, saved state, services, then the router.
// See docs/architecture.md §8. Everything here fails soft: blocked storage,
// no speech voices, no service worker, a module that won't load.

import { testHookFromSearch, entryRedirect, shouldRegisterSw, isInIframe, APP_VERSION } from './app/boot.js';
import { startRouter } from './app/router.js';
import { toast } from './app/ui.js';
import { bookErrorScreen, messageScreen } from './app/chrome.js';
import { createServices, armAudioUnlock, createQuietNarrator, createQuietSfx } from './app/services.js';
import { loadState, saveState, blobs } from './core/storage.js';
import { loadBook, bookUrl } from './core/book.js';
import { loadLexicon } from './pronounce/index.js';

import * as home from './app/screens/home.js';
import * as landing from './app/screens/landing.js';
import * as nameScreen from './app/screens/name.js';
import * as say from './app/screens/pronunciation.js';
import * as read from './app/screens/read.js';
import * as magic from './app/screens/magic.js';
import * as settings from './app/screens/settings.js';
import * as qr from './app/screens/qr.js';
import * as print from './app/screens/print.js';
import * as record from './app/screens/record.js';
import * as gift from './app/screens/gift.js';
import * as openPack from './app/screens/open.js';

// ---- 1. Test hook (before anything reads it) ----------------------------------------
const hook = testHookFromSearch(location.search);
if (hook) globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), ...hook };

// ---- 2. The QR code's entry URL -> a hash route ------------------------------------------
try {
  const next = entryRedirect(location);
  if (next) history.replaceState(null, '', next);
} catch {
  /* an odd URL is not worth failing over */
}

// ---- 3. State --------------------------------------------------------------------------
let state = loadState();
const getSettings = () => state.settings;

/**
 * Replace the app state (a new state or an updater function) and save it.
 * `persist: false` keeps it in memory only (e.g. straight after "forget everything").
 */
function setState(next, { persist = true } = {}) {
  state = typeof next === 'function' ? next(state) : next;
  if (persist) saveState(state);
  return state;
}

// ---- 4. Data ---------------------------------------------------------------------------
// The name dictionary is only needed from the pronunciation step on, so it
// loads in the background and never holds up the first screen.
let lexicon = null;
const lexiconReady = Promise.race([loadLexicon(), new Promise((r) => setTimeout(() => r(null), 6000))])
  .then((index) => (lexicon = index ?? null))
  .catch(() => null);

const books = new Map();
function getBook(id) {
  if (!books.has(id)) {
    const p = loadBook(id);
    books.set(id, p);
    p.catch(() => books.delete(id)); // let a flaky connection retry
  }
  return books.get(id);
}

async function prepareBook(match) {
  const book = await getBook(match.params.book);
  // Remember the book for settings; nothing is written to the device until a child is added.
  if (state.lastBook !== book.id) setState((s) => ({ ...s, lastBook: book.id }), { persist: state.profiles.length > 0 });
  return { book, bookId: book.id, baseUrl: bookUrl(book.id) };
}

// ---- 5. Services -------------------------------------------------------------------------
// Speech and sound load in the background so the first screen (the name box)
// never waits for them. Until they arrive, quiet stand-ins answer; screens
// that talk (pronunciation, reader, settings...) wait for the real ones in
// their route's prepare step.
const services = { narrator: createQuietNarrator({ getSettings }), sfx: createQuietSfx(), real: false };
const servicesReady = createServices({ getSettings, getRecording: (id) => blobs.get(id) }).then((s) => Object.assign(services, s, { real: true }));
armAudioUnlock(services);

// ---- 6. Router ---------------------------------------------------------------------------
const withBook = (screen, extra = null) => ({
  ...screen,
  prepare: async (match, signal) => ({ ...(await prepareBook(match, signal)), ...(extra ? await extra(match, signal) : {}) }),
});
const withLexicon = async () => ({ lexicon: await lexiconReady });
const withServices = async () => (await servicesReady, {});
const both = (...fns) => async (match, signal) => Object.assign({}, ...(await Promise.all(fns.map((f) => f(match, signal)))));

const routes = [
  { path: '/', name: 'home', render: home.render },
  { path: '/b/:book', name: 'landing', ...withBook(landing) },
  { path: '/b/:book/name', name: 'name', ...withBook(nameScreen) },
  { path: '/b/:book/say', name: 'say', ...withBook(say, both(withLexicon, withServices)) },
  { path: '/b/:book/read/:page', name: 'read', ...withBook(read, withServices) },
  { path: '/b/:book/read', name: 'read', ...withBook(read, withServices) },
  { path: '/b/:book/magic/:page', name: 'magic', ...withBook(magic, withServices) },
  { path: '/b/:book/record', name: 'record', ...withBook(record, both(withLexicon, withServices)) },
  { path: '/b/:book/gift', name: 'gift', ...withBook(gift, both(withLexicon, withServices)) },
  { path: '/open', name: 'open', render: openPack.render, prepare: withServices },
  { path: '/settings', name: 'settings', render: settings.render, prepare: withServices },
  { path: '/qr/:book', name: 'qr', ...withBook(qr) },
  { path: '/print/:book', name: 'print', ...withBook(print) },
];

let router = null;
const root = document.getElementById('app');

function makeContext(match, extras) {
  return {
    get state() {
      return state;
    },
    setState,
    navigate: (hash, opts) => router?.navigate(hash, opts),
    get narrator() {
      return services.narrator;
    },
    get sfx() {
      return services.sfx;
    },
    get lexicon() {
      return extras.lexicon ?? lexicon;
    },
    getLexicon: () => lexiconReady,
    /** Resolves once the real narrator and sound effects have loaded (screens that don't wait in prepare). */
    servicesReady,
    blobs,
    params: match.params,
    query: match.query,
    route: match.route.name,
    book: extras.book ?? null,
    bookId: extras.bookId ?? match.params.book ?? null,
    baseUrl: extras.baseUrl ?? null,
    signal: extras.signal,
    version: APP_VERSION,
  };
}

router = startRouter({
  root,
  routes,
  notFound: {
    name: 'not-found',
    render: (el, ctx) =>
      el.append(messageScreen(ctx, { title: 'This page has wandered off', message: 'Let’s get you back to the stories.', testid: 'not-found' })),
  },
  makeContext,
  onError(err, match) {
    const ctx = makeContext(match, { signal: new AbortController().signal });
    if (match.params?.book) root.append(bookErrorScreen(ctx, err));
    else root.append(messageScreen(ctx, { title: 'Something went wrong', message: 'Please try again in a moment.', testid: 'load-error' }));
  },
});
document.documentElement.classList.add('is-booted');

// ---- 7. Global safety net ------------------------------------------------------------------
let lastToastAt = 0;
function reportProblem() {
  if (Date.now() - lastToastAt < 8000) return;
  lastToastAt = Date.now();
  toast('Sorry — something went wrong there. Please try again.', { kind: 'error' });
}
window.addEventListener('error', (e) => {
  if (e?.error) reportProblem();
});
window.addEventListener('unhandledrejection', () => reportProblem());

// ---- 8. Offline support (optional) ------------------------------------------------------------
try {
  if (shouldRegisterSw(location, { inIframe: isInIframe(), hasServiceWorker: 'serviceWorker' in navigator })) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
} catch {
  /* sandboxed or unsupported: fine */
}

// Handy when debugging on a phone: window.__tiffin.state
globalThis.__tiffin = { get state() { return state; }, router, services, version: APP_VERSION };
