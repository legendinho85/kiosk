// A tiny hash router. Routes are patterns like "/b/:book/read/:page"; the
// hash may carry a query ("#/b/tiffin-football/name?child=p_1").
//
// Each screen is `render(root, ctx) -> cleanup` (cleanup may also come back
// wrapped in a promise). Before the next screen renders, the previous
// screen's cleanup runs and its ctx.signal aborts, so late async work (a
// scene that finishes loading after the parent has moved on) can bail out.
//
// Pure helpers (parseHash, compileRoute, matchRoute, buildHash) are exported
// for unit tests and have no DOM dependency.

/**
 * Split a location hash into a normalised path and query.
 *   "#/b/x/name?child=a" -> { path: "/b/x/name", query: { child: "a" } }
 * An empty hash or "#" is the shelf "/". Trailing slashes are dropped.
 * @param {string} hash
 * @returns {{path: string, query: Record<string, string>}}
 */
export function parseHash(hash) {
  let s = String(hash ?? '').replace(/^#!?/, '');
  const q = s.indexOf('?');
  const queryStr = q >= 0 ? s.slice(q + 1) : '';
  if (q >= 0) s = s.slice(0, q);
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  const query = {};
  if (queryStr) {
    for (const [k, v] of new URLSearchParams(queryStr)) query[k] = v;
  }
  return { path: s, query };
}

/**
 * Compile "/b/:book/read/:page" into a matcher. Parameters match one path
 * segment; a trailing "*" matches the rest of the path (as params.rest).
 * @param {string} pattern
 * @returns {{pattern: string, keys: string[], re: RegExp}}
 */
export function compileRoute(pattern) {
  const keys = [];
  const body = String(pattern)
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg === '*') {
        keys.push('rest');
        return '(.*)';
      }
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { pattern, keys, re: new RegExp(`^/${body}/?$`) };
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Find the first route matching a hash.
 * @template {{path: string}} R
 * @param {R[]} routes objects with a `path` pattern (compiled lazily and cached on the object)
 * @param {string} hash
 * @returns {{route: R, params: Record<string, string>, query: Record<string, string>, path: string} | null}
 */
export function matchRoute(routes, hash) {
  const { path, query } = parseHash(hash);
  for (const route of routes) {
    route._compiled ??= compileRoute(route.path);
    const m = route._compiled.re.exec(path);
    if (!m) continue;
    const params = {};
    route._compiled.keys.forEach((k, i) => {
      params[k] = safeDecode(m[i + 1] ?? '');
    });
    return { route, params, query, path };
  }
  return null;
}

/**
 * Build a hash from a pattern and params: buildHash('/b/:book/read/:page', {book: 'x', page: 2}) -> "#/b/x/read/2".
 * @param {string} pattern
 * @param {Record<string, string|number>} [params]
 * @param {Record<string, string|number|null|undefined>} [query]
 */
export function buildHash(pattern, params = {}, query = {}) {
  const path = String(pattern).replace(/:([A-Za-z_]\w*)/g, (_, k) => encodeURIComponent(String(params[k] ?? '')));
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v != null && v !== '') q.set(k, String(v));
  const qs = q.toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

/**
 * Start the router.
 * @param {{
 *   root: HTMLElement,
 *   routes: Array<{path: string, name?: string, render: Function, prepare?: (match) => Promise<object|void>}>,
 *   notFound: {render: Function},
 *   makeContext: (match: object, extras: {signal: AbortSignal}) => object,
 *   onError?: (err: Error, match: object) => void,
 * }} opts
 *   `prepare(match)` may load data before rendering (a book, the lexicon); what
 *   it resolves to is merged into the context. If it throws, `onError` decides
 *   what to show (it is called with the root already cleared).
 * @returns {{navigate(hash: string, opts?: {replace?: boolean}): void, refresh(): void, destroy(): void, readonly current: object|null}}
 */
export function startRouter({ root, routes, notFound, makeContext, onError }) {
  let current = null; // { match, cleanup, ctl }
  let seq = 0;
  let first = true;

  async function runCleanup(entry) {
    if (!entry) return;
    entry.ctl.abort();
    try {
      const fn = await entry.cleanup;
      if (typeof fn === 'function') fn();
    } catch (err) {
      console.warn('[router] screen cleanup failed', err);
    }
  }

  async function show() {
    const my = ++seq;
    const match = matchRoute(routes, location.hash) ?? { route: notFound, params: {}, query: parseHash(location.hash).query, path: parseHash(location.hash).path };
    const prev = current;
    current = null;
    await runCleanup(prev);
    if (my !== seq) return;

    const ctl = new AbortController();
    let extras = {};
    try {
      if (match.route.prepare) extras = (await match.route.prepare(match, ctl.signal)) ?? {};
    } catch (err) {
      if (my !== seq) return;
      root.replaceChildren();
      onError?.(err, match);
      afterRender(match);
      return;
    }
    if (my !== seq) return;

    root.replaceChildren();
    root.dataset.route = match.route.name ?? match.route.path ?? 'not-found';
    const ctx = makeContext(match, { signal: ctl.signal, ...extras });
    let cleanup;
    try {
      cleanup = match.route.render(root, ctx);
    } catch (err) {
      console.error('[router] screen failed to render', err);
      root.replaceChildren();
      onError?.(err, match);
    }
    // A screen's async setup failing must not become an unhandled rejection.
    if (cleanup && typeof cleanup.then === 'function') {
      cleanup = cleanup.catch((err) => {
        console.error('[router] screen failed to render', err);
        if (my === seq) {
          root.replaceChildren();
          onError?.(err, match);
        }
        return null;
      });
    }
    current = { match, cleanup, ctl };
    afterRender(match);
  }

  function afterRender() {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* ignore */
    }
    // Move focus to the new screen's heading so screen readers announce it.
    // Not on the very first load: the page is announced anyway, and pulling
    // focus there would fight the browser's own behaviour.
    if (first) {
      first = false;
      return;
    }
    // A screen that deliberately focused something (e.g. the name box) keeps it.
    const active = document.activeElement;
    if (active && active !== document.body && root.contains(active)) return;
    const h1 = root.querySelector('h1');
    if (h1) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      try {
        h1.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
    }
  }

  const onHash = () => show();
  window.addEventListener('hashchange', onHash);
  show();

  return {
    navigate(hash, { replace = false } = {}) {
      const target = hash.startsWith('#') ? hash : `#${hash}`;
      if (replace) {
        history.replaceState(history.state, '', target);
        show();
      } else if (location.hash === target) {
        show();
      } else {
        location.hash = target;
      }
    },
    refresh: show,
    destroy() {
      window.removeEventListener('hashchange', onHash);
      runCleanup(current);
      current = null;
    },
    get current() {
      return current?.match ?? null;
    },
  };
}
