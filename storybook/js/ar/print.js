// Printable test pages (#/print/<book>): every page of the book laid out on
// A4 landscape the way the printed board book will look — the scene at rest
// (every moving part at its starting position), the name spots left blank
// with their faint star (.sb-print-only), no screen-only extras
// (.sb-digital) — plus a back cover with the QR code that opens the
// read-along. Families can try the magic window on paper before the real
// book exists. See docs/print-production.md §8.
//
// The shared scene helpers (js/reader/scene.js, drive.js) are imported
// lazily, so a missing reader module costs the pictures, not the page.

import { bookUrl } from '../core/book.js';
import { fillTemplate } from '../core/personalise.js';
import { qrSvg, displayUrl, landingUrlFor } from './qr.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// A private-use character stands in for the name while filling templates,
// so the text can be split around it and a blank drawn in its place.
const BLANK = '';

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

/**
 * Split a story line into text and blanks where the child's name goes:
 * "Pass to {name}!" -> ["Pass to ", {blank: 'plain'}, "!"]. Possessives keep
 * their "'s" after the blank.
 * @param {string} template
 * @returns {Array<string|{blank: true}>}
 */
export function lineWithBlanks(template) {
  const filled = fillTemplate(String(template ?? ''), BLANK);
  const out = [];
  filled.split(BLANK).forEach((part, i) => {
    if (i > 0) out.push({ blank: true });
    if (part) out.push(part);
  });
  return out;
}

function lineNode(template) {
  const p = h('p', { class: 'tp-line' });
  for (const part of lineWithBlanks(template)) {
    if (typeof part === 'string') p.append(part);
    else p.append(h('span', { class: 'tp-blank', role: 'img', 'aria-label': 'your child’s name' }));
  }
  return p;
}

function selectorId(sel) {
  return typeof sel === 'string' && sel.startsWith('#') ? sel.slice(1) : null;
}

function byId(svg, sel) {
  const id = selectorId(sel);
  if (!id) return null;
  return [...svg.querySelectorAll('[id]')].find((el) => el.id === id) ?? null;
}

/**
 * Put a mounted scene into its printed state: the mechanism at rest, things
 * that only appear later hidden, the name spots empty. The scene must be in
 * the document (the drive engine measures paths).
 * Also used by the magic window's "ghost" guide.
 * @param {SVGSVGElement} svg
 * @param {object} page book page
 * @param {{drive?: object|null, scene?: object|null}} [mods] js/reader/drive.js and scene.js, when available
 */
export function prepareRestState(svg, page, { drive = null, scene = null } = {}) {
  const m = page?.mechanic ?? {};
  const driven = new Set((m.drives ?? []).map((d) => d?.target));
  try {
    scene?.hoistAnimations?.(svg, driven);
  } catch {
    /* animation wrappers are cosmetic */
  }
  // Whatever pops in on completion isn't printed on the page.
  for (const sel of [...(m.complete?.show ?? []), ...(m.midway?.show ?? [])]) byId(svg, sel)?.setAttribute('display', 'none');
  for (const el of svg.querySelectorAll('[data-reveal]')) el.setAttribute('display', 'none');
  try {
    drive?.createDriver?.(svg, m.drives ?? [])?.apply(0, { phase: 'out' });
  } catch (err) {
    console.warn('[print] could not set the moving parts to their start', err);
  }
  // Blank name spots: the faint star (.sb-print-only) shows where they go.
  for (const t of svg.querySelectorAll('text.sb-name, .sb-letters text')) {
    t.textContent = '';
    t.setAttribute('aria-hidden', 'true');
  }
  svg.classList.add('is-rest');
  return svg;
}

function pageLabel(page, count) {
  if (page.kind === 'cover') return 'Front cover';
  if (page.kind === 'end') return `Page ${page.n} of ${count} · the end`;
  return `Page ${page.n} of ${count}`;
}

/** Tiffin waving with her ball, from the book's shared artwork (loadDefs must have run). */
function tiffinArt(hasDefs) {
  if (!hasDefs) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '-330 -640 680 660');
  svg.setAttribute('class', 'tp-back-tiffin');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML =
    '<use href="#d-shadow" transform="translate(40 2) scale(2.4 1.2)"/>' +
    '<use href="#d-ball" transform="translate(-150 -42) scale(.84)"/>' +
    '<use href="#d-tiffin-wave"/>' +
    '<use href="#d-sparkle" transform="translate(250 -560) scale(.8)"/>' +
    '<use href="#d-sparkle" transform="translate(-270 -470) scale(.55)"/>';
  return svg;
}

/**
 * Render the printable pages into `root`.
 * @param {HTMLElement} root
 * @param {{book: object, bookId?: string, baseUrl?: string, landingUrl?: string, signal?: AbortSignal}} opts
 *   landingUrl: what the back-cover QR opens (default: landingUrlFor(bookId) for this host)
 * @returns {Promise<() => void>} cleanup
 */
export async function renderPrintPages(root, { book, bookId = book?.id, baseUrl = bookUrl(bookId), landingUrl, signal } = {}) {
  const life = new AbortController();
  signal?.addEventListener('abort', () => life.abort(), { once: true });
  const pages = Array.isArray(book?.pages) ? book.pages : [];
  const title = fillTemplate(book?.title ?? 'Your story', BLANK);

  const wrap = h('div', { class: 'tp', 'data-testid': 'print-sheets' });

  // ---- On-screen introduction (never printed) --------------------------------------------
  // The app's print screen already has a Print button in its bar; only add ours when it doesn't.
  const hasPrintButton = Boolean(document.querySelector('[data-testid="print-now"]'));
  const printBtn = hasPrintButton
    ? null
    : h(
        'button',
        { type: 'button', class: 'tp-print-btn', 'data-testid': 'print-pages-print', onClick: () => window.print() },
        h('span', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 9V3.5h10V9M7 17H4.5V10.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5V17H17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="7" y="14" width="10" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>' }),
        'Print',
      );
  const intro = h(
    'section',
    { class: 'tp-intro', 'data-testid': 'print-intro', 'aria-labelledby': 'tp-intro-title' },
    h(
      'div',
      { class: 'tp-intro-text' },
      h('h2', { id: 'tp-intro-title' }, 'Try the magic window before the real book exists'),
      h('p', {}, 'Print these pages on A4 paper, landscape, at 100% (“actual size”). The name spots are left blank with a faint star, just like the printed book will be. Open the magic window on your phone, point it at a page and watch your child’s name appear.'),
      h('p', { class: 'tp-intro-hint' }, `${pages.length} story pages and a back cover with the QR code. Matt paper works best under the camera.`),
    ),
    printBtn,
  );
  wrap.append(intro);

  // ---- One sheet per page ------------------------------------------------------------
  const sheets = pages.map((page) => {
    const art = h('div', { class: 'tp-art', 'data-state': 'loading' });
    const text = h('div', { class: 'tp-text' }, (page.text ?? []).map(lineNode));
    const meta = h('p', { class: 'tp-meta' }, h('span', { class: 'tp-meta-title' }, splitTitle(title)), h('span', {}, pageLabel(page, pages.length)), h('span', { class: 'tp-meta-test' }, 'Test page'));
    const el = h('section', { class: `tp-sheet tp-${page.kind ?? 'spread'}`, 'data-page': page.n, 'data-testid': 'print-sheet', 'aria-label': `Test page ${page.n} of ${pages.length}` }, h('div', { class: 'tp-page' }, art, h('footer', { class: 'tp-foot' }, text, meta)));
    return { el, art, page };
  });

  // ---- The back cover --------------------------------------------------------------------
  let url = String(landingUrl ?? '');
  if (!url) {
    try {
      url = landingUrlFor(bookId);
    } catch {
      url = '';
    }
  }
  let qr = '';
  try {
    qr = url ? qrSvg(url, { ecl: 'Q', margin: 4, moduleSize: 1, dark: '#000000', light: '#FFFFFF', title: 'QR code: opens the read-along' }) : '';
  } catch (err) {
    console.warn('[print] QR code', err);
  }
  const backArt = h('div', { class: 'tp-back-art' });
  const backLeft = h(
    'div',
    { class: 'tp-back-left' },
    backArt,
    h('p', { class: 'tp-back-title' }, splitTitle(title)),
    book?.subtitle ? h('p', { class: 'tp-back-sub' }, book.subtitle) : null,
  );
  const backRight = h(
    'div',
    { class: 'tp-back-right' },
    h('p', { class: 'tp-back-kicker' }, 'For grown-ups'),
    h('h2', { class: 'tp-back-head' }, 'Scan me to hear this story read aloud — with your child’s name in it'),
    h(
      'div',
      { class: 'tp-back-code' },
      qr ? h('div', { class: 'tp-qr', 'data-testid': 'print-qr', html: qr }) : h('div', { class: 'tp-qr is-missing' }, 'QR code unavailable'),
      h(
        'ol',
        { class: 'tp-steps' },
        h('li', {}, 'Point your phone’s camera at the code.'),
        h('li', {}, 'Type your child’s name and check how it sounds.'),
        h('li', {}, 'Read together — or open the magic window and watch the name appear on these pages.'),
      ),
    ),
    h('p', { class: 'tp-back-url' }, 'Or type ', h('strong', { 'data-testid': 'print-url' }, displayUrl(url))),
    h('p', { class: 'tp-back-small' }, 'No account, no sign-up. Your child’s name stays on your phone.'),
  );
  const back = h(
    'section',
    { class: 'tp-sheet tp-back', 'data-testid': 'print-back-cover', 'aria-label': 'Back cover with the QR code' },
    h('div', { class: 'tp-page' }, backLeft, backRight),
  );

  wrap.append(...sheets.map((s) => s.el), back);
  root.append(wrap);

  // ---- Pictures ------------------------------------------------------------------------
  let sceneMod = null;
  let driveMod = null;
  try {
    [sceneMod, driveMod] = await Promise.all([import('../reader/scene.js'), import('../reader/drive.js').catch(() => null)]);
  } catch (err) {
    console.warn('[print] scene loader unavailable', err);
  }

  const fillSheet = async ({ art, page }) => {
    if (!sceneMod?.loadScene) {
      art.dataset.state = 'missing';
      art.append(h('p', { class: 'tp-art-missing' }, 'Pictures are nearly ready'));
      return;
    }
    try {
      const svg = await sceneMod.loadScene(book, page, baseUrl);
      if (life.signal.aborted) return;
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Picture for page ${page.n}`);
      art.append(svg);
      prepareRestState(svg, page, { drive: driveMod, scene: sceneMod });
      art.dataset.state = 'ready';
    } catch (err) {
      if (life.signal.aborted) return;
      console.warn(`[print] page ${page.n}: ${err.message}`);
      art.dataset.state = 'missing';
      art.append(h('p', { class: 'tp-art-missing' }, `The picture for page ${page.n} didn’t load.`));
    }
  };

  const defsReady = sceneMod?.loadDefs ? sceneMod.loadDefs(book, baseUrl).catch(() => null) : Promise.resolve(null);
  await Promise.all([...sheets.map(fillSheet), defsReady.then((holder) => !life.signal.aborted && backArt.append(tiffinArt(Boolean(holder)) ?? ''))]);
  if (!life.signal.aborted) wrap.dataset.state = 'ready';

  return function cleanup() {
    life.abort();
    wrap.remove();
  };
}

/** "Goal, !" -> ["Goal, ", <blank>, "!"] as nodes. */
function splitTitle(filled) {
  const parts = String(filled).split(BLANK);
  const out = [];
  parts.forEach((part, i) => {
    if (i > 0) out.push(h('span', { class: 'tp-blank tp-blank-sm', role: 'img', 'aria-label': 'your child’s name' }));
    if (part) out.push(part);
  });
  return out;
}
