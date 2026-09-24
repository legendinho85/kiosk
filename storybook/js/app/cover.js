// The book's cover, drawn live from the real artwork (scenes/p1.svg) with
// the child's name written into it. On the landing screen the name updates
// as the parent types, which is the app's first bit of magic.
//
// Uses js/reader/scene.js and js/reader/name-fit.js, loaded lazily so a
// problem there (or artwork that hasn't been drawn yet) never breaks the
// name form: we fall back to a simple drawn cover with the same name slot.

import { h, tiffinMark } from './ui.js';
import { bookUrl } from '../core/book.js';
import { parseTemplate, person as makePerson } from '../core/personalise.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** What a screen reader hears in place of the blank name spot. */
export const BLANK_NAME = 'your child’s name';

/**
 * The cover's accessible name: "Book cover: Goal, Siobhan!", or with no name
 * yet "Book cover: Goal, your child’s name!" (never "Goal, !").
 * @param {string} template e.g. "Goal, {name}!"
 * @param {string} display
 */
export function coverLabel(template, display) {
  const name = display || BLANK_NAME;
  const text = parseTemplate(String(template ?? ''))
    .map((c) => {
      if (c.kind === 'text') return c.text;
      if (c.kind === 'say') return c.display;
      if (c.form === 'upper' && display) return name.toLocaleUpperCase('en-GB');
      return c.form === 'poss' ? `${name}'s` : name;
    })
    .join('');
  return `Book cover: ${text.replace(/\s+/g, ' ').trim()}`;
}

let libs = null;
function loadLibs() {
  libs ??= Promise.all([import('../reader/scene.js'), import('../reader/name-fit.js')])
    .then(([scene, nameFit]) => ({ scene, nameFit }))
    .catch((err) => {
      console.warn('[cover] reader modules unavailable; using the simple cover', err?.message);
      libs = null;
      return null;
    });
  return libs;
}

/**
 * The title with the name in it, as nodes: "Goal, " <name>Siobhan</name> "!".
 * With no name yet, the name is a blank line, like the empty spot in the printed book.
 * @param {string} template e.g. "Goal, {name}!"
 * @param {string} display
 * @returns {Node[]}
 */
export function titleNodes(template, display) {
  const p = makePerson(display || ' ');
  return parseTemplate(String(template ?? '')).map((c) => {
    if (c.kind === 'text') return document.createTextNode(c.text);
    if (c.kind === 'say') return document.createTextNode(c.display);
    // The blank line is drawn for eyes only; screen readers hear "your child’s name" (an aria-label on a plain span is ignored).
    if (!display) return h('span', { class: 'cover-name is-blank' }, h('span', { 'aria-hidden': 'true' }, '   '), h('span', { class: 'sr-only' }, BLANK_NAME));
    const text = c.form === 'upper' ? p.display.toLocaleUpperCase('en-GB') : c.form === 'poss' ? `${p.display}'s` : p.display;
    return h('span', { class: 'cover-name' }, text);
  });
}

/** A simple stand-in cover (sky, grass, ribbon, Tiffin) with a real name slot. */
function fallbackScene(book) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1600 1000');
  svg.setAttribute('class', 'sb-scene cover-fallback');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  const word = String(book?.title ?? 'Goal, {name}!').split('{')[0].trim() || 'Hello,';
  svg.innerHTML = `
    <rect width="1600" height="1000" fill="#9FDCF7"/>
    <circle cx="1380" cy="170" r="90" fill="#FFE08A"/>
    <path d="M0 640 C 400 590 1200 600 1600 650 V1000 H0Z" fill="#74C655"/>
    <path d="M0 760 L1600 700 L1600 770 L0 840Z" fill="#86D166"/>
    <g stroke-linejoin="round" stroke-width="10">
      <path d="M190 70 H1410 L1360 160 L1410 250 H190 L240 160Z" fill="#FFCB3D" stroke="#CF9612"/>
      <path d="M470 262 H1130 V362 H470Z" fill="#FFE08A" stroke="#CF9612"/>
    </g>
    <text x="800" y="205" text-anchor="middle" font-family="Fredoka, Andika, sans-serif" font-weight="700" font-size="128" fill="#E4483A" stroke="#fff" stroke-width="10" paint-order="stroke"></text>
    <g class="sb-print-only" opacity=".35"><path d="M800 278l14 29 32 5-23 22 5 32-28-15-28 15 5-32-23-22 32-5z" fill="#CF9612"/></g>
    <text class="sb-name" data-form="plain" data-max-width="600" x="800" y="340" text-anchor="middle" font-family="Fredoka, Andika, sans-serif" font-weight="700" font-size="80" fill="#E4483A" stroke="#fff" stroke-width="7" paint-order="stroke"></text>
    <g transform="translate(560 590) scale(1.25)" class="cover-fallback-face"></g>
    <g transform="translate(1040 820)"><circle r="95" fill="#fff" stroke="#2B2B2B" stroke-width="9"/><path d="M0 -40l38 28-15 44h-46l-15-44z" fill="#2B2B2B"/></g>`;
  svg.querySelector('text').textContent = word;
  const face = tiffinMark({ size: 320 });
  const g = svg.querySelector('.cover-fallback-face');
  g.innerHTML = face.innerHTML;
  return svg;
}

function fillSimple(svg, display) {
  for (const t of svg.querySelectorAll('text.sb-name')) {
    t.classList.remove('is-pending', 'is-veiled');
    const form = t.dataset.form;
    t.textContent = !display ? '' : form === 'upper' ? display.toLocaleUpperCase('en-GB') : form === 'poss' ? `${display}'s` : display;
  }
}

/**
 * Create a live cover.
 * @param {{book: object, bookId?: string, baseUrl?: string, display?: string, art?: string, signal?: AbortSignal, caption?: boolean, label?: string}} opts
 *   art: the form drawn inside the picture when it differs from `display` (siblings: "Amara & Zak")
 * @returns {{el: HTMLElement, setName(display: string, opts?: {pop?: boolean, art?: string}): void, loaded: Promise<'scene'|'fallback'>}}
 */
export function createCover({ book, bookId = book?.id, baseUrl, display = '', art: artName = '', signal, caption = true } = {}) {
  const base = baseUrl ?? bookUrl(bookId);
  const art = h('div', { class: 'cover-art is-loading', 'data-testid': 'cover-art' });
  const title = h('p', { class: 'cover-title', 'data-testid': 'cover-title' });
  const sub = h('p', { class: 'cover-sub' }, book?.subtitle ?? '', book?.subtitle && book?.ages ? ' · ' : '', book?.ages ? h('span', { class: 'nowrap' }, `Ages ${book.ages}`) : null);
  const el = h('figure', { class: 'cover is-blank', 'data-testid': 'cover' }, art, caption ? h('figcaption', { class: 'cover-caption' }, title, sub) : null);
  let svg = null;
  let slots = null;
  let nameFit = null;
  let current = String(display ?? '');
  let currentArt = String(artName ?? '');
  const who = () => makePerson(current, undefined, { art: currentArt || undefined });

  const renderTitle = () => {
    title.replaceChildren(...titleNodes(book?.title ?? 'Goal, {name}!', current));
    // One accessible name for the picture, e.g. "Book cover: Goal, Siobhan!"
    art.setAttribute('role', 'img');
    art.setAttribute('aria-label', coverLabel(book?.title ?? 'Goal, {name}!', current));
  };

  const fill = ({ pop = false } = {}) => {
    el.classList.toggle('is-blank', !current);
    if (!svg) return;
    try {
      if (!current) {
        // No name yet: blank spots, just like the printed book (its faint
        // stars show through via .is-blank).
        fillSimple(svg, '');
        for (const t of svg.querySelectorAll('text.sb-letter')) t.textContent = '';
      } else if (nameFit) slots = nameFit.fillNameSlots(svg, who(), { animate: false });
      else fillSimple(svg, currentArt || current);
    } catch (err) {
      console.warn('[cover] could not write the name', err);
      fillSimple(svg, currentArt || current);
    }
    if (pop && current) popNames();
  };

  const popNames = () => {
    for (const t of svg.querySelectorAll('text.sb-name')) {
      const target = t.hasAttribute('transform') && libsScene ? libsScene.animationWrapper(t) : t;
      target.classList.remove('sb-name-written');
      void target.getBBox?.();
      target.classList.add('sb-name-written');
    }
  };

  let libsScene = null;
  const loaded = (async () => {
    const lib = await loadLibs();
    let kind = 'fallback';
    let scene = null;
    const page = book?.pages?.find((p) => p.kind === 'cover') ?? book?.pages?.[0];
    if (lib && page?.scene) {
      try {
        scene = await lib.scene.loadScene(book, page, base);
        libsScene = lib.scene;
        nameFit = lib.nameFit;
        kind = 'scene';
      } catch (err) {
        console.info(`[cover] artwork not available yet (${err?.message}); showing the simple cover`);
      }
    }
    if (signal?.aborted) return kind;
    if (!scene) {
      scene = fallbackScene(book);
      nameFit = lib?.nameFit ?? null;
    }
    scene.setAttribute('aria-hidden', 'true');
    scene.setAttribute('focusable', 'false');
    svg = scene;
    art.replaceChildren(svg);
    art.classList.remove('is-loading');
    art.dataset.kind = kind;
    fill();
    // Web fonts change text widths: refit once they have arrived.
    document.fonts?.ready?.then(() => !signal?.aborted && slots?.refit?.()).catch(() => {});
    return kind;
  })();

  renderTitle();
  return {
    el,
    loaded,
    setName(next, { pop = false, art: nextArt = '' } = {}) {
      const n = String(next ?? '');
      const a = String(nextArt ?? '');
      if (n === current && a === currentArt) return;
      current = n;
      currentArt = a;
      renderTitle();
      fill({ pop });
    },
  };
}
