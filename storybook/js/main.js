// Boot: test hooks, the QR entry URL, saved state, services, then the router.
// See docs/architecture.md §8. Everything here fails soft: blocked storage,
// no speech voices, no service worker, a module that won't load.

import { testHookFromSearch, entryRedirect, shouldRegisterSw, isInIframe, APP_VERSION } from './app/boot.js';
import { startRouter } from './app/router.js';
import { toast } from './app/ui.js';
import { bookErrorScreen, messageScreen } from './app/chrome.js';
import { createServices, armAudioUnlock } from './app/services.js';
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

function setState(next) {
  state = typeof next === 'function' ? next(state) : next;
  saveState(state);
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
  if (state.lastBook !== book.id) setState((s) => ({ ...s, lastBook: book.id }));
  return { book, bookId: book.id, baseUrl: bookUrl(book.id) };
}

// ---- 5. Services -------------------------------------------------------------------------
const { narrator, sfx } = await createServices({ getSettings, getRecording: (id) => blobs.get(id) });
armAudioUnlock({ narrator, sfx });

// ---- 6. Router ---------------------------------------------------------------------------
const withBook = (screen, extra = null) => ({
  ...screen,
  prepare: async (match, signal) => ({ ...(await prepareBook(match, signal)), ...(extra ? await extra(match, signal) : {}) }),
});
const withLexicon = async () => ({ lexicon: await lexiconReady });

const routes = [
  { path: '/', name: 'home', render: home.render },
  { path: '/b/:book', name: 'landing', ...withBook(landing) },
  { path: '/b/:book/name', name: 'name', ...withBook(nameScreen) },
  { path: '/b/:book/say', name: 'say', ...withBook(say, withLexicon) },
  { path: '/b/:book/read/:page', name: 'read', ...withBook(read) },
  { path: '/b/:book/read', name: 'read', ...withBook(read) },
  { path: '/b/:book/magic/:page', name: 'magic', ...withBook(magic) },
  { path: '/settings', name: 'settings', render: settings.render },
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
    narrator,
    sfx,
    get lexicon() {
      return extras.lexicon ?? lexicon;
    },
    getLexicon: () => lexiconReady,
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
globalThis.__tiffin = { get state() { return state; }, router, narrator, sfx, version: APP_VERSION };
