// "Find your first letter": an early-literacy game for after the story's last
// page. Children learning to recognise and form the first letter of their own
// name (the letter they see most, and the one nurseries start with).
//
// Two steps, once per child (siblings take turns, "Amara & Zak" -> A then Z):
//   1. FIND IT  - the letter floats among a few other big friendly letters and
//                 shapes. "Can you find the letter A? A is for Ava!" A right
//                 tap sparkles ("Yes! A for Ava!"); wrong taps wobble gently
//                 and the voice kindly names what was tapped. Never a buzzer.
//   2. TRACE IT - a huge letter with a numbered start dot, a dotty centre line
//                 and arrows. Crayon ink follows the finger. The letter counts
//                 as traced once the drawn path has passed near ~70% of points
//                 sampled inside the glyph (rendered offscreen in the app's own
//                 font), so wobbly toddler lines still win. "Show me" traces it
//                 by itself (the keyboard and screen-reader route) and counts.
//
// Letters with no stroke guide (other scripts, "Æ", Welsh "Ll") are coloured
// in by outline instead; a letter the device can't draw at all skips tracing.
//
// Self-contained: injects css/activities.css once (no index.html change),
// never throws into the caller, and destroy() stops speech, timers,
// animations and listeners. Pure helpers are exported for unit tests
// (tests/unit/activities-letter-trace.test.mjs).

import { joinNames, possessive } from '../core/personalise.js';

export const TRACE_THRESHOLD = 0.7; // share of glyph sample points the path must pass near
export const MIN_ON_LETTER = 0.25; // share of the drawn path that must be on the letter (not a whole-screen scribble)
export const STYLESHEET_URL = new URL('../../css/activities.css', import.meta.url).href;

const FONT_FAMILY = 'Fredoka, Andika, "Andika New Basic", ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
const FONT_WEIGHT = 600;
const IDLE_MS = 9000;
const TILE_COLOURS = ['#FFD866', '#9ED8F5', '#A8DD8C', '#F9A9B0', '#CDB8F5', '#FFBE7A'];
const TILE_COLOURS_NIGHT = ['#46507F', '#3D5A7A', '#46634F', '#6A4A63', '#54497A', '#6B5540'];
const INK_COLOURS = ['#E8505B', '#2F7DE1', '#2E9E48', '#F08A1C', '#8E5BD6'];
const INK_NIGHT = '#FFD27A';
const CONFETTI = ['#E8505B', '#FFC83D', '#7EC8F0', '#6CC24A', '#FFFFFF', '#3E7BDB', '#F59A2B'];

/** Every word the activity says or shows. Pass `strings` to mountLetterTrace to override (e.g. to translate). */
export const STRINGS = Object.freeze({
  title: 'Find your first letter',
  titleMany: 'Find your first letters',
  kicker: "{name's} letter",
  find: 'Can you find the letter {letter}? {letter} is for {name}!',
  findNext: "Now it's {name's} turn! Can you find the letter {letter}? {letter} is for {name}!",
  found: 'Yes! {letter} for {name}!',
  wrongLetter: "That's {other}. Can you find {letter}?",
  wrongShape: "That's a {other}. Can you find {letter}?",
  trace: 'Now trace the {letter} with your finger. Start at the green dot!',
  traceOutline: 'Now colour in the {letter} with your finger!',
  idle: 'Put your finger on the green dot and follow the arrows.',
  idleOutline: 'Rub your finger all over the letter.',
  wander: 'Follow the dotty line on the letter!',
  well: "Brilliant! That's the letter {letter} — the first letter of {name}!",
  noTrace: "That's the letter {letter} — the first letter of {name}!",
  nothing: 'Well done, {name}!',
  letterLabel: 'Letter {letter}',
  stageLabel: 'Trace the letter {letter} here with your finger, or press Show me to watch it being traced.',
  fieldLabel: 'Letters and shapes',
  skip: 'Skip',
  showMe: 'Show me',
  rubOut: 'Start again',
  again: 'Trace it again',
  next: 'Next letter',
  done: 'Done',
});

const SHAPE_NAMES = Object.freeze({ star: 'star', heart: 'heart', moon: 'moon', flower: 'flower', cloud: 'cloud', leaf: 'leaf' });
export const SHAPES = Object.freeze(Object.keys(SHAPE_NAMES));

// ---- Letters ---------------------------------------------------------------------

/** Split text into user-perceived characters (Intl.Segmenter, else letter + combining marks). */
export function graphemes(text) {
  const s = String(text ?? '');
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      return Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
    }
  } catch {
    /* fall through */
  }
  return s.match(/\P{M}\p{M}*/gsu) ?? [];
}

// Letters of some alphabets that are written with two characters. Only used
// when the caller says which language the name is in.
const DIGRAPHS = Object.freeze({ cy: ['Ch', 'Dd', 'Ff', 'Ll', 'Ph', 'Rh', 'Th'], nl: ['IJ'] });

const langBase = (lang) => String(lang ?? '').toLowerCase().split(/[-_]/)[0];

function upperFor(s, lang) {
  try {
    return s.toLocaleUpperCase(lang || 'en-GB');
  } catch {
    return s.toUpperCase();
  }
}

/**
 * The first letter of a name, in upper case: "ava" -> "A", "élodie" -> "É",
 * "D'Arcy" -> "D", "小明" -> "小", "مريم" -> "م". With `lang: 'cy'` Welsh
 * double letters count as one ("Llinos" -> "Ll"); with 'nl', "IJsbrand" -> "IJ".
 * @returns {string} '' when the name has no letters
 */
export function firstGrapheme(name, { lang = '' } = {}) {
  const gs = graphemes(String(name ?? '').normalize('NFC').trim());
  const i = gs.findIndex((g) => /\p{L}/u.test(g));
  if (i < 0) return '';
  const g = gs[i];
  const pairs = DIGRAPHS[langBase(lang)];
  if (pairs && gs[i + 1]) {
    const two = `${g}${gs[i + 1]}`.toLowerCase();
    const hit = pairs.find((d) => d.toLowerCase() === two);
    if (hit) return hit;
  }
  const up = upperFor(g, lang).normalize('NFC');
  return graphemes(up).length === 1 ? up : g; // "ß" -> "SS" would be two letters: keep it as written
}

const SCRIPT_TESTS = [
  ['latin', /\p{Script=Latin}/u],
  ['greek', /\p{Script=Greek}/u],
  ['cyrillic', /\p{Script=Cyrillic}/u],
  ['arabic', /\p{Script=Arabic}/u],
  ['hebrew', /\p{Script=Hebrew}/u],
  ['devanagari', /\p{Script=Devanagari}/u],
  ['bengali', /\p{Script=Bengali}/u],
  ['gurmukhi', /\p{Script=Gurmukhi}/u],
  ['gujarati', /\p{Script=Gujarati}/u],
  ['tamil', /\p{Script=Tamil}/u],
  ['thai', /\p{Script=Thai}/u],
  ['han', /\p{Script=Han}/u],
  ['hiragana', /\p{Script=Hiragana}/u],
  ['katakana', /\p{Script=Katakana}/u],
  ['hangul', /\p{Script=Hangul}/u],
  ['armenian', /\p{Script=Armenian}/u],
  ['georgian', /\p{Script=Georgian}/u],
  ['ethiopic', /\p{Script=Ethiopic}/u],
];

/** Which writing system a letter belongs to ('latin', 'arabic', 'han', ... or 'other'). */
export function scriptOf(letter) {
  const s = String(letter ?? '');
  if (!s) return '';
  for (const [name, re] of SCRIPT_TESTS) if (re.test(s)) return name;
  return 'other';
}

const BASE_EXTRA = Object.freeze({ Ø: 'O', Ł: 'L', Đ: 'D', Ħ: 'H', Ŧ: 'T' });

/** The plain A-Z letter under an accented capital ("É" -> "E", "Ø" -> "O"); '' when there isn't one. */
export function baseLetter(letter) {
  const s = String(letter ?? '');
  if (graphemes(s).length !== 1) return '';
  const stripped = s.normalize('NFD').replace(/\p{M}/gu, '');
  const b = BASE_EXTRA[stripped] ?? stripped;
  return /^[A-Z]$/.test(b) ? b : '';
}

// Speech engines read a lone "A" as the article ("uh"); UK English says "zed".
const SPOKEN_LETTER = Object.freeze({ A: 'ay', Z: 'zed' });

/** How the voice should say a letter's name. */
export function spokenLetter(letter) {
  return SPOKEN_LETTER[letter] ?? String(letter ?? '');
}

function splitNames(text) {
  return String(text ?? '')
    .split(/\s*&\s*|\s*,\s*|\s+and\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * The letters to play with, one round per distinct first letter. For siblings
 * (person.count > 1) the names come from person.art ("Amara & Zak") or the
 * joined display name; children who share a letter share its round.
 * @param {{display: string, say?: string, art?: string, count?: number}} person
 * @returns {Array<{letter: string, names: string[], says: string[], display: string, say: string}>}
 */
export function initialsFor(person, { lang = '' } = {}) {
  if (!person) return [];
  const display = String(person.display ?? '').trim();
  const say = String(person.say ?? '').trim() || display;
  let names = [display];
  let says = [say];
  if ((person.count | 0) > 1) {
    names = splitNames(person.art ?? display);
    const spoken = splitNames(say);
    says = spoken.length === names.length ? spoken : names.slice();
  }
  const rounds = [];
  const byLetter = new Map();
  names.forEach((name, i) => {
    const letter = firstGrapheme(name, { lang });
    if (!letter) return;
    const key = letter.toLowerCase();
    const known = byLetter.get(key);
    if (known) {
      known.names.push(name);
      known.says.push(says[i] ?? name);
      return;
    }
    const round = { letter, names: [name], says: [says[i] ?? name] };
    byLetter.set(key, round);
    rounds.push(round);
  });
  return rounds.map((r) => ({ ...r, display: joinNames(r.names), say: joinNames(r.says) }));
}

// ---- Distractors -------------------------------------------------------------------

const POOLS = Object.freeze({
  latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  greek: 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
  cyrillic: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ',
  arabic: 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي',
  hebrew: 'אבגדהוזחטיכלמנסעפצקרשת',
  devanagari: 'अआइउएओकगचजटडतदनपबमयरलवसह',
  bengali: 'অআইউএওকগচজটডতদনপবমযরলসহ',
  gurmukhi: 'ਅਇਉਏਕਗਚਜਟਡਤਦਨਪਬਮਯਰਲਵਸਹ',
  gujarati: 'અઆઇઉએઓકગચજટડતદનપબમયરલવસહ',
  tamil: 'அஆஇஉஎஒகஙசஞடணதநபமயரலவழளறன',
  thai: 'กขคงจฉชซดตถทนบปผพฟมยรลวสหอ',
  han: '大山日月木水火人口天中上下田土',
  hiragana: 'あいうえおかきくけこさしすせそたちつてとなにぬねの',
  katakana: 'アイウエオカキクケコサシスセソタチツテトナニヌネノ',
  hangul: '가나다라마바사아자차카타파하',
  armenian: 'ԱԲԳԴԵԶԷԹԺԻԼԽԾԿՀՁՂՃՄՅՆՇՈՉՊՋՌՍՎՏՐՑՒՓՔՕՖ',
  georgian: 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
});

// Groups that look alike to a toddler: never offered as distractors for each other.
const CONFUSABLE = [
  'OQCDG', 'EF', 'FP', 'PRB', 'BD', 'MNW', 'VWYU', 'IJLT', 'KX', 'XY', 'HN',
  'ΟΘ', 'ΕΣ', 'ΠН', 'ПН', 'ШЩ', 'ОЭ', 'ЗЭ',
  'بتثني', 'جحخ', 'دذ', 'رز', 'سش', 'صض', 'طظ', 'عغ', 'فق',
  'בכ', 'דרך', 'החת', 'וזן', 'סם', 'מם',
];

/** Deterministic pseudo-random numbers in [0, 1) (mulberry32): for tests and screenshots. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, random = Math.random) {
  const a = Array.from(list);
  for (let i = a.length - 1; i > 0; i--) {
    const r = Number(random());
    const j = Math.min(i, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * (i + 1))));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Other tiles to hide the letter among: letters from the same alphabet that
 * don't look like it, plus friendly shapes (all shapes for an unknown script).
 * @returns {Array<{kind: 'letter'|'shape', value: string}>}
 */
export function pickDistractors(letter, { count = 5, shapes = 1, exclude = [], random = Math.random } = {}) {
  const target = String(letter ?? '');
  const base = baseLetter(target) || target;
  const avoid = new Set([target, base]);
  for (const ch of Array.from(target)) avoid.add(upperFor(ch));
  for (const e of exclude) {
    avoid.add(e);
    avoid.add(baseLetter(e) || e);
  }
  for (const group of CONFUSABLE) if (group.includes(base) || group.includes(target)) for (const c of group) avoid.add(c);
  const pool = Array.from(POOLS[scriptOf(target)] ?? '').filter((c) => !avoid.has(c));
  const wantLetters = Math.max(0, Math.min(count - Math.max(0, shapes), pool.length));
  const letters = shuffle(pool, random).slice(0, wantLetters);
  const shapeList = shuffle(SHAPES, random).slice(0, Math.max(0, count - letters.length));
  return [...letters.map((value) => ({ kind: 'letter', value })), ...shapeList.map((value) => ({ kind: 'shape', value }))];
}

// ---- Glyph sampling and coverage -----------------------------------------------------

function toXY(p) {
  return Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p?.x), y: Number(p?.y) };
}

/** Squared distance from point P to segment AB. */
export function distToSegment2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return x * x + y * y;
}

/**
 * Incremental coverage of glyph sample points by a drawn path (grid-bucketed
 * so every pointer move is cheap). `onRatio` is the share of the drawn length
 * that ran over the letter, to tell tracing from scribbling on the whole card.
 */
export function createCoverage(samplePoints, radius) {
  const pts = Array.from(samplePoints ?? [], toXY).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const r = Math.max(0.5, Number(radius) || 0);
  const r2 = r * r;
  const cell = r;
  const grid = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  pts.forEach((p, i) => {
    const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  });
  let covered = new Uint8Array(pts.length);
  let count = 0;
  let onLen = 0;
  let totalLen = 0;

  function near(x, y) {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const list = grid.get(key(gx, gy));
        if (!list) continue;
        for (const i of list) {
          const dx = pts[i].x - x;
          const dy = pts[i].y - y;
          if (dx * dx + dy * dy <= r2) return true;
        }
      }
    }
    return false;
  }

  const api = {
    /** Add a path segment (a dot when both ends are equal); returns the covered fraction. */
    add(x0, y0, x1 = x0, y1 = y0) {
      if (![x0, y0, x1, y1].every(Number.isFinite)) return api.fraction;
      const c0x = Math.floor((Math.min(x0, x1) - r) / cell);
      const c1x = Math.floor((Math.max(x0, x1) + r) / cell);
      const c0y = Math.floor((Math.min(y0, y1) - r) / cell);
      const c1y = Math.floor((Math.max(y0, y1) + r) / cell);
      for (let gx = c0x; gx <= c1x; gx++) {
        for (let gy = c0y; gy <= c1y; gy++) {
          const list = grid.get(key(gx, gy));
          if (!list) continue;
          for (const i of list) {
            if (covered[i]) continue;
            if (distToSegment2(pts[i].x, pts[i].y, x0, y0, x1, y1) <= r2) {
              covered[i] = 1;
              count += 1;
            }
          }
        }
      }
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > 0) {
        totalLen += len;
        const n = Math.max(1, Math.ceil(len / r));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          if (near(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) onLen += len / n;
        }
      }
      return api.fraction;
    },
    get fraction() {
      return pts.length ? count / pts.length : 0;
    },
    get onRatio() {
      return totalLen > 0 ? onLen / totalLen : 1;
    },
    get inkLength() {
      return totalLen;
    },
    get covered() {
      return count;
    },
    get total() {
      return pts.length;
    },
    isCovered: (i) => Boolean(covered[i]),
    reset() {
      covered = new Uint8Array(pts.length);
      count = 0;
      onLen = 0;
      totalLen = 0;
    },
  };
  return api;
}

/**
 * Share (0..1) of `samplePoints` lying within `radius` of any drawn stroke.
 * Points are {x, y} or [x, y]; strokes are arrays of points (polylines).
 */
export function coverage(samplePoints, strokes, radius) {
  const t = createCoverage(samplePoints, radius);
  for (const s of strokes ?? []) {
    const p = Array.from(s ?? [], toXY);
    if (p.length === 1) t.add(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) t.add(p[i - 1].x, p[i - 1].y, p[i].x, p[i].y);
  }
  return t.fraction;
}

/** Has the child traced enough? Generous on purpose: toddlers wobble. */
export function traceComplete({ fraction = 0, onRatio = 1 } = {}, { threshold = TRACE_THRESHOLD, minOnLetter = MIN_ON_LETTER } = {}) {
  return fraction >= threshold && onRatio >= minOnLetter;
}

/** Points on a `step` grid where the glyph is inked (alpha >= threshold), in image pixels. */
export function sampleGlyphPoints(imageData, step = 6, { threshold = 128 } = {}) {
  const { width: w, height: h, data } = imageData ?? {};
  if (!w || !h || !data) return [];
  const s = Math.max(1, Math.round(Number(step) || 1));
  const out = [];
  for (let y = Math.floor(s / 2); y < h; y += s) {
    for (let x = Math.floor(s / 2); x < w; x += s) if (data[(y * w + x) * 4 + 3] >= threshold) out.push({ x, y });
  }
  return out;
}

/** Bounding box of the inked pixels, or null when nothing was drawn. */
export function inkBounds(imageData, { threshold = 128 } = {}) {
  const { width: w, height: h, data } = imageData ?? {};
  if (!w || !h || !data) return null;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[(row + x) * 4 + 3] < threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Typical stroke thickness of the glyph: a low percentile of horizontal and vertical ink runs. */
export function strokeWidthEstimate(imageData, { threshold = 128 } = {}) {
  const { width: w, height: h, data } = imageData ?? {};
  if (!w || !h || !data) return 0;
  const runs = [];
  const ink = (x, y) => data[(y * w + x) * 4 + 3] >= threshold;
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && ink(x, y)) run++;
      else if (run) {
        if (run >= 2) runs.push(run);
        run = 0;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      if (y < h && ink(x, y)) run++;
      else if (run) {
        if (run >= 2) runs.push(run);
        run = 0;
      }
    }
  }
  if (!runs.length) return 0;
  runs.sort((a, b) => a - b);
  return runs[Math.floor(runs.length * 0.4)];
}

/** True when two renderings have (almost) the same ink: used to spot "tofu" boxes for missing glyphs. */
export function sameInk(a, b, { threshold = 128, tolerance = 0.002 } = {}) {
  if (!a?.data || !b?.data || a.width !== b.width || a.height !== b.height) return false;
  let diff = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) if ((a.data[i * 4 + 3] >= threshold) !== (b.data[i * 4 + 3] >= threshold)) diff++;
  return diff / n <= tolerance;
}

// ---- Stroke guides ---------------------------------------------------------------------
//
// How capitals are formed (UK nursery/reception style), as polylines in a
// 0..100 box whose edges are the centre lines of the letter's outermost
// strokes. Drawn over the real glyph: the box is the glyph's ink bounds inset
// by half the stroke width. Round parts are arcs; angles in degrees, 0 = 3
// o'clock, 90 = 6 o'clock (screen y points down), so decreasing = anticlockwise.

function arc(cx, cy, rx, ry, a0, a1, stepDeg = 12) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / stepDeg));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([Math.round((cx + rx * Math.cos(a)) * 10) / 10, Math.round((cy + ry * Math.sin(a)) * 10) / 10]);
  }
  return pts;
}

const C_RX = 100 / (1 + Math.SQRT1_2); // C: ends at +-45 degrees, so the ring's centre sits left of the box centre

const GUIDE_DEFS = {
  A: [[[50, 0], [0, 100]], [[50, 0], [100, 100]], [[16, 68], [84, 68]]],
  B: [[[0, 0], [0, 100]], [[0, 0], [44, 0], ...arc(44, 24, 46, 24, -90, 90), [0, 48]], [[0, 48], [48, 48], ...arc(48, 74, 52, 26, -90, 90), [0, 100]]],
  C: [arc(C_RX, 50, C_RX, 50, -45, -315)],
  D: [[[0, 0], [0, 100]], [[0, 0], [42, 0], ...arc(42, 50, 58, 50, -90, 90), [0, 100]]],
  E: [[[0, 0], [0, 100]], [[0, 0], [100, 0]], [[0, 50], [88, 50]], [[0, 100], [100, 100]]],
  F: [[[0, 0], [0, 100]], [[0, 0], [100, 0]], [[0, 50], [88, 50]]],
  G: [[...arc(50, 50, 50, 50, -45, -360), [58, 50]]],
  H: [[[0, 0], [0, 100]], [[100, 0], [100, 100]], [[0, 50], [100, 50]]],
  I: [[[50, 0], [50, 100]]],
  J: [[[100, 0], [100, 64], ...arc(50, 64, 50, 36, 0, 180)]],
  K: [[[0, 0], [0, 100]], [[100, 0], [4, 56], [100, 100]]],
  L: [[[0, 0], [0, 100], [100, 100]]],
  M: [[[0, 0], [0, 100]], [[0, 0], [50, 70], [100, 0], [100, 100]]],
  N: [[[0, 0], [0, 100]], [[0, 0], [100, 100], [100, 0]]],
  O: [arc(50, 50, 50, 50, -90, -450)],
  P: [[[0, 0], [0, 100]], [[0, 0], [44, 0], ...arc(44, 27, 56, 27, -90, 90), [0, 54]]],
  Q: [arc(48, 47, 48, 47, -90, -450), [[62, 72], [100, 100]]],
  R: [[[0, 0], [0, 100]], [[0, 0], [42, 0], ...arc(42, 26, 52, 26, -90, 90), [0, 52]], [[40, 52], [100, 100]]],
  S: [[...arc(50, 25, 48, 25, -25, -270), ...arc(50, 75, 50, 25, -90, 155)]],
  T: [[[50, 0], [50, 100]], [[0, 0], [100, 0]]],
  U: [[[0, 0], [0, 58], ...arc(50, 58, 50, 42, 180, 0), [100, 0]]],
  V: [[[0, 0], [50, 100], [100, 0]]],
  W: [[[0, 0], [25, 100], [50, 18], [75, 100], [100, 0]]],
  X: [[[0, 0], [100, 100]], [[100, 0], [0, 100]]],
  Y: [[[0, 0], [50, 52]], [[100, 0], [50, 52], [50, 100]]],
  Z: [[[0, 0], [100, 0], [0, 100], [100, 100]]],
};

function dedupe(poly) {
  const out = [];
  for (const p of poly) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 0.05 || Math.abs(last[1] - p[1]) > 0.05) out.push([p[0], p[1]]);
  }
  return out;
}

/** Stroke guide for a capital (accents ignored: "É" uses "E"), or null when there isn't one. */
export function strokeGuide(letter) {
  const def = GUIDE_DEFS[baseLetter(letter)];
  return def ? def.map(dedupe) : null;
}

/** Shrink a box by `d` on every side (never below zero size). */
export function insetBox(box, d) {
  const dx = Math.min(d, box.width / 2);
  const dy = Math.min(d, box.height / 2);
  return { x: box.x + dx, y: box.y + dy, width: box.width - dx * 2, height: box.height - dy * 2 };
}

/** Map a 0..100 guide onto a pixel box. */
export function layoutGuide(guide, box) {
  return (guide ?? []).map((poly) => poly.map(([x, y]) => ({ x: box.x + (x / 100) * box.width, y: box.y + (y / 100) * box.height })));
}

export function polylineLength(poly) {
  let len = 0;
  for (let i = 1; i < poly.length; i++) len += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
  return len;
}

/** The point `dist` along a polyline, with the direction of travel there (degrees). */
export function pointAlong(poly, dist) {
  if (!poly?.length) return null;
  let left = Math.max(0, dist);
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (left <= seg || i === poly.length - 1) {
      const t = Math.min(1, left / seg);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle };
    }
    left -= seg;
  }
  return { x: poly[0].x, y: poly[0].y, angle: 0 };
}

/** Numbered start dots, nudged along their stroke when they'd sit on an earlier dot (B, E, M, N, R...). */
export function startDots(polys, minGap) {
  const dots = [];
  polys.forEach((poly, i) => {
    if (!poly.length) return;
    let p = { x: poly[0].x, y: poly[0].y };
    if (dots.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < minGap)) {
      const moved = pointAlong(poly, Math.min(minGap, polylineLength(poly) * 0.45));
      if (moved) p = { x: moved.x, y: moved.y };
    }
    dots.push({ n: i + 1, x: p.x, y: p.y });
  });
  return dots;
}

/** Direction arrows: one partway along each stroke, two on long ones. */
export function arrowMarks(polys, { spacing = 160 } = {}) {
  const marks = [];
  polys.forEach((poly, i) => {
    const len = polylineLength(poly);
    if (len < 8) return;
    const at = len > spacing * 2.6 ? [0.36, 0.74] : [0.56];
    for (const t of at) {
      const p = pointAlong(poly, len * t);
      if (p) marks.push({ stroke: i, x: p.x, y: p.y, angle: p.angle });
    }
  });
  return marks;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Everything the trace step needs from one offscreen rendering of the letter:
 * sample points, how thick the ink is, how near the path must pass, and the
 * guide strokes / dots / arrows in the same pixel space.
 * @param {ImageData} imageData  the letter drawn opaque on transparent
 * @param {{fontPx?: number, guide?: number[][][] | null, guideBounds?: object | null}} opts
 *   guideBounds: ink bounds of the plain base letter when the letter has an accent
 */
export function glyphModel(imageData, { fontPx = 100, guide = null, guideBounds = null } = {}) {
  const bounds = inkBounds(imageData);
  if (!bounds) return null;
  const strokeWidth = strokeWidthEstimate(imageData) || fontPx * 0.12;
  const step = clamp(Math.round(bounds.height / 26), 4, 16);
  const samples = sampleGlyphPoints(imageData, step);
  const inkWidth = clamp(strokeWidth * 0.62, 18, 48);
  const radius = Math.max(strokeWidth * 0.5 + inkWidth * 0.35, fontPx * 0.06);
  const dotR = clamp(strokeWidth * 0.42, 15, 26);
  const polys = guide ? layoutGuide(guide, insetBox(guideBounds ?? bounds, strokeWidth / 2)) : null;
  return {
    bounds,
    strokeWidth,
    step,
    samples,
    inkWidth,
    radius,
    dotR,
    polys,
    dots: polys ? startDots(polys, dotR * 2.2) : [],
    arrows: polys ? arrowMarks(polys, { spacing: Math.max(80, bounds.height * 0.42) }) : [],
  };
}

// ---- Words ----------------------------------------------------------------------------

/**
 * Fill a line for the screen and for the voice. `vars` values are strings or
 * {display, spoken}: {letter}, {name}, {name's}, {other}.
 * @returns {{display: string, spoken: string, parts: Array<{text: string, spoken?: string, key?: string}>}}
 */
export function fillLine(template, vars = {}) {
  const src = String(template ?? '');
  const parts = [];
  const re = /\{(letter|name's|name|other)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index) });
    const key = m[1];
    const v = vars[key === "name's" ? 'name' : key];
    const display = v && typeof v === 'object' ? String(v.display ?? '') : String(v ?? '');
    const spoken = v && typeof v === 'object' ? String(v.spoken ?? v.display ?? '') : display;
    parts.push(key === "name's" ? { key, text: possessive(display), spoken: possessive(spoken) } : { key, text: display, spoken });
    last = re.lastIndex;
  }
  if (last < src.length) parts.push({ text: src.slice(last) });
  return {
    parts,
    display: parts.map((p) => p.text).join(''),
    spoken: parts
      .map((p) => p.spoken ?? p.text)
      .join('')
      .replace(/\s+[—–]\s+/g, ', '),
  };
}

function estimateSpeechMs(text) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean).length;
  return 500 + words * 360;
}

// ---- Browser helpers ---------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function testScale() {
  const s = Number(globalThis.SB_TEST?.timeScale);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const done = (ok) => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
      resolve(ok);
    };
    const onAbort = () => done(false);
    const id = setTimeout(() => done(true), Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function childController(parent) {
  const ctl = new AbortController();
  if (parent?.aborted) ctl.abort();
  else parent?.addEventListener('abort', () => ctl.abort(), { once: true });
  return ctl;
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Add css/activities.css to the document once. Resolves when it has loaded
 * (or failed: the activity still works unstyled).
 */
export function ensureStylesheet(doc = globalThis.document) {
  if (!doc?.head) return Promise.resolve(false);
  let link = doc.querySelector('link[data-sb-activities]');
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLESHEET_URL;
    link.setAttribute('data-sb-activities', '');
    doc.head.append(link);
  }
  if (link.sheet) return Promise.resolve(true);
  return new Promise((resolve) => {
    link.addEventListener('load', () => resolve(true), { once: true });
    link.addEventListener('error', () => resolve(false), { once: true });
  });
}

function fontString(px) {
  return `${FONT_WEIGHT} ${px}px ${FONT_FAMILY}`;
}

/**
 * Can this device draw the letter? False when the fonts have no glyph for it
 * (it would render as an empty space or a "tofu" box).
 */
export function glyphRenders(letter, doc = globalThis.document) {
  try {
    const c = doc.createElement('canvas');
    c.width = 120;
    c.height = 120;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return true; // can't tell: assume it can
    ctx.font = fontString(64);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    const draw = (text) => {
      ctx.clearRect(0, 0, 120, 120);
      ctx.fillText(text, 20, 88);
      return ctx.getImageData(0, 0, 120, 120);
    };
    const img = draw(letter);
    if (!inkBounds(img)) return false;
    for (const missing of ['͸', '\u{10FFFD}']) {
      const other = draw(missing);
      if (inkBounds(other) && sameInk(img, other)) return false;
    }
    return true;
  } catch {
    return true;
  }
}

/** Is there at least one first letter this device can show? (For deciding whether to offer the game.) */
export function letterTraceAvailable(person, { lang = '', doc = globalThis.document } = {}) {
  const rounds = initialsFor(person, { lang });
  if (!doc) return rounds.length > 0;
  return rounds.some((r) => glyphRenders(r.letter, doc));
}

function h(doc, tag, attrs = {}, ...children) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

function s(doc, tag, attrs = {}, ...children) {
  const el = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

const ICONS = {
  skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6.5 11.5 12 6 17.5M12.5 6.5 18 12l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="#FFC83D" stroke="#2B2A33" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  show: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 14.5 9.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M16.5 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z M20 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z M9.5 3l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="currentColor"/></svg>',
  rub: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 4.6 20 10.4a1.5 1.5 0 0 1 0 2.1l-6.3 6.3H9L4 13.8a1.5 1.5 0 0 1 0-2.1l8.1-7.1a1.5 1.5 0 0 1 2.1 0zM8.4 9.3l6.3 6.3M9 18.8h11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12a6.5 6.5 0 1 0 2-4.7M5 4.5v4h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M12.5 6 18.5 12l-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19.5 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const SHAPE_SVG = {
  star: '<path d="M50 8l12.4 25.2 27.8 4-20.1 19.6 4.7 27.7L50 71.4 25.2 84.5l4.7-27.7L9.8 37.2l27.8-4z" fill="#FFC83D"/>',
  heart: '<path d="M50 86C24 68 10 52 10 34a19 19 0 0 1 40-8 19 19 0 0 1 40 8c0 18-14 34-40 52z" fill="#E8505B"/>',
  moon: '<path d="M60 10a40 40 0 1 0 28 62A33 33 0 0 1 60 10z" fill="#FFE08A"/>',
  flower:
    '<g fill="#F9A9B0"><circle cx="50" cy="27" r="16"/><circle cx="72" cy="43" r="16"/><circle cx="64" cy="69" r="16"/><circle cx="36" cy="69" r="16"/><circle cx="28" cy="43" r="16"/></g><circle cx="50" cy="50" r="13" fill="#FFC83D"/>',
  cloud: '<path d="M27 76h47a17 17 0 0 0 2-34 23 23 0 0 0-44-6 18 18 0 0 0-5 40z" fill="#FFFFFF"/>',
  leaf: '<path d="M16 84C16 42 44 16 86 16c0 42-26 68-70 68z" fill="#6CC24A"/><path d="M22 78 62 38" fill="none"/>',
};

function shapeSvg(name) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g stroke="#2B2A33" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">${SHAPE_SVG[name] ?? SHAPE_SVG.star}</g></svg>`;
}

const SPARKLE = '<svg viewBox="-10 -10 20 20" aria-hidden="true" focusable="false"><path d="M0-10 2.3-2.3 10 0 2.3 2.3 0 10-2.3 2.3-10 0-2.3-2.3z" fill="currentColor"/></svg>';

let uid = 0;

// ---- The activity ---------------------------------------------------------------------------

/**
 * Mount "Find your first letter" into `root` (a full-screen overlay by default).
 * @param {HTMLElement} root
 * @param {{
 *   person: {display: string, say?: string, art?: string, count?: number},
 *   narrator?: {speakText(text: string, o?: {signal?: AbortSignal, rateScale?: number}): Promise<any>, stop?(): void, unlock?(): void, speaking?: boolean},
 *   sfx?: {play(name: string, o?: {volume?: number}): any, unlock?(): void},
 *   onDone?: (result: LetterTraceResult) => void, onSkip?: (result: LetterTraceResult) => void,
 *   reducedMotion?: boolean, bedtime?: boolean,
 *   lang?: string, strings?: Partial<typeof STRINGS>, random?: () => number, threshold?: number, inline?: boolean,
 * }} opts  reducedMotion: undefined follows the device setting. lang: the name's language (Welsh "Ll",
 *   Turkish "İ"). inline: fill `root` instead of covering the screen.
 * @returns {{destroy(): void, readonly step: string, readonly letter: string}}
 * @typedef {{letters: string[], results: Array<{letter: string, names: string[], how: 'traced'|'shown'|'seen'|null}>}} LetterTraceResult
 */
export function mountLetterTrace(root, opts = {}) {
  const o = opts ?? {};
  const doc = root?.ownerDocument ?? globalThis.document;
  if (!root || !doc?.createElement) return { destroy() {}, step: 'none', letter: '' };
  const win = doc.defaultView ?? globalThis;
  const S = { ...STRINGS, ...(o.strings ?? {}) };
  const random = typeof o.random === 'function' ? o.random : Math.random;
  const threshold = Number.isFinite(o.threshold) ? clamp(o.threshold, 0.05, 1) : TRACE_THRESHOLD;
  const bedtime = Boolean(o.bedtime);
  const narrator = o.narrator ?? null;
  const sfx = o.sfx ?? null;
  const lang = o.lang ?? '';
  const T = (ms) => ms * testScale();

  const life = new AbortController();
  const on = (target, type, fn, extra) => target?.addEventListener?.(type, fn, { ...extra, signal: life.signal });
  const mq = safe(() => win.matchMedia?.('(prefers-reduced-motion: reduce)')) ?? null;
  const reduced = () => (typeof o.reducedMotion === 'boolean' ? o.reducedMotion : Boolean(mq?.matches));

  let destroyed = false;
  let finished = false;
  let step = 'loading';
  let idx = -1;
  let rounds = [];
  let roundCtl = null;
  let stepCtl = null;
  let speechCtl = null;
  let speechLive = false;
  let raf = 0;
  let geo = null; // trace layout
  let tracker = null;
  let strokes = []; // in glyph units: [{u, v}] relative to the text origin, / font size
  let activeId = null;
  let lastPt = null;
  let inkColour = INK_COLOURS[0];
  let inkStyle = inkColour;
  let traceMode = 'none'; // guided | outline | none
  let wandered = false;
  let misses = 0;
  let unlocked = false;

  // ---- DOM ----
  const titleId = `sb-lt-title-${++uid}`;
  const pill = (cls, testid, label, icon) =>
    h(doc, 'button', { type: 'button', class: `sb-lt-pill ${cls}`, 'data-testid': testid, hidden: true }, h(doc, 'span', { class: 'sb-lt-pill-icon', html: ICONS[icon] }), h(doc, 'span', {}, label));
  const heading = h(doc, 'h2', { id: titleId, class: 'sb-lt-sr', tabindex: '-1' });
  const kicker = h(doc, 'p', { class: 'sb-lt-kicker', 'data-testid': 'lt-kicker' });
  const skipBtn = h(doc, 'button', { type: 'button', class: 'sb-lt-skip', 'data-testid': 'lt-skip' }, h(doc, 'span', {}, S.skip), h(doc, 'span', { class: 'sb-lt-skip-icon', html: ICONS.skip }));
  const top = h(doc, 'div', { class: 'sb-lt-top' }, kicker, skipBtn);
  const prompt = h(doc, 'p', { class: 'sb-lt-say', 'data-testid': 'lt-prompt', 'aria-live': 'polite', tabindex: '-1' });
  const field = h(doc, 'div', { class: 'sb-lt-field', role: 'group', 'aria-label': S.fieldLabel });
  const fieldWrap = h(doc, 'div', { class: 'sb-lt-fieldwrap' }, field);
  const glyphCv = h(doc, 'canvas', { class: 'sb-lt-glyph', 'aria-hidden': 'true' });
  const inkCv = h(doc, 'canvas', { class: 'sb-lt-ink', 'data-testid': 'lt-canvas', role: 'img' });
  const guideSvg = s(doc, 'svg', { class: 'sb-lt-guide', 'data-testid': 'lt-guide', 'aria-hidden': 'true', focusable: 'false' });
  const pen = h(doc, 'span', { class: 'sb-lt-pen', 'aria-hidden': 'true', hidden: true });
  const stage = h(doc, 'div', { class: 'sb-lt-stage' }, glyphCv, inkCv, guideSvg, pen);
  const traceWrap = h(doc, 'div', { class: 'sb-lt-trace', hidden: true }, stage);
  const main = h(doc, 'div', { class: 'sb-lt-main' }, fieldWrap, traceWrap);
  const rubBtn = pill('is-rub', 'lt-rubout', S.rubOut, 'rub');
  const showBtn = pill('is-show', 'lt-show-me', S.showMe, 'show');
  const againBtn = pill('is-again', 'lt-again', S.again, 'again');
  const nextBtn = pill('is-next', 'lt-next', S.next, 'next');
  const doneBtn = pill('is-done', 'lt-done', S.done, 'done');
  const bar = h(doc, 'div', { class: 'sb-lt-bar' }, rubBtn, showBtn, againBtn, nextBtn, doneBtn);
  const confetti = h(doc, 'div', { class: 'sb-lt-confetti', 'aria-hidden': 'true' });
  const el = h(
    doc,
    'section',
    {
      class: `sb-lt${o.inline ? ' is-inline' : ''}`,
      'data-testid': 'letter-trace',
      'aria-labelledby': titleId,
      'data-step': 'loading',
      'data-bedtime': bedtime ? '' : null,
      style: 'visibility:hidden',
    },
    heading,
    top,
    prompt,
    main,
    bar,
    confetti,
  );
  const setReduced = () => el.toggleAttribute('data-reduced', reduced());
  setReduced();
  if (typeof o.reducedMotion !== 'boolean' && mq) on(mq, 'change', setReduced);
  root.append(el);

  // ---- Small helpers ----
  const ictx = () => safe(() => inkCv.getContext('2d'));
  const gctx = () => safe(() => glyphCv.getContext('2d'));
  const round = () => rounds[idx] ?? null;
  const vars = (r) => ({ letter: { display: r.letter, spoken: spokenLetter(r.letter) }, name: { display: r.display, spoken: r.say } });

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    safe(() => narrator?.unlock?.());
    safe(() => sfx?.unlock?.());
  }

  function play(name, delay = 0) {
    const vol = bedtime ? { volume: 0.28 } : undefined;
    const go = () => {
      if (!destroyed) safe(() => sfx?.play?.(name, vol));
    };
    if (delay > 0) sleep(delay, life.signal).then((ok) => ok && go());
    else go();
  }

  function focusIfOurs(target) {
    const a = doc.activeElement;
    if (!a || a === doc.body || el.contains(a) || !a.isConnected) safe(() => target.focus({ preventScroll: true }));
  }

  function setPrompt(line) {
    prompt.replaceChildren(
      ...line.parts.map((p) => {
        if (!p.key) return p.text;
        const cls = p.key === 'letter' ? 'sb-lt-say-letter' : p.key.startsWith('name') ? 'sb-lt-say-name' : 'sb-lt-say-other';
        return h(doc, 'bdi', { class: cls }, p.text);
      }),
    );
  }

  /** Show a line and say it. Resolves when it has been said (or a sensible time has passed). */
  function say(template, extra = {}) {
    const r = round();
    const line = fillLine(template, { ...(r ? vars(r) : {}), ...extra });
    setPrompt(line);
    speechCtl?.abort();
    const ctl = (speechCtl = childController(life.signal));
    const est = estimateSpeechMs(line.spoken);
    let spoken = null;
    if (typeof narrator?.speakText === 'function') {
      try {
        speechLive = true;
        spoken = Promise.resolve(narrator.speakText(line.spoken, { signal: ctl.signal, rateScale: bedtime ? 0.88 : 1 })).catch(() => 'done');
      } catch {
        spoken = null;
      }
    }
    if (!spoken) spoken = sleep(T(est), ctl.signal);
    // A voice that never reports back mustn't hold the game up.
    return Promise.race([spoken, sleep(est * 2 + 2500, ctl.signal)]).then(() => {
      if (speechCtl === ctl) speechLive = false;
    });
  }

  function stopSpeech() {
    speechCtl?.abort();
    speechCtl = null;
    if (speechLive) safe(() => narrator?.stop?.());
    speechLive = false;
  }

  function result() {
    return {
      letters: rounds.map((r) => r.letter),
      results: rounds.map((r) => ({ letter: r.letter, names: r.names.slice(), how: r.how ?? null })),
    };
  }

  // ---- Steps ----
  function setStep(next) {
    step = next;
    el.dataset.step = next;
    stepCtl?.abort();
    stepCtl = childController((roundCtl ?? life).signal);
    const r = round();
    const tracing = traceMode !== 'none' && (next === 'trace' || next === 'showing' || next === 'celebrate');
    fieldWrap.hidden = tracing || next === 'loading';
    traceWrap.hidden = !tracing;
    rubBtn.hidden = next !== 'trace' || !strokes.length;
    showBtn.hidden = !(next === 'trace' || next === 'showing');
    showBtn.setAttribute('aria-disabled', String(next === 'showing'));
    const celebrating = next === 'celebrate';
    const last = idx >= rounds.length - 1;
    againBtn.hidden = !(celebrating && tracing && r);
    nextBtn.hidden = !(celebrating && !last);
    doneBtn.hidden = !(celebrating && last);
    bar.hidden = [rubBtn, showBtn, againBtn, nextBtn, doneBtn].every((b) => b.hidden);
    el.classList.toggle('has-ink', strokes.length > 0);
  }

  function setKicker(r) {
    const parts = [h(doc, 'span', { class: 'sb-lt-kicker-icon', html: ICONS.star }), h(doc, 'span', {}, fillLine(S.kicker, vars(r)).display)];
    if (rounds.length > 1) parts.push(h(doc, 'span', { class: 'sb-lt-count' }, `${idx + 1}/${rounds.length}`));
    kicker.replaceChildren(...parts);
  }

  // ---- 1. Find it ----
  function startRound(i) {
    idx = i;
    roundCtl?.abort();
    roundCtl = childController(life.signal);
    const r = round();
    r.how = r.how ?? null;
    misses = 0;
    strokes = [];
    tracker = null;
    wandered = false;
    traceMode = 'none';
    stage.classList.remove('is-complete');
    inkColour = bedtime ? INK_NIGHT : INK_COLOURS[(i + Math.floor(random() * INK_COLOURS.length)) % INK_COLOURS.length];
    el.dataset.letter = r.letter;
    el.dataset.round = String(i);
    el.dataset.coverage = '0';
    delete el.dataset.mode;
    setKicker(r);
    buildTiles(r);
    setStep('find');
    focusIfOurs(i === 0 ? heading : prompt);
    say(i === 0 ? S.find : S.findNext);
    armFindIdle();
  }

  function buildTiles(r) {
    const others = pickDistractors(r.letter, { count: 5, shapes: 1, exclude: rounds.map((x) => x.letter), random }).filter(
      (it) => it.kind === 'shape' || glyphRenders(it.value, doc),
    );
    const used = new Set(others.filter((it) => it.kind === 'shape').map((it) => it.value));
    for (const shape of shuffle(SHAPES, random)) {
      if (others.length >= 5) break;
      if (!used.has(shape)) others.push({ kind: 'shape', value: shape });
    }
    const items = shuffle([{ kind: 'letter', value: r.letter, target: true }, ...others], random);
    const colours = shuffle(bedtime ? TILE_COLOURS_NIGHT : TILE_COLOURS, random);
    const sparkles = Array.from({ length: 9 }, (_, k) =>
      h(doc, 'span', {
        class: 'sb-lt-sparkle',
        html: SPARKLE,
        style: `left:${(4 + random() * 92).toFixed(1)}%;top:${(4 + random() * 90).toFixed(1)}%;--s:${(12 + random() * 16).toFixed(0)}px;--d:${(k * 330) % 2600}ms`,
      }),
    );
    const tiles = items.map((it, k) => {
      const face =
        it.kind === 'letter'
          ? h(doc, 'span', { class: 'sb-lt-tile-glyph' }, it.value)
          : h(doc, 'span', { class: 'sb-lt-tile-shape', html: shapeSvg(it.value) });
      const b = h(
        doc,
        'button',
        {
          type: 'button',
          class: 'sb-lt-tile',
          'data-testid': 'lt-tile',
          'data-kind': it.kind,
          'data-glyph': it.kind === 'letter' ? it.value : null,
          'data-shape': it.kind === 'shape' ? it.value : null,
          'aria-label': it.kind === 'letter' ? fillLine(S.letterLabel, { letter: it.value }).display : SHAPE_NAMES[it.value].replace(/^./, (c) => c.toUpperCase()),
          style: `--c:${colours[k % colours.length]};--tilt:${(random() * 14 - 7).toFixed(1)}deg;--jx:${(random() * 0.14 - 0.07).toFixed(3)};--jy:${(random() * 0.14 - 0.07).toFixed(3)};--bob:${(k * 450) % 2700}ms`,
        },
        h(doc, 'span', { class: 'sb-lt-tile-bob' }, h(doc, 'span', { class: 'sb-lt-tile-face' }, face)),
      );
      if (it.target) b.dataset.target = '';
      on(b, 'click', () => onTile(it, b));
      return b;
    });
    field.replaceChildren(...sparkles, ...tiles);
    layoutField();
  }

  function layoutField() {
    const w = fieldWrap.clientWidth;
    const hgt = fieldWrap.clientHeight;
    if (!w || !hgt) return;
    const n = field.querySelectorAll('.sb-lt-tile').length || 6;
    const gap = clamp(Math.min(w, hgt) * 0.05, 12, 30);
    let best = { tile: 0, cols: 3 };
    for (const cols of [2, 3, 6]) {
      const rows = Math.ceil(n / cols);
      const tile = Math.min((w - gap * (cols + 1)) / cols, (hgt - gap * (rows + 1)) / rows) * 0.88;
      if (tile > best.tile) best = { tile, cols };
    }
    field.style.setProperty('--tile', `${Math.round(clamp(best.tile, 64, 200))}px`);
    field.style.setProperty('--cols', String(best.cols));
    field.style.setProperty('--gap', `${Math.round(gap)}px`);
  }

  function armFindIdle() {
    const sig = stepCtl.signal;
    sleep(T(IDLE_MS + 1500), sig).then((ok) => {
      if (!ok || step !== 'find') return;
      say(S.find);
      sleep(T(IDLE_MS + 1500), sig).then((ok2) => {
        if (ok2 && step === 'find') field.querySelector('[data-target]')?.classList.add('is-hint');
      });
    });
  }

  function onTile(it, b) {
    unlock();
    if (step !== 'find') return;
    if (it.target) {
      found(b);
      return;
    }
    misses += 1;
    b.classList.remove('is-wobble');
    void b.offsetWidth;
    b.classList.add('is-wobble');
    sleep(700, life.signal).then(() => b.classList.remove('is-wobble'));
    const other = it.kind === 'letter' ? { display: it.value, spoken: spokenLetter(it.value) } : { display: SHAPE_NAMES[it.value], spoken: SHAPE_NAMES[it.value] };
    say(it.kind === 'letter' ? S.wrongLetter : S.wrongShape, { other });
    if (misses >= 2) field.querySelector('[data-target]')?.classList.add('is-hint');
  }

  async function found(b) {
    setStep('found');
    const sig = roundCtl.signal;
    b.classList.remove('is-hint');
    b.classList.add('is-found');
    for (const t of field.querySelectorAll('.sb-lt-tile')) if (t !== b) t.classList.add('is-faded');
    burst(b);
    play('sparkle');
    play('ding', 260);
    await say(S.found);
    if (!(await sleep(T(450), sig))) return;
    enterTrace();
  }

  function burst(b) {
    if (reduced()) return;
    const n = bedtime ? 5 : 8;
    for (let k = 0; k < n; k++) {
      const star = h(doc, 'span', { class: 'sb-lt-burst', html: SPARKLE, style: `--a:${Math.round((360 / n) * k + random() * 20)}deg` });
      b.append(star);
      sleep(900, life.signal).then(() => star.remove());
    }
  }

  // ---- 2. Trace it ----
  async function enterTrace() {
    const r = round();
    const canTrace = Boolean(safe(() => glyphCv.getContext('2d')) && safe(() => inkCv.getContext('2d')));
    traceMode = canTrace ? (strokeGuide(r.letter) ? 'guided' : 'outline') : 'none';
    if (traceMode === 'none') {
      celebrate('seen');
      return;
    }
    setStep('trace');
    const sig = roundCtl.signal;
    // Let the stage get its size; retry briefly (fonts, layout) before giving up on tracing.
    let ok = false;
    for (let tries = 0; tries < 8 && !ok; tries++) {
      await nextFrame();
      if (sig.aborted) return;
      ok = layoutTrace();
      if (!ok) await sleep(80, sig);
    }
    if (!ok) {
      traceMode = 'none';
      celebrate('seen');
      return;
    }
    el.dataset.mode = traceMode;
    inkCv.setAttribute('aria-label', fillLine(S.stageLabel, vars(r)).display);
    focusIfOurs(showBtn);
    say(traceMode === 'guided' ? S.trace : S.traceOutline);
    armTraceIdle();
  }

  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 16);
    });
  }

  function armTraceIdle() {
    const sig = stepCtl.signal;
    sleep(T(IDLE_MS), sig).then((ok) => {
      if (!ok || step !== 'trace' || strokes.length) return;
      say(traceMode === 'guided' ? S.idle : S.idleOutline);
      showBtn.classList.add('is-nudge');
    });
  }

  function cssVar(name, fallback) {
    const v = safe(() => win.getComputedStyle(el).getPropertyValue(name).trim());
    return v || fallback;
  }

  /** Measure the stage, render the letter offscreen, work out samples/guides, redraw everything. */
  function layoutTrace() {
    const r = round();
    if (!r) return false;
    const W = Math.round(stage.clientWidth);
    const H = Math.round(stage.clientHeight);
    if (W < 60 || H < 60) return false;
    const off = doc.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = safe(() => off.getContext('2d', { willReadFrequently: true }));
    if (!octx) return false;
    octx.textAlign = 'left';
    octx.textBaseline = 'alphabetic';
    octx.font = fontString(100);
    const m = octx.measureText(r.letter);
    const left = Number.isFinite(m.actualBoundingBoxLeft) ? m.actualBoundingBoxLeft : 0;
    const right = Number.isFinite(m.actualBoundingBoxRight) ? m.actualBoundingBoxRight : m.width;
    const asc = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : 72;
    const desc = Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : 0;
    const inkW = Math.max(1, left + right);
    const inkH = Math.max(1, asc + desc);
    const fontPx = Math.min(100 * Math.min((H * 0.7) / inkH, (W * 0.74) / inkW), 900);
    const k = fontPx / 100;
    const x = W / 2 - ((right - left) / 2) * k;
    const y = H / 2 + ((asc - desc) / 2) * k;
    const font = fontString(fontPx);
    octx.font = font;
    octx.fillStyle = '#000';
    octx.fillText(r.letter, x, y);
    const img = octx.getImageData(0, 0, W, H);
    const base = baseLetter(r.letter);
    const guide = traceMode === 'guided' ? strokeGuide(r.letter) : null;
    let guideBounds = null;
    if (guide && base && base !== r.letter) {
      octx.clearRect(0, 0, W, H);
      octx.fillText(base, x, y);
      guideBounds = inkBounds(octx.getImageData(0, 0, W, H));
    }
    const model = glyphModel(img, { fontPx, guide, guideBounds });
    if (!model || model.samples.length < 8) return false;
    const dpr = clamp(win.devicePixelRatio || 1, 1, 2.5);
    geo = { W, H, dpr, x, y, fontPx, font, ...model };
    for (const cv of [glyphCv, inkCv]) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = ictx();
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      inkStyle = crayon(ctx, inkColour);
    }
    drawGlyph(step === 'celebrate');
    drawGuide();
    // Replay what the child has drawn so far at the new size.
    tracker = createCoverage(geo.samples, geo.radius);
    for (const stroke of strokes) {
      const pts = stroke.map(fromUnits);
      drawDot(pts[0]);
      trackSeg(pts[0], pts[0], false);
      for (let i = 1; i < pts.length; i++) {
        drawSeg(pts[i - 1], pts[i]);
        trackSeg(pts[i - 1], pts[i], false);
      }
    }
    updateCoverage();
    return true;
  }

  const toUnits = (p) => ({ u: (p.x - geo.x) / geo.fontPx, v: (p.y - geo.y) / geo.fontPx });
  const fromUnits = (q) => ({ x: geo.x + q.u * geo.fontPx, y: geo.y + q.v * geo.fontPx });

  function crayon(ctx, colour) {
    // A waxy crayon: the colour with lighter and darker specks, as a repeating
    // pattern anchored to the canvas so overlapping strokes don't build up.
    try {
      const t = doc.createElement('canvas');
      t.width = 48;
      t.height = 48;
      const c = t.getContext('2d');
      if (!c) return colour;
      c.fillStyle = colour;
      c.fillRect(0, 0, 48, 48);
      const light = mix(colour, '#FFFFFF', 0.4);
      const dark = mix(colour, '#000000', 0.14);
      for (let i = 0; i < 190; i++) {
        c.globalAlpha = 0.3 + Math.random() * 0.5;
        c.fillStyle = i % 4 === 0 ? dark : light;
        c.fillRect(Math.random() * 48, Math.random() * 48, 1 + Math.random() * 2.2, 1 + Math.random() * 1.2);
      }
      return ctx.createPattern(t, 'repeat') ?? colour;
    } catch {
      return colour;
    }
  }

  function drawGlyph(lit) {
    const ctx = gctx();
    if (!ctx || !geo) return;
    const { dpr, W, H } = geo;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = geo.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const letter = round()?.letter ?? '';
    if (lit) {
      ctx.fillStyle = inkColour;
      ctx.fillText(letter, geo.x, geo.y);
      ctx.lineWidth = clamp(geo.strokeWidth * 0.1, 3, 7);
      ctx.strokeStyle = cssVar('--lt-line', '#2B2A33');
      ctx.strokeText(letter, geo.x, geo.y);
      return;
    }
    // A soft drop shadow, then the pale letter with a clear edge.
    ctx.fillStyle = cssVar('--lt-glyph-shadow', 'rgba(43,42,51,.10)');
    ctx.fillText(letter, geo.x, geo.y + clamp(geo.strokeWidth * 0.12, 3, 8));
    ctx.fillStyle = cssVar('--lt-glyph', '#FFFFFF');
    ctx.fillText(letter, geo.x, geo.y);
    ctx.lineWidth = clamp(geo.strokeWidth * 0.08, 3, 6);
    ctx.strokeStyle = cssVar('--lt-glyph-edge', '#8FC6E6');
    ctx.strokeText(letter, geo.x, geo.y);
  }

  function drawGuide() {
    guideSvg.replaceChildren();
    if (!geo) return;
    guideSvg.setAttribute('viewBox', `0 0 ${geo.W} ${geo.H}`);
    if (!geo.polys) return;
    const lineW = clamp(geo.strokeWidth * 0.13, 4, 9);
    const gap = lineW * 2.6;
    const lines = s(
      doc,
      'g',
      { class: 'sb-lt-guide-lines' },
      geo.polys.map((poly, i) =>
        s(doc, 'polyline', {
          class: 'sb-lt-guide-line',
          'data-stroke': i,
          points: poly.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
          'stroke-width': lineW.toFixed(1),
          'stroke-dasharray': `0 ${gap.toFixed(1)}`,
        }),
      ),
    );
    const a = clamp(geo.strokeWidth * 0.2, 8, 15);
    const chevron = `M${-a * 0.6} ${-a} L${a * 0.5} 0 L${-a * 0.6} ${a}`;
    const arrows = s(
      doc,
      'g',
      { class: 'sb-lt-arrows' },
      geo.arrows.map((m) =>
        s(
          doc,
          'g',
          { class: 'sb-lt-arrow', transform: `translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) rotate(${m.angle.toFixed(1)})` },
          s(doc, 'path', { class: 'sb-lt-arrow-halo', d: chevron, 'stroke-width': (a * 0.9).toFixed(1) }),
          s(doc, 'path', { class: 'sb-lt-arrow-mark', d: chevron, 'stroke-width': (a * 0.45).toFixed(1) }),
        ),
      ),
    );
    const R = geo.dotR;
    const dots = s(
      doc,
      'g',
      { class: 'sb-lt-dots' },
      geo.dots
        .slice()
        .reverse()
        .map((d) =>
          s(
            doc,
            'g',
            { class: `sb-lt-dot${d.n === 1 ? ' is-first' : ''}`, 'data-n': d.n, transform: `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)})` },
            d.n === 1 ? s(doc, 'circle', { class: 'sb-lt-dot-ring', r: R.toFixed(1) }) : null,
            s(doc, 'circle', { class: 'sb-lt-dot-face', r: R.toFixed(1), 'stroke-width': Math.max(3, R * 0.16).toFixed(1) }),
            s(doc, 'text', { class: 'sb-lt-dot-n', 'font-size': (R * 1.15).toFixed(1), y: (R * 0.05).toFixed(1) }, String(d.n)),
          ),
        ),
    );
    guideSvg.append(lines, arrows, dots);
  }

  function drawSeg(a, b, width = geo.inkWidth) {
    const ctx = ictx();
    if (!ctx) return;
    ctx.strokeStyle = inkStyle;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width * (0.93 + Math.random() * 0.14); // a slightly uneven edge, like a crayon
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawDot(p, width = geo.inkWidth) {
    const ctx = ictx();
    if (!ctx) return;
    ctx.fillStyle = inkStyle;
    ctx.beginPath();
    ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateCoverage() {
    el.dataset.coverage = tracker ? tracker.fraction.toFixed(2) : '0';
  }

  function trackSeg(a, b, check = true) {
    if (!tracker) return;
    tracker.add(a.x, a.y, b.x, b.y);
    if (!check) return;
    updateCoverage();
    if (step !== 'trace') return;
    if (traceComplete({ fraction: tracker.fraction, onRatio: tracker.onRatio }, { threshold })) {
      complete('traced');
      return;
    }
    if (!wandered && tracker.inkLength > geo.H * 3 && tracker.onRatio < 0.4) {
      wandered = true;
      say(traceMode === 'guided' ? S.wander : S.idleOutline);
    }
  }

  function localPoint(e, rect) {
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  let rect = null;
  on(inkCv, 'pointerdown', (e) => {
    if (step !== 'trace' || !geo || activeId !== null) return;
    if (e.button > 0) return;
    e.preventDefault();
    unlock();
    activeId = e.pointerId;
    safe(() => inkCv.setPointerCapture(e.pointerId));
    rect = inkCv.getBoundingClientRect();
    const p = localPoint(e, rect);
    strokes.push([toUnits(p)]);
    lastPt = p;
    if (strokes.length === 1) {
      stepCtl.abort(); // the idle nudge
      stepCtl = childController(roundCtl.signal);
      showBtn.classList.remove('is-nudge');
    }
    rubBtn.hidden = false;
    bar.hidden = false;
    el.classList.add('has-ink');
    drawDot(p);
    trackSeg(p, p);
  });
  on(inkCv, 'pointermove', (e) => {
    if (e.pointerId !== activeId || step !== 'trace' || !lastPt) return;
    const list = safe(() => e.getCoalescedEvents?.());
    for (const ev of list?.length ? list : [e]) {
      const p = localPoint(ev, rect);
      if (Math.hypot(p.x - lastPt.x, p.y - lastPt.y) < 1.5) continue;
      strokes[strokes.length - 1].push(toUnits(p));
      drawSeg(lastPt, p);
      const from = lastPt;
      lastPt = p;
      trackSeg(from, p);
      if (step !== 'trace') break;
    }
  });
  const endPointer = (e) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    lastPt = null;
    safe(() => inkCv.releasePointerCapture(e.pointerId));
  };
  on(inkCv, 'pointerup', endPointer);
  on(inkCv, 'pointercancel', endPointer);
  on(inkCv, 'lostpointercapture', endPointer);
  on(inkCv, 'contextmenu', (e) => e.preventDefault());

  function clearInk() {
    strokes = [];
    activeId = null;
    lastPt = null;
    wandered = false;
    tracker?.reset();
    const ctx = ictx();
    if (ctx && geo) ctx.clearRect(0, 0, geo.W, geo.H);
    el.classList.remove('has-ink');
    updateCoverage();
  }

  function animate(ms, fn, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve(false);
      const now = () => win.performance?.now?.() ?? Date.now();
      const t0 = now();
      const frame = (cb) => (typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame(cb) : setTimeout(cb, 16));
      const tick = () => {
        if (signal.aborted) return resolve(false);
        const t = ms > 0 ? Math.min(1, (now() - t0) / ms) : 1;
        fn(t);
        if (t >= 1) resolve(true);
        else raf = frame(tick);
      };
      raf = frame(tick);
    });
  }

  async function showMe() {
    unlock();
    if (step !== 'trace' || !geo) return;
    setStep('showing');
    showBtn.classList.remove('is-nudge');
    const sig = stepCtl.signal;
    const width = geo.inkWidth * 1.2;
    if (geo.polys) {
      const speed = Math.max(0.12, geo.bounds.height / 900); // px per ms
      for (const poly of geo.polys) {
        const len = polylineLength(poly);
        if (reduced()) {
          drawDot(poly[0], width);
          for (let i = 1; i < poly.length; i++) {
            drawSeg(poly[i - 1], poly[i], width);
            tracker?.add(poly[i - 1].x, poly[i - 1].y, poly[i].x, poly[i].y);
          }
          updateCoverage();
          if (!(await sleep(T(450), sig))) return;
          continue;
        }
        let done = 0;
        let prev = poly[0];
        pen.hidden = false;
        drawDot(prev, width);
        const ok = await animate(T(Math.max(450, len / speed)), (t) => {
          const d = len * t;
          while (done < d) {
            done = Math.min(d, done + 4);
            const p = pointAlong(poly, done);
            drawSeg(prev, p, width);
            tracker?.add(prev.x, prev.y, p.x, p.y);
            prev = p;
          }
          pen.style.transform = `translate(${prev.x.toFixed(1)}px, ${prev.y.toFixed(1)}px)`;
          updateCoverage();
        }, sig);
        if (!ok) return;
        if (!(await sleep(T(200), sig))) return;
      }
    } else {
      // No stroke order for this letter: colour it in, top to bottom.
      const ctx = ictx();
      const { bounds } = geo;
      const letter = round().letter;
      const paint = (t) => {
        if (!ctx) return;
        const yCut = bounds.y + bounds.height * t;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, geo.W, yCut + 1);
        ctx.clip();
        ctx.font = geo.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = inkStyle;
        ctx.fillText(letter, geo.x, geo.y);
        ctx.restore();
      };
      if (reduced()) paint(1);
      else if (!(await animate(T(1400), paint, sig))) return;
    }
    pen.hidden = true;
    if (!sig.aborted) complete('shown');
  }

  function complete(how) {
    if (step === 'celebrate') return;
    const r = round();
    if (r) r.how = r.how === 'traced' ? 'traced' : how;
    activeId = null;
    lastPt = null;
    pen.hidden = true;
    setStep('celebrate');
    stage.classList.add('is-complete');
    drawGlyph(true);
    if (bedtime) play('ding');
    else {
      play('sparkle');
      play('cheer', 260);
      confettiBurst();
    }
    say(S.well);
    focusIfOurs(nextBtn.hidden ? doneBtn : nextBtn);
  }

  function celebrate(how) {
    // The letter was found but can't be traced here (no canvas / no outline).
    const r = round();
    if (r) r.how = r.how ?? how;
    traceMode = 'none';
    el.dataset.mode = 'none';
    setStep('celebrate');
    if (!bedtime) play('cheer');
    say(S.noTrace);
    focusIfOurs(nextBtn.hidden ? doneBtn : nextBtn);
  }

  function confettiBurst() {
    const box = stage.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    const cx = box.left - host.left + box.width / 2;
    const cy = box.top - host.top + box.height * 0.55;
    const calm = reduced();
    const n = calm ? 14 : 28;
    const spread = Math.max(160, box.width * 0.55);
    const pieces = [];
    for (let i = 0; i < n; i++) {
      const piece = h(doc, 'span', {
        class: `sb-lt-confetti-piece${i % 3 === 0 ? ' is-round' : ''}`,
        style: [
          `left:${cx.toFixed(0)}px`,
          `top:${cy.toFixed(0)}px`,
          `--c:${CONFETTI[i % CONFETTI.length]}`,
          `--x:${((random() * 2 - 1) * spread).toFixed(0)}px`,
          `--up:${(-(0.35 + random() * 0.45) * box.height).toFixed(0)}px`,
          `--fall:${(box.height * (0.6 + random() * 0.5)).toFixed(0)}px`,
          `--r:${Math.round(random() * 720 - 360)}deg`,
          `--d:${Math.round(random() * 220)}ms`,
        ].join(';'),
      });
      pieces.push(piece);
    }
    confetti.append(...pieces);
    sleep(2800, life.signal).then(() => pieces.forEach((p) => p.remove()));
  }

  function showNothing() {
    // No letter this device can draw: a friendly ending instead of a broken game.
    rounds = [];
    idx = 0;
    const display = String(o.person?.display ?? '').trim();
    const spoken = String(o.person?.say ?? '').trim() || display;
    kicker.replaceChildren(h(doc, 'span', { class: 'sb-lt-kicker-icon', html: ICONS.star }), h(doc, 'span', {}, S.title));
    traceMode = 'none';
    el.dataset.mode = 'none';
    setStep('celebrate');
    fieldWrap.hidden = true;
    say(S.nothing, { name: { display, spoken } });
    focusIfOurs(doneBtn);
  }

  // ---- Buttons ----
  on(skipBtn, 'click', () => {
    unlock();
    stopSpeech();
    if (typeof o.onSkip === 'function') safe(() => o.onSkip(result()));
    else destroy();
  });
  on(showBtn, 'click', () => {
    if (showBtn.getAttribute('aria-disabled') === 'true') return;
    showMe();
  });
  on(rubBtn, 'click', () => {
    unlock();
    if (step !== 'trace') return;
    clearInk();
    rubBtn.hidden = true;
  });
  on(againBtn, 'click', () => {
    unlock();
    if (step !== 'celebrate' || !geo) return;
    clearInk();
    stage.classList.remove('is-complete');
    confetti.replaceChildren();
    setStep('trace');
    drawGlyph(false);
    say(traceMode === 'guided' ? S.trace : S.traceOutline);
    armTraceIdle();
    focusIfOurs(showBtn);
  });
  on(nextBtn, 'click', () => {
    unlock();
    if (step !== 'celebrate' || idx >= rounds.length - 1) return;
    confetti.replaceChildren();
    startRound(idx + 1);
  });
  on(doneBtn, 'click', () => {
    unlock();
    if (finished) return;
    finished = true;
    stopSpeech();
    if (typeof o.onDone === 'function') safe(() => o.onDone(result()));
    else destroy();
  });

  // ---- Resizing ----
  let relayoutQueued = false;
  const relayout = () => {
    if (relayoutQueued || destroyed) return;
    relayoutQueued = true;
    nextFrame().then(() => {
      relayoutQueued = false;
      if (destroyed) return;
      if (!fieldWrap.hidden) layoutField();
      // Not mid-stroke or mid-"show me": both would lose ink drawn since the last layout.
      if (!traceWrap.hidden && geo && activeId === null && step !== 'showing') layoutTrace();
    });
  };
  const RO = win.ResizeObserver;
  const ro = typeof RO === 'function' ? new RO(relayout) : null;
  if (ro) ro.observe(main);
  else on(win, 'resize', relayout);
  // A web font arriving late changes the letter's shape: redraw it.
  if (doc.fonts?.addEventListener) on(doc.fonts, 'loadingdone', relayout);

  // ---- Start ----
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopSpeech();
    life.abort();
    if (raf) safe(() => win.cancelAnimationFrame?.(raf));
    safe(() => ro?.disconnect());
    el.remove();
  }

  (async () => {
    const css = ensureStylesheet(doc);
    await Promise.race([css, sleep(1500, life.signal)]);
    const fonts = doc.fonts?.load ? Promise.all([doc.fonts.load(fontString(100)), doc.fonts.load('700 20px Andika')]).catch(() => null) : null;
    if (fonts) await Promise.race([fonts, sleep(1200, life.signal)]);
    if (destroyed) return;
    el.style.removeProperty('visibility');
    heading.textContent = S.title;
    rounds = initialsFor(o.person ?? {}, { lang }).filter((r) => glyphRenders(r.letter, doc));
    if (rounds.length > 1) heading.textContent = S.titleMany;
    if (!rounds.length) {
      showNothing();
      return;
    }
    startRound(0);
  })().catch((err) => {
    console.warn('[letter-trace] could not start', err);
    if (destroyed) return;
    el.style.removeProperty('visibility');
    safe(showNothing);
  });

  return {
    destroy,
    get step() {
      return step;
    },
    get letter() {
      return round()?.letter ?? '';
    },
  };
}
