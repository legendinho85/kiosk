// Putting the child's name into the pictures: shirts, banners, scoreboards,
// trophies (`<text class="sb-name">` slots) and bunting (`<g class="sb-letters">`,
// one letter per flag). See docs/architecture.md ("Scene SVG conventions").
//
// A name must always fit its spot and never be cut off: it shrinks (down to
// 45% of the drawn size), then tightens its letter spacing, then — for names
// with a space or hyphen in a `data-wrap="2"` slot — breaks onto two lines,
// and only as a last resort squeezes the glyphs. The fitting maths is pure and
// unit-tested; the DOM layer measures real text when it can and estimates
// when it can't.
//
// Siblings reading together ("Amara & Zak & Oluwaseun") must stay readable
// too, so they are never squashed: all the names on one line while that stays
// at least SIBLING_MIN_SCALE of the drawn size, else (in a `data-wrap` slot)
// stacked on two lines split at an "&", else their first letters ("A & Z & O").
// A group marked `data-siblings="copies"` (a shirt, a hat) is drawn once per
// child, fanned out, each copy with one child's name.
//
// This module makes no sound. writeIn() returns a promise and reports each
// letter, so the reader decides when to ding.

import { upper, possessive } from '../core/personalise.js';
import { animationWrapper } from './scene.js';

export const MIN_SCALE = 0.45; // smallest a name may shrink, as a fraction of the drawn size
export const SIBLING_MIN_SCALE = 0.55; // siblings' names smaller than this switch to a shorter form
// Browsers hint (round) glyph widths for the size text is drawn at on screen, so the same name can
// measure ~5% wider or narrower as the picture is resized. Unhinted ("geometric precision") text
// scales exactly, so it is measured and drawn that way.
const GEOMETRIC = 'geometricPrecision';
const MAX_SQUEEZE = 0.12; // tightest letter spacing, as a fraction of the font size
const WRAP_BELOW = 0.7; // consider two lines when one line would shrink below this
const TWO_LINE_MAX = 0.62; // each of two lines is at most this fraction of the drawn size
const LINE_GAP = 1.08;

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;

/** Split text into user-perceived characters ("ë" stays one letter even when decomposed). */
export function graphemes(text) {
  const s = String(text ?? '');
  return segmenter ? [...segmenter.segment(s)].map((x) => x.segment) : Array.from(s);
}

/**
 * The name as drawn inside the pictures: `person.art` when there is one
 * (siblings: "Amara & Zak"), otherwise the displayed name.
 */
export function artName(person) {
  if (typeof person === 'string') return person;
  return String(person?.art ?? person?.display ?? '');
}

/** The text a slot shows for its data-form: upper ("AVA"), poss ("Ava's") or plain. */
export function nameForForm(person, form) {
  const display = artName(person);
  if (form === 'upper') return upper(display);
  if (form === 'poss') return possessive(display);
  return display;
}

/**
 * The children's names when several read together (from the art form
 * "Amara & Zak"; a single name never contains "&"), else null.
 */
export function siblingNames(person) {
  const names = artName(person)
    .split(/\s+&\s+/)
    .map((n) => n.trim())
    .filter(Boolean);
  return names.length > 1 ? names : null;
}

/** Apply a slot's data-form to (a line of) sibling names; "poss" marks only the end. */
function formLines(lines, form) {
  if (form === 'upper') return lines.map(upper);
  if (form === 'poss') return lines.map((l, i) => (i === lines.length - 1 ? possessive(l) : l));
  return lines;
}

/**
 * Lay out several children's names in one spot, always readable and never
 * squashed: one line ("Amara & Zak") while it stays at least `minScale` of the
 * drawn size; otherwise, where the slot may wrap, two lines split at an "&"
 * ("Amara & Zak" / "& Oluwaseun"); otherwise first letters ("A & Z & O").
 * @param {{names: string[], form?: string, fontSize: number, maxWidth: number, wrap?: boolean,
 *   measure?: (text: string, fontSize: number) => number, minScale?: number}} spec
 * @returns {{lines: string[], fontSize: number, letterSpacing: number, squeeze: boolean, style: 'full'|'stacked'|'initials'}}
 */
export function layoutSiblings({ names, form = 'plain', fontSize, maxWidth, wrap = false, measure = estimateTextWidth, minScale = SIBLING_MIN_SCALE }) {
  const readable = (l) => !l.letterSpacing && !l.squeeze && l.fontSize >= fontSize * minScale - 1e-6;
  const [full] = formLines([names.join(' & ')], form);
  const one = layoutName({ text: full, fontSize, maxWidth, wrap: false, measure });
  if (readable(one) || !(maxWidth > 0)) return { ...one, style: 'full' };
  if (wrap) {
    let best = null;
    for (let i = 1; i < names.length; i++) {
      const lines = formLines([names.slice(0, i).join(' & '), `& ${names.slice(i).join(' & ')}`], form);
      const fits = lines.map((t) => fitText(measure(t, fontSize), fontSize, maxWidth, { chars: graphemes(t).length }));
      if (fits.some((f) => f.letterSpacing || f.squeeze)) continue;
      const size = settleSize(lines, Math.min(...fits.map((f) => f.fontSize), fontSize * TWO_LINE_MAX), maxWidth, measure, fontSize * MIN_SCALE);
      if (size >= fontSize * minScale - 1e-6 && (!best || size > best.fontSize)) best = { lines, fontSize: size, letterSpacing: 0, squeeze: false, style: 'stacked' };
    }
    if (best) return best;
  }
  const [initials] = formLines([names.map((n) => upper(graphemes(n)[0] ?? '')).join(' & ')], form);
  return { ...layoutName({ text: initials, fontSize, maxWidth, wrap: false, measure }), style: 'initials' };
}

const SEPARATOR = /^[\s\-'’.]$/u;
// Bunting spells a name one letter per flag, which only makes sense for
// alphabetic scripts. Chinese, Arabic, Devanagari... use the overflow banner.
const FLAG_FRIENDLY = /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}][\p{M}]*$/u;

/**
 * The upper-case letters a name puts on bunting flags (separators skipped),
 * or null when the name isn't written in an alphabet that splits into letters.
 */
export function slotLetters(display) {
  // Several names ("Amara & Zak", "Amara and Zak") don't spell out on one
  // string of bunting: the overflow banner shows them instead.
  if (/[&+,]/.test(String(display ?? ''))) return null;
  const letters = graphemes(upper(String(display ?? '').normalize('NFC'))).filter((g) => !SEPARATOR.test(g));
  if (!letters.length || !letters.every((g) => FLAG_FRIENDLY.test(g))) return null;
  return letters;
}

/**
 * Centre letters across N slots ("BO" on 7 flags -> ['', '', 'B', 'O', '', '', '']).
 * @returns {string[]|null} null when they don't fit (show the overflow banner)
 */
export function distributeLetters(letters, slotCount) {
  if (!letters || !letters.length || letters.length > slotCount) return null;
  const out = new Array(slotCount).fill('');
  const start = Math.floor((slotCount - letters.length) / 2);
  letters.forEach((l, i) => {
    out[start + i] = l;
  });
  return out;
}

/**
 * Where a name may break onto two lines: at a space (dropped) or after a
 * hyphen (kept on line one), choosing the break that balances the lines.
 * @returns {[string, string]|null}
 */
export function splitForWrap(text) {
  const g = graphemes(String(text ?? '').trim());
  let best = null;
  for (let i = 1; i < g.length - 1; i++) {
    if (g[i] !== ' ' && g[i] !== '-') continue;
    const a = g.slice(0, g[i] === '-' ? i + 1 : i).join('').trim();
    const b = g.slice(i + 1).join('').trim();
    if (!a || !b) continue;
    // Balance first; on a tie a space beats a hyphen ("Jean-Luc / Paul").
    const score = Math.max(graphemes(a).length, graphemes(b).length) * 2 + (g[i] === '-' ? 1 : 0);
    if (!best || score < best.score) best = { score, parts: [a, b] };
  }
  return best ? best.parts : null;
}

/** Rough rendered width of text in a rounded bold face, for when we can't measure. */
export function estimateTextWidth(text, fontSize) {
  let em = 0;
  for (const g of graphemes(text)) {
    if (/\s/u.test(g)) em += 0.28;
    else if (/^[iIl1!|.,:;'’jtfr-]/u.test(g)) em += 0.32;
    else if (/^[MWmw]/u.test(g)) em += 0.9;
    else if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(g)) em += 1;
    else if (/^\p{Lu}/u.test(g)) em += 0.68;
    else em += 0.56;
  }
  return em * fontSize;
}

/**
 * Fit one line of text into maxWidth.
 * @param {number} naturalWidth width of the text at fontSize
 * @param {number} fontSize the size the artist drew
 * @param {number} maxWidth
 * @param {{chars?: number, minScale?: number}} [opts]
 * @returns {{fontSize: number, letterSpacing: number, squeeze: boolean}}
 *   squeeze: even the tightest spacing overflows; set textLength to squash the glyphs.
 */
export function fitText(naturalWidth, fontSize, maxWidth, { chars = 1, minScale = MIN_SCALE } = {}) {
  if (!(maxWidth > 0) || !(naturalWidth > maxWidth)) return { fontSize, letterSpacing: 0, squeeze: false };
  const scale = maxWidth / naturalWidth;
  if (scale >= minScale) return { fontSize: fontSize * scale, letterSpacing: 0, squeeze: false };
  const size = fontSize * minScale;
  // Browsers add letter-spacing after every character, so n characters give n gaps.
  const need = (naturalWidth * minScale - maxWidth) / Math.max(1, chars);
  const limit = size * MAX_SQUEEZE;
  if (need <= limit) return { fontSize: size, letterSpacing: -need, squeeze: false };
  return { fontSize: size, letterSpacing: -limit, squeeze: true };
}

/**
 * Choose between one line and two for a name slot.
 * @param {{text: string, fontSize: number, maxWidth: number, wrap?: boolean,
 *   measure: (text: string, fontSize: number) => number}} spec
 * @returns {{lines: string[], fontSize: number, letterSpacing: number, squeeze: boolean}}
 */
export function layoutName({ text, fontSize, maxWidth, wrap = false, measure = estimateTextWidth }) {
  const single = { lines: [text], ...fitText(measure(text, fontSize), fontSize, maxWidth, { chars: graphemes(text).length }) };
  if (single.fontSize < fontSize && !single.letterSpacing && !single.squeeze) single.fontSize = settleSize([text], single.fontSize, maxWidth, measure, fontSize * MIN_SCALE);
  if (!wrap || single.fontSize >= fontSize * WRAP_BELOW) return single;
  const parts = splitForWrap(text);
  if (!parts) return single;
  const fits = parts.map((t) => fitText(measure(t, fontSize), fontSize, maxWidth, { chars: graphemes(t).length }));
  const size = settleSize(parts, Math.min(...fits.map((f) => f.fontSize), fontSize * TWO_LINE_MAX), maxWidth, measure, fontSize * MIN_SCALE);
  // Two lines only when every line fits by shrinking alone and ends up bigger.
  if (fits.some((f) => f.letterSpacing || f.squeeze) || size <= single.fontSize) return single;
  return { lines: parts, fontSize: size, letterSpacing: 0, squeeze: false };
}

/**
 * Text doesn't shrink exactly in proportion on screen: at the small sizes a
 * phone draws a scene at, glyph widths are rounded, so a name scaled to fit
 * by its full-size width can still come out a few per cent too wide. Measure
 * again at the chosen size and take a little more off if needed.
 */
function settleSize(lines, size, maxWidth, measure, minSize) {
  let s = size;
  if (!(maxWidth > 0)) return s;
  for (let i = 0; i < 3; i++) {
    const w = Math.max(...lines.map((t) => measure(t, s)));
    if (!(w > maxWidth * 1.002)) break;
    s = Math.max(minSize, s * (maxWidth / w) * 0.995);
    if (s === minSize) break;
  }
  return s;
}

/**
 * Baselines for a two-line name so the pair sits centred where the artist's
 * single line was. The drawn line's visual middle is ~0.35em above its baseline.
 */
export function twoLineBaselines(y, drawnSize, size, centred = false) {
  // With dominant-baseline="central"/"middle" the y already is the middle.
  const middle = centred ? y : y - 0.35 * drawnSize;
  const first = middle - (LINE_GAP / 2) * size + (centred ? 0 : 0.35 * size);
  return [first, first + LINE_GAP * size];
}

// ---- DOM ------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const original = new WeakMap();

const round = (n) => String(Math.round(n * 100) / 100);

function pick(root, sel) {
  if (typeof sel !== 'string' || !sel.startsWith('#')) return null;
  return [...root.querySelectorAll('[id]')].find((el) => el.id === sel.slice(1)) ?? null;
}

function remember(el) {
  if (!original.has(el)) {
    const fs = parseFloat(el.getAttribute('font-size') ?? '') || parseFloat(safeStyle(el)?.fontSize ?? '') || 64;
    original.set(el, {
      fontSize: fs,
      x: el.getAttribute('x'),
      y: el.getAttribute('y'),
      letterSpacing: el.getAttribute('letter-spacing'),
      text: el.textContent,
    });
  }
  return original.get(el);
}

function safeStyle(el) {
  try {
    return globalThis.getComputedStyle?.(el) ?? null;
  } catch {
    return null;
  }
}

/** Is the element displayed (nothing between it and the scene root is display:none)? */
export function isShown(el, root) {
  for (let n = el; n && n !== root?.parentNode; n = n.parentNode) {
    if (n.nodeType !== 1) break;
    if (n.getAttribute('display') === 'none' || n.style?.display === 'none') return false;
    if (safeStyle(n)?.display === 'none') return false;
    if (n === root) break;
  }
  return true;
}

/**
 * Measure text in the slot's own font by laying out a hidden twin beside it.
 * The twin sits in the slot's own group, so it is drawn at the same on-screen
 * size: at the small sizes a phone draws a scene at, glyph widths are rounded
 * differently at different scales, and a twin at the scene root can come out
 * a few per cent narrower than the slot inside a scaled-down group. A slot
 * whose group isn't drawn (hidden until the mechanism is done) is measured at
 * the scene root instead, then estimated as a last resort.
 */
function makeMeasurer(svgRoot) {
  const probes = new Map(); // host element -> hidden <text>
  const probeIn = (host) => {
    let probe = probes.get(host);
    if (!probe) {
      probe = document.createElementNS(SVG_NS, 'text');
      probe.setAttribute('visibility', 'hidden');
      probe.setAttribute('aria-hidden', 'true');
      probe.setAttribute('class', 'sb-measure');
      probe.setAttribute('text-rendering', GEOMETRIC);
      host.appendChild(probe);
      probes.set(host, probe);
    }
    return probe;
  };
  const measure = (slot) => (text, fontSize) => {
    const cs = safeStyle(slot);
    const hosts = [slot.parentNode, svgRoot].filter((x, i, all) => x && x.namespaceURI === SVG_NS && all.indexOf(x) === i);
    for (const host of hosts) {
      try {
        const probe = probeIn(host);
        // Same place as the slot (in its own group), so the same scale applies.
        probe.setAttribute('x', host === svgRoot ? '0' : slot.getAttribute('x') || '0');
        probe.setAttribute('y', host === svgRoot ? '-500' : slot.getAttribute('y') || '0');
        probe.setAttribute('font-family', slot.getAttribute('font-family') || cs?.fontFamily || 'Fredoka, Andika, sans-serif');
        probe.setAttribute('font-weight', slot.getAttribute('font-weight') || cs?.fontWeight || '700');
        probe.setAttribute('font-style', cs?.fontStyle || 'normal');
        probe.setAttribute('font-size', String(fontSize));
        // The artist's own letter spacing counts; ours (from an earlier fit) doesn't.
        probe.setAttribute('letter-spacing', original.get(slot)?.letterSpacing ?? '0');
        probe.textContent = text;
        const w = probe.getComputedTextLength();
        if (w > 0) return w;
      } catch {
        /* not rendered (detached scene, old engine): try the next place */
      }
    }
    return estimateTextWidth(text, fontSize);
  };
  const done = () => {
    for (const probe of probes.values()) probe.remove();
    probes.clear();
  };
  return { measure, done };
}

function charSpans(parent, text, hidden) {
  for (const g of graphemes(text)) {
    const t = document.createElementNS(SVG_NS, 'tspan');
    t.setAttribute('class', hidden ? 'sb-ch is-hidden' : 'sb-ch');
    t.textContent = g;
    parent.appendChild(t);
  }
}

function renderSlot(item, measure) {
  const { el, orig } = item;
  // Unhinted text scales exactly with the picture, so a name that fits at one size fits at every size.
  el.setAttribute('text-rendering', GEOMETRIC);
  const maxWidth = parseFloat(el.dataset.maxWidth ?? el.getAttribute('data-max-width') ?? '');
  const wrap = el.dataset.wrap === '2';
  const layout = item.sibs
    ? layoutSiblings({ names: item.sibs, form: item.form, fontSize: orig.fontSize, maxWidth, wrap, measure })
    : layoutName({ text: item.text, fontSize: orig.fontSize, maxWidth, wrap, measure });
  item.layout = layout;
  el.setAttribute('font-size', round(layout.fontSize));
  if (layout.letterSpacing) el.setAttribute('letter-spacing', round(layout.letterSpacing));
  else if (orig.letterSpacing != null) el.setAttribute('letter-spacing', orig.letterSpacing);
  else el.removeAttribute('letter-spacing');
  if (layout.squeeze && maxWidth > 0) {
    el.setAttribute('textLength', round(maxWidth));
    el.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  } else {
    el.removeAttribute('textLength');
    el.removeAttribute('lengthAdjust');
  }
  if (orig.y != null) el.setAttribute('y', orig.y);
  el.textContent = '';
  // Per-letter spans only while a write-in is pending, and only for scripts
  // whose letters stand alone (splitting Arabic would break its joining).
  const split = item.pending && item.letterwise;
  if (layout.lines.length === 1) {
    if (split) charSpans(el, layout.lines[0], true);
    else el.textContent = layout.lines[0];
  } else {
    const y = parseFloat(orig.y ?? '0') || 0;
    const baseline = el.getAttribute('dominant-baseline') || safeStyle(el)?.dominantBaseline || '';
    const baselines = twoLineBaselines(y, orig.fontSize, layout.fontSize, /central|middle/.test(baseline));
    layout.lines.forEach((line, i) => {
      const t = document.createElementNS(SVG_NS, 'tspan');
      if (orig.x != null) t.setAttribute('x', orig.x);
      t.setAttribute('y', round(baselines[i]));
      if (split) charSpans(t, line, true);
      else t.textContent = line;
      el.appendChild(t);
    });
  }
  el.classList.toggle('is-pending', Boolean(item.pending));
  // Whole-name scripts can't reveal letter by letter: veil and fade instead.
  el.classList.toggle('is-veiled', Boolean(item.pending && !item.letterwise));
  el.setAttribute('aria-label', item.text);
  if (layout.style) el.dataset.siblingsAs = layout.style;
  else delete el.dataset.siblingsAs;
}

function renderLetters(group, svgRoot, display, animate, several = false) {
  const texts = [...group.querySelectorAll('text.sb-letter')];
  const dist = several ? null : distributeLetters(slotLetters(display), texts.length);
  const overflow = pick(svgRoot, group.dataset.overflow ?? group.getAttribute('data-overflow'));
  const write = animate && (group.dataset.anim === 'write' || texts.some((t) => t.dataset.anim === 'write'));
  texts.forEach((t, i) => {
    const letter = dist ? dist[i] : '';
    t.textContent = letter;
    t.classList.remove('sb-letter-pop');
    if (t.parentNode?.getAttribute?.('data-sb-wrap') === 'anim') t.parentNode.classList.remove('sb-letter-pop');
    t.classList.toggle('is-hidden', Boolean(write && letter));
    if (letter) t.removeAttribute('display');
    else t.setAttribute('display', 'none');
    const maxWidth = parseFloat(t.dataset.maxWidth ?? '');
    if (letter && maxWidth > 0) {
      const orig = remember(t);
      const fit = fitText(estimateTextWidth(letter, orig.fontSize), orig.fontSize, maxWidth);
      t.setAttribute('font-size', round(fit.fontSize));
    }
  });
  if (overflow) {
    if (dist) overflow.setAttribute('display', 'none');
    else overflow.removeAttribute('display');
  }
  group.classList.toggle('is-overflow', !dist);
  return { el: group, kind: 'letters', pending: Boolean(write && dist), letters: texts.filter((t) => t.textContent) };
}

/** Restart a CSS pop animation, on a wrapper if the element is positioned with a transform. */
function popClass(el, cls) {
  const target = el.hasAttribute('transform') ? animationWrapper(el) : el;
  target.classList.remove(cls);
  void target.getBBox?.();
  target.classList.add(cls);
}

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(id), resolve()), { once: true });
  });

/**
 * Siblings: draw each `[data-siblings="copies"]` group once per child, fanned
 * out round where the artist drew it (`data-sibling-step`: the gap between
 * copies in the group's own units, default 150; `data-sibling-turn`: degrees
 * between them, default 7; `data-sibling-scale`: default 0.9 for two, 0.8 for
 * three). Each copy's name slots get `data-sibling="i"` (that child's name).
 * Copies' ids get a "-s2"/"-s3" suffix. Re-running with one child removes them.
 * @param {SVGSVGElement} svgRoot
 * @param {string[]|null} names
 */
export function expandSiblingCopies(svgRoot, names) {
  for (const el of svgRoot.querySelectorAll('[data-siblings="copies"]')) {
    if (el.closest('[data-sibling-copy]')) continue; // a copy of a copy
    // Undo an earlier fan (a different set of children).
    const fan = el.parentNode?.getAttribute?.('data-sibling-fan') === '0' ? el.parentNode : null;
    if (fan) {
      for (const g of [...fan.parentNode.querySelectorAll(':scope > [data-sibling-fan]')]) if (g !== fan) g.remove();
      fan.removeAttribute('transform');
      fan.replaceWith(el);
    }
    for (const t of el.querySelectorAll('text.sb-name')) delete t.dataset.sibling;
    const n = names?.length ?? 0;
    if (n < 2) continue;
    const step = Number(el.dataset.siblingStep) || 150;
    const turn = Number(el.dataset.siblingTurn ?? 7);
    const scale = Number(el.dataset.siblingScale) || (n === 2 ? 0.9 : 0.8);
    // The copies pivot on the group's own origin, where the artist placed it.
    let ox = 0;
    let oy = 0;
    try {
      const m = el.transform?.baseVal?.consolidate?.()?.matrix;
      if (m) [ox, oy] = [m.e, m.f];
    } catch {
      /* no transform: the parent's origin */
    }
    const parent = el.parentNode;
    const next = el.nextSibling;
    for (let i = 0; i < n; i++) {
      const copy = i === 0 ? el : el.cloneNode(true);
      if (i > 0) {
        copy.setAttribute('data-sibling-copy', String(i));
        for (const node of [copy, ...copy.querySelectorAll('[id]')]) if (node.id) node.id = `${node.id}-s${i + 1}`;
      }
      for (const t of copy.querySelectorAll('text.sb-name')) t.dataset.sibling = String(i);
      const k = i - (n - 1) / 2;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('data-sibling-fan', String(i));
      g.setAttribute('transform', `translate(${round(ox + k * step)} ${round(oy)}) rotate(${round(k * turn)}) scale(${round(scale)}) translate(${round(-ox)} ${round(-oy)})`);
      g.appendChild(copy);
      parent.insertBefore(g, next);
    }
  }
}

/**
 * Fill every name slot and bunting string in a scene.
 * With `animate`, slots marked `data-anim="write"` start blank and write
 * themselves in when writeIn() is called; everything else shows at once.
 * The scene should be in the document so text can be measured.
 * @param {SVGSVGElement} svgRoot
 * @param {{display: string, say?: string, art?: string, count?: number}} person  pictures show `art ?? display`;
 *   with several children (`count > 1`) bunting always uses the overflow banner
 * @param {{animate?: boolean}} [opts]
 * @returns {{
 *   writeIn(opts?: {within?: Element, filter?: (el: Element) => boolean, signal?: AbortSignal,
 *     letterMs?: number, instant?: boolean, onLetter?: (el: Element, i: number) => void,
 *     onWritten?: (el: Element) => void}): Promise<number>,
 *   refit(): void, pending(): Element[], revealAll(): void }}
 */
export function fillNameSlots(svgRoot, person, { animate = false } = {}) {
  const display = artName(person);
  const sibs = siblingNames(person);
  const several = Boolean(sibs) || (typeof person === 'object' && (person?.count ?? 1) > 1);
  expandSiblingCopies(svgRoot, sibs);
  // Letter-by-letter write-in suits alphabetic scripts ("Amara & Zak" too).
  const letterwise = slotLetters(display.replace(/[&+,]/g, ' ')) !== null;
  const items = [];

  const layoutAll = () => {
    const m = makeMeasurer(svgRoot);
    for (const item of items) if (item.kind === 'name') renderSlot(item, m.measure(item.el));
    m.done();
  };

  for (const el of svgRoot.querySelectorAll('text.sb-name')) {
    const form = el.dataset.form ?? 'plain';
    // A slot on one child's copy of a shirt or hat has just that child's name.
    const own = sibs && el.dataset.sibling != null ? sibs[Number(el.dataset.sibling)] : null;
    items.push({
      el,
      kind: 'name',
      orig: remember(el),
      form,
      text: nameForForm(own ?? display, form),
      sibs: own ? null : sibs,
      letterwise,
      pending: Boolean(animate && el.dataset.anim === 'write'),
    });
  }
  for (const group of svgRoot.querySelectorAll('.sb-letters')) items.push(renderLetters(group, svgRoot, display, animate, several));
  layoutAll();

  async function writeItem(item, { signal, letterMs, instant, onLetter, onWritten }) {
    const parts = item.kind === 'name' ? [...item.el.querySelectorAll('.sb-ch.is-hidden')] : item.letters;
    for (let i = 0; i < parts.length; i++) {
      if (!instant && !signal?.aborted) await sleep(i === 0 ? 0 : letterMs, signal);
      parts[i].classList.remove('is-hidden');
      if (item.kind === 'letters' && !instant) popClass(parts[i], 'sb-letter-pop');
      if (!instant && !signal?.aborted) onLetter?.(item.el, i);
    }
    item.pending = false;
    item.writing = false;
    if (item.kind === 'name') {
      item.el.classList.remove('is-pending');
      // Collapse the per-letter spans back to plain text so kerning returns;
      // the "written" pop hides the tiny settle.
      if (!instant && !signal?.aborted) await sleep(160, signal);
      const m = makeMeasurer(svgRoot);
      renderSlot(item, m.measure(item.el));
      m.done();
      if (!instant) popClass(item.el, 'sb-name-written');
    }
    onWritten?.(item.el);
  }

  return {
    /** Write in the pending slots that are showing (optionally only inside `within`). Resolves with how many were written. */
    async writeIn({ within = null, filter = null, signal, letterMs = 110, instant = false, onLetter, onWritten } = {}) {
      const due = items.filter((it) => it.pending && !it.writing && (!within || within.contains(it.el)) && (!filter || filter(it.el)) && isShown(it.el, svgRoot));
      for (const it of due) it.writing = true;
      await Promise.all(due.map((it) => writeItem(it, { signal, letterMs, instant, onLetter, onWritten })));
      return due.length;
    },
    /** Re-measure after web fonts arrive (keeps pending/written state). */
    refit: layoutAll,
    /** Slots still waiting to be written in. */
    pending: () => items.filter((it) => it.pending).map((it) => it.el),
    /** Show everything immediately (e.g. when leaving the page mid-animation). */
    revealAll() {
      for (const it of items) {
        if (!it.pending) continue;
        it.pending = false;
        if (it.kind === 'letters') it.letters.forEach((t) => t.classList.remove('is-hidden'));
      }
      layoutAll();
    },
  };
}
