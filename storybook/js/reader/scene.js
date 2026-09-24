// Loading scene artwork. Each page is one SVG file drawn in a 1600x1000
// viewBox; shared symbols (Tiffin's poses, the ball, the goal) live in the
// book's defs.svg, which is inlined into the document once so every scene can
// <use href="#d-..."/> them.
//
// Scenes are inlined (not <img>) so the reader can animate parts and write
// the child's name into them. Inlined SVG is live markup, so everything that
// could run code, style the whole page or reach the network is stripped.

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

// Only plain SVG drawing elements survive (compared case-insensitively).
// Anything else goes: elements from other namespaces (an <html:img> fetches
// its src when inserted), and SVG elements that can run code, pull in other
// documents or fonts, or (for <style>) leak rules onto the whole app.
const ALLOWED = new Set(
  [
    'svg', 'g', 'defs', 'symbol', 'use', 'switch', 'view',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image',
    'text', 'tspan', 'textpath', 'title', 'desc',
    'lineargradient', 'radialgradient', 'stop', 'pattern', 'clippath', 'mask', 'marker',
    'filter', 'feblend', 'fecolormatrix', 'fecomponenttransfer', 'fecomposite', 'feconvolvematrix',
    'fediffuselighting', 'fedisplacementmap', 'fedistantlight', 'fedropshadow', 'feflood', 'fefunca',
    'fefuncb', 'fefuncg', 'fefuncr', 'fegaussianblur', 'feimage', 'femerge', 'femergenode',
    'femorphology', 'feoffset', 'fepointlight', 'fespecularlighting', 'fespotlight', 'fetile', 'feturbulence',
    'set', 'animate', 'animatetransform', 'animatemotion', 'mpath',
    'a', // unwrapped into a <g>: no links out of a children's book
  ],
);
const ANIMATION = new Set(['set', 'animate', 'animatetransform', 'animatemotion']);
// Presentation attributes that can point at a resource with url(...).
const URL_ATTRS = new Set(['fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'cursor']);
// Attributes that load things in HTML (and have no business on SVG art).
const LOADING_ATTRS = new Set(['src', 'srcset', 'poster', 'data', 'action', 'formaction', 'background', 'codebase', 'archive', 'ping', 'lowsrc', 'dynsrc', 'manifest', 'xml:base']);

/** Idle/celebration classes from css/reader.css; they animate `transform`. */
export const ANIMATION_CLASSES = Object.freeze(['sb-bob', 'sb-sway', 'sb-wiggle', 'sb-pulse', 'sb-twinkle', 'sb-float', 'sb-spin-slow', 'sb-cheer', 'sb-hint', 'sb-bulge', 'sb-blink']);

const textCache = new Map();
const defsCache = new Map();

/** Make sure a base URL ends with a slash so relative paths resolve inside it. */
export function normaliseBase(baseUrl) {
  const s = String(baseUrl ?? '');
  return s.endsWith('/') ? s : `${s}/`;
}

/** Absolute URL of a file in a book package. */
export function resolveIn(baseUrl, path) {
  return new URL(path, new URL(normaliseBase(baseUrl), globalThis.location?.href ?? 'http://localhost/')).href;
}

const isLocalRef = (v) => /^\s*#/.test(v ?? '');
// Embedded bitmaps are allowed on <image> (they can't run code); nothing else.
const isInlineBitmap = (el, v) => el.localName === 'image' && /^\s*data:image\/(png|jpe?g|webp|gif);/i.test(v ?? '');

/** Undo CSS escapes ("u\\72 l(" is "url("), so a disguised url() can't slip past. */
export function cssUnescape(v) {
  return String(v ?? '').replace(/\\(?:([0-9a-f]{1,6})\s?|(.))/gi, (_, hex, ch) => {
    if (hex) {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '\ufffd';
    }
    return ch;
  });
}

/**
 * Could this CSS value fetch something from outside the scene? Any url() that
 * isn't a local "#id", and image-set()/image()/cross-fade()/element(), even
 * when disguised with CSS escapes or comments.
 */
export function hasExternalUrl(v) {
  const s = cssUnescape(v).replace(/\/\*[\s\S]*?\*\//g, '');
  if (/(?:^|[^\w-])(?:-webkit-)?(?:image-set|image|cross-fade|element|src)\s*\(/i.test(s)) return true;
  const re = /url\(\s*(['"]?)([^'")]*)/gi;
  for (let m = re.exec(s); m; m = re.exec(s)) if (!/^\s*#/.test(m[2])) return true;
  return false;
}

/**
 * Remove anything unsafe from a parsed SVG tree, in place.
 * Exported for tests and for the magic window / print pages.
 * @param {Element} root
 */
export function sanitiseSvg(root) {
  const walk = [root];
  while (walk.length) {
    const el = walk.pop();
    for (const child of [...el.children]) {
      const name = child.localName.toLowerCase();
      if (child.namespaceURI !== SVG_NS || !ALLOWED.has(name)) {
        child.remove();
        continue;
      }
      if (ANIMATION.has(name)) {
        // <set attributeName="href" to="javascript:..."> is a classic way in;
        // so is animating a paint to url(https://...).
        const attr = (child.getAttribute('attributeName') ?? '').toLowerCase();
        const values = ['to', 'from', 'by', 'values'].map((a) => child.getAttribute(a) ?? '').join(' ');
        if (/^on/.test(attr) || /(^|:)href$/.test(attr) || attr === 'style' || LOADING_ATTRS.has(attr) || hasExternalUrl(values) || /javascript:/i.test(values)) {
          child.remove();
          continue;
        }
      }
      if (name === 'a') {
        // No links out of a children's book: keep the artwork, lose the link.
        const g = child.ownerDocument.createElementNS(SVG_NS, 'g');
        while (child.firstChild) g.appendChild(child.firstChild);
        child.replaceWith(g);
        walk.push(g);
        cleanAttributes(g);
        continue;
      }
      cleanAttributes(child);
      walk.push(child);
    }
  }
  cleanAttributes(root);
  return root;
}

function cleanAttributes(el) {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    const ns = attr.namespaceURI;
    if (ns && ns !== XLINK_NS && ns !== XML_NS && ns !== 'http://www.w3.org/2000/xmlns/') el.removeAttributeNode(attr);
    else if (name.startsWith('on')) el.removeAttributeNode(attr);
    else if (name === 'href' || name === 'xlink:href' || attr.localName === 'href') {
      if (!isLocalRef(value) && !isInlineBitmap(el, value)) el.removeAttributeNode(attr);
    } else if (name === 'style') {
      // Scenes use presentation attributes only (docs/architecture.md); a style
      // attribute is the easiest place to hide a tracking pixel.
      el.removeAttributeNode(attr);
    } else if (LOADING_ATTRS.has(name) || attr.localName === 'base') {
      el.removeAttributeNode(attr);
    } else if (URL_ATTRS.has(name) && (hasExternalUrl(value) || value.includes('\\'))) {
      el.setAttribute(attr.name, 'none');
    }
  }
}

/**
 * A plain <g> wrapped around `el` (reused if already there) to carry CSS
 * animations. A CSS transform animation replaces an element's transform
 * attribute while it runs (and for good with fill-mode "both"), which would
 * throw anything drawn with transform="translate(...)" to the corner. On a
 * wrapper the animation adds to the element's own placement instead.
 * @param {Element} el
 * @returns {SVGGElement}
 */
export function animationWrapper(el) {
  const parent = el.parentNode;
  if (parent?.getAttribute?.('data-sb-wrap') === 'anim' && parent.childElementCount === 1) return parent;
  const g = el.ownerDocument.createElementNS(SVG_NS, 'g');
  g.setAttribute('data-sb-wrap', 'anim');
  el.replaceWith(g);
  g.appendChild(el);
  return g;
}

/** Does animating this element's CSS transform need a wrapper? */
export function needsAnimationWrapper(el, drivenIds = null) {
  return el.hasAttribute('transform') || Boolean(drivenIds && el.id && drivenIds.has(`#${el.id}`));
}

/**
 * Move animation classes off elements that also carry a transform attribute
 * (or are moved by drives) onto a wrapper group, so both work together.
 * @param {Element} root
 * @param {Set<string>} [drivenIds] "#id"s of drive targets
 */
export function hoistAnimations(root, drivenIds = null) {
  const sel = ANIMATION_CLASSES.map((c) => `.${c}`).join(',');
  for (const el of [...root.querySelectorAll(sel)]) {
    if (!needsAnimationWrapper(el, drivenIds)) continue;
    const classes = ANIMATION_CLASSES.filter((c) => el.classList.contains(c));
    el.classList.remove(...classes);
    animationWrapper(el).classList.add(...classes);
  }
  return root;
}

async function fetchText(url) {
  if (!textCache.has(url)) {
    const p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${url.split('/').pop()} (${res.status})`);
      return res.text();
    });
    textCache.set(url, p);
    // Don't cache failures: a flaky connection should be able to retry.
    p.catch(() => textCache.delete(url));
  }
  return textCache.get(url);
}

/** Parse SVG text into a sanitised <svg> element owned by the parse document. */
export function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    throw new Error('This picture could not be read');
  }
  return sanitiseSvg(root);
}

/**
 * Inline the book's shared symbols (defs.svg) into the document once. Safe to
 * call repeatedly; resolves to the hidden <svg> holder, or null if the book has
 * no defs or they could not be loaded (scenes then simply miss those symbols).
 * @param {{defs?: string}} book
 * @param {string} baseUrl book package folder
 */
export async function loadDefs(book, baseUrl) {
  if (!book?.defs || typeof document === 'undefined') return null;
  const url = resolveIn(baseUrl, book.defs);
  const existing = [...document.querySelectorAll('svg.sb-defs')].find((el) => el.dataset.src === url);
  if (existing) return existing;
  if (!defsCache.has(url)) {
    defsCache.set(
      url,
      fetchText(url)
        .then((text) => {
          const src = parseSvg(text);
          const holder = document.createElementNS(SVG_NS, 'svg');
          holder.setAttribute('class', 'sb-defs');
          holder.setAttribute('aria-hidden', 'true');
          holder.setAttribute('focusable', 'false');
          holder.setAttribute('width', '0');
          holder.setAttribute('height', '0');
          // Not display:none: some engines won't render gradients/filters
          // referenced from inside a display:none subtree.
          holder.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
          holder.dataset.src = url;
          for (const child of [...src.childNodes]) holder.appendChild(document.importNode(child, true));
          return holder;
        })
        .catch((err) => {
          defsCache.delete(url);
          console.warn(`[reader] shared artwork unavailable: ${err.message}`);
          return null;
        }),
    );
  }
  const holder = await defsCache.get(url);
  // The app may have cleared <body>; put the holder back if so.
  if (holder && !holder.isConnected) document.body.appendChild(holder);
  return holder;
}

/**
 * Load one page's scene as a fresh, sanitised <svg> element ready to insert.
 * Shared defs are loaded first. Throws a readable Error if the scene is
 * missing or malformed.
 * @param {object} book
 * @param {{n: number, scene: string}} page
 * @param {string} baseUrl
 * @returns {Promise<SVGSVGElement>}
 */
export async function loadScene(book, page, baseUrl) {
  await loadDefs(book, baseUrl);
  const url = resolveIn(baseUrl, page.scene);
  const text = await fetchText(url);
  const src = parseSvg(text);
  const svg = document.importNode(src, true);
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 1600 1000');
  // CSS sizes the picture; fixed width/height would fight the layout.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('sb-scene');
  svg.dataset.page = String(page.n);
  // Artists' <title>s would pop up as hover tooltips over a child's picture;
  // the scene's own title is kept as a fallback description for screen readers.
  const title = [...svg.children].find((c) => c.localName === 'title')?.textContent?.replace(/\s+/g, ' ').trim();
  if (title) svg.dataset.title = title;
  for (const t of [...svg.querySelectorAll('title, desc')]) t.remove();
  hoistAnimations(svg);
  return svg;
}

/** Warm the cache for a page we are likely to open next. Never rejects. */
export function prefetchScene(book, page, baseUrl) {
  if (!page?.scene) return Promise.resolve();
  return fetchText(resolveIn(baseUrl, page.scene)).then(
    () => undefined,
    () => undefined,
  );
}
