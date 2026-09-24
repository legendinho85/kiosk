// Pure start-up decisions for js/main.js, kept free of side effects so they
// can be unit-tested in Node: the ?test=1 hook, turning the QR code's
// entry URL into a hash route, and when to register the service worker.

/** Shown in settings; keep in step with package.json and the cache name in sw.js. */
export const APP_VERSION = '0.1.0';

const BOOK_ID = /^[a-z0-9-]+$/;

/**
 * The test hook from the query string. `?test=1` makes narration silent and
 * 20× faster (headless browsers have no voices); `&scale=` overrides the speed.
 * @param {string} search location.search
 * @returns {{forceSilent: true, timeScale: number} | null}
 */
export function testHookFromSearch(search) {
  const p = new URLSearchParams(String(search ?? ''));
  if (p.get('test') !== '1') return null;
  const scale = Number(p.get('scale'));
  return { forceSilent: true, timeScale: Number.isFinite(scale) && scale > 0 ? scale : 0.05 };
}

/**
 * Where the QR code landed us, as the URL the app should show instead, or
 * null when nothing needs changing.
 *   https://host/app/?b=tiffin-football        -> https://host/app/#/b/tiffin-football
 *   https://host/app/?b=tiffin-football&test=1 -> https://host/app/?test=1#/b/tiffin-football
 *   https://host/b/tiffin-football             -> https://host/#/b/tiffin-football
 * An explicit hash route wins over ?b= (the parent has already moved on).
 * @param {{pathname: string, search: string, hash: string, origin?: string}} loc
 * @returns {string|null} a path + search + hash (same origin) for history.replaceState
 */
export function entryRedirect(loc) {
  const params = new URLSearchParams(loc.search ?? '');
  const fromQuery = params.get('b');
  const pathMatch = /^(.*\/)b\/([^/]+)\/?$/.exec(loc.pathname ?? '');
  const fromPath = pathMatch && BOOK_ID.test(pathMatch[2]) ? pathMatch[2] : null;
  const bookId = fromQuery ?? fromPath;
  if (bookId == null) return null;

  params.delete('b');
  const search = params.toString();
  const pathname = fromPath ? pathMatch[1] : loc.pathname || '/';
  const hasRoute = /^#\/./.test(loc.hash ?? '');
  const hash = hasRoute ? loc.hash : `#/b/${encodeURIComponent(bookId)}`;
  return `${pathname}${search ? `?${search}` : ''}${hash}`;
}

/**
 * The folder the app is served from when a production QR opens /b/<id>
 * (so relative URLs like css/app.css still resolve). Null otherwise.
 * index.html does the same thing inline, before the stylesheets load.
 * @param {string} pathname
 */
export function appBaseForPath(pathname) {
  const m = /^(.*\/)b\/([^/]+)\/?$/.exec(String(pathname ?? ''));
  return m && BOOK_ID.test(m[2]) ? m[1] : null;
}

/**
 * Should we register the offline service worker? Only on https (it is
 * required there anyway), never inside an iframe (sandboxed previews throw),
 * and never in test mode (a cached app would hide the code under test).
 * `?sw=1` allows it on http://localhost for testing the worker itself.
 * @param {{protocol: string, hostname: string, search: string}} loc
 * @param {{inIframe: boolean, hasServiceWorker: boolean}} env
 */
export function shouldRegisterSw(loc, { inIframe, hasServiceWorker }) {
  if (!hasServiceWorker || inIframe) return false;
  const p = new URLSearchParams(loc.search ?? '');
  if (p.get('test') === '1') return false;
  if (loc.protocol === 'https:') return true;
  return p.get('sw') === '1' && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');
}

/**
 * The attributes on <html> that carry the reading-comfort settings
 * (docs/architecture.md §12), for every stylesheet to key off:
 * `data-easy-read="true"` (dyslexia-friendly text) and `data-contrast="high"`.
 * A null value means "remove the attribute".
 * @param {{easyRead?: boolean, highContrast?: boolean}|null|undefined} settings
 * @returns {{'data-easy-read': string|null, 'data-contrast': string|null}}
 */
export function docSettingAttrs(settings) {
  return {
    'data-easy-read': settings?.easyRead === true ? 'true' : null,
    'data-contrast': settings?.highContrast === true ? 'high' : null,
  };
}

/**
 * Put the reading-comfort settings on an element (the <html> element).
 * Never throws.
 * @param {{setAttribute: Function, removeAttribute: Function}|null} el
 * @param {object} settings
 */
export function applyDocSettings(el, settings) {
  if (!el) return;
  for (const [name, value] of Object.entries(docSettingAttrs(settings))) {
    try {
      if (value == null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    } catch {
      /* not worth failing over */
    }
  }
}

/**
 * The browser tab's title for a book ("Beep beep! — a Tiffin & Me story"),
 * without the child's name (tabs and history are seen by anyone). Falls back
 * to the app's name for screens that aren't about one book.
 * @param {{title?: string}|null} book
 */
export function pageTitle(book) {
  const t = String(book?.title ?? '')
    .replace(/,?\s*\{[^}]*\}/g, '')
    .replace(/\s+([!?.])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? `${t} — a Tiffin & Me story` : 'Tiffin & Me read-along';
}

/** Are we inside a frame? (Cross-origin parents throw on access: that counts as yes.) */
export function isInIframe(win = globalThis) {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}
