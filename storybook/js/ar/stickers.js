// Printable name stickers (#/stickers/<book>): a screen-free way to put the
// child's name into the printed book. Every blank name spot in the book (the
// shirt's name panel, the crowd banner, the scoreboard, the trophy plaque, one
// letter per bunting flag...) gets a sticker at the spot's PRINTED size, with
// the name in the same font, colour and case as the reader draws it, on the
// spot's own background colour. The stickers are laid out on A4 portrait
// sheets (10 mm margins, 3 mm gaps, a light grey cut line round each one, a
// label on the backing sheet saying where it goes, and a 50 mm ruler to check
// the print scale). Parents print them on A4 sticker paper; the full product
// sells a kiss-cut sheet as a paid extra.
//
// Sizes: a scene is a 1600-unit-wide spread = two pages of `trimMm`, so one
// scene unit is trimMm * 2 / 1600 mm. Each spot is measured in a hidden render
// of the real scene (getBBox of the name slot, its font size and
// data-max-width, and the slot's scale in the scene), and the name is fitted
// with the reader's own helpers (js/reader/name-fit.js). The spot's colour is
// sampled from a snapshot of the art underneath it.
//
// The pure helpers (sizes, labels, planning, packing, colours) are exported
// and unit-tested (tests/unit/stickers.test.mjs). The module brings its own
// stylesheet (css/stickers.css) and loads the scene helpers lazily, so a
// missing reader module shows a message instead of breaking the screen.

import { bookUrl } from '../core/book.js';
import { fillTemplate } from '../core/personalise.js';
import { layoutName, fitText, twoLineBaselines, nameForForm, slotLetters, distributeLetters, estimateTextWidth } from '../reader/name-fit.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- Sizes (millimetres unless stated) ------------------------------------------------------------

export const SCENE_WIDTH = 1600;
export const DEFAULT_TRIM_MM = 180;
export const A4 = Object.freeze({ w: 210, h: 297 });
export const SHEET = Object.freeze({
  margin: 10, // round the printed area
  gap: 3, // between stickers
  bleed: 1, // background colour carried past the cut line, so a wobbly cut still looks right
  cutLine: 0.2, // light grey cut guide
  head: 30, // title, how-to and the ruler at the top of every sheet
  foot: 6, // "Sheet 1 of 2" at the bottom of the printed area
  labelGap: 1.8, // cut line to label
  labelH: 3.4, // label line
  labelSize: 2.5, // label type size (about 7 pt)
  letterGap: 2.5, // between bunting letters
  numberH: 4, // flag number under a bunting letter (clear of the bleed)
  headingH: 8, // "Amara’s stickers" (siblings)
});
export const RULER_MM = 50;

// Sticker proportions, as fractions of the spot's font size.
const PAD_X = 0.16; // breathing room left and right of the widest name
const PAD_Y = 0.03; // and above and below the font's own line box
const LETTER_DIAMETER = 1.08; // a round bunting sticker sits inside the flag
const LETTER_FIT = 0.74; // widest letter, as a fraction of the circle
const CAP_MIDDLE = 0.35; // an alphabetic baseline sits this far below the capitals' middle
// Mirrors name-fit.js: two lines are each at most this fraction of the drawn size.
const TWO_LINE_MAX = 0.62;

const round = (n, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const positive = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Millimetres per scene unit for a book of this trim (a spread is two pages wide). */
export function mmPerUnit(trimMm = DEFAULT_TRIM_MM) {
  const trim = positive(Number(trimMm)) || DEFAULT_TRIM_MM;
  return (trim * 2) / SCENE_WIDTH;
}

/** Scene units -> printed millimetres. 1600 units = 2 × trimMm. */
export function unitsToMm(units, trimMm = DEFAULT_TRIM_MM) {
  return Number(units) * mmPerUnit(trimMm);
}

// ---- Labels -------------------------------------------------------------------------------------

// What a name spot is, from the ids and artwork around it (nearest first).
const SPOT_WORDS = [
  ['scoreboard', /score/],
  ['shirt', /shirt|jersey|\bkit\b/],
  ['trophy', /\bcup\b|(^|[-_])cup($|[-_])|trophy|plaque|medal/],
  ['ribbon', /ribbon/],
  ['bunting', /bunting|flags?($|[-_])|pennant/],
  ['door', /door/],
  ['plan', /(^|[-_])plans?($|[-_])|blueprint/],
  ['hard hat', /hard-?hat|helmet/],
  ['sign', /(^|[-_])(sign|placard|board)($|[-_])/],
  ['cake', /cake/],
  ['weight', /weight/],
  ['digger', /digger|excavator/],
  ['crane', /crane/],
  ['banner', /banner/],
];
const IGNORED_ART = /^d\d*-(star|sparkle|shadow|glow)/;

/**
 * Name a spot from hints such as ids and the <use> hrefs drawn with it,
 * nearest first ("p2-name", "d-shirt-back", "p2-shirt-up" -> "shirt").
 * @param {string[]} hints
 * @returns {string}
 */
export function spotLabel(hints) {
  for (const raw of hints ?? []) {
    const hint = String(raw ?? '')
      .toLowerCase()
      .replace(/^#/, '');
    if (!hint || IGNORED_ART.test(hint)) continue;
    for (const [word, re] of SPOT_WORDS) if (re.test(hint)) return word;
  }
  return 'name spot';
}

/** "Cover", "Page 2" */
export function pageLabel(page) {
  if (page?.kind === 'cover') return 'Cover';
  return `Page ${page?.n ?? '?'}`;
}

/**
 * The names that each get their own set of stickers: siblings reading
 * together ("Amara & Zak") get one set each.
 * @param {{display?: string, art?: string, count?: number}|string} person
 * @returns {string[]}
 */
export function childNames(person) {
  if (typeof person === 'string') return person.trim() ? [person.trim()] : [];
  const art = String(person?.art ?? person?.display ?? '').trim();
  if (!art) return [];
  if ((person?.count ?? 1) > 1 || /\s&\s/.test(art)) {
    const parts = (/\s&\s/.test(art) ? art.split(/\s+&\s+/) : art.split(/\s*,\s*|\s+and\s+/)).map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts;
  }
  return [art];
}

/** Rough printed width of a label in mm (Andika regular). */
export function estimateLabelWidth(text, sizeMm = SHEET.labelSize) {
  return estimateTextWidth(String(text ?? ''), sizeMm) * 0.9;
}

// ---- Colours ------------------------------------------------------------------------------------

/** '#e4483a' | '#fff' | 'rgb(228, 72, 58)' | 'rgba(...)' -> [r, g, b] (0-255), or null. */
export function parseColour(value) {
  const s = String(value ?? '')
    .trim()
    .toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((v) => clamp(Math.round(Number(v)), 0, 255));
  if (s === 'white') return [255, 255, 255];
  if (s === 'black') return [0, 0, 0];
  return null;
}

export function toHex([r, g, b]) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG relative luminance (0 black .. 1 white). */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colour most of an area is painted in (anti-aliased edges and small
 * details lose the vote). Pixels are RGBA; transparent ones count as paper white.
 * @param {ArrayLike<number>} data RGBA bytes
 * @returns {string|null} '#rrggbb'
 */
export function dominantColour(data) {
  const buckets = new Map();
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3] / 255;
    const r = data[i] * a + 255 * (1 - a);
    const g = data[i + 1] * a + 255 * (1 - a);
    const b = data[i + 2] * a + 255 * (1 - a);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) {
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else buckets.set(key, { n: 1, r, g, b });
  }
  let best = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  return best ? toHex([best.r / best.n, best.g / best.n, best.b / best.n]) : null;
}

/** When the art can't be sampled: white behind dark names, ink behind light ones. */
export function fallbackBackground(fill) {
  const rgb = parseColour(fill);
  return rgb && luminance(rgb) > 0.45 ? '#2B2A33' : '#FFFFFF';
}

// ---- Sticker specs --------------------------------------------------------------------------------

/**
 * A name sticker for one measured name slot, in the slot's own units.
 * @param {{page?: number, pageKind?: string, label?: string, x: number, y: number,
 *   anchor?: 'start'|'middle'|'end', baseline?: string, fontSize: number, maxWidth?: number,
 *   wrap?: boolean, form?: string, bbox?: {x: number, y: number, width: number, height: number}|null,
 *   scale?: number, paint?: object, background?: string|null}} slot
 *   measured in the scene: `bbox` is the slot's getBBox() with the artist's placeholder at
 *   the drawn size, `scale` its size in scene units per slot unit.
 * @param {{trimMm?: number, bleedMm?: number}} [opts]
 */
export function stickerSpecFromSlot(slot, { trimMm = DEFAULT_TRIM_MM, bleedMm = SHEET.bleed } = {}) {
  const fs = positive(Number(slot?.fontSize)) || 64;
  const scale = positive(Number(slot?.scale)) || 1;
  const unitMm = mmPerUnit(trimMm) * scale;
  const x = Number(slot?.x) || 0;
  const y = Number(slot?.y) || 0;
  const anchor = slot?.anchor === 'middle' || slot?.anchor === 'end' ? slot.anchor : 'start';
  const central = /central|middle/.test(String(slot?.baseline ?? ''));
  const bb = slot?.bbox && positive(slot.bbox.height) ? slot.bbox : null;
  const maxWidth = positive(Number(slot?.maxWidth)) || positive(bb?.width) || fs * 4;
  const left = anchor === 'middle' ? x - maxWidth / 2 : anchor === 'end' ? x - maxWidth : x;
  // One line at the drawn size, as the font lays it out (ascent to descent).
  let top = bb ? bb.y : central ? y - 0.6 * fs : y - 0.95 * fs;
  let bottom = bb ? bb.y + bb.height : top + 1.21 * fs;
  if (slot?.wrap) {
    // Room for the two-line layout the reader may choose (name-fit.js).
    const s = fs * TWO_LINE_MAX;
    const [b0, b1] = twoLineBaselines(y, fs, s, central);
    const k = s / fs;
    top = Math.min(top, b0 - (y - top) * k);
    bottom = Math.max(bottom, b1 + (bottom - y) * k);
  }
  // A visible outline (paint-order="stroke", e.g. the cover's white edge) needs room too.
  const stroke = slot?.paint?.stroke ? positive(parseFloat(slot.paint.strokeWidth)) / 2 : 0;
  const padX = PAD_X * fs + stroke;
  const padY = PAD_Y * fs + stroke;
  const box = { x: left - padX, y: top - padY, w: maxWidth + 2 * padX, h: bottom - top + 2 * padY };
  const middle = central ? y : y - CAP_MIDDLE * fs;
  return {
    kind: 'name',
    shape: 'rect',
    page: slot?.page ?? null,
    label: slot?.label ?? 'name spot',
    form: slot?.form === 'upper' || slot?.form === 'poss' ? slot.form : 'plain',
    wrap: Boolean(slot?.wrap),
    box: mapBox(box, round),
    radius: round(Math.min(box.h / 2, 0.24 * fs)),
    scale,
    unitMm,
    mm: { w: round(box.w * unitMm), h: round(box.h * unitMm), bleed: bleedMm },
    text: { x: round(left + maxWidth / 2), y, middle: round(middle), fontSize: fs, maxWidth: round(maxWidth), central },
    paint: slot?.paint ?? {},
    background: slot?.background ?? null,
  };
}

/**
 * A round sticker for one bunting letter slot.
 * @param {{fontSize: number, scale?: number, index?: number, paint?: object, background?: string|null}} slot
 * @param {{trimMm?: number, bleedMm?: number}} [opts]
 */
export function letterSpecFromSlot(slot, { trimMm = DEFAULT_TRIM_MM, bleedMm = SHEET.bleed } = {}) {
  const fs = positive(Number(slot?.fontSize)) || 62;
  const scale = positive(Number(slot?.scale)) || 1;
  const unitMm = mmPerUnit(trimMm) * scale;
  const d = LETTER_DIAMETER * fs;
  return {
    kind: 'letter',
    shape: 'circle',
    flag: Number.isInteger(slot?.index) ? slot.index + 1 : null,
    box: mapBox({ x: -d / 2, y: -d / 2, w: d, h: d }, round),
    radius: round(d / 2),
    scale,
    unitMm,
    mm: { w: round(d * unitMm), h: round(d * unitMm), bleed: bleedMm },
    text: { x: 0, y: round(CAP_MIDDLE * fs), middle: 0, fontSize: fs, maxWidth: round(LETTER_FIT * d), central: false },
    paint: slot?.paint ?? {},
    background: slot?.background ?? null,
  };
}

function mapBox(b, f) {
  return { x: f(b.x), y: f(b.y), w: f(b.w), h: f(b.h) };
}

// ---- Planning -------------------------------------------------------------------------------------

/**
 * Which stickers each child gets, from the measured spots of every page.
 * @param {Array<{n: number, kind?: string, spots: Array<object>}>} pages measured pages:
 *   spots in document order, each `{type: 'name', ...slot}` or
 *   `{type: 'letters', label, letters: slot[], overflow: slot|null}`
 * @param {string[]} children one name per child
 * @param {{trimMm?: number, spares?: boolean}} [opts]
 * @returns {Array<object>} entries: `heading` | `name` | `letters`
 */
export function planStickers(pages, children, { trimMm = DEFAULT_TRIM_MM, spares = true } = {}) {
  const entries = [];
  const several = children.length > 1;
  const specOpts = { trimMm };
  for (const [c, child] of children.entries()) {
    const heading = several ? { type: 'heading', child: c, name: child, text: `${child}’s stickers`, keepWith: 0 } : null;
    const start = entries.length;
    if (heading) entries.push(heading);
    const letters = slotLetters(child);
    let spareSource = null;
    for (const page of pages ?? []) {
      const where = pageLabel(page);
      for (const spot of page.spots ?? []) {
        if (spot.type === 'name') {
          const spec = stickerSpecFromSlot({ ...spot, page: page.n }, specOpts);
          entries.push({ type: 'name', child: c, name: child, page: page.n, label: `${where} · ${spot.label ?? 'name spot'}`, text: nameForForm(child, spec.form), spec });
        } else if (spot.type === 'letters') {
          const slots = spot.letters ?? [];
          const dist = distributeLetters(letters, slots.length);
          if (dist) {
            const items = [];
            dist.forEach((letter, i) => letter && items.push({ text: letter, flag: i + 1, spec: letterSpecFromSlot({ ...slots[i], index: i }, specOpts) }));
            entries.push({ type: 'letters', child: c, name: child, page: page.n, label: `${where} · ${spot.label ?? 'bunting'} flags (count from the left)`, numbered: true, items });
          } else if (spot.overflow) {
            const spec = stickerSpecFromSlot({ ...spot.overflow, page: page.n }, specOpts);
            entries.push({ type: 'name', child: c, name: child, page: page.n, label: `${where} · across the ${spot.label ?? 'bunting'}`, text: nameForForm(child, spec.form), spec });
          }
          spareSource ??= slots;
        }
      }
    }
    // A spare set of the first letter, one in each flag colour (lost stickers, wonky first tries).
    if (spares && letters && spareSource?.length) {
      const seen = new Set();
      const items = [];
      for (const [i, slot] of spareSource.entries()) {
        const key = `${slot.background ?? ''}|${slot.paint?.fill ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ text: letters[0], flag: null, spec: letterSpecFromSlot({ ...slot, index: i }, specOpts) });
        if (items.length === 3) break;
      }
      entries.push({ type: 'letters', child: c, name: child, page: null, label: 'Spare first letters', numbered: false, spare: true, items });
    }
    // Each child's set stays on one sheet when it can.
    if (heading) heading.keepWith = entries.length - start - 1;
  }
  return entries;
}

/**
 * The size of each entry on the sheet (mm) and where its parts sit inside it.
 * @param {object} entry from planStickers
 * @param {{areaW?: number}} [opts] width of the printable area
 * @returns {{w: number, h: number, newRow?: boolean, keepWith?: number, fullWidth?: boolean,
 *   parts: Array<{x: number, y: number, w: number, h: number, item?: object, number?: number|null}>, label: {x: number, y: number, w: number}|null}}
 */
export function sizeEntry(entry, { areaW = A4.w - 2 * SHEET.margin } = {}) {
  const { labelGap, labelH, letterGap, numberH, headingH } = SHEET;
  if (entry.type === 'heading') return { w: areaW, h: headingH, newRow: true, fullWidth: true, keepWith: Math.max(1, entry.keepWith ?? 1), parts: [], label: null };
  const labelW = Math.min(areaW, estimateLabelWidth(entry.label));
  if (entry.type === 'name') {
    const { w, h } = entry.spec.mm;
    const W = Math.max(w, labelW);
    return { w: round(W, 3), h: round(h + labelGap + labelH, 3), parts: [{ x: round((W - w) / 2, 3), y: 0, w, h, item: entry }], label: { x: 0, y: round(h + labelGap, 3), w: round(W, 3) } };
  }
  // Letters: a row (or rows) of circles in order, each with its flag number.
  const items = entry.items ?? [];
  const d = Math.max(0, ...items.map((it) => it.spec.mm.w));
  const numH = entry.numbered ? numberH : 0;
  const perRow = Math.max(1, Math.floor((areaW + letterGap) / (d + letterGap)));
  const cols = Math.min(items.length, perRow);
  const rows = Math.ceil(items.length / perRow);
  const groupW = cols * d + Math.max(0, cols - 1) * letterGap;
  const W = Math.max(groupW, labelW);
  const off = (W - groupW) / 2;
  const parts = items.map((it, i) => ({
    x: round(off + (i % perRow) * (d + letterGap) + (d - it.spec.mm.w) / 2, 3),
    y: round(Math.floor(i / perRow) * (d + numH + letterGap), 3),
    w: it.spec.mm.w,
    h: it.spec.mm.h,
    item: it,
    number: entry.numbered ? it.flag : null,
  }));
  const bodyH = rows * (d + numH) + Math.max(0, rows - 1) * letterGap;
  return { w: round(W, 3), h: round(bodyH + labelGap + labelH, 3), parts, label: { x: 0, y: round(bodyH + labelGap, 3), w: round(W, 3) } };
}

/**
 * Shelf packing onto A4: items keep their order, fill rows left to right,
 * rows top to bottom, and spill onto as many sheets as needed.
 * @param {Array<{w: number, h: number, newRow?: boolean, fullWidth?: boolean, keepWith?: number}>} items sizes in mm.
 *   newRow: start a new row; fullWidth: nothing else shares its row; keepWith: keep this many
 *   following items on the same sheet when they would fit together on a fresh one (a heading
 *   and its set), and never leave the item alone at the bottom of a sheet.
 * @param {{pageW?: number, pageH?: number, margin?: number, gap?: number, top?: number, bottom?: number}} [opts]
 *   top/bottom: space kept free inside the margins (the sheet's header and footer)
 * @returns {{sheets: Array<{items: Array<{index: number, x: number, y: number, w: number, h: number}>}>, oversize: number[],
 *   area: {x: number, y: number, w: number, h: number}}} positions are mm from the sheet's top-left corner
 */
export function packStickers(items, { pageW = A4.w, pageH = A4.h, margin = SHEET.margin, gap = SHEET.gap, top = 0, bottom = 0 } = {}) {
  const EPS = 1e-6;
  const left = margin;
  const right = pageW - margin;
  const startY = margin + top;
  const maxY = pageH - margin - bottom;
  const list = Array.isArray(items) ? items.map((it) => it ?? {}) : [];
  const dim = (v) => Math.max(0, Number(v) || 0);
  const fresh = () => ({ x: left, y: startY, rowH: 0 });

  // Where an item goes from `st` without a new sheet: {pos, next}, or null if it won't fit.
  const tryPlace = (st, it, force = false) => {
    let { x, y, rowH } = st;
    const w = dim(it.w);
    const h = dim(it.h);
    const breakRow = () => {
      if (x > left + EPS || rowH > 0) {
        y += rowH + gap;
        x = left;
        rowH = 0;
      }
    };
    if (it.newRow) breakRow();
    if (x > left + EPS && x + w > right + EPS) breakRow();
    if (!force && y + h > maxY + EPS) return null;
    const pos = { x, y, w, h };
    rowH = Math.max(rowH, h);
    x += w + gap;
    if (it.fullWidth) breakRow();
    return { pos, next: { x, y, rowH } };
  };
  const fitsAll = (st, from, to) => {
    let cur = st;
    for (let k = from; k <= to && k < list.length; k++) {
      const r = tryPlace(cur, list[k]);
      if (!r) return false;
      cur = r.next;
    }
    return true;
  };

  const sheets = [];
  const oversize = [];
  let sheet = null;
  let st = fresh();
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (dim(it.w) > right - left + EPS || dim(it.h) > maxY - startY + EPS) oversize.push(i);
    if (!sheet) {
      sheet = { items: [] };
      sheets.push(sheet);
    } else if (sheet.items.length) {
      const k = Math.max(0, Math.floor(Number(it.keepWith) || 0));
      let needNew = !tryPlace(st, it);
      if (!needNew && k && !fitsAll(st, i, i + k)) needNew = fitsAll(fresh(), i, i + k) || !fitsAll(st, i, i + 1);
      if (needNew) {
        sheet = { items: [] };
        sheets.push(sheet);
        st = fresh();
      }
    }
    // Too big even for an empty sheet: it goes at the top and is reported in `oversize`.
    const r = tryPlace(st, it) ?? tryPlace(st, it, true);
    sheet.items.push({ index: i, ...r.pos });
    st = r.next;
  }
  return { sheets, oversize, area: { x: left, y: startY, w: right - left, h: maxY - startY } };
}

// ---- DOM: measuring the spots ------------------------------------------------------------------------

function safeStyle(el) {
  try {
    return globalThis.getComputedStyle?.(el) ?? null;
  } catch {
    return null;
  }
}

const firstNumber = (v) => {
  const n = parseFloat(String(v ?? '').trim().split(/[\s,]+/)[0]);
  return Number.isFinite(n) ? n : 0;
};

function paintOf(el) {
  const cs = safeStyle(el);
  const attr = (n) => el.getAttribute(n);
  const stroke = attr('stroke') || (cs?.stroke && cs.stroke !== 'none' ? cs.stroke : null);
  return {
    fill: attr('fill') || cs?.fill || '#2B2A33',
    stroke: stroke && stroke !== 'none' ? stroke : null,
    strokeWidth: stroke ? attr('stroke-width') || cs?.strokeWidth || null : null,
    paintOrder: attr('paint-order') || null,
    strokeLinejoin: attr('stroke-linejoin') || null,
    fontFamily: attr('font-family') || cs?.fontFamily || 'Fredoka, Andika, sans-serif',
    fontWeight: attr('font-weight') || cs?.fontWeight || '700',
    fontStyle: attr('font-style') || null,
    letterSpacing: attr('letter-spacing') || null,
  };
}

/** Ids and artwork near a slot, nearest first, for spotLabel(). */
function spotHints(el, root) {
  const hints = [];
  const push = (v) => v && hints.push(String(v));
  push(el.getAttribute('data-spot'));
  push(el.id);
  let node = el;
  for (let depth = 0; node && node !== root && depth < 6; depth++) {
    const parent = node.parentNode;
    if (!parent || parent.nodeType !== 1) break;
    for (const sib of parent.children) if (sib !== node && sib.localName === 'use') push(sib.getAttribute('href') ?? sib.getAttribute('xlink:href'));
    if (parent === root) break;
    push(parent.getAttribute('data-spot'));
    push(parent.id);
    node = parent;
  }
  return hints;
}

function pickById(root, sel) {
  if (typeof sel !== 'string' || !sel.startsWith('#')) return null;
  return [...root.querySelectorAll('[id]')].find((e) => e.id === sel.slice(1)) ?? null;
}

/** Slot units -> scene units: the slot's own transform and everything above it. */
function toScene(svg, el) {
  try {
    const rootM = svg.getScreenCTM();
    const elM = el.getScreenCTM();
    if (!rootM || !elM) return null;
    const m = rootM.inverse().multiply(elM);
    return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
  } catch {
    return null;
  }
}

function measureText(el, placeholder) {
  if (!el.textContent.trim()) el.textContent = placeholder;
  let bbox = null;
  try {
    const b = el.getBBox();
    if (b && b.height > 0) bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {
    /* not rendered */
  }
  return bbox;
}

function measureSlot(el, svg, placeholder = 'NAME') {
  const cs = safeStyle(el);
  const m = toScene(svg, el);
  return {
    key: el.getAttribute('data-st-key'),
    x: firstNumber(el.getAttribute('x')),
    y: firstNumber(el.getAttribute('y')),
    anchor: el.getAttribute('text-anchor') || cs?.textAnchor || 'start',
    baseline: el.getAttribute('dominant-baseline') || cs?.dominantBaseline || '',
    fontSize: parseFloat(el.getAttribute('font-size') ?? '') || parseFloat(cs?.fontSize ?? '') || 64,
    maxWidth: parseFloat(el.getAttribute('data-max-width') ?? '') || 0,
    wrap: el.getAttribute('data-wrap') === '2',
    form: el.getAttribute('data-form') || 'plain',
    bbox: measureText(el, placeholder),
    scale: m ? Math.hypot(m.a, m.b) || 1 : 1,
    matrix: m,
    paint: paintOf(el),
    background: null,
  };
}

/**
 * Measure every name spot on one page. The scene must be in the document.
 * Letter groups whose overflow banner is a name slot keep it as their fallback.
 */
function measureScene(svg) {
  // Make everything measurable: spots that only appear later (under a flap,
  // after the wheel turns) still have a place in the printed book.
  for (const el of svg.querySelectorAll('[display]')) if (el.getAttribute('display') === 'none') el.removeAttribute('display');
  for (const el of svg.querySelectorAll('[style]')) if (el.style?.display === 'none') el.style.removeProperty('display');
  const inDigital = (el) => Boolean(el.closest?.('.sb-digital'));
  const groups = [...svg.querySelectorAll('.sb-letters')].filter((g) => !inDigital(g));
  // data-overflow names the banner shown when the letters don't fit: a name
  // slot, or a group with one inside.
  const overflowSlot = (g) => {
    const o = pickById(svg, g.getAttribute('data-overflow'));
    return o?.matches?.('text.sb-name') ? o : o?.querySelector?.('text.sb-name') ?? null;
  };
  const overflowOf = new Map();
  for (const g of groups) {
    const o = overflowSlot(g);
    if (o) overflowOf.set(o, g);
  }
  const spots = [];
  const order = [...svg.querySelectorAll('text.sb-name, .sb-letters')];
  for (const el of order) {
    if (inDigital(el)) continue;
    if (el.matches('text.sb-name')) {
      if (overflowOf.has(el) || el.closest('.sb-letters')) continue;
      spots.push({ type: 'name', ...measureSlot(el, svg), label: spotLabel(spotHints(el, svg)) });
    } else {
      const texts = [...el.querySelectorAll('text.sb-letter')];
      if (!texts.length) continue;
      const letters = texts.map((t, index) => ({ ...measureSlot(t, svg, 'A'), index }));
      const o = overflowSlot(el);
      const overflow = o ? measureSlot(o, svg) : null;
      const label = spotLabel(spotHints(el, svg));
      spots.push({ type: 'letters', key: el.getAttribute('data-st-key'), label: label === 'name spot' ? 'bunting' : label, letters, overflow });
    }
  }
  return spots;
}

// ---- DOM: sampling the colour under a spot ----------------------------------------------------------

function sceneBounds(m, box) {
  const pts = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

const shrink = (r, f) => ({ x: r.x + r.w * f, y: r.y + r.h * f, w: r.w * (1 - 2 * f), h: r.h * (1 - 2 * f) });

/**
 * A standalone SVG of the art that lies under `target`: names blank, the
 * faint print-only star and screen-only extras gone, the target's hidden
 * ancestors shown, and everything painted after it (flaps, characters,
 * sparkles) removed.
 */
function snapshotXml(raw, key, region, px, defsXml) {
  const svg = raw.cloneNode(true);
  const target = svg.querySelector(`[data-st-key="${key}"]`);
  if (!target) return null;
  for (const t of svg.querySelectorAll('text.sb-name, .sb-letters text')) t.textContent = '';
  for (const el of svg.querySelectorAll('.sb-print-only, .sb-digital')) if (!el.contains(target)) el.remove();
  for (let n = target; n && n !== svg; n = n.parentNode) {
    n.removeAttribute('display');
    n.style?.removeProperty?.('display');
    while (n.nextSibling) n.nextSibling.remove();
  }
  svg.setAttribute('viewBox', `${region.x} ${region.y} ${region.w} ${region.h}`);
  svg.setAttribute('width', String(px.w));
  svg.setAttribute('height', String(px.h));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.removeAttribute('class');
  svg.removeAttribute('style');
  const xml = new XMLSerializer().serializeToString(svg);
  return defsXml ? xml.replace(/^(<svg\b[^>]*>)/, `$1${defsXml}`) : xml;
}

async function rasterise(xml, px) {
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = px.w;
    canvas.height = px.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, px.w, px.h);
    ctx.drawImage(img, 0, 0, px.w, px.h);
    return ctx.getImageData(0, 0, px.w, px.h); // throws if the browser treats the image as foreign
  } finally {
    URL.revokeObjectURL(url);
  }
}

function subImage(image, rect) {
  const x0 = clamp(Math.floor(rect.x), 0, image.width - 1);
  const y0 = clamp(Math.floor(rect.y), 0, image.height - 1);
  const x1 = clamp(Math.ceil(rect.x + rect.w), x0 + 1, image.width);
  const y1 = clamp(Math.ceil(rect.y + rect.h), y0 + 1, image.height);
  const out = new Uint8ClampedArray((x1 - x0) * (y1 - y0) * 4);
  let o = 0;
  for (let y = y0; y < y1; y++) {
    const row = (y * image.width + x0) * 4;
    out.set(image.data.subarray(row, row + (x1 - x0) * 4), o);
    o += (x1 - x0) * 4;
  }
  return out;
}

/**
 * Fill in `background` on every spot of a page from snapshots of its art. Never throws.
 * `state.blocked` is set (and later calls skip) when the browser won't let pixels be read.
 */
async function sampleBackgrounds(raw, spots, defsXml, { trimMm, state = {} }) {
  const sampleOne = async (key, regions) => {
    const all = regions.reduce((a, r) => (a ? { x: Math.min(a.x, r.x), y: Math.min(a.y, r.y), x2: Math.max(a.x2, r.x + r.w), y2: Math.max(a.y2, r.y + r.h) } : { x: r.x, y: r.y, x2: r.x + r.w, y2: r.y + r.h }), null);
    const region = { x: all.x, y: all.y, w: Math.max(1, all.x2 - all.x), h: Math.max(1, all.y2 - all.y) };
    const k = Math.min(1, 240 / region.w, 160 / region.h); // pixels per scene unit
    const px = { w: Math.max(4, Math.round(region.w * k)), h: Math.max(4, Math.round(region.h * k)) };
    const xml = snapshotXml(raw, key, region, px, defsXml);
    if (!xml) return regions.map(() => null);
    const image = await rasterise(xml, px);
    return regions.map((r) => dominantColour(subImage(image, { x: (r.x - region.x) * k, y: (r.y - region.y) * k, w: Math.max(1, r.w * k), h: Math.max(1, r.h * k) })));
  };
  for (const spot of spots) {
    if (state.blocked) return;
    try {
      if (spot.type === 'name' && spot.matrix) {
        const spec = stickerSpecFromSlot(spot, { trimMm });
        [spot.background] = await sampleOne(spot.key, [shrink(sceneBounds(spot.matrix, spec.box), 0.1)]);
      } else if (spot.type === 'letters') {
        const withM = spot.letters.filter((l) => l.matrix);
        const regions = withM.map((l) => {
          const fs = l.fontSize;
          // Round the letter's own middle (where the reader draws it on the flag).
          const box = { x: l.x - 0.28 * fs, y: l.y - CAP_MIDDLE * fs - 0.28 * fs, w: 0.56 * fs, h: 0.56 * fs };
          return sceneBounds(l.matrix, box);
        });
        if (regions.length) (await sampleOne(spot.key, regions)).forEach((c, i) => (withM[i].background = c));
        if (spot.overflow?.matrix) {
          const spec = stickerSpecFromSlot(spot.overflow, { trimMm });
          [spot.overflow.background] = await sampleOne(spot.overflow.key, [shrink(sceneBounds(spot.overflow.matrix, spec.box), 0.1)]);
        }
      }
    } catch (err) {
      // A browser that won't let us read the snapshot: plain colours from the name's own colour.
      if (err?.name === 'SecurityError') state.blocked = true;
      console.warn('[stickers] could not sample the art under a name spot', err?.message ?? err);
    }
  }
}

/**
 * Measure every name spot in a book: loads each scene into a hidden render,
 * reads the slots (position, size, font, colour, scale in the scene) and
 * samples the colour of the art under each one. Also handy for tools and tests.
 * @param {object} book
 * @param {{baseUrl?: string, trimMm?: number, signal?: AbortSignal}} [opts]
 * @returns {Promise<{pages: Array<{n: number, kind: string, spots: object[]}>, missing: number[]}>}
 *   pages with at least one spot; `missing` lists pages whose picture didn't load
 */
export async function measureBookSpots(book, { baseUrl, trimMm = DEFAULT_TRIM_MM, signal } = {}) {
  const sceneMod = await import('../reader/scene.js');
  const base = baseUrl ?? bookUrl(book?.id);
  const host = document.createElement('div');
  host.className = 'st-hidden-render';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;left:-40000px;top:0;width:1600px;height:1000px;visibility:hidden;pointer-events:none;overflow:hidden;contain:strict';
  document.body.appendChild(host);
  const pages = [];
  const missing = [];
  const sampling = { blocked: false };
  try {
    let defsXml = '';
    const holder = await sceneMod.loadDefs?.(book, base).catch(() => null);
    if (holder) {
      const defs = svgEl('defs');
      for (const c of holder.childNodes) defs.appendChild(c.cloneNode(true));
      defsXml = new XMLSerializer().serializeToString(defs);
    }
    await fontsSettled();
    for (const page of Array.isArray(book?.pages) ? book.pages : []) {
      if (signal?.aborted) break;
      try {
        const svg = await sceneMod.loadScene(book, page, base);
        let k = 0;
        for (const el of svg.querySelectorAll('text.sb-name, .sb-letters')) el.setAttribute('data-st-key', `k${k++}`);
        const raw = svg.cloneNode(true);
        svg.setAttribute('width', '1600');
        svg.setAttribute('height', '1000');
        host.replaceChildren(svg);
        const spots = measureScene(svg);
        await sampleBackgrounds(raw, spots, defsXml, { trimMm, state: sampling });
        if (spots.length) pages.push({ n: page.n, kind: page.kind ?? 'spread', spots });
      } catch (err) {
        console.warn(`[stickers] page ${page?.n}: ${err?.message ?? err}`);
        missing.push(page?.n);
      }
    }
  } finally {
    host.remove();
  }
  return { pages, missing };
}

// ---- DOM: drawing ---------------------------------------------------------------------------------

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  return el;
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const mm = (n) => `calc(var(--st-mm) * ${round(n, 3)})`;
const place = (x, y, w, h) => `left:${mm(x)};top:${mm(y)};width:${mm(w)};height:${mm(h)}`;

function makeMeasurer(host) {
  const probe = svgEl('text', { x: 0, y: -500, 'aria-hidden': 'true' });
  host.appendChild(probe);
  const measure = (text, fontSize, paint = {}) => {
    try {
      probe.setAttribute('font-family', paint.fontFamily || 'Fredoka, Andika, sans-serif');
      probe.setAttribute('font-weight', paint.fontWeight || '700');
      probe.setAttribute('font-style', paint.fontStyle || 'normal');
      probe.setAttribute('font-size', String(fontSize));
      probe.setAttribute('letter-spacing', paint.letterSpacing || '0');
      probe.textContent = text;
      const w = probe.getComputedTextLength();
      if (w > 0) return w;
    } catch {
      /* not rendered */
    }
    return estimateTextWidth(text, fontSize);
  };
  return { measure, done: () => probe.remove() };
}

function applyPaint(t, paint) {
  const set = (k, v) => (v != null && v !== '' ? t.setAttribute(k, String(v)) : t.removeAttribute(k));
  set('fill', paint.fill || '#2B2A33');
  set('stroke', paint.stroke);
  set('stroke-width', paint.stroke ? paint.strokeWidth : null);
  set('paint-order', paint.paintOrder);
  set('stroke-linejoin', paint.strokeLinejoin);
  set('font-family', paint.fontFamily || 'Fredoka, Andika, sans-serif');
  set('font-weight', paint.fontWeight || '700');
  set('font-style', paint.fontStyle);
}

/** Write (or rewrite) the name into a sticker's <text>, fitted like the reader fits it. */
function drawText(t, spec, text, measure) {
  const { fontSize, maxWidth, x, middle } = spec.text;
  const m = (s, fs) => measure(s, fs, spec.paint);
  let layout;
  if (spec.kind === 'letter') layout = { lines: [text], ...fitText(m(text, fontSize), fontSize, maxWidth, { chars: 1 }) };
  else layout = layoutName({ text, fontSize, maxWidth, wrap: spec.wrap, measure: m });
  t.textContent = '';
  t.setAttribute('font-size', String(round(layout.fontSize)));
  const spacing = layout.letterSpacing ? round(layout.letterSpacing) : spec.paint.letterSpacing;
  if (spacing) t.setAttribute('letter-spacing', String(spacing));
  else t.removeAttribute('letter-spacing');
  if (layout.squeeze && maxWidth > 0) {
    t.setAttribute('textLength', String(round(maxWidth)));
    t.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  } else {
    t.removeAttribute('textLength');
    t.removeAttribute('lengthAdjust');
  }
  // Centred in the sticker: a shrunk name stays in the middle of the spot.
  const cap = spec.text.central ? 0 : CAP_MIDDLE;
  if (layout.lines.length === 1) {
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(round(middle + cap * layout.fontSize)));
    t.textContent = layout.lines[0];
  } else {
    const baselines = twoLineBaselines(middle + cap * fontSize, fontSize, layout.fontSize, spec.text.central);
    layout.lines.forEach((line, i) => {
      const span = svgEl('tspan', { x, y: round(baselines[i]) });
      span.textContent = line;
      t.appendChild(span);
    });
  }
  return layout;
}

function stickerArt(spec, text, { measure, testid = 'sticker', data = {} }) {
  const bleedU = SHEET.bleed / spec.unitMm;
  const cutU = SHEET.cutLine / spec.unitMm;
  const { box } = spec;
  const bg = spec.background || fallbackBackground(spec.paint.fill);
  const svg = svgEl('svg', {
    class: `st-art st-art-${spec.kind}`,
    viewBox: `${round(box.x - bleedU, 3)} ${round(box.y - bleedU, 3)} ${round(box.w + 2 * bleedU, 3)} ${round(box.h + 2 * bleedU, 3)}`,
    role: 'img',
    'aria-label': text,
    'data-testid': testid,
    'data-text': text,
    'data-mm-w': spec.mm.w,
    'data-mm-h': spec.mm.h,
    'data-bg': bg,
  });
  for (const [k, v] of Object.entries(data)) if (v != null) svg.setAttribute(`data-${k}`, String(v));
  svg.style.cssText = place(-SHEET.bleed, -SHEET.bleed, spec.mm.w + 2 * SHEET.bleed, spec.mm.h + 2 * SHEET.bleed);
  if (spec.shape === 'circle') {
    svg.append(svgEl('circle', { class: 'st-bleed', cx: 0, cy: 0, r: round(spec.radius + bleedU, 3), fill: bg }));
  } else {
    svg.append(svgEl('rect', { class: 'st-bleed', x: round(box.x - bleedU, 3), y: round(box.y - bleedU, 3), width: round(box.w + 2 * bleedU, 3), height: round(box.h + 2 * bleedU, 3), rx: round(spec.radius + bleedU, 3), fill: bg }));
  }
  const t = svgEl('text', { class: 'st-name', 'text-anchor': 'middle', 'aria-hidden': 'true' });
  applyPaint(t, spec.paint);
  svg.append(t);
  const layout = drawText(t, spec, text, measure);
  svg.setAttribute('data-font-size', String(round(layout.fontSize)));
  const cut = spec.shape === 'circle' ? svgEl('circle', { cx: 0, cy: 0, r: spec.radius }) : svgEl('rect', { x: box.x, y: box.y, width: box.w, height: box.h, rx: spec.radius });
  cut.setAttribute('class', 'st-cut');
  cut.setAttribute('fill', 'none');
  cut.setAttribute('stroke', '#B8B4C2');
  cut.setAttribute('stroke-width', String(round(cutU, 3)));
  svg.append(cut);
  return { svg, text: t };
}

function rulerSvg() {
  // 50 mm in five 10 mm blocks (dark, light, dark, light, dark): the dark ends
  // are exactly 50 mm apart, so a ruler (or a test) can check them.
  const svg = svgEl('svg', { class: 'st-ruler-bar', viewBox: '0 0 50 7', 'aria-hidden': 'true', 'data-testid': 'sticker-ruler' });
  for (let i = 0; i < 5; i++) svg.append(svgEl('rect', { x: i * 10, y: 0, width: 10, height: 2.6, fill: i % 2 ? '#FFFFFF' : '#2B2A33' }));
  svg.append(svgEl('rect', { x: 0.06, y: 0.06, width: 49.88, height: 2.48, fill: 'none', stroke: '#2B2A33', 'stroke-width': 0.12 }));
  for (let i = 0; i <= 5; i++) {
    svg.append(svgEl('rect', { x: clamp(i * 10 - 0.06, 0, 49.88), y: 2.6, width: 0.12, height: 1.1, fill: '#2B2A33' }));
    const anchor = i === 0 ? 'start' : i === 5 ? 'end' : 'middle';
    const label = svgEl('text', { x: i * 10, y: 6.3, 'font-size': 2.3, 'text-anchor': anchor, fill: '#4A4754', 'font-family': 'Andika, sans-serif' });
    label.textContent = i === 5 ? '5 cm' : String(i);
    svg.append(label);
  }
  return svg;
}

// ---- Stylesheet, printing -------------------------------------------------------------------------

const CSS_URL = (() => {
  try {
    return new URL('../../css/stickers.css', import.meta.url).href;
  } catch {
    return 'css/stickers.css';
  }
})();

/** Load css/stickers.css once. Resolves when it has loaded (or failed, or after 3 s). */
export function ensureStylesheet(doc = globalThis.document) {
  if (!doc?.head) return Promise.resolve(false);
  let link = doc.querySelector('link[data-sb-stickers-css]');
  if (link?.dataset.loaded) return Promise.resolve(true);
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    link.setAttribute('data-sb-stickers-css', '');
    doc.head.appendChild(link);
  }
  return new Promise((resolve) => {
    const done = (ok) => {
      if (ok) link.dataset.loaded = '1';
      resolve(ok);
    };
    link.addEventListener('load', () => done(true), { once: true });
    link.addEventListener('error', () => done(false), { once: true });
    setTimeout(() => resolve(Boolean(link.sheet)), 3000);
  });
}

/**
 * While the sheets are on screen, printing prints only them: every ancestor
 * of `wrap` is marked, and css/stickers.css hides everything off that path.
 * The page size (A4 portrait) is set here too, since other printable screens
 * use A4 landscape (css/ar.css). Chrome lets a later stylesheet's @page win
 * even over a named page, so the rule goes last in <head>, and moves back to
 * the end just before printing in case another stylesheet arrived since.
 */
function claimPrint(wrap) {
  const marked = [];
  for (let n = wrap.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    n.classList.add('st-path');
    marked.push(n);
  }
  document.documentElement.classList.add('st-printing');
  const style = document.createElement('style');
  style.setAttribute('data-sb-stickers-page', '');
  style.textContent = '@page st-a4 { size: A4 portrait; margin: 0; } @page { size: A4 portrait; margin: 0; }';
  document.head.appendChild(style);
  const lastInHead = () => {
    if (style.isConnected && style !== document.head.lastElementChild) document.head.appendChild(style);
  };
  globalThis.addEventListener?.('beforeprint', lastInHead);
  return () => {
    globalThis.removeEventListener?.('beforeprint', lastInHead);
    for (const n of marked) n.classList.remove('st-path');
    if (!document.querySelector('.st[data-testid="sticker-sheets"]:not([data-released])')) document.documentElement.classList.remove('st-printing');
    style.remove();
  };
}

async function fontsSettled(ms = 2500) {
  const fonts = document.fonts;
  if (!fonts) return;
  try {
    await Promise.race([Promise.all([fonts.load('700 64px Fredoka'), fonts.load('400 16px Andika')]).then(() => fonts.ready), new Promise((r) => setTimeout(r, ms))]);
  } catch {
    /* fonts are a nicety */
  }
}

// ---- The screen -----------------------------------------------------------------------------------

const PRINT_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M7 9V3.5h10V9M7 17H4.5V10.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5V17H17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><rect x="7" y="14" width="10" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

/**
 * Render printable name-sticker sheets for one book into `root`.
 * @param {HTMLElement} root
 * @param {{book: object, bookId?: string, baseUrl?: string,
 *   person: {display: string, art?: string, count?: number}|string, trimMm?: number,
 *   printButton?: boolean, signal?: AbortSignal}} opts
 *   person: as for the reader (`togetherPerson(...)` for siblings: each child gets a set);
 *   trimMm: the printed page width (a spread is two pages); printButton: false when the
 *   surrounding screen has its own Print button.
 * @returns {Promise<() => void>} cleanup
 */
export async function renderStickerSheet(root, { book, bookId = book?.id, baseUrl, person, trimMm = DEFAULT_TRIM_MM, printButton = true, signal } = {}) {
  const life = new AbortController();
  signal?.addEventListener('abort', () => life.abort(), { once: true });
  const trim = clamp(positive(Number(trimMm)) || DEFAULT_TRIM_MM, 60, 600);
  const base = baseUrl ?? (bookId ? bookUrl(bookId) : '');
  const cssReady = ensureStylesheet();
  const pages = Array.isArray(book?.pages) ? book.pages : [];
  const children = childNames(person);
  let storyTitle = typeof person === 'string' ? person : String(person?.display ?? children.join(' and '));
  try {
    if (book?.title) storyTitle = fillTemplate(book.title, person);
  } catch {
    /* keep the name */
  }
  const title = `Name stickers for ${storyTitle}`;

  const status = h('p', { class: 'st-status', role: 'status', 'data-testid': 'sticker-status' }, 'Making your stickers…');
  const printBtn = printButton
    ? h('button', { type: 'button', class: 'st-print-btn', 'data-testid': 'sticker-print', onClick: () => window.print() }, h('span', { class: 'st-print-icon' }), 'Print')
    : null;
  if (printBtn) printBtn.firstChild.innerHTML = PRINT_ICON;
  const firstName = children[0] ?? 'your child';
  const intro = h(
    'section',
    { class: 'st-intro', 'data-testid': 'sticker-intro', 'aria-labelledby': 'st-intro-title' },
    h(
      'div',
      { class: 'st-intro-text' },
      h('h2', { id: 'st-intro-title' }, 'Name stickers for the printed book'),
      h('p', {}, `A screen-free way to put ${children.length > 1 ? 'each child’s' : `${firstName}’s`} name in the pictures. Print these on A4 sticker paper, cut round each sticker and pop it on the matching star in the book.`),
      h(
        'ul',
        { class: 'st-tips' },
        h('li', {}, 'Print at 100% (“actual size”), not “fit to page”, then check the 50 mm bar with a ruler.'),
        h('li', {}, 'No sticker paper? Plain paper and a glue stick work too.'),
      ),
      status,
    ),
    printBtn,
  );
  const sheetsBox = h('div', { class: 'st-sheets', 'data-testid': 'sticker-sheet-list' });
  const measureHost = svgEl('svg', { class: 'st-measure', width: 1, height: 1, 'aria-hidden': 'true', focusable: 'false' });
  const wrap = h('div', { class: 'st', 'data-testid': 'sticker-sheets', 'data-state': 'loading', 'aria-busy': 'true' }, intro, sheetsBox);
  wrap.append(measureHost);
  root.append(wrap);
  const releasePrint = claimPrint(wrap);

  let refitAll = () => {};
  const onFonts = () => refitAll();
  document.fonts?.addEventListener?.('loadingdone', onFonts);

  const cleanup = () => {
    life.abort();
    document.fonts?.removeEventListener?.('loadingdone', onFonts);
    wrap.setAttribute('data-released', '');
    releasePrint();
    wrap.remove();
  };

  const fail = (message) => {
    wrap.dataset.state = 'error';
    wrap.removeAttribute('aria-busy');
    status.textContent = message;
    status.classList.add('is-error');
    if (printBtn) printBtn.disabled = true;
  };

  if (!children.length) {
    fail('Add your child’s name first, then come back for the stickers.');
    return cleanup;
  }

  // ---- 1. Measure every page in a hidden render ----
  let measuredBook = null;
  try {
    measuredBook = await measureBookSpots(book, { baseUrl: base, trimMm: trim, signal: life.signal });
  } catch (err) {
    console.warn('[stickers] could not measure the book', err);
  }
  if (life.signal.aborted) return cleanup;
  if (!measuredBook) {
    fail('The stickers aren’t ready yet. Please try again later.');
    return cleanup;
  }
  const { pages: measured, missing } = measuredBook;

  // ---- 2. Plan, size and pack ----
  const entries = planStickers(measured, children, { trimMm: trim });
  const areaW = A4.w - 2 * SHEET.margin;
  const sized = entries.map((e) => sizeEntry(e, { areaW }));
  const packed = packStickers(sized, { top: SHEET.head, bottom: SHEET.foot });
  if (!entries.length) {
    fail(missing.length ? 'The pictures didn’t load, so there are no stickers yet. Please try again.' : 'This book has no name spots to stick a name on.');
    return cleanup;
  }

  // ---- 3. Draw the sheets ----
  const { measure, done: measureDone } = makeMeasurer(measureHost);
  const drawn = []; // {text, spec, value} for refitting when fonts arrive
  const total = packed.sheets.length;
  let stickerCount = 0;
  const sheets = packed.sheets.map((sheet, s) => {
    const page = h('div', { class: 'st-page' });
    page.append(sheetHeader(title, s === 0));
    const list = h('ul', { class: 'st-list', role: 'list' });
    for (const pos of sheet.items) {
      const entry = entries[pos.index];
      const size = sized[pos.index];
      if (entry.type === 'heading') {
        list.append(h('li', { class: 'st-heading', style: place(pos.x, pos.y, size.w, size.h) }, h('h3', {}, entry.text)));
        continue;
      }
      const li = h('li', { class: `st-item st-item-${entry.type}${entry.spare ? ' st-item-spare' : ''}`, style: place(pos.x, pos.y, size.w, size.h), 'data-page': entry.page ?? '', 'data-child': entry.child });
      for (const part of size.parts) {
        const item = part.item;
        const spec = item.spec;
        const value = item.text;
        const holder = h('div', { class: 'st-sticker', style: place(part.x, part.y, part.w, part.h) });
        const data = { page: entry.page ?? '', kind: entry.spare ? 'spare' : spec.kind, child: entry.name, label: entry.label, flag: part.number ?? null };
        const { svg, text } = stickerArt(spec, value, { measure, data });
        if (spec.kind === 'letter') svg.setAttribute('aria-label', part.number ? `${value}, flag ${part.number}` : `${value}, spare`);
        holder.append(svg);
        if (part.number) holder.append(h('span', { class: 'st-flag-no', 'aria-hidden': 'true' }, String(part.number)));
        li.append(holder);
        drawn.push({ text, spec, value });
        stickerCount++;
      }
      if (size.label) li.append(h('span', { class: 'st-label', style: `left:${mm(size.label.x)};top:${mm(size.label.y)};width:${mm(size.label.w)}` }, entry.label));
      list.append(li);
    }
    page.append(list, h('footer', { class: 'st-foot' }, `Sheet ${s + 1} of ${total}`, book?.subtitle ? ` · ${book.subtitle}` : ''));
    return h('section', { class: 'st-sheet', 'data-testid': 'sticker-sheet', 'data-sheet': s + 1, 'aria-label': `Sticker sheet ${s + 1} of ${total}` }, page);
  });
  sheetsBox.replaceChildren(...sheets);

  refitAll = () => {
    if (life.signal.aborted) return;
    const m = makeMeasurer(measureHost);
    for (const d of drawn) {
      const layout = drawText(d.text, d.spec, d.value, m.measure);
      d.text.parentNode?.setAttribute('data-font-size', String(round(layout.fontSize)));
    }
    m.done();
  };
  measureDone();
  await cssReady;
  if (life.signal.aborted) return cleanup;

  const sheetWord = total === 1 ? 'sheet' : 'sheets';
  status.textContent = `${total} A4 ${sheetWord} · ${stickerCount} stickers${children.length > 1 ? ` · a set for each of ${children.join(' and ')}` : ''}.`;
  if (missing.length) status.textContent += ` Page ${missing.join(', ')} couldn’t be made.`;
  wrap.dataset.state = 'ready';
  wrap.dataset.sheets = String(total);
  wrap.dataset.stickers = String(stickerCount);
  wrap.dataset.trimMm = String(trim);
  wrap.removeAttribute('aria-busy');
  return cleanup;
}

function sheetHeader(title, first) {
  const ruler = h('figure', { class: 'st-ruler' }, rulerSvg(), h('figcaption', {}, 'This bar should measure 50 mm. If it doesn’t, print again at 100%.'));
  return h(
    'header',
    { class: `st-head${first ? ' is-first' : ''}` },
    h(
      'div',
      { class: 'st-head-text' },
      h('p', { class: `st-title${title.length > 40 ? ' is-long' : ''}` }, title),
      h('p', { class: 'st-howto' }, 'Print on A4 sticker paper at 100% scale — not ‘fit to page’. Cut round each sticker and pop it on the matching star in the book.'),
    ),
    ruler,
  );
}
