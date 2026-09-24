// The magic window: the phone's rear camera shows the real, printed book and
// the page's digital layer — the child's name in the name spots, sparkles and
// other screen-only extras — is drawn over it, as if written onto the paper.
//
// How it lines up (docs/architecture.md §9):
//   - Baseline, always available: the grown-up lines the overlay up with the
//     real page by hand (drag to move, pinch or the slider to resize, a
//     rotate nudge, a translucent "ghost" of the whole page to aim with). The
//     fit is remembered per book and per phone orientation.
//   - Experimental: when books/<id>/targets.mind exists, MindAR image
//     tracking is loaded lazily from jsDelivr and pins the overlay to the
//     detected page. It never blocks the manual mode, and any failure simply
//     leaves the manual fit in place.
//
// Privacy: the video never leaves the <video> element. Nothing is recorded,
// stored or uploaded; the camera stops on destroy and when the page is
// hidden. Only the overlay fit (numbers) is saved, on this device.
//
// The scene helpers (js/reader/scene.js, name-fit.js, drive.js) are loaded
// with import() so a missing module shows a friendly message, not an error.

import { bookUrl } from '../core/book.js';
import { blobs } from '../core/storage.js';
import { fillTemplate } from '../core/personalise.js';
import { planLines } from '../narrator/plan.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** "Siobhan’s" with a typographic apostrophe, for the grown-up's cards. */
const possessive = (name) => `${name}’s`;
export const SCENE_ASPECT = 1600 / 1000;
export const ALIGN_LIMITS = Object.freeze({ minScale: 0.25, maxScale: 4, maxShift: 0.8, maxRotate: 45 });
export const DEFAULT_ALIGN = Object.freeze({ x: 0, y: 0, scale: 1, rotate: 0 });
/** Lazily loaded only when a book ships targets.mind (MindAR's image build: no three.js, uses our own video). */
export const MINDAR_URL = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js';
export const CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
});
const PLAY_MS = 1700; // one run of a page's moving part
const SFX_GAP_MS = 250;

// ---- Pure helpers (unit-tested in tests/unit/ar-magic.test.mjs) ----------------------------------

/**
 * Can this browser open a camera here? Needs getUserMedia and a secure
 * context (https or localhost).
 * @param {typeof globalThis} [env]
 */
export function isCameraSupported(env = globalThis) {
  try {
    return Boolean(env?.navigator?.mediaDevices?.getUserMedia) && env.isSecureContext !== false;
  } catch {
    return false;
  }
}

/**
 * Sort a getUserMedia failure into something we can explain to a parent.
 * @returns {'denied'|'nocamera'|'busy'|'unsupported'|'error'}
 */
export function cameraErrorKind(err) {
  const name = String(err?.name ?? '');
  if (/NotAllowed|PermissionDenied|Security/i.test(name)) return 'denied';
  if (/NotFound|DevicesNotFound|Overconstrained|ConstraintNotSatisfied/i.test(name)) return 'nocamera';
  if (/NotReadable|TrackStart|Abort/i.test(name)) return 'busy';
  if (/NotSupported/i.test(name) || name === 'TypeError') return 'unsupported';
  return 'error';
}

export function orientationOf(width, height) {
  return width >= height ? 'landscape' : 'portrait';
}

/**
 * The overlay's size at scale 1: the scene (16:10) fitted inside the stage.
 * @returns {{width: number, height: number}}
 */
export function fitSize(stageW, stageH, { aspect = SCENE_ASPECT, fill = 0.9 } = {}) {
  const w = Math.max(0, stageW) * fill;
  const hgt = Math.max(0, stageH) * fill;
  if (!w || !hgt) return { width: 0, height: 0 };
  return w / hgt > aspect ? { width: hgt * aspect, height: hgt } : { width: w, height: w / aspect };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

/**
 * A safe alignment: x/y are offsets as fractions of the stage size (so a fit
 * survives small layout changes), scale multiplies the fitted size, rotate is
 * in degrees.
 */
export function normaliseAlign(a) {
  const L = ALIGN_LIMITS;
  return {
    x: clamp(num(a?.x, 0), -L.maxShift, L.maxShift),
    y: clamp(num(a?.y, 0), -L.maxShift, L.maxShift),
    scale: clamp(num(a?.scale, 1), L.minScale, L.maxScale),
    rotate: clamp(num(a?.rotate, 0), -L.maxRotate, L.maxRotate),
  };
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/** CSS transform for the overlay (positioned at 50%/50% of the stage). */
export function alignTransform(a, stage) {
  const n = normaliseAlign(a);
  const x = r3(n.x * (stage?.width ?? 0));
  const y = r3(n.y * (stage?.height ?? 0));
  return `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${r3(n.rotate)}deg) scale(${r3(n.scale)})`;
}

/** One-finger drag by (dx, dy) px from where the gesture started. */
export function dragAlign(start, dx, dy, stage) {
  const w = stage?.width || 1;
  const hgt = stage?.height || 1;
  return normaliseAlign({ ...start, x: start.x + dx / w, y: start.y + dy / hgt });
}

/**
 * Two-finger pinch/twist: scale by the change in finger distance, rotate by
 * the change in angle, move with the midpoint.
 * @param {{x,y,scale,rotate}} start alignment when both fingers went down
 * @param {[{x,y},{x,y}]} from finger positions then
 * @param {[{x,y},{x,y}]} to finger positions now
 */
export function pinchAlign(start, from, to, stage) {
  const d0 = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y) || 1;
  const d1 = Math.hypot(to[1].x - to[0].x, to[1].y - to[0].y) || d0;
  const a0 = Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x);
  const a1 = Math.atan2(to[1].y - to[0].y, to[1].x - to[0].x);
  let turn = ((a1 - a0) * 180) / Math.PI;
  turn = ((((turn + 180) % 360) + 360) % 360) - 180;
  const mid0 = { x: (from[0].x + from[1].x) / 2, y: (from[0].y + from[1].y) / 2 };
  const mid1 = { x: (to[0].x + to[1].x) / 2, y: (to[0].y + to[1].y) / 2 };
  const moved = dragAlign(start, mid1.x - mid0.x, mid1.y - mid0.y, stage);
  return normaliseAlign({ ...moved, scale: start.scale * (d1 / d0), rotate: start.rotate + turn });
}

/** Small keyboard/button steps. */
export function nudgeAlign(a, { dx = 0, dy = 0, zoom = 1, turn = 0 } = {}) {
  const n = normaliseAlign(a);
  return normaliseAlign({ x: n.x + dx, y: n.y + dy, scale: n.scale * zoom, rotate: n.rotate + turn });
}

/** The saved fit for an orientation, or null. Tolerates junk from storage. */
export function readAlignStore(raw, orientation) {
  const a = raw && typeof raw === 'object' ? raw[orientation] : null;
  return a && typeof a === 'object' ? normaliseAlign(a) : null;
}

export function writeAlignStore(raw, orientation, align) {
  const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { ...base, v: 1, [orientation]: normaliseAlign(align) };
}

// -- Tracking maths (MindAR world/projection matrices -> a CSS matrix3d) ----------------------------

/**
 * How object-fit: cover places a video frame of vw x vh inside a bw x bh box.
 * @returns {{scale: number, dx: number, dy: number}}
 */
export function coverFit(vw, vh, bw, bh) {
  const scale = Math.max(bw / (vw || 1), bh / (vh || 1));
  return { scale, dx: (bw - vw * scale) / 2, dy: (bh - vh * scale) / 2 };
}

function mul4(m, v) {
  // Column-major 4x4 (WebGL / three.js order) times a column vector.
  return [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
}

/**
 * Project a point on the tracked image (pixel coords of the target image,
 * y down) into camera-frame pixels, using MindAR's OpenGL-style world matrix
 * (which flips y: marker y becomes height - y) and projection matrix.
 * @returns {[number, number]|null}
 */
export function projectMarkerPoint(world, proj, x, y, markerH, inputW, inputH) {
  const eye = mul4(world, [x, markerH - y, 0, 1]);
  const clip = mul4(proj, eye);
  if (!(Math.abs(clip[3]) > 1e-9)) return null;
  const nx = clip[0] / clip[3];
  const ny = clip[1] / clip[3];
  return [((nx + 1) / 2) * inputW, ((1 - ny) / 2) * inputH];
}

/**
 * The four corners of the tracked image on screen (in the stage's px),
 * clockwise from top-left.
 */
export function trackedQuad(world, proj, [markerW, markerH], input, cover) {
  const corners = [
    [0, 0],
    [markerW, 0],
    [markerW, markerH],
    [0, markerH],
  ];
  const out = [];
  for (const [x, y] of corners) {
    const p = projectMarkerPoint(world, proj, x, y, markerH, input.width, input.height);
    if (!p) return null;
    out.push([p[0] * cover.scale + cover.dx, p[1] * cover.scale + cover.dy]);
  }
  return out;
}

/**
 * The perspective transform taking the rectangle (0,0)-(w,h) onto a quad
 * (clockwise from top-left), as a column-major 4x4 for CSS matrix3d with
 * transform-origin 0 0. Returns null for a degenerate quad.
 * (Heckbert's square-to-quad mapping, pre-scaled by 1/w, 1/h.)
 */
export function rectToQuadMatrix(w, h, quad) {
  if (!(w > 0 && h > 0) || !Array.isArray(quad) || quad.length !== 4) return null;
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g, k;
  if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
    a = x1 - x0;
    b = x3 - x0;
    c = x0;
    d = y1 - y0;
    e = y3 - y0;
    f = y0;
    g = 0;
    k = 0;
  } else {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-12) return null;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
    a = x1 - x0 + g * x1;
    b = x3 - x0 + k * x3;
    c = x0;
    d = y1 - y0 + g * y1;
    e = y3 - y0 + k * y3;
    f = y0;
  }
  // A quad squashed to a line or a point (a tracking glitch) can't be drawn on.
  if (Math.abs(a * e - b * d) < 1e-9) return null;
  // (u, v) = (x / w, y / h)
  return [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, c, f, 0, 1];
}

/** Apply a column-major matrix3d (as built above) to a 2D point. */
export function applyMatrix3d(m, x, y) {
  const X = m[0] * x + m[4] * y + m[12];
  const Y = m[1] * x + m[5] * y + m[13];
  const W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}

export function matrix3dCss(m) {
  return `matrix3d(${m.map((v) => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(8)))).join(',')})`;
}

// Whether a book ships tracking targets, asked once per session (a missing
// file is the normal case, so we don't keep asking the server).
const targetsProbe = new Map();
function targetsExist(url) {
  if (!targetsProbe.has(url)) {
    targetsProbe.set(
      url,
      fetch(url, { method: 'HEAD', cache: 'no-store' })
        .then((res) => res.ok && !/text\/html/i.test(res.headers.get('content-type') ?? ''))
        .catch(() => false),
    );
  }
  return targetsProbe.get(url);
}

// ---- DOM helpers ----------------------------------------------------------------------------------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const S = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  back: `<path d="M14.5 5.5 8 12l6.5 6.5" ${S} stroke-width="2.8"/>`,
  prev: `<path d="M14.5 5.5 8 12l6.5 6.5" ${S} stroke-width="3.2"/>`,
  next: `<path d="M9.5 5.5 16 12l-6.5 6.5" ${S} stroke-width="3.2"/>`,
  move: `<path d="M12 3v18M3 12h18M12 3l-2.6 2.6M12 3l2.6 2.6M12 21l-2.6-2.6M12 21l2.6-2.6M3 12l2.6-2.6M3 12l2.6 2.6M21 12l-2.6-2.6M21 12l-2.6 2.6" ${S} stroke-width="2"/>`,
  sparkle: '<path d="M11 2.5c.8 5.1 2.9 7.3 8 8.1-5.1.8-7.2 3-8 8.1-.8-5.1-2.9-7.3-8-8.1 5.1-.8 7.2-3 8-8.1z" fill="currentColor"/><path d="M19 14.5c.35 2.1 1.2 3 3.3 3.35-2.1.35-2.95 1.25-3.3 3.35-.35-2.1-1.2-3-3.3-3.35 2.1-.35 2.95-1.25 3.3-3.35z" fill="currentColor"/>',
  speaker: `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" ${S}/>`,
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/>',
  rotl: `<path d="M8 7.5H4V3.5M4.4 7.3A8 8 0 1 1 4 12" ${S}/>`,
  rotr: `<path d="M16 7.5h4V3.5M19.6 7.3A8 8 0 1 0 20 12" ${S}/>`,
  minus: `<path d="M6 12h12" ${S} stroke-width="2.8"/>`,
  plus: `<path d="M12 6v12M6 12h12" ${S} stroke-width="2.8"/>`,
  ghost: `<rect x="3.5" y="6" width="17" height="12" rx="2" ${S} stroke-dasharray="3 2.6"/><path d="M7 15l3.5-4 2.5 3 1.8-2 2.2 3" ${S} stroke-width="1.8"/>`,
  reset: `<path d="M5.5 12a6.5 6.5 0 1 0 2-4.7M5 4.5v4h4" ${S}/>`,
  camera: `<rect x="3" y="7" width="18" height="12.5" rx="3" ${S}/><circle cx="12" cy="13.2" r="3.3" ${S}/><path d="M8.5 7 10 4.5h4L15.5 7" ${S}/>`,
  target: `<rect x="4" y="5" width="16" height="14" rx="2" ${S} stroke-dasharray="2.5 2.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${S}/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" ${S}/>`,
};

function icon(name, size = 24) {
  return h('span', { class: 'mw-icon', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" focusable="false">${ICONS[name] ?? ''}</svg>` });
}

/** The explainer's little picture: a phone held over an open book, a name glowing on the page. */
function explainerArt(display) {
  const safe = String(display ?? '').replace(/[&<>"']/g, '');
  const label = [...safe].length > 10 ? `${[...safe].slice(0, 9).join('')}…` : safe || '★';
  // Shrink long names to fit the little label on the phone's screen.
  const size = Math.round(Math.min(15, Math.max(7, 70 / Math.max(1, [...label].length))) * 10) / 10;
  return h('div', {
    class: 'mw-card-art',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 240 150" width="240" height="150" focusable="false">
  <ellipse cx="120" cy="138" rx="96" ry="8" fill="#2B2A33" opacity=".08"/>
  <path d="M22 50 Q70 40 118 52 L118 132 Q70 120 22 130 Z" fill="#9FDCF7" stroke="#2B2A33" stroke-width="3" stroke-linejoin="round"/>
  <path d="M218 50 Q170 40 122 52 L122 132 Q170 120 218 130 Z" fill="#B7E28F" stroke="#2B2A33" stroke-width="3" stroke-linejoin="round"/>
  <path d="M22 108 Q70 98 118 110 L118 132 Q70 120 22 130 Z" fill="#74C655" stroke="#2B2A33" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="58" cy="76" r="10" fill="#FFCB3D"/>
  <g transform="rotate(-8 150 70)">
    <rect x="112" y="14" width="84" height="116" rx="14" fill="#2B2A33"/>
    <rect x="118" y="24" width="72" height="96" rx="7" fill="#FFF8EC"/>
    <path d="M118 88 Q150 80 190 86 L190 113 Q190 120 183 120 L125 120 Q118 120 118 113 Z" fill="#B7E28F"/>
    <rect x="128" y="50" width="52" height="24" rx="7" fill="#FFFFFF" stroke="#E4483A" stroke-width="2.5"/>
    <text x="154" y="67" text-anchor="middle" font-family="Fredoka, Andika, sans-serif" font-weight="700" font-size="${size}" fill="#E4483A">${label}</text>
  </g>
  <path d="M205 20c.9 5.4 3 7.6 8.4 8.4-5.4.9-7.5 3-8.4 8.4-.8-5.4-3-7.5-8.3-8.4 5.3-.8 7.5-3 8.3-8.4z" fill="#FFC83D"/>
  <path d="M101 16c.5 3.2 1.8 4.5 5 5-3.2.5-4.5 1.8-5 5-.5-3.2-1.8-4.5-5-5 3.2-.5 4.5-1.8 5-5z" fill="#FFC83D"/>
  <path d="M222 70c.5 3 1.7 4.2 4.7 4.7-3 .5-4.2 1.7-4.7 4.7-.5-3-1.7-4.2-4.7-4.7 3-.5 4.2-1.7 4.7-4.7z" fill="#7EC8F0"/>
</svg>`,
  });
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted || !(ms > 0)) return resolve();
    const id = setTimeout(done, ms);
    function done() {
      clearTimeout(id);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Run fn(p) over `ms` with p from `from` to `to` on animation frames. Resolves early (never rejects) when aborted. */
function tween(from, to, ms, fn, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    if (!(ms > 0) || typeof requestAnimationFrame !== 'function') {
      fn(to);
      return resolve();
    }
    const t0 = performance.now();
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      resolve();
    };
    signal?.addEventListener('abort', stop, { once: true });
    const frame = (now) => {
      if (signal?.aborted) return;
      const t = Math.min(1, (now - t0) / ms);
      fn(from + (to - from) * easeInOut(t));
      if (t < 1) raf = requestAnimationFrame(frame);
      else {
        signal?.removeEventListener('abort', stop);
        resolve();
      }
    };
    raf = requestAnimationFrame(frame);
  });
}

function byId(root, sel) {
  if (typeof sel !== 'string' || !sel.startsWith('#')) return null;
  const id = sel.slice(1);
  return [...root.querySelectorAll('[id]')].find((el) => el.id === id) ?? null;
}

/** An element's box in the scene's own coordinates (1600 x 1000), or null. */
function sceneBox(svg, el) {
  try {
    const b = el.getBBox();
    const m = svg.getScreenCTM()?.inverse().multiply(el.getScreenCTM());
    if (!m || !(b.width || b.height)) return null;
    const pts = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  } catch {
    return null;
  }
}

// ---- The magic window ------------------------------------------------------------------------------

/**
 * Mount the magic window full-screen inside `root`.
 * @param {HTMLElement} root
 * @param {{book: object, bookId?: string, baseUrl?: string, page?: number,
 *   person: {display: string, say?: string, art?: string},
 *   narrator?: object|null, sfx?: {play(name: string): void, unlock?(): void}|null,
 *   onExit?: () => void, onPage?: (n: number) => void,
 *   explain?: 'auto'|'always'}} opts
 *   explain: 'auto' skips the camera explainer when permission was already granted.
 * @returns {Promise<{destroy(): void, goTo(n: number): void, play(): Promise<void>}>}
 */
export async function mountMagicWindow(root, opts = {}) {
  const { book, bookId = book?.id, baseUrl = bookUrl(bookId), person, narrator = null, sfx = null, onExit, onPage, explain = 'auto' } = opts;
  const life = new AbortController();
  const { signal } = life;
  const pages = Array.isArray(book?.pages) ? book.pages : [];
  // `who` is for words (captions, headings, speech); `artWho` for the pictures,
  // which draw siblings as "Amara & Zak" (personalise.js `art`).
  const who = {
    display: String(person?.display ?? '').trim(),
    say: String(person?.say ?? person?.display ?? '').trim(),
  };
  if (person?.count > 1) who.count = person.count;
  const artWho = { display: String(person?.art ?? person?.display ?? '').trim() };
  const hasName = Boolean(who.display);
  const clampPage = (n) => Math.min(Math.max(1, Math.round(Number(n)) || 1), Math.max(1, pages.length));

  let current = clampPage(opts.page ?? 1);
  let destroyed = false;
  let stream = null;
  let state = 'explain';
  let everLive = false;
  let resumeWanted = false;
  let mods = null;
  let cur = null; // the page on show: {n, page, svg, driver, names, reveals, underFlap, mechanic, driven, ctl, played}
  let playing = false;
  let readCtl = null;
  let aligning = false;
  let ghostOn = false;
  let align = { ...DEFAULT_ALIGN };
  let alignStore = null;
  let stage = { width: 0, height: 0 };
  let orientation = 'portrait';
  let saveTimer = 0;
  let tracking = { state: 'off', controller: null, markers: null, lostTimer: 0, found: -1, enabled: true };
  const reduced = prefersReducedMotion;

  // ---- DOM ---------------------------------------------------------------------------------------
  const video = h('video', { class: 'mw-video', 'data-testid': 'mw-video', playsinline: true, muted: true, autoplay: true, 'aria-hidden': 'true', disablepictureinpicture: true });
  video.muted = true; // the attribute alone doesn't mute in every engine
  const ghost = h('div', { class: 'mw-ghost', 'data-testid': 'mw-ghost', hidden: true });
  const layer = h('div', { class: 'mw-layer', 'data-testid': 'mw-layer' });
  const fx = document.createElementNS(SVG_NS, 'svg');
  fx.setAttribute('class', 'mw-fx');
  fx.setAttribute('viewBox', '0 0 1600 1000');
  fx.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  fx.setAttribute('aria-hidden', 'true');
  const frame = h('div', { class: 'mw-frame', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  const overlay = h('div', { class: 'mw-overlay', 'data-testid': 'mw-overlay', 'aria-hidden': 'true' }, ghost, layer, fx, frame);
  const confetti = h('div', { class: 'mw-confetti', 'aria-hidden': 'true' });
  const stageEl = h('div', { class: 'mw-stage', 'data-testid': 'mw-stage' }, overlay, confetti);

  const backBtn = h('button', { type: 'button', class: 'mw-pill mw-back', 'data-testid': 'mw-exit', onClick: () => exit() }, icon('back', 22), h('span', {}, 'Back to reading'));
  const pageChip = h('p', { class: 'mw-chip', 'data-testid': 'mw-page' });
  const alignBtn = h('button', { type: 'button', class: 'mw-round mw-align-btn', 'data-testid': 'mw-align', 'aria-pressed': 'false', 'aria-label': 'Line up the picture with the page', title: 'Line up', onClick: () => setAligning(!aligning) }, icon('move', 26));
  const trackBtn = h('button', { type: 'button', class: 'mw-track', 'data-testid': 'mw-track', hidden: true, 'aria-pressed': 'true', onClick: () => toggleTracking() });
  const top = h('div', { class: 'mw-top' }, backBtn, pageChip, alignBtn, trackBtn);

  const prevBtn = h('button', { type: 'button', class: 'mw-round', 'data-testid': 'mw-prev', 'aria-label': 'Previous page', onClick: () => goTo(current - 1) }, icon('prev', 28));
  const nextBtn = h('button', { type: 'button', class: 'mw-round', 'data-testid': 'mw-next', 'aria-label': 'Next page', onClick: () => goTo(current + 1) }, icon('next', 28));
  const playBtn = h('button', { type: 'button', class: 'mw-magic', 'data-testid': 'mw-play', onClick: () => play() }, icon('sparkle', 28), h('span', { class: 'mw-magic-text' }, 'Magic!'));
  const readBtn = h('button', { type: 'button', class: 'mw-round mw-read', 'data-testid': 'mw-read', 'aria-label': 'Read this page aloud', 'aria-pressed': 'false', onClick: () => toggleRead() }, icon('speaker', 26));
  if (!narrator?.play) readBtn.hidden = true;
  const bottom = h('div', { class: 'mw-bottom' }, prevBtn, playBtn, readBtn, nextBtn);

  const caption = h('p', { class: 'mw-caption', 'data-testid': 'mw-caption', hidden: true });
  const hint = h('p', { class: 'mw-hint', 'data-testid': 'mw-hint', hidden: true });
  const status = h('p', { class: 'mw-status', role: 'status', 'aria-live': 'polite' });
  const toastEl = h('p', { class: 'mw-toast', 'data-testid': 'mw-toast', hidden: true });

  // Line-up panel
  const sizeInput = h('input', { type: 'range', class: 'mw-range', min: '25', max: '400', step: '1', value: '100', 'data-testid': 'mw-size', 'aria-label': 'Picture size', 'aria-valuetext': '100%' });
  const sizeOut = h('output', { class: 'mw-size-out' }, '100%');
  const ghostBtn = h('button', { type: 'button', class: 'mw-tool', 'data-testid': 'mw-ghost-toggle', 'aria-pressed': 'false', 'aria-label': 'Show the whole page to line up with', onClick: () => setGhost(!ghostOn) }, icon('ghost', 22), h('span', { 'aria-hidden': 'true' }, 'Whole page'));
  const panel = h(
    'section',
    { class: 'mw-panel', 'data-testid': 'mw-align-panel', hidden: true, 'aria-labelledby': 'mw-panel-title' },
    h(
      'div',
      { class: 'mw-panel-head' },
      h('div', {}, h('h2', { class: 'mw-panel-title', id: 'mw-panel-title' }, 'Line up the page'), h('p', { class: 'mw-panel-hint' }, 'Drag it onto the page in your book. Pinch or slide to resize.')),
      h('button', { type: 'button', class: 'mw-done', 'data-testid': 'mw-align-done', onClick: () => setAligning(false) }, 'Done'),
    ),
    h(
      'div',
      { class: 'mw-size-row' },
      h('button', { type: 'button', class: 'mw-mini', 'aria-label': 'Smaller', onClick: () => updateAlign(nudgeAlign(align, { zoom: 1 / 1.05 })) }, icon('minus', 20)),
      sizeInput,
      h('button', { type: 'button', class: 'mw-mini', 'aria-label': 'Bigger', onClick: () => updateAlign(nudgeAlign(align, { zoom: 1.05 })) }, icon('plus', 20)),
      sizeOut,
    ),
    h(
      'div',
      { class: 'mw-tools' },
      h('button', { type: 'button', class: 'mw-tool', 'data-testid': 'mw-rotate-left', 'aria-label': 'Turn left a little', onClick: (e) => updateAlign(nudgeAlign(align, { turn: e.shiftKey ? -5 : -1 })) }, icon('rotl', 22), h('span', { 'aria-hidden': 'true' }, 'Turn')),
      h('button', { type: 'button', class: 'mw-tool', 'data-testid': 'mw-rotate-right', 'aria-label': 'Turn right a little', onClick: (e) => updateAlign(nudgeAlign(align, { turn: e.shiftKey ? 5 : 1 })) }, icon('rotr', 22), h('span', { 'aria-hidden': 'true' }, 'Turn')),
      ghostBtn,
      h('button', { type: 'button', class: 'mw-tool', 'data-testid': 'mw-reset', 'aria-label': 'Reset the size and position', onClick: () => updateAlign({ ...DEFAULT_ALIGN }) }, icon('reset', 22), h('span', { 'aria-hidden': 'true' }, 'Reset')),
    ),
  );

  const card = h('div', { class: 'mw-card-wrap', 'data-testid': 'mw-card', hidden: true });

  const el = h(
    'div',
    { class: 'mw', 'data-testid': 'magic-window', 'data-state': state, role: 'region', 'aria-label': 'Magic window', tabindex: '-1' },
    video,
    stageEl,
    top,
    toastEl,
    caption,
    hint,
    bottom,
    panel,
    card,
    status,
  );
  root.append(el);
  document.documentElement.classList.add('mw-open');

  // ---- State & cards -----------------------------------------------------------------------------
  function setState(s) {
    state = s;
    el.dataset.state = s;
  }

  function say(text) {
    status.textContent = '';
    // A fresh node each time so repeated messages are announced.
    setTimeout(() => {
      if (!destroyed) status.textContent = text;
    }, 30);
  }

  let toastTimer = 0;
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.hidden = true;
  }
  function toast(text, ms = 4200) {
    clearTimeout(toastTimer);
    toastEl.textContent = text;
    toastEl.hidden = false;
    toastEl.classList.remove('is-out');
    toastTimer = setTimeout(() => {
      toastEl.classList.add('is-out');
      toastTimer = setTimeout(() => (toastEl.hidden = true), 400);
    }, ms);
  }

  const CARDS = {
    explain: () => ({
      eyebrow: 'Magic window',
      title: hasName ? `See ${possessive(who.display)} name on the real page` : 'See the name on the real page',
      body: [`We use the camera only on this phone to draw ${hasName ? possessive(who.display) : 'your child’s'} name onto your book. Nothing is recorded or sent anywhere.`],
      steps: [`Open the book at page ${current}.`, 'Hold the phone above the page.', 'Line the picture up — then tap Magic!'],
      primary: { text: 'Turn on the camera', icon: 'camera', testid: 'mw-allow', run: () => allow() },
      note: 'Your browser will ask if the camera can be used.',
    }),
    starting: () => ({ title: 'Opening the camera…', busy: true }),
    denied: () => ({
      eyebrow: 'Camera switched off',
      title: 'The camera isn’t allowed for this site',
      body: [
        `To see ${hasName ? possessive(who.display) : 'the'} name on your book, allow the camera, then tap Try again.`,
        'iPhone: tap “aA” in the address bar › Website Settings › Camera › Allow.',
        'Android (Chrome): tap the icon beside the address › Permissions › Camera › Allow.',
      ],
      primary: { text: 'Try again', icon: 'camera', testid: 'mw-retry', run: () => allow() },
    }),
    nocamera: () => ({
      eyebrow: 'No camera found',
      title: 'We couldn’t find a camera',
      body: ['The magic window needs a phone or tablet with a camera. You can still read the story on screen.'],
      primary: { text: 'Try again', icon: 'camera', testid: 'mw-retry', run: () => allow() },
    }),
    busy: () => ({
      eyebrow: 'Camera busy',
      title: 'The camera is busy',
      body: ['Another app may be using it. Close that app, then try again.'],
      primary: { text: 'Try again', icon: 'camera', testid: 'mw-retry', run: () => allow() },
    }),
    unsupported: () => ({
      eyebrow: 'Magic window',
      title: 'This browser can’t open the camera here',
      body: ['The magic window needs a camera and a secure (https) link. Try opening this page in Safari or Chrome. You can still read the story on screen.'],
    }),
    error: () => ({
      eyebrow: 'Magic window',
      title: 'The camera didn’t start',
      body: ['Please check the camera permission for this site, then try again.'],
      primary: { text: 'Try again', icon: 'camera', testid: 'mw-retry', run: () => allow() },
    }),
    stopped: () => ({
      eyebrow: 'Camera off',
      title: 'The camera stopped',
      body: ['It turns off when you leave the page or another app uses it.'],
      primary: { text: 'Turn it back on', icon: 'camera', testid: 'mw-retry', run: () => allow() },
    }),
  };

  function showCard(kind) {
    const spec = CARDS[kind]?.();
    // Cards carry their own "Back to reading"; hide the top bar's copy behind them.
    el.classList.toggle('has-card', Boolean(spec && !spec.busy));
    if (!spec) {
      card.hidden = true;
      card.replaceChildren();
      return;
    }
    const primary = spec.primary
      ? h('button', { type: 'button', class: 'mw-btn mw-btn-primary', 'data-testid': spec.primary.testid, onClick: spec.primary.run }, icon(spec.primary.icon, 24), h('span', {}, spec.primary.text))
      : null;
    const back = h('button', { type: 'button', class: 'mw-btn mw-btn-quiet', 'data-testid': 'mw-card-exit', onClick: () => exit() }, icon('back', 22), h('span', {}, 'Back to reading'));
    const body = spec.busy
      ? [h('span', { class: 'mw-spinner', 'aria-hidden': 'true' }), h('h2', { class: 'mw-card-title' }, spec.title)]
      : [
          kind === 'explain' ? explainerArt(artWho.display) : null,
          h(
            'div',
            { class: 'mw-card-text' },
            spec.eyebrow ? h('p', { class: 'mw-eyebrow' }, spec.eyebrow) : null,
            h('h2', { class: 'mw-card-title', id: 'mw-card-title' }, spec.title),
            (spec.body ?? []).map((t, i) => h('p', { class: i === 0 ? 'mw-card-lead' : 'mw-card-body', 'data-testid': i === 0 ? 'mw-card-lead' : null }, t)),
            spec.steps ? h('ol', { class: 'mw-steps' }, spec.steps.map((t) => h('li', {}, t))) : null,
            h('div', { class: 'mw-card-actions' }, primary, back),
            spec.note ? h('p', { class: 'mw-card-note' }, icon('lock', 16), h('span', {}, spec.note)) : null,
          ),
        ];
    const box = h('div', { class: `mw-card mw-card-${kind}`, role: spec.busy ? 'status' : 'dialog', 'aria-modal': spec.busy ? null : 'false', 'aria-labelledby': spec.busy ? null : 'mw-card-title' }, body);
    card.replaceChildren(box);
    card.hidden = false;
    // Move focus into the card for keyboard and screen-reader users.
    (primary ?? back)?.focus?.({ preventScroll: true });
  }

  // ---- Camera ----------------------------------------------------------------------------------------
  function stopCamera() {
    if (stream) {
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    stream = null;
    try {
      video.pause();
    } catch {
      /* ignore */
    }
    video.srcObject = null;
    tracking.controller?.stopProcessVideo?.();
  }

  async function openStream() {
    const md = navigator.mediaDevices;
    try {
      // Tests may ask for another size (SB_TEST.camera): a real phone turns 1280x720
      // into 720x1280 when held upright, which desktop Chromium's fake camera can't mimic.
      return await md.getUserMedia(globalThis.SB_TEST?.camera ?? CAMERA_CONSTRAINTS);
    } catch (err) {
      const kind = cameraErrorKind(err);
      // Some cameras refuse the resolution/facing hints; any camera will do.
      if (kind === 'nocamera' || kind === 'busy') return md.getUserMedia({ audio: false, video: true });
      throw err;
    }
  }

  function waitForFrames() {
    return new Promise((resolve) => {
      if (video.readyState >= 2 && video.videoWidth) return resolve();
      const done = () => resolve();
      video.addEventListener('loadeddata', done, { once: true, signal });
      setTimeout(done, 4000);
    });
  }

  // One start at a time: a double tap must not open (and leak) a second stream.
  let starting = null;
  function startCamera() {
    starting ??= openCamera()
      .catch((err) => {
        console.warn('[magic] the camera failed to start', err);
        if (!destroyed) {
          setState('error');
          showCard('error');
        }
        return false;
      })
      .finally(() => {
        starting = null;
      });
    return starting;
  }

  async function openCamera() {
    if (!isCameraSupported()) {
      setState('unsupported');
      showCard('unsupported');
      return false;
    }
    setState('starting');
    showCard('starting');
    let s;
    try {
      s = await openStream();
    } catch (err) {
      if (destroyed) return false;
      const kind = cameraErrorKind(err);
      console.warn(`[magic] camera: ${err?.name ?? 'error'}`);
      setState(kind);
      showCard(kind);
      return false;
    }
    if (destroyed || signal.aborted) {
      for (const t of s.getTracks()) t.stop();
      return false;
    }
    if (stream && stream !== s) stopCamera();
    stream = s;
    for (const t of s.getVideoTracks()) {
      t.addEventListener(
        'ended',
        () => {
          if (destroyed || stream !== s) return;
          stopCamera();
          setState('stopped');
          showCard('stopped');
        },
        { signal },
      );
    }
    video.srcObject = s;
    try {
      await video.play();
    } catch {
      /* muted inline video may still start on its own */
    }
    await waitForFrames();
    if (destroyed) return false;
    setState('live');
    showCard(null);
    el.focus?.({ preventScroll: true });
    const first = !everLive;
    everLive = true;
    if (first) {
      toast('Camera on — only on this phone. Nothing is recorded.');
      say(`Magic window on. Page ${current} of ${pages.length}.`);
      // No saved fit yet for this way up: help the grown-up line it up first.
      if (!readAlignStore(alignStore, orientation)) setAligning(true, { ghost: true });
    }
    writeNames();
    maybeStartTracking().catch(() => {});
    if (tracking.controller && tracking.enabled) tracking.controller.processVideo?.(video);
    return true;
  }

  function allow() {
    // Inside the tap: let sound and speech start later on iOS.
    try {
      sfx?.unlock?.();
    } catch {
      /* ignore */
    }
    try {
      narrator?.unlock?.();
    } catch {
      /* ignore */
    }
    return startCamera();
  }

  async function cameraPermission() {
    try {
      const p = await navigator.permissions?.query?.({ name: 'camera' });
      return p?.state ?? 'prompt';
    } catch {
      return 'prompt';
    }
  }

  // Never keep the camera running in the background.
  document.addEventListener(
    'visibilitychange',
    () => {
      if (destroyed) return;
      if (document.visibilityState === 'hidden') {
        if (stream) {
          resumeWanted = true;
          stopCamera();
          setState('paused');
        }
      } else if (resumeWanted) {
        resumeWanted = false;
        startCamera();
      }
    },
    { signal },
  );
  window.addEventListener(
    'pagehide',
    () => {
      if (!stream) return;
      stopCamera();
      resumeWanted = true;
      setState('paused');
    },
    { signal },
  );
  // Back from the browser's back-forward cache: switch the camera on again.
  window.addEventListener(
    'pageshow',
    (e) => {
      if (e.persisted && resumeWanted && !destroyed && document.visibilityState !== 'hidden') {
        resumeWanted = false;
        startCamera();
      }
    },
    { signal },
  );

  // ---- Layout & alignment ----------------------------------------------------------------------------
  function measure() {
    const r = stageEl.getBoundingClientRect();
    stage = { width: r.width || window.innerWidth, height: r.height || window.innerHeight };
    const next = orientationOf(stage.width, stage.height);
    if (next !== orientation) {
      orientation = next;
      align = readAlignStore(alignStore, orientation) ?? { ...DEFAULT_ALIGN };
    }
    el.dataset.orientation = orientation;
    const fit = fitSize(stage.width, stage.height, { fill: orientation === 'portrait' ? 0.94 : 0.86 });
    overlay.style.width = `${fit.width}px`;
    overlay.style.height = `${fit.height}px`;
    applyAlign();
  }

  function applyAlign() {
    if (tracking.state === 'found') return;
    overlay.style.transform = alignTransform(align, stage);
    overlay.style.setProperty('--mw-s', String(r3(align.scale)));
    const pct = Math.round(align.scale * 100);
    sizeInput.value = String(pct);
    sizeInput.setAttribute('aria-valuetext', `${pct}%`);
    sizeOut.textContent = `${pct}%`;
    el.dataset.align = [align.x, align.y, align.scale, align.rotate].map((v) => r3(v)).join(',');
  }

  function updateAlign(next) {
    align = normaliseAlign(next);
    applyAlign();
    scheduleSave();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAlign, 400);
  }

  function saveAlign() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    alignStore = writeAlignStore(alignStore, orientation, align);
    // blobs.put falls back to memory and never throws; the catch is belt and braces.
    Promise.resolve()
      .then(() => blobs.put(`magic-align:${bookId}`, alignStore))
      .catch(() => {});
  }

  async function loadAlign() {
    try {
      const raw = await blobs.get(`magic-align:${bookId}`);
      alignStore = raw && typeof raw === 'object' ? raw : null;
    } catch {
      alignStore = null;
    }
    align = readAlignStore(alignStore, orientation) ?? { ...DEFAULT_ALIGN };
    applyAlign();
  }

  function setAligning(on, { ghost: withGhost = null } = {}) {
    aligning = Boolean(on);
    el.classList.toggle('is-aligning', aligning);
    alignBtn.setAttribute('aria-pressed', String(aligning));
    panel.hidden = !aligning;
    bottom.hidden = aligning;
    if (withGhost != null) setGhost(withGhost);
    updateHint();
    // Lining up by hand takes over from tracking until Done.
    if (aligning && tracking.found !== -1) lostPage();
    if (aligning) {
      stopReading();
      say('Line up mode. Drag the picture onto the page; pinch or use the slider to resize.');
      if (orientation === 'portrait' && pages[current - 1]?.kind === 'spread') toast('Tip: turn your phone sideways for a two-page spread.', 5000);
      sizeInput.focus?.({ preventScroll: true });
    } else {
      if (ghostOn) setGhost(false);
      hideToast();
      saveAlign();
      if (everLive) celebrateNames();
      playBtn.focus?.({ preventScroll: true });
    }
  }

  // Pointer gestures on the stage (only while lining up, so small hands can't knock it out).
  const pointers = new Map();
  let gesture = null;
  const baseline = () => {
    gesture = { align: { ...align }, pts: [...pointers.values()].map((p) => ({ ...p })) };
  };
  stageEl.addEventListener(
    'pointerdown',
    (e) => {
      if (!aligning || state !== 'live') return;
      e.preventDefault();
      try {
        stageEl.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      baseline();
      el.classList.add('is-dragging');
    },
    { signal },
  );
  stageEl.addEventListener(
    'pointermove',
    (e) => {
      if (!pointers.has(e.pointerId) || !gesture) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = [...pointers.values()];
      if (now.length >= 2 && gesture.pts.length >= 2) {
        align = pinchAlign(gesture.align, gesture.pts.slice(0, 2), now.slice(0, 2), stage);
      } else if (now.length === 1 && gesture.pts.length === 1) {
        align = dragAlign(gesture.align, now[0].x - gesture.pts[0].x, now[0].y - gesture.pts[0].y, stage);
      }
      applyAlign();
    },
    { signal },
  );
  const lift = (e) => {
    if (!pointers.delete(e.pointerId)) return;
    baseline();
    if (!pointers.size) {
      el.classList.remove('is-dragging');
      scheduleSave();
    }
  };
  stageEl.addEventListener('pointerup', lift, { signal });
  stageEl.addEventListener('pointercancel', lift, { signal });
  stageEl.addEventListener(
    'wheel',
    (e) => {
      if (!aligning) return;
      e.preventDefault();
      updateAlign(nudgeAlign(align, { zoom: Math.exp(-e.deltaY * 0.0015) }));
    },
    { passive: false, signal },
  );
  sizeInput.addEventListener('input', () => updateAlign({ ...align, scale: Number(sizeInput.value) / 100 }), { signal });

  el.addEventListener(
    'keydown',
    (e) => {
      if (state !== 'live' || e.target === sizeInput) return;
      const big = e.shiftKey ? 5 : 1;
      if (aligning) {
        const step = 0.004 * big;
        const map = {
          ArrowLeft: { dx: -step },
          ArrowRight: { dx: step },
          ArrowUp: { dy: -step },
          ArrowDown: { dy: step },
          '+': { zoom: 1.02 ** big },
          '=': { zoom: 1.02 ** big },
          '-': { zoom: 1 / 1.02 ** big },
          '[': { turn: -big },
          ']': { turn: big },
        };
        if (map[e.key] && !e.target.closest?.('button')) {
          e.preventDefault();
          updateAlign(nudgeAlign(align, map[e.key]));
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setAligning(false);
        }
        return;
      }
      if (e.target.closest?.('button, input')) return;
      if (e.key === 'ArrowLeft') goTo(current - 1);
      else if (e.key === 'ArrowRight') goTo(current + 1);
    },
    { signal },
  );

  function setGhost(on) {
    ghostOn = Boolean(on);
    ghost.hidden = !ghostOn;
    ghostBtn.setAttribute('aria-pressed', String(ghostOn));
    el.classList.toggle('has-ghost', ghostOn);
    if (ghostOn) loadGhost();
  }

  async function loadGhost() {
    const n = current;
    if (ghost.dataset.page === String(n) && ghost.firstChild) return;
    ghost.dataset.page = String(n);
    try {
      const m = await loadModules();
      const svg = await m.scene.loadScene(book, pages[n - 1], baseUrl);
      if (destroyed || current !== n || !ghostOn) return;
      ghost.replaceChildren(svg);
      const printMod = await import('./print.js');
      printMod.prepareRestState(svg, pages[n - 1], { drive: m.drive, scene: m.scene });
    } catch (err) {
      console.warn('[magic] the page guide didn’t load', err);
      delete ghost.dataset.page;
    }
  }

  // ---- Pages ---------------------------------------------------------------------------------------
  // Names are measured to fit their spots, so give the book's font a moment to arrive first.
  const fontsReady = (() => {
    try {
      const f = document.fonts;
      if (!f?.load) return Promise.resolve();
      return Promise.race([f.load('700 64px Fredoka').catch(() => {}), sleep(1200, signal)]);
    } catch {
      return Promise.resolve();
    }
  })();

  async function loadModules() {
    if (mods) return mods;
    const [scene, nameFit, drive] = await Promise.all([import('../reader/scene.js'), import('../reader/name-fit.js'), import('../reader/drive.js').catch(() => null)]);
    mods = { scene, nameFit, drive };
    return mods;
  }

  function pageTitle(n) {
    const page = pages[n - 1];
    const first = page?.text?.[0] ? fillTemplate(page.text[0], who) : '';
    return first;
  }

  function updateChrome() {
    el.dataset.page = String(current);
    const title = pageTitle(current);
    pageChip.replaceChildren(h('strong', {}, `Page ${current} of ${pages.length}`), title ? h('span', { class: 'mw-chip-title' }, title) : null);
    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= pages.length;
    updateHint();
  }

  /**
   * "Lift the flap on the kit bag! Then tap Magic!" — while the page's moving
   * part hasn't been played. It steps aside after a few seconds so the page
   * stays in view; the Magic! button keeps beckoning.
   */
  let hintTimer = 0;
  let hintFor = '';
  function updateHint() {
    const page = pages[current - 1];
    const prompt = page?.mechanic?.type && page.mechanic.type !== 'none' && page.prompt ? fillTemplate(page.prompt, who).trim() : '';
    const show = Boolean(prompt) && !aligning && !readCtl && !(cur?.n === current && cur.played);
    el.classList.toggle('has-hint', show);
    if (!show) {
      hint.hidden = true;
      return;
    }
    const key = `${current}:${prompt}`;
    if (hintFor === key && !hint.hidden) return;
    hintFor = key;
    hint.replaceChildren(h('span', {}, prompt), ' ', h('strong', {}, 'Then tap Magic!'));
    hint.hidden = false;
    hint.classList.remove('is-out');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add('is-out'), globalThis.SB_TEST?.hintMs ?? 7000);
  }

  /** Show page n's digital layer. Never rejects: a broken page shows a note instead. */
  function showPage(n, opts) {
    return loadPage(n, opts).catch((err) => {
      console.warn(`[magic] page ${n} didn’t open`, err);
      if (!destroyed) layer.replaceChildren(h('p', { class: 'mw-layer-note' }, 'This page’s picture didn’t load.'));
      return null;
    });
  }

  async function loadPage(n, { instantNames = false } = {}) {
    cur?.ctl.abort();
    stopReading();
    const ctl = new AbortController();
    signal.addEventListener('abort', () => ctl.abort(), { once: true });
    current = clampPage(n);
    updateChrome();
    if (ghostOn) loadGhost();
    const page = pages[current - 1];
    let m;
    try {
      m = await loadModules();
    } catch (err) {
      console.warn('[magic] scene helpers unavailable', err);
      layer.replaceChildren(h('p', { class: 'mw-layer-note' }, 'The pictures are nearly ready — please try again soon.'));
      return null;
    }
    let svg;
    try {
      [svg] = await Promise.all([m.scene.loadScene(book, page, baseUrl), fontsReady]);
    } catch (err) {
      if (ctl.signal.aborted) return null;
      console.warn(`[magic] page ${current}: ${err.message}`);
      layer.replaceChildren(h('p', { class: 'mw-layer-note' }, 'This page’s picture didn’t load.'));
      return null;
    }
    if (ctl.signal.aborted || destroyed) return null;
    svg.classList.add('mw-scene');
    svg.setAttribute('aria-hidden', 'true');
    layer.replaceChildren(svg);
    fx.replaceChildren();
    const run = { n: current, page, svg, ctl, played: false, ...setupLayer(svg, page, m, instantNames) };
    cur = run;
    if (state === 'live') writeNames();
    // Warm the next page so turning over is instant.
    const nextPage = pages[current];
    if (nextPage) m.scene.prefetchScene?.(book, nextPage, baseUrl);
    return run;
  }

  /** Prepare the page's digital layer: moving parts at rest, later things hidden, names pending. */
  function setupLayer(svg, page, m, instantNames) {
    const mechanic = page.mechanic ?? { type: 'none' };
    const driven = new Set((mechanic.drives ?? []).map((d) => d?.target));
    try {
      m.scene.hoistAnimations?.(svg, driven);
    } catch {
      /* cosmetic */
    }
    for (const sel of [...(mechanic.complete?.show ?? []), ...(mechanic.midway?.show ?? [])]) byId(svg, sel)?.setAttribute('display', 'none');
    const reveals = [...svg.querySelectorAll('[data-reveal]')];
    for (const node of reveals) node.setAttribute('display', 'none');
    let driver = null;
    try {
      driver = m.drive?.createDriver?.(svg, mechanic.drives ?? []) ?? null;
      driver?.apply(0, { phase: 'out' });
    } catch (err) {
      console.warn('[magic] moving parts unavailable', err);
      driver = null;
    }
    const names = m.nameFit.fillNameSlots(svg, artWho, { animate: !instantNames && !reduced() });
    // Names under a flap stay hidden until the flap "opens" (Magic!), like in the reader.
    const underFlap = new Set();
    if (mechanic.type === 'flap') {
      const flap = byId(svg, mechanic.control?.flap);
      const box = flap && sceneBox(svg, flap);
      if (box) {
        for (const slot of names.pending()) {
          if (flap.contains(slot)) continue;
          const b = sceneBox(svg, slot);
          const before = flap.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_PRECEDING;
          const cx = b ? b.x + b.width / 2 : NaN;
          const cy = b ? b.y + b.height / 2 : NaN;
          if (before && cx > box.x && cx < box.x + box.width && cy > box.y && cy < box.y + box.height) underFlap.add(slot);
        }
      }
    }
    // Remember which elements the magic layer shows, for tests and debugging.
    svg.dataset.magicNames = String(svg.querySelectorAll('.sb-name, .sb-letters').length);
    return { driver, names, reveals, underFlap, mechanic, driven };
  }

  function writeNames({ within = null, filter = null, run = cur } = {}) {
    if (!run?.names || state !== 'live') return Promise.resolve(0);
    return run.names.writeIn({
      within,
      signal: run.ctl.signal,
      instant: reduced(),
      letterMs: 120,
      filter: (e) => (filter ? filter(e) : !run.underFlap.has(e)),
      onLetter: (slot, i) => sparkleAtLetter(run, slot, i),
      onWritten: (slot) => {
        burstAt(run, slot);
        playSfx('ding');
      },
    });
  }

  function goTo(n) {
    const next = clampPage(n);
    if (next === current && cur) return;
    hideToast();
    showPage(next);
    say(`Page ${next} of ${pages.length}. ${pageTitle(next)}`);
    try {
      onPage?.(next);
    } catch (err) {
      console.warn('[magic] onPage failed', err);
    }
  }

  // ---- Sparkles, confetti and sounds -----------------------------------------------------------
  function playSfx(name) {
    try {
      sfx?.play?.(name);
    } catch {
      /* sounds are a bonus */
    }
  }

  function playSeq(names, sig) {
    (names ?? []).forEach((n, i) => {
      sleep(i * SFX_GAP_MS, sig).then(() => !sig?.aborted && playSfx(n));
    });
    return (names?.length ?? 0) * SFX_GAP_MS;
  }

  const STAR = 'M0 -30C4 -8 8 -4 30 0C8 4 4 8 0 30C-4 8 -8 4 -30 0C-8 -4 -4 -8 0 -30Z';
  function spark(x, y, { size = 1, delay = 0, colour = '#FFD84F', drift = [0, 0] } = {}) {
    if (reduced()) return;
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${r3(x)} ${r3(y)}) scale(${r3(size)})`);
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', STAR);
    p.setAttribute('fill', colour);
    p.setAttribute('class', 'mw-spark');
    p.style.setProperty('--dx', `${r3(drift[0])}px`);
    p.style.setProperty('--dy', `${r3(drift[1])}px`);
    p.style.animationDelay = `${delay}ms`;
    g.append(p);
    fx.append(g);
    setTimeout(() => g.remove(), 1200 + delay);
  }

  function sparkleAtLetter(run, slot, i) {
    if (run !== cur) return;
    const parts = slot.classList.contains('sb-letters') ? [...slot.querySelectorAll('text.sb-letter')].filter((t) => t.textContent) : [...slot.querySelectorAll('.sb-ch')];
    const target = parts[i] ?? slot;
    const b = sceneBox(run.svg, target);
    if (!b) return;
    spark(b.x + b.width / 2, b.y + b.height * 0.45, { size: 0.55 + Math.random() * 0.25, colour: i % 2 ? '#FFFFFF' : '#FFD84F', drift: [(Math.random() - 0.5) * 40, -30 - Math.random() * 30] });
  }

  function burstAt(run, slot) {
    if (run !== cur) return;
    const b = sceneBox(run.svg, slot);
    if (!b) return;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const rx = b.width / 2 + 26;
      const ry = b.height / 2 + 22;
      spark(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, { size: 0.45 + Math.random() * 0.5, delay: i * 40, colour: ['#FFD84F', '#FFFFFF', '#7EC8F0'][i % 3], drift: [Math.cos(a) * 36, Math.sin(a) * 36] });
    }
  }

  function celebrateNames() {
    if (!cur) return;
    for (const slot of cur.svg.querySelectorAll('text.sb-name, .sb-letters')) {
      if (slot.getAttribute('display') === 'none' || cur.names?.pending().includes(slot)) continue;
      if (slot.closest('[display="none"]')) continue;
      burstAt(cur, slot);
    }
    playSfx('sparkle');
  }

  const CONFETTI = ['#E8505B', '#FFC83D', '#7EC8F0', '#6CC24A', '#FFFFFF', '#3E7BDB', '#F59A2B'];
  function burstConfetti() {
    if (reduced()) return;
    const w = confetti.clientWidth || 360;
    const hgt = confetti.clientHeight || 640;
    const batch = [];
    for (let i = 0; i < 56; i++) {
      const piece = h('span', { class: `mw-confetti-piece${i % 3 === 0 ? ' is-round' : ''}` });
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      const power = 0.5 + Math.random() * 0.6;
      piece.style.setProperty('--x', `${Math.round(Math.cos(angle) * power * w * 0.5)}px`);
      piece.style.setProperty('--up', `${Math.round(Math.sin(angle) * power * hgt * 0.4)}px`);
      piece.style.setProperty('--fall', `${Math.round(hgt * (0.35 + Math.random() * 0.6))}px`);
      piece.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 1080)}deg`);
      piece.style.setProperty('--d', `${Math.round(Math.random() * 160)}ms`);
      piece.style.setProperty('--c', CONFETTI[i % CONFETTI.length]);
      piece.style.left = `${44 + Math.random() * 12}%`;
      batch.push(piece);
    }
    confetti.append(...batch);
    setTimeout(() => batch.forEach((p) => p.remove()), 2800);
  }

  // ---- Magic! (the page's moving part, played over the real page) -------------------------------------
  function animateClass(run, node, cls) {
    const target = mods.scene.needsAnimationWrapper?.(node, run.driven) ? mods.scene.animationWrapper(node) : node;
    target.classList.remove(cls);
    void target.getBBox?.();
    target.classList.add(cls);
  }

  function runEffects(run, fx0, { reveal = false } = {}) {
    const f = fx0 ?? {};
    const sig = run.ctl.signal;
    const shown = [];
    for (const sel of f.show ?? []) {
      const node = byId(run.svg, sel);
      if (!node) continue;
      node.removeAttribute('display');
      animateClass(run, node, 'sb-pop-in');
      shown.push(node);
    }
    for (const sel of f.hide ?? []) {
      const node = byId(run.svg, sel);
      if (!node) continue;
      node.classList.add('sb-fade-out');
      sleep(reduced() ? 0 : 260, sig).then(() => node.setAttribute('display', 'none'));
    }
    for (const pair of f.addClass ?? []) {
      const node = Array.isArray(pair) ? byId(run.svg, pair[0]) : null;
      if (!node || typeof pair[1] !== 'string') continue;
      for (const cls of pair[1].split(/\s+/).filter(Boolean)) {
        if (mods.scene.ANIMATION_CLASSES?.includes(cls)) animateClass(run, node, cls);
        else node.classList.add(cls);
      }
    }
    const soundMs = playSeq(f.sfx, sig);
    if (f.confetti) burstConfetti();
    const waits = [sleep(Math.max(500, soundMs + 300), sig)];
    for (const node of shown) waits.push(writeNames({ within: node, filter: () => true, run }));
    if (reveal) {
      for (const node of run.reveals) {
        node.removeAttribute('display');
        animateClass(run, node, 'sb-pop-in');
      }
      waits.push(writeNames({ filter: () => true, run }));
    }
    return Promise.all(waits);
  }

  async function play() {
    if (playing || !cur || state !== 'live') return;
    try {
      sfx?.unlock?.();
    } catch {
      /* ignore */
    }
    playing = true;
    el.dataset.playing = '1';
    playBtn.setAttribute('aria-busy', 'true');
    try {
      let run = cur;
      // Play it again from the start (names stay written).
      if (run.played) run = (await showPage(run.n, { instantNames: true })) ?? run;
      if (!run || run !== cur) return;
      const m = run.mechanic;
      const sig = run.ctl.signal;
      if (!m || m.type === 'none' || !run.driver) {
        celebrateNames();
        await writeNames({ filter: () => true, run });
        await runEffects(run, m?.complete, { reveal: true });
      } else {
        const step = (p, phase) => {
          run.driver.apply(p, { phase });
          if (run.underFlap.size && p >= 0.45) {
            const slots = new Set(run.underFlap);
            run.underFlap.clear();
            writeNames({ filter: (e) => slots.has(e), run });
          }
          // A name riding in on a flip-book frame writes itself once it shows.
          if (run.names.pending().length) writeNames({ run });
        };
        playSfx('swoosh');
        const ms = reduced() ? 0 : PLAY_MS;
        await tween(0, 1, ms, (p) => step(p, 'out'), sig);
        if (m.control?.returnTrip && !sig.aborted) {
          await runEffects(run, m.midway);
          await tween(1, 0, ms * 0.8, (p) => step(p, 'back'), sig);
        }
        if (!sig.aborted) await runEffects(run, m.complete, { reveal: true });
      }
      run.played = true;
      updateHint();
      say('Ta-da!');
    } catch (err) {
      console.warn('[magic] play failed', err);
    } finally {
      playing = false;
      delete el.dataset.playing;
      playBtn.removeAttribute('aria-busy');
    }
  }

  // ---- Read aloud (with a caption, word by word) ----------------------------------------------------
  function stopReading() {
    if (!readCtl) return;
    readCtl.abort();
    readCtl = null;
    try {
      narrator?.stop?.();
    } catch {
      /* ignore */
    }
    readBtn.setAttribute('aria-pressed', 'false');
    readBtn.replaceChildren(icon('speaker', 26));
    readBtn.setAttribute('aria-label', 'Read this page aloud');
    caption.hidden = true;
    updateHint();
  }

  async function toggleRead() {
    if (readCtl) return stopReading();
    if (!narrator?.play) return;
    try {
      narrator.unlock?.();
    } catch {
      /* ignore */
    }
    const page = pages[current - 1];
    const plan = planLines(page?.text ?? [], who);
    if (!plan.segments.length) return;
    const ctl = new AbortController();
    readCtl = ctl;
    readBtn.setAttribute('aria-pressed', 'true');
    readBtn.setAttribute('aria-label', 'Stop reading');
    hint.hidden = true;
    readBtn.replaceChildren(icon('stop', 24));
    let shownLine = -1;
    let spans = [];
    const showLine = (li) => {
      shownLine = li;
      spans = plan.lines[li].units.map((u) => h('span', { class: u.isName ? 'mw-word is-name' : 'mw-word' }, u.text));
      const parts = [];
      spans.forEach((s, i) => parts.push(i ? ' ' : '', s));
      caption.replaceChildren(...parts);
      caption.hidden = false;
    };
    try {
      const r = await narrator.play(plan, {
        signal: ctl.signal,
        onUnit: (line, unit) => {
          if (ctl.signal.aborted) return;
          if (line !== shownLine) showLine(line);
          spans.forEach((s, i) => s.classList.toggle('is-current', i === unit));
        },
      });
      if (r === 'done' && !ctl.signal.aborted) await sleep(1200, ctl.signal);
    } catch (err) {
      console.warn('[magic] reading failed', err);
    }
    if (readCtl === ctl) stopReading();
  }

  // ---- Experimental image tracking (MindAR) ------------------------------------------------------------
  function setTracking(s, text) {
    tracking.state = s;
    el.dataset.tracking = s;
    if (s === 'off') {
      trackBtn.hidden = true;
      return;
    }
    trackBtn.hidden = false;
    trackBtn.setAttribute('aria-pressed', String(tracking.enabled));
    trackBtn.replaceChildren(icon('target', 18), h('span', {}, text), h('em', {}, 'beta'));
  }

  async function maybeStartTracking() {
    if (tracking.state !== 'off' || destroyed || book?.targets === false) return;
    let url;
    try {
      const path = typeof book?.targets === 'string' ? book.targets : 'targets.mind';
      url = new URL(path, new URL(String(baseUrl).replace(/\/?$/, '/'), location.href)).href;
    } catch {
      return;
    }
    const exists = typeof book?.targets === 'string' ? true : await targetsExist(url);
    if (!exists || destroyed || tracking.state !== 'off') return;
    setTracking('loading', 'Auto line-up: getting ready…');
    try {
      const mod = await import(/* webpackIgnore: true */ MINDAR_URL);
      const Controller = mod.Controller ?? globalThis.MINDAR?.IMAGE?.Controller;
      if (!Controller) throw new Error('MindAR did not load');
      await waitForFrames();
      if (destroyed || !stream) throw new Error('camera stopped');
      // MindAR reads the frame size from the element's width/height attributes.
      video.width = video.videoWidth;
      video.height = video.videoHeight;
      const input = { width: video.videoWidth, height: video.videoHeight };
      const controller = new Controller({ inputWidth: input.width, inputHeight: input.height, maxTrack: 1, filterMinCF: 0.001, filterBeta: 10, onUpdate: (d) => onTrackUpdate(d, input) });
      tracking.controller = controller;
      const { dimensions } = await controller.addImageTargets(url);
      tracking.markers = dimensions;
      controller.dummyRun?.(video);
      if (destroyed) return disposeTracking();
      if (tracking.enabled && stream) controller.processVideo(video);
      setTracking('searching', 'Auto line-up: looking for the page…');
    } catch (err) {
      console.warn('[magic] image tracking unavailable; lining up by hand', err?.message ?? err);
      disposeTracking();
      setTracking('failed', 'Auto line-up unavailable');
      setTimeout(() => !destroyed && tracking.state === 'failed' && (trackBtn.hidden = true), 5000);
    }
  }

  function onTrackUpdate(data, input) {
    if (destroyed || data?.type !== 'updateMatrix' || !tracking.enabled || aligning) return;
    const { targetIndex, worldMatrix } = data;
    if (!worldMatrix) {
      if (tracking.found === targetIndex) {
        clearTimeout(tracking.lostTimer);
        tracking.lostTimer = setTimeout(() => lostPage(), 400);
      }
      return;
    }
    clearTimeout(tracking.lostTimer);
    const n = targetIndex + 1;
    if (n !== current && pages[n - 1]) goTo(n); // turning the real page turns ours
    const marker = tracking.markers?.[targetIndex];
    if (!marker) return;
    const quad = trackedQuad(worldMatrix, tracking.controller.getProjectionMatrix(), marker, input, coverFit(input.width, input.height, stage.width, stage.height));
    const m = quad && rectToQuadMatrix(overlay.offsetWidth, overlay.offsetHeight, quad);
    if (!m) return;
    if (tracking.found !== targetIndex) {
      tracking.found = targetIndex;
      overlay.classList.add('is-tracked');
      setTracking('found', `Auto line-up: found page ${n}`);
    }
    overlay.style.transform = matrix3dCss(m);
  }

  function lostPage() {
    tracking.found = -1;
    overlay.classList.remove('is-tracked');
    if (tracking.state === 'found') setTracking('searching', 'Auto line-up: looking for the page…');
    applyAlign();
  }

  function toggleTracking() {
    tracking.enabled = !tracking.enabled;
    if (!tracking.enabled) {
      tracking.controller?.stopProcessVideo?.();
      lostPage();
      setTracking(tracking.state === 'failed' ? 'failed' : 'searching', 'Auto line-up: off');
    } else {
      if (stream) tracking.controller?.processVideo?.(video);
      setTracking('searching', 'Auto line-up: looking for the page…');
    }
  }

  function disposeTracking() {
    clearTimeout(tracking.lostTimer);
    try {
      tracking.controller?.stopProcessVideo?.();
      tracking.controller?.dispose?.();
    } catch {
      /* ignore */
    }
    tracking.controller = null;
    overlay.classList.remove('is-tracked');
  }

  // ---- Leaving ----------------------------------------------------------------------------------------
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopReading();
    if (saveTimer) saveAlign();
    stopCamera();
    disposeTracking();
    clearTimeout(toastTimer);
    clearTimeout(hintTimer);
    life.abort();
    ro?.disconnect();
    el.remove();
    document.documentElement.classList.remove('mw-open');
  }

  function exit() {
    // Stop the camera first: the grown-up should see it go off at once.
    stopCamera();
    if (typeof onExit === 'function') {
      try {
        onExit();
      } catch (err) {
        console.warn('[magic] onExit failed', err);
      }
    } else destroy();
  }

  // ---- Start ---------------------------------------------------------------------------------------
  let ro = null;
  try {
    ro = new ResizeObserver(() => !destroyed && measure());
    ro.observe(stageEl);
  } catch {
    window.addEventListener('resize', measure, { signal });
  }
  measure();
  updateChrome();
  const [perm] = await Promise.all([cameraPermission(), loadAlign(), showPage(current)]);
  if (destroyed) return { destroy, goTo, play };
  measure();

  if (!isCameraSupported()) {
    setState('unsupported');
    showCard('unsupported');
  } else if (perm === 'granted' && explain !== 'always') {
    startCamera();
  } else if (perm === 'denied') {
    setState('denied');
    showCard('denied');
  } else {
    setState('explain');
    showCard('explain');
  }

  return { destroy, goTo, play };
}
