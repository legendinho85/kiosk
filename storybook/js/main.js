// Boot: test hooks, the QR entry URL, saved state, services, then the router.
// See docs/architecture.md §8. Everything here fails soft: blocked storage,
// no speech voices, no service worker, a module that won't load.

import { testHookFromSearch, entryRedirect, shouldRegisterSw, isInIframe, applyDocSettings, pageTitle, APP_VERSION } from './app/boot.js';
import { startRouter } from './app/router.js';
import { toast } from './app/ui.js';
import { bookErrorScreen, messageScreen } from './app/chrome.js';
import { createServices, armAudioUnlock, createQuietNarrator, createQuietSfx } from './app/services.js';
import { loadState, saveState, blobs } from './core/storage.js';
import { loadBook, bookUrl } from './core/book.js';
import { loadLexicon } from './pronounce/index.js';
import { scratch } from './app/scratch.js';

// The first screen after scanning (the name box, or "Ava's story is ready")
// and the shelf load with the app; every other screen loads when its route
// first opens (see routes below), so a phone on a slow connection shows the
// name box sooner.
import * as home from './app/screens/home.js';
import * as landing from './app/screens/landing.js';
import { upgradePronunciations } from './app/screens/name.js';

// ---- 0. Styles only the reader and the magic window use ----------------------------
// index.html marks css/reader.css and css/ar.css media="print" so they don't
// hold up the first paint on a slow phone; they have been downloading
// quietly since the page began, and apply from here on.
for (const link of document.querySelectorAll('link[data-deferred-style]')) link.media = 'all';

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

// Reading comfort (easy-read text, higher contrast) is carried on <html> so
// every stylesheet (app, reader, activities) can follow it.
let appliedSettings = null;
function applySettings() {
  if (state.settings === appliedSettings) return;
  appliedSettings = state.settings;
  applyDocSettings(document.documentElement, state.settings);
}
applySettings();

/**
 * Replace the app state (a new state or an updater function) and save it.
 * `persist: false` keeps it in memory only (e.g. straight after "forget everything").
 */
function setState(next, { persist = true } = {}) {
  state = typeof next === 'function' ? next(state) : next;
  if (persist) saveState(state);
  applySettings();
  return state;
}

// ---- 4. Data ---------------------------------------------------------------------------
// The name dictionary is only needed from the pronunciation step on, so it
// loads in the background and never holds up the first screen. A slow
// connection only delays it: screens wait a short while (a render deadline,
// lexiconSoon) and then carry on without it, and when it does arrive it is
// used from then on — the pronunciation screen adds its suggestions, and any
// "as written" guess saved without it (marked provisional) is replaced by
// the dictionary's best match unless a grown-up has chosen since.
let lexicon = null;
const lexiconLoaded = loadLexicon()
  .then((index) => (lexicon = index ?? null))
  .catch((err) => {
    console.warn('[app] the names dictionary did not load', err?.message ?? err);
    return null;
  });
/** The dictionary if it arrives within `ms`, else null for now (it keeps loading). */
const lexiconSoon = (ms = 2500) => Promise.race([lexiconLoaded, new Promise((r) => setTimeout(() => r(lexicon), ms))]);
lexiconLoaded.then((index) => {
  if (!index) return;
  const next = upgradePronunciations(state, index);
  if (next !== state) setState(next, { persist: state.profiles.length > 0 });
});

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
// A take of the name that isn't kept yet lives in memory (js/app/scratch.js); the story can still play it.
const getRecording = (id) => (scratch.has(id) ? Promise.resolve(scratch.get(id)) : blobs.get(id));
const servicesReady = createServices({ getSettings, getRecording }).then((s) => Object.assign(services, s, { real: true }));
armAudioUnlock(services);

// ---- 6. Router ---------------------------------------------------------------------------
const withLexicon = async () => ({ lexicon: await lexiconSoon() });
const withServices = async () => (await servicesReady, {});
const both = (...fns) => async (match, signal) => Object.assign({}, ...(await Promise.all(fns.map((f) => f(match, signal)))));

/**
 * A route whose screen module loads the first time it opens (in its prepare
 * step, alongside the book and whatever else it waits for). If the module
 * can't load (a flaky connection), prepare fails and the router shows the
 * friendly "didn't load — try again" screen.
 * @param {string} path
 * @param {string} name
 * @param {object | (() => Promise<object>)} screen a module, or a loader for one
 * @param {{book?: boolean, extra?: Function|null}} [opts]
 */
function route(path, name, screen, { book = false, extra = null } = {}) {
  let mod = typeof screen === 'function' ? null : screen;
  const load = () => (mod ? Promise.resolve(mod) : screen().then((m) => (mod = m)));
  return {
    path,
    name,
    prepare: async (match, signal) => {
      const [, fromBook, fromExtra] = await Promise.all([load(), book ? prepareBook(match, signal) : null, extra ? extra(match, signal) : null]);
      return { ...(fromBook ?? {}), ...(fromExtra ?? {}) };
    },
    render: (root, ctx) => mod.render(root, ctx),
  };
}

const routes = [
  route('/', 'home', home),
  route('/b/:book', 'landing', landing, { book: true }),
  route('/b/:book/name', 'name', () => import('./app/screens/name.js'), { book: true }),
  route('/b/:book/say', 'say', () => import('./app/screens/pronunciation.js'), { book: true, extra: both(withLexicon, withServices) }),
  route('/b/:book/read/:page', 'read', () => import('./app/screens/read.js'), { book: true, extra: withServices }),
  route('/b/:book/read', 'read', () => import('./app/screens/read.js'), { book: true, extra: withServices }),
  route('/b/:book/magic/:page', 'magic', () => import('./app/screens/magic.js'), { book: true, extra: withServices }),
  route('/b/:book/record', 'record', () => import('./app/screens/record.js'), { book: true, extra: both(withLexicon, withServices) }),
  route('/b/:book/gift', 'gift', () => import('./app/screens/gift.js'), { book: true, extra: both(withLexicon, withServices) }),
  route('/open', 'open', () => import('./app/screens/open.js'), { extra: withServices }),
  route('/settings', 'settings', () => import('./app/screens/settings.js'), { extra: withServices }),
  route('/qr/:book', 'qr', () => import('./app/screens/qr.js'), { book: true }),
  route('/print/:book', 'print', () => import('./app/screens/print.js'), { book: true }),
  route('/stickers/:book', 'stickers', () => import('./app/screens/stickers.js'), { book: true }),
  route('/b/:book/letters', 'letters', () => import('./app/screens/letters.js'), { book: true, extra: withServices }),
];

let router = null;
const root = document.getElementById('app');

function makeContext(match, extras) {
  try {
    document.title = pageTitle(extras.book ?? null, match.route?.name === 'landing' ? null : match.route?.name ?? null);
  } catch {
    /* ignore */
  }
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
    /** The names dictionary: `getLexicon()` waits for it however long it takes; `getLexicon(ms)` gives up after ms (null). */
    getLexicon: (ms) => (ms ? lexiconSoon(ms) : lexiconLoaded),
    /** Memory-only store for recordings that aren't kept yet (js/app/scratch.js). */
    scratch,
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

// "Skip to content" jumps to the screen's <main> (focus moves there) without
// touching the address, which belongs to the router.
document.addEventListener('click', (e) => {
  const link = e.target?.closest?.('a.skip-link');
  const main = link ? document.getElementById('main') : null;
  if (!main) return;
  e.preventDefault();
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  try {
    main.focus();
  } catch {
    /* ignore */
  }
});

// Once the first screen is up and the phone is idle, fetch the next steps'
// code (how the name is said, the reader) so they open without a wait.
try {
  const warm = () => {
    for (const load of [() => import('./app/screens/name.js'), () => import('./app/screens/pronunciation.js'), () => import('./app/screens/read.js')]) load().catch(() => {});
  };
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
  setTimeout(() => idle(warm, { timeout: 4000 }), 2500);
} catch {
  /* only a speed-up */
}

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
