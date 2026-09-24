// The on-screen twin of each page's moving part: slider, pull-tab, wheel,
// lift-the-flap and push-button (docs/architecture.md, "Controls").
//
// Designed for small hands first: generous invisible hit areas (never under
// 56 CSS px), dragging moves the part relative to the finger so it never
// jumps, and a simple tap plays a "show me" animation that finishes the move
// by itself. Keyboard users get arrows to nudge and Enter/Space to finish.
// Every control reports progress 0..1; the reader turns that into scene
// animation through drives (drive.js).

import { clamp01, ease, lerp, pick, applyMatrix, num } from './drive.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const TAP_MOVE_PX = 8;
export const TAP_MS = 300;
export const HIT_MIN_PX = 56;
export const RETURN_AT = 0.05;
const SHOW_ME_MS = 900;
const SHOW_ME_REDUCED_MS = 320;
const KEY_STEP = 0.1;

// ---- Pure geometry (unit-tested) -------------------------------------------

/** Where a point falls along the segment from -> to (0 at from, 1 at to; not clamped). */
export function projectOnSegment(pt, from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return 0;
  return ((pt[0] - from[0]) * dx + (pt[1] - from[1]) * dy) / len2;
}

/** Progress change for a pointer movement (dx, dy) along from -> to. */
export function segmentDelta(delta, from, to) {
  return projectOnSegment([from[0] + delta[0], from[1] + delta[1]], from, to);
}

/** Angle of a point around a centre in degrees; clockwise is positive because SVG's y axis points down. */
export function angleOf(pt, centre) {
  return (Math.atan2(pt[1] - centre[1], pt[0] - centre[0]) * 180) / Math.PI;
}

/** Signed shortest turn from angle a to angle b, in (-180, 180]. Keeps a wheel from jumping at ±180°. */
export function angleDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Wheel progress from its accumulated angle. Before completion it is simply
 * angle / total; afterwards the wheel keeps going round and progress cycles,
 * so a toddler can keep flicking through the poses.
 */
export function wheelProgress(acc, total, completed = false) {
  if (!(total > 0)) return 0;
  if (acc <= 0) return 0;
  if (!completed || acc <= total) return clamp01(acc / total);
  const r = (acc - total) % total;
  return r === 0 ? 1 : r / total;
}

/** Which way lifts a flap (unit vector): towards and over the hinge, like lifting it off the page. */
export function flapAxis(hinge) {
  return { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[hinge] ?? [0, -1];
}

/**
 * The 3D-ish transform for a flap lifted by p (0 closed, 1 fully open),
 * pivoting on its hinge edge. The flap swings through edge-on at p = 0.5 and
 * lands foreshortened on the other side of the hinge; a little skew and
 * widening sell the perspective.
 * @param {number} p
 * @param {'top'|'bottom'|'left'|'right'} hinge
 * @param {{x:number, y:number, width:number, height:number}} box the flap's own bounding box
 * @returns {{transform: string, back: boolean, lift: number}}
 */
export function flapTransform(p, hinge, box) {
  const t = clamp01(p);
  const theta = t * Math.PI;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  let fore = c >= 0 ? c : c * 0.62; // the open flap leans back, so it looks shorter
  if (Math.abs(fore) < 0.002) fore = fore < 0 ? -0.002 : 0.002; // never a singular matrix
  const widen = 1 + 0.06 * s;
  const skew = 7 * s;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let px;
  let py;
  let body;
  if (hinge === 'left' || hinge === 'right') {
    px = hinge === 'left' ? box.x : box.x + box.width;
    py = cy;
    body = `skewY(${num(hinge === 'left' ? -skew : skew)}) scale(${num(fore)} ${num(widen)})`;
  } else {
    px = cx;
    py = hinge === 'bottom' ? box.y + box.height : box.y;
    body = `skewX(${num(hinge === 'bottom' ? skew : -skew)}) scale(${num(widen)} ${num(fore)})`;
  }
  if (t === 0) return { transform: '', back: false, lift: 0 };
  return { transform: `translate(${num(px)} ${num(py)}) ${body} translate(${num(-px)} ${num(-py)})`, back: c < 0, lift: s };
}

/** A press/drag that barely moved and was quick counts as a tap ("show me"). */
export function isTap(movedPx, ms) {
  return movedPx < TAP_MOVE_PX && ms < TAP_MS;
}

/**
 * Progress bookkeeping for every control type: which half of a return trip
 * we're in and when midway/completion fire (each exactly once).
 * @param {{phase: 'out'|'back', done: boolean, midway: boolean}} s
 * @param {number} p
 * @param {{at?: number, returnTrip?: boolean}} opts
 * @returns {{phase: 'out'|'back', done: boolean, midway: boolean, fireMidway: boolean, fireComplete: boolean}}
 */
export function stepProgress(s, p, { at = 0.95, returnTrip = false } = {}) {
  const next = { phase: s.phase, done: s.done, midway: s.midway, fireMidway: false, fireComplete: false };
  if (returnTrip) {
    if (next.phase === 'out' && p >= at) {
      next.phase = 'back';
      if (!next.midway) next.midway = next.fireMidway = true;
    } else if (next.phase === 'back' && p <= RETURN_AT && !next.done) {
      next.done = next.fireComplete = true;
    }
  } else if (!next.done && p >= at) {
    next.done = next.fireComplete = true;
  }
  return next;
}

/** Arrow-key nudge (+1 / -1 / 0) for a control whose travel points along dir. */
export function keyDirection(key, dir = [1, 0]) {
  const vertical = Math.abs(dir[1]) > Math.abs(dir[0]);
  switch (key) {
    case 'ArrowRight':
      return vertical ? 1 : Math.sign(dir[0]) || 1;
    case 'ArrowLeft':
      return vertical ? -1 : -(Math.sign(dir[0]) || 1);
    case 'ArrowUp':
      return vertical ? (dir[1] < 0 ? 1 : -1) : 1;
    case 'ArrowDown':
      return vertical ? (dir[1] < 0 ? -1 : 1) : -1;
    default:
      return 0;
  }
}

// ---- DOM helpers -------------------------------------------------------------

function svg(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

let uid = 0;

/** Scene-space bounding box of an element (its getBBox mapped through any transforms). */
function sceneBox(svgRoot, el) {
  try {
    const b = el.getBBox();
    const m = svgRoot.getScreenCTM()?.inverse().multiply(el.getScreenCTM());
    if (!m) return { x: b.x, y: b.y, width: b.width, height: b.height };
    const pts = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ].map(([x, y]) => applyMatrix(m, x, y));
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  } catch {
    return null;
  }
}

/** Matrix from scene coordinates into the coordinate system an element's transform attribute works in. */
function sceneToParent(svgRoot, el) {
  try {
    const parent = el.parentNode;
    if (!parent || parent === svgRoot) return null;
    return parent.getScreenCTM().inverse().multiply(svgRoot.getScreenCTM());
  } catch {
    return null;
  }
}

const vec = (m, v) => (m ? [m.a * v[0] + m.c * v[1], m.b * v[0] + m.d * v[1]] : v);
const pt = (m, p) => (m ? applyMatrix(m, p[0], p[1]) : p);

/** Scene units per CSS pixel right now (the scene scales with the screen). */
function unitsPerPx(svgRoot) {
  try {
    const m = svgRoot.getScreenCTM();
    const s = m ? Math.hypot(m.a, m.b) : 0;
    if (s > 0) return 1 / s;
  } catch {
    /* fall through */
  }
  const w = svgRoot.clientWidth || svgRoot.getBoundingClientRect?.().width || 1600;
  return 1600 / w;
}

function animateValue(from, to, ms, easing, onFrame, done) {
  let raf = 0;
  let start = 0;
  let stopped = false;
  const step = (now) => {
    if (stopped) return;
    start ||= now;
    const t = ms > 0 ? Math.min(1, (now - start) / ms) : 1;
    onFrame(lerp(from, to, ease(easing, t)));
    if (t < 1) raf = requestAnimationFrame(step);
    else done?.();
  };
  raf = requestAnimationFrame(step);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

// ---- Artwork for controls the artist didn't draw -----------------------------

const INK = '#2B2A33';

function chevron(parent, x, y, angle, size, colour = INK) {
  const s = size;
  svg('path', {
    d: `M ${num(-s * 0.35)} ${num(-s * 0.5)} L ${num(s * 0.25)} 0 L ${num(-s * 0.35)} ${num(s * 0.5)}`,
    transform: `translate(${num(x)} ${num(y)}) rotate(${num(angle)})`,
    fill: 'none',
    stroke: colour,
    'stroke-width': 9,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }, parent);
}

function drawSliderKnob(parent, angle, twoWay) {
  const g = svg('g', { class: 'sb-control-knob' }, parent);
  svg('circle', { r: 64, fill: INK, opacity: 0.18, cy: 8 }, g);
  svg('circle', { r: 58, fill: '#FFC83D', stroke: INK, 'stroke-width': 6 }, g);
  svg('path', { d: 'M -34 -22 A 40 40 0 0 1 -6 -42', fill: 'none', stroke: '#FFFFFF', 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.8 }, g);
  const rad = (angle * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);
  chevron(g, ux * 14, uy * 14, angle, 34);
  if (twoWay) chevron(g, -ux * 14, -uy * 14, angle + 180, 34);
  return g;
}

function drawPullTab(parent, angle) {
  const g = svg('g', { class: 'sb-control-knob' }, parent);
  const inner = svg('g', { transform: `rotate(${num(angle)})` }, g);
  svg('rect', { x: -96, y: -52, width: 192, height: 104, rx: 30, fill: INK, opacity: 0.18, transform: 'translate(0 8)' }, inner);
  svg('rect', { x: -96, y: -52, width: 192, height: 104, rx: 30, fill: '#E8505B', stroke: INK, 'stroke-width': 6 }, inner);
  svg('rect', { x: -70, y: -34, width: 70, height: 14, rx: 7, fill: '#FFFFFF', opacity: 0.45 }, inner);
  svg('path', { d: 'M -46 0 L 40 0 M 12 -28 L 44 0 L 12 28', fill: 'none', stroke: '#FFFFFF', 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, inner);
  return g;
}

function drawWheel(parent, r) {
  const g = svg('g', { class: 'sb-control-wheel' }, parent);
  svg('circle', { r: r + 22, fill: 'none', stroke: INK, 'stroke-width': 6 }, g);
  svg('circle', { r, fill: 'none', stroke: '#FFC83D', 'stroke-width': 40 }, g);
  svg('circle', { r: r - 22, fill: 'none', stroke: INK, 'stroke-width': 6 }, g);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    svg('line', {
      x1: num(Math.cos(a) * (r - 13)),
      y1: num(Math.sin(a) * (r - 13)),
      x2: num(Math.cos(a) * (r + 13)),
      y2: num(Math.sin(a) * (r + 13)),
      stroke: '#E0A21C',
      'stroke-width': 8,
      'stroke-linecap': 'round',
    }, g);
  }
  // The thumb notch, like the one that pokes out of the page edge.
  svg('circle', { cy: r, r: 40, fill: '#E8505B', stroke: INK, 'stroke-width': 6 }, g);
  svg('circle', { cx: -12, cy: r - 12, r: 10, fill: '#FFFFFF', opacity: 0.6 }, g);
  return g;
}

function drawButton(parent, r) {
  const g = svg('g', { class: 'sb-control-button' }, parent);
  svg('circle', { r: r + 12, cy: 12, fill: INK }, g);
  svg('circle', { r: r + 12, fill: '#FFE9A8', stroke: INK, 'stroke-width': 6 }, g);
  const dome = svg('g', { class: 'sb-control-dome' }, g);
  svg('circle', { r, fill: '#E8505B', stroke: INK, 'stroke-width': 6 }, dome);
  svg('ellipse', { cx: -r * 0.32, cy: -r * 0.36, rx: r * 0.3, ry: r * 0.18, fill: '#FFFFFF', opacity: 0.65, transform: `rotate(-30 ${num(-r * 0.32)} ${num(-r * 0.36)})` }, dome);
  return { g, dome };
}

/**
 * A friendly cartoon hand, fingertip at (0, 0), about 140 units tall: the
 * universal "touch here" for grown-ups and toddlers alike.
 */
function drawHand(parent) {
  const g = svg('g', { class: 'sb-ghost-hand' }, parent);
  const shapes = (layer) => {
    svg('rect', { x: -16, y: 0, width: 32, height: 92, rx: 16 }, layer); // pointing finger
    svg('rect', { x: 12, y: 46, width: 28, height: 44, rx: 14 }, layer); // curled fingers
    svg('rect', { x: 34, y: 54, width: 26, height: 40, rx: 13 }, layer);
    svg('rect', { x: 54, y: 64, width: 22, height: 34, rx: 11 }, layer);
    svg('rect', { x: -18, y: 58, width: 92, height: 76, rx: 30 }, layer); // palm
    svg('rect', { x: -50, y: 78, width: 50, height: 28, rx: 14, transform: 'rotate(30 -25 92)' }, layer); // thumb
  };
  // Outline layer, then the white fill on top: one clean silhouette, no inner lines.
  shapes(svg('g', { fill: INK, stroke: INK, 'stroke-width': 14, 'stroke-linejoin': 'round' }, g));
  shapes(svg('g', { fill: '#FFFFFF' }, g));
  svg('path', { d: 'M-4 14 Q 0 8 4 14', fill: 'none', stroke: '#F3C9B8', 'stroke-width': 6, 'stroke-linecap': 'round' }, g); // nail
  return g;
}

function flapFilters(defs, id) {
  // Card back: the flap's own silhouette as plain board with a dark edge.
  const back = svg('filter', { id: `${id}-back`, x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' }, defs);
  svg('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius: 3, result: 'outer' }, back);
  svg('feFlood', { 'flood-color': INK, result: 'ink' }, back);
  svg('feComposite', { in: 'ink', in2: 'outer', operator: 'in', result: 'edge' }, back);
  svg('feMorphology', { in: 'SourceAlpha', operator: 'erode', radius: 3, result: 'inner' }, back);
  svg('feFlood', { 'flood-color': '#F3E1C0', result: 'card' }, back);
  svg('feComposite', { in: 'card', in2: 'inner', operator: 'in', result: 'face' }, back);
  const merge = svg('feMerge', {}, back);
  svg('feMergeNode', { in: 'edge' }, merge);
  svg('feMergeNode', { in: 'face' }, merge);
  // Lifting: a soft shadow falls on whatever is underneath.
  const lift = svg('filter', { id: `${id}-lift`, x: '-20%', y: '-20%', width: '140%', height: '160%', 'color-interpolation-filters': 'sRGB' }, defs);
  svg('feDropShadow', { dx: 0, dy: 16, stdDeviation: 12, 'flood-color': INK, 'flood-opacity': 0.35 }, lift);
}

// ---- The control -------------------------------------------------------------

/**
 * Create the interactive twin of a page's mechanism inside a mounted scene.
 * @param {SVGSVGElement} svgRoot scene (in the document)
 * @param {{type: string, control?: object, drives?: object[], complete?: {at?: number}}} mechanic
 * @param {{label?: string, onProgress?: (p: number, info: {phase: 'out'|'back', source: string, done: boolean}) => void,
 *   onComplete?: () => void, onMidway?: () => void, onStart?: () => void, reducedMotion?: boolean, hint?: boolean}} [opts]
 *   onStart fires on first touch of each interaction (finger, key or tap).
 * @returns {{el: SVGGElement, complete(): Promise<void>, destroy(): void, hint(on: boolean): void,
 *   readonly progress: number, readonly done: boolean, readonly phase: 'out'|'back'} | null}
 *   null for mechanic type "none" or an unknown type.
 */
export function createControl(svgRoot, mechanic, { label = '', onProgress, onComplete, onMidway, onStart, reducedMotion = false, hint = true } = {}) {
  const type = mechanic?.type;
  if (!['slider', 'pull-tab', 'wheel', 'flap', 'push-button'].includes(type)) return null;
  const c = mechanic.control ?? {};
  const at = Number.isFinite(mechanic.complete?.at) ? mechanic.complete.at : 0.95;
  const returnTrip = Boolean(c.returnTrip) && (type === 'slider' || type === 'pull-tab');
  const driven = new Set((mechanic.drives ?? []).map((d) => d?.target));
  const id = `sb-ctl-${++uid}`;
  const showMs = reducedMotion ? SHOW_ME_REDUCED_MS : SHOW_ME_MS;

  let p = 0;
  let state = { phase: 'out', done: false, midway: false };
  let stopAnim = null;
  let drag = null;
  let destroyed = false;
  let seq = 0;
  const cleanups = [];
  const listen = (target, type_, fn, opts) => {
    if (!target) return;
    target.addEventListener(type_, fn, opts);
    cleanups.push(() => target.removeEventListener(type_, fn, opts));
  };

  const el = svg('g', {
    class: `sb-control sb-control-${type}`,
    'data-testid': 'control',
    'data-type': type,
    'data-state': 'idle',
    'data-progress': '0',
    tabindex: 0,
    role: type === 'flap' || type === 'push-button' ? 'button' : 'slider',
    'aria-label': label || { slider: 'Slide it', 'pull-tab': 'Pull the tab', wheel: 'Turn the wheel', flap: 'Lift the flap', 'push-button': 'Press the button' }[type],
  });
  if (el.getAttribute('role') === 'slider') {
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '100');
    el.setAttribute('aria-valuenow', '0');
  }
  const defs = svg('defs', {}, el);
  const focusRing = svg('g', { class: 'sb-focus-ring', 'aria-hidden': 'true' }, el);
  const art = svg('g', { class: 'sb-control-art', 'aria-hidden': 'true' }, el);
  const hintLayer = svg('g', { class: 'sb-control-hints', 'aria-hidden': 'true' }, el);
  const hit = svg('g', { class: 'sb-control-hit' }, el);
  svgRoot.appendChild(el);

  const grabbers = [el];
  const hitFill = { fill: '#000', 'fill-opacity': 0, 'pointer-events': 'all' };
  const hitStroke = { fill: 'none', stroke: '#000', 'stroke-opacity': 0, 'stroke-linecap': 'round', 'pointer-events': 'all' };

  // ---- Per-type geometry --------------------------------------------------
  /** @type {{render(p: number): void, begin(d: object, at: number[]): void, move(d: object, at: number[]): number,
   *  layout(): void, hintAt(): number[], keyDir: number[], press?: (down: boolean) => void}} */
  let kind;

  const knob = typeof c.knob === 'string' ? pick(svgRoot, c.knob) : null;
  const knobMovable = knob && !driven.has(c.knob);
  const knobBase = knob?.getAttribute('transform') ?? '';
  const knobM = knob ? sceneToParent(svgRoot, knob) : null;
  if (knob) grabbers.push(knob);

  if (type === 'slider' || type === 'pull-tab') {
    const from = Array.isArray(c.from) ? c.from : [400, 850];
    const to = Array.isArray(c.to) ? c.to : [1200, 850];
    const dir = [to[0] - from[0], to[1] - from[1]];
    const angle = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
    let drawn = null;
    let groove = null;
    if (!knob) {
      if (type === 'slider') {
        const gg = svg('g', { class: 'sb-control-groove' }, art);
        svg('line', { x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: INK, 'stroke-width': 70, 'stroke-linecap': 'round', opacity: 0.9 }, gg);
        svg('line', { x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: '#F7E6CC', 'stroke-width': 56, 'stroke-linecap': 'round' }, gg);
        svg('line', { x1: from[0], y1: from[1], x2: to[0], y2: to[1], stroke: '#D9B68A', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-dasharray': '2 26' }, gg);
        drawn = drawSliderKnob(art, angle, returnTrip);
      } else {
        // A slot in the page with the tab poking out of it.
        const nx = -Math.sin((angle * Math.PI) / 180);
        const ny = Math.cos((angle * Math.PI) / 180);
        svg('line', { x1: num(from[0] - nx * 70), y1: num(from[1] - ny * 70), x2: num(from[0] + nx * 70), y2: num(from[1] + ny * 70), stroke: INK, 'stroke-width': 14, 'stroke-linecap': 'round' }, art);
        drawn = drawPullTab(art, angle);
      }
    }
    const grooveHit = svg('line', { x1: from[0], y1: from[1], x2: to[0], y2: to[1], ...hitStroke }, hit);
    const knobHit = svg('circle', { r: 60, ...hitFill }, hit);
    groove = grooveHit;
    const knobPos = (q) => [lerp(from[0], to[0], q), lerp(from[1], to[1], q)];
    kind = {
      keyDir: dir,
      render(q) {
        const [x, y] = knobPos(q);
        drawn?.setAttribute('transform', `translate(${num(x)} ${num(y)})`);
        knobHit.setAttribute('cx', num(x));
        knobHit.setAttribute('cy', num(y));
        if (knobMovable) {
          const [dx, dy] = vec(knobM, [x - from[0], y - from[1]]);
          knob.setAttribute('transform', `translate(${num(dx)} ${num(dy)}) ${knobBase}`.trim());
        }
      },
      begin(d) {
        d.p0 = p;
      },
      move(d, at_) {
        return clamp01(d.p0 + segmentDelta([at_[0] - d.start[0], at_[1] - d.start[1]], from, to));
      },
      layout() {
        const u = unitsPerPx(svgRoot);
        groove.setAttribute('stroke-width', num(Math.max(130, HIT_MIN_PX * 1.1 * u)));
        knobHit.setAttribute('r', num(Math.max(70, (HIT_MIN_PX / 2) * 1.3 * u)));
        focusRing.replaceChildren();
        // A pill-shaped outline round the whole groove.
        const len = Math.hypot(dir[0], dir[1]);
        const ph = Math.max(150, 64 * u);
        svg('rect', {
          x: num(-len / 2 - ph / 2), y: num(-ph / 2), width: num(len + ph), height: num(ph), rx: num(ph / 2),
          fill: 'none', stroke: '#1D6FE0', 'stroke-width': num(Math.max(10, 4 * u)),
          transform: `translate(${num((from[0] + to[0]) / 2)} ${num((from[1] + to[1]) / 2)}) rotate(${num(angle)})`,
        }, focusRing);
      },
      hintAt() {
        if (knob && !knobMovable) {
          const b = sceneBox(svgRoot, knob);
          if (b) return [b.x + b.width / 2, b.y + b.height / 2];
        }
        return knobPos(p);
      },
      hintVector() {
        const back = state.phase === 'back';
        return back ? [from[0] - to[0], from[1] - to[1]] : [to[0] - from[0], to[1] - from[1]];
      },
    };
  } else if (type === 'wheel') {
    const centre = Array.isArray(c.center) ? c.center : [800, 500];
    const radius = Number.isFinite(c.radius) ? c.radius : 200;
    const total = 360 * (Number.isFinite(c.turns) && c.turns > 0 ? c.turns : 1);
    let acc = 0;
    let drawn = null;
    if (!knob) {
      const holder = svg('g', { transform: `translate(${num(centre[0])} ${num(centre[1])})` }, art);
      drawn = drawWheel(holder, radius);
    }
    const disc = svg('circle', { cx: centre[0], cy: centre[1], r: radius, ...hitFill }, hit);
    const kc = knobM ? pt(knobM, centre) : centre;
    kind = {
      keyDir: [1, 0],
      total,
      get acc() {
        return acc;
      },
      setAcc(a) {
        acc = Math.max(0, state.done ? a : Math.min(total, a));
        return wheelProgress(acc, total, state.done);
      },
      render() {
        drawn?.setAttribute('transform', `rotate(${num(acc)})`);
        if (knobMovable) knob.setAttribute('transform', `rotate(${num(acc)} ${num(kc[0])} ${num(kc[1])}) ${knobBase}`.trim());
      },
      begin(d, at_) {
        d.angle = angleOf(at_, centre);
      },
      move(d, at_) {
        // Near the hub the angle swings wildly for tiny movements; ignore it.
        if (Math.hypot(at_[0] - centre[0], at_[1] - centre[1]) < radius * 0.12) return p;
        const a = angleOf(at_, centre);
        const delta = angleDelta(d.angle, a);
        d.angle = a;
        return this.setAcc(acc + delta);
      },
      layout() {
        const u = unitsPerPx(svgRoot);
        disc.setAttribute('r', num(Math.max(radius + 50, radius + (HIT_MIN_PX / 2) * u)));
        focusRing.replaceChildren();
        svg('circle', { cx: centre[0], cy: centre[1], r: radius + 44, fill: 'none', stroke: '#1D6FE0', 'stroke-width': num(Math.max(16, 5 * u)), opacity: 0.8 }, focusRing);
      },
      hintAt: () => [centre[0], centre[1] + radius],
      centre,
      radius,
    };
  } else if (type === 'flap') {
    const flap = typeof c.flap === 'string' ? pick(svgRoot, c.flap) : null;
    const hinge = ['top', 'bottom', 'left', 'right'].includes(c.hinge) ? c.hinge : 'top';
    if (!flap) console.warn(`[reader] flap ${c.flap} not found in scene`);
    const flapBase = flap?.getAttribute('transform') ?? '';
    const flapFilter = flap?.getAttribute('filter');
    let own = null;
    try {
      own = flap?.getBBox();
    } catch {
      own = null;
    }
    const box = (flap && sceneBox(svgRoot, flap)) || { x: 650, y: 380, width: 300, height: 240 };
    if (flap) {
      grabbers.push(flap);
      flapFilters(defs, id);
    }
    const rect = svg('rect', { ...hitFill }, hit);
    const axis = flapAxis(hinge);
    const size = axis[0] ? box.width : box.height;
    kind = {
      keyDir: [-axis[0] || 1, axis[1]],
      box,
      render(q) {
        if (!flap || !own) return;
        const f = flapTransform(q, hinge, own);
        flap.setAttribute('transform', `${flapBase} ${f.transform}`.trim());
        if (q <= 0 || q >= 1) {
          if (f.back) flap.setAttribute('filter', `url(#${id}-back)`);
          else if (flapFilter) flap.setAttribute('filter', flapFilter);
          else flap.removeAttribute('filter');
        } else flap.setAttribute('filter', `url(#${id}-${f.back ? 'back' : 'lift'})`);
        flap.classList.toggle('sb-flap-open', q >= 0.5);
      },
      begin(d) {
        d.p0 = p;
        d.sign = 0;
      },
      move(d, at_) {
        const along = (at_[0] - d.start[0]) * axis[0] + (at_[1] - d.start[1]) * axis[1];
        // Lifting towards the hinge is what a hand does with a real flap, but
        // toddlers drag every which way: whichever way the drag starts lifts.
        if (!d.sign && Math.abs(along) > 4) d.sign = Math.sign(along);
        const reach = Math.max(60, size * 0.7);
        return clamp01(d.p0 + ((d.sign || 1) * along) / reach);
      },
      layout() {
        const u = unitsPerPx(svgRoot);
        const min = HIT_MIN_PX * u;
        const padX = Math.max(10, (min - box.width) / 2);
        const padY = Math.max(10, (min - box.height) / 2);
        rect.setAttribute('x', num(box.x - padX));
        rect.setAttribute('y', num(box.y - padY));
        rect.setAttribute('width', num(box.width + padX * 2));
        rect.setAttribute('height', num(box.height + padY * 2));
        rect.setAttribute('rx', num(Math.min(40, box.width / 4)));
        focusRing.replaceChildren();
        svg('rect', { x: num(box.x - 14), y: num(box.y - 14), width: num(box.width + 28), height: num(box.height + 28), rx: 28, fill: 'none', stroke: '#1D6FE0', 'stroke-width': num(Math.max(12, 4 * u)) }, focusRing);
      },
      hintAt() {
        // The free edge, opposite the hinge: where fingers grab a real flap.
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        return {
          top: [cx, box.y + box.height * 0.82],
          bottom: [cx, box.y + box.height * 0.18],
          left: [box.x + box.width * 0.82, cy],
          right: [box.x + box.width * 0.18, cy],
        }[hinge];
      },
      hintVector: () => [axis[0] * size * 0.45, axis[1] * size * 0.45],
      flapShown() {
        for (let n = flap; n && n !== svgRoot; n = n.parentNode) if (n.getAttribute?.('display') === 'none') return false;
        return Boolean(flap);
      },
      restore() {
        if (!flap) return;
        if (flapFilter) flap.setAttribute('filter', flapFilter);
        else flap.removeAttribute('filter');
      },
    };
  } else {
    // push-button
    const centre = Array.isArray(c.center) ? c.center : [800, 500];
    const radius = Number.isFinite(c.radius) ? c.radius : 70;
    const presses = Number.isFinite(c.presses) && c.presses >= 1 ? Math.round(c.presses) : 1;
    let count = 0;
    let dome = null;
    if (!knob) {
      const holder = svg('g', { transform: `translate(${num(centre[0])} ${num(centre[1])})` }, art);
      dome = drawButton(holder, radius).dome;
    }
    const disc = svg('circle', { cx: centre[0], cy: centre[1], r: radius, ...hitFill }, hit);
    const kc = knobM ? pt(knobM, centre) : centre;
    kind = {
      keyDir: [1, 0],
      presses,
      get count() {
        return count;
      },
      pressOnce() {
        count = Math.min(presses, count + 1);
        return count / presses;
      },
      press(down) {
        const squash = down ? 'translate(0 9) scale(0.94)' : '';
        dome?.setAttribute('transform', squash);
        if (knobMovable) {
          knob.setAttribute(
            'transform',
            down ? `translate(${num(kc[0])} ${num(kc[1] + 9)}) scale(0.94) translate(${num(-kc[0])} ${num(-kc[1])}) ${knobBase}`.trim() : knobBase,
          );
          if (!down && !knobBase) knob.removeAttribute('transform');
        }
      },
      render() {},
      begin() {},
      move: () => p,
      layout() {
        const u = unitsPerPx(svgRoot);
        disc.setAttribute('r', num(Math.max(radius + 24, (HIT_MIN_PX / 2) * 1.2 * u)));
        focusRing.replaceChildren();
        svg('circle', { cx: centre[0], cy: centre[1], r: radius + 34, fill: 'none', stroke: '#1D6FE0', 'stroke-width': num(Math.max(14, 5 * u)) }, focusRing);
      },
      hintAt: () => centre,
      hintVector: () => [0, 0],
    };
  }

  // ---- Hint: a pulsing ring where to grab + a ghost finger showing the move ----
  function drawHint() {
    hintLayer.replaceChildren();
    const [hx, hy] = kind.hintAt();
    const u = unitsPerPx(svgRoot);
    // Keep the hand about 70 CSS px tall whatever the screen size (a little
    // less on a small picture, so it points rather than covers).
    const shownH = svgRoot.getBoundingClientRect?.().height || 400;
    const s = Math.min(2.4, Math.max(0.9, ((shownH < 320 ? 58 : 70) * u) / 140));
    const at_ = svg('g', { transform: `translate(${num(hx)} ${num(hy)})` }, hintLayer);
    const ring = svg('g', { class: 'sb-hint' }, at_);
    svg('circle', { r: 58 * s, fill: '#FFFFFF', 'fill-opacity': 0.3, stroke: INK, 'stroke-opacity': 0.3, 'stroke-width': 16 * s }, ring);
    svg('circle', { r: 58 * s, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 9 * s }, ring);
    const hand = (parent) => drawHand(svg('g', { transform: `scale(${num(s)})` }, parent));
    if (type === 'wheel') {
      // The hand travels round the rim, clockwise, staying upright.
      const orbit = svg('g', { transform: `translate(${num(kind.centre[0])} ${num(kind.centre[1])})` }, hintLayer);
      const spin = svg('g', { class: 'sb-ghost-orbit' }, orbit);
      svg('circle', { r: kind.radius + 180 * s, fill: 'none', stroke: 'none' }, spin); // centres the fill-box on the hub
      const tip = svg('g', { transform: `translate(0 ${num(kind.radius)})` }, spin);
      const upright = svg('g', { class: 'sb-ghost-upright' }, tip);
      svg('circle', { r: 170 * s, fill: 'none', stroke: 'none' }, upright); // centres the fill-box on the fingertip
      hand(upright);
    } else if (type === 'push-button') {
      hand(svg('g', { class: 'sb-ghost-press' }, svg('g', { transform: `translate(${num(hx)} ${num(hy)})` }, hintLayer)));
    } else {
      const [vx, vy] = kind.hintVector();
      const mover = svg('g', { class: 'sb-ghost-slide', style: `--dx:${num(vx * 0.85)}px;--dy:${num(vy * 0.85)}px` }, svg('g', { transform: `translate(${num(hx)} ${num(hy)})` }, hintLayer));
      hand(mover);
    }
  }

  function setHint(on) {
    if (destroyed) return;
    if (on) drawHint();
    el.classList.toggle('is-hinting', Boolean(on));
  }

  // ---- Progress ---------------------------------------------------------------
  function setP(np, source) {
    if (destroyed) return;
    p = clamp01(np);
    kind.render(p);
    const step = stepProgress(state, p, { at, returnTrip });
    state = { phase: step.phase, done: step.done, midway: step.midway };
    el.dataset.progress = num(p);
    el.dataset.phase = state.phase;
    if (el.getAttribute('role') === 'slider') el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    safe(onProgress, p, { phase: state.phase, source, done: state.done });
    if (step.fireMidway) safe(onMidway);
    if (step.fireComplete) {
      el.dataset.state = 'done';
      el.classList.add('is-done');
      if (el.getAttribute('role') === 'slider') el.setAttribute('aria-valuetext', 'Done!');
      safe(onComplete);
    }
  }

  function safe(fn, ...args) {
    try {
      fn?.(...args);
    } catch (err) {
      console.warn('[reader] control callback failed', err);
    }
  }

  function stop() {
    stopAnim?.();
    stopAnim = null;
  }

  /** Animate progress (or the wheel angle) to a target; resolves when there. */
  function glide(target, ms, easing = 'easeInOut') {
    stop();
    return new Promise((resolve) => {
      if (destroyed) return resolve();
      el.dataset.state = state.done ? 'done' : 'auto';
      const finish = () => {
        stopAnim = null;
        if (!destroyed && !drag) el.dataset.state = state.done ? 'done' : 'idle';
        resolve();
      };
      if (type === 'wheel') {
        const from = kind.acc;
        stopAnim = animateValue(from, target, ms, easing, (a) => setP(kind.setAcc(a), 'auto'), finish);
      } else {
        stopAnim = animateValue(p, target, ms, easing, (q) => setP(q, 'auto'), finish);
      }
      const cancel = stopAnim;
      stopAnim = () => {
        cancel();
        resolve();
      };
    });
  }

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  /** "Show me": finish the move by itself, the way a grown-up would demonstrate. */
  async function showMe(source = 'tap') {
    if (destroyed) return;
    // Each demonstration gets a ticket; a finger (or a newer demo) takes over
    // by invalidating it, so an old sequence never carries on underneath.
    const ticket = ++seq;
    const live = () => ticket === seq && !destroyed;
    if (type === 'push-button') {
      while (live() && !state.done) await pressAnim(source);
      return;
    }
    if (type === 'wheel') {
      const target = state.done ? kind.acc + 360 : kind.total;
      const ms = reducedMotion ? showMs : Math.max(showMs, (420 * (target - kind.acc)) / 120);
      await glide(target, ms);
      return;
    }
    if (type === 'flap' && state.done) {
      // Peekaboo: once found, a tap closes the flap and the next opens it again
      // (unless the page took the flap away when it was found).
      if (kind.flapShown()) await glide(p > 0.5 ? 0 : 1, showMs * 0.8);
      return;
    }
    if (returnTrip) {
      if (state.phase === 'out') {
        await glide(1, showMs);
        if (!live()) return;
        await pause(reducedMotion ? 120 : 380);
      }
      if (live() && !state.done) await glide(0, showMs);
      return;
    }
    await glide(1, showMs, type === 'flap' ? 'easeOut' : 'easeInOut');
    if (live()) await afterComplete();
  }

  async function afterComplete() {
    if (type === 'pull-tab' && c.springBack && state.done && !destroyed && p > 0) {
      const ticket = seq;
      await pause(reducedMotion ? 150 : 450);
      if (!drag && !destroyed && ticket === seq) await glide(0, reducedMotion ? 200 : 600, 'easeOut');
    }
  }

  /** One press counted: the linked parts glide to the next step rather than jump. */
  function pressed(source) {
    const target = kind.pressOnce();
    el.classList.remove('sb-pressed');
    void el.getBBox?.();
    el.classList.add('sb-pressed');
    return glide(target, reducedMotion ? 120 : 380, 'easeOut').then(() => {
      if (!stopAnim && p < target && !destroyed) setP(target, source);
    });
  }

  async function pressAnim(source) {
    kind.press(true);
    await pause(reducedMotion ? 60 : 140);
    if (destroyed) return;
    kind.press(false);
    pressed(source);
    if (!state.done) await pause(reducedMotion ? 80 : 420);
  }

  function firstTouch() {
    seq++; // cancels any "show me" in progress
    setHint(false);
    safe(onStart);
  }

  // ---- Pointer ---------------------------------------------------------------
  const handled = new WeakSet();
  function toScene(ev) {
    try {
      const m = svgRoot.getScreenCTM();
      if (m) return applyMatrix(m.inverse(), ev.clientX, ev.clientY);
    } catch {
      /* fall through */
    }
    return [ev.clientX, ev.clientY];
  }

  function onDown(ev) {
    if (destroyed || handled.has(ev)) return;
    handled.add(ev);
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (drag) return; // a second finger: ignore it
    stop();
    try {
      ev.currentTarget.setPointerCapture?.(ev.pointerId);
    } catch {
      /* synthetic or already released */
    }
    const start = toScene(ev);
    drag = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, t0: performance.now(), moved: false, start };
    kind.begin(drag, start);
    if (type === 'push-button') kind.press(true);
    firstTouch();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function onMove(ev) {
    if (!drag || ev.pointerId !== drag.id || handled.has(ev)) return;
    handled.add(ev);
    ev.stopPropagation();
    const dist = Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0);
    if (!drag.moved && dist >= TAP_MOVE_PX) {
      drag.moved = true;
      el.dataset.state = 'dragging';
      el.classList.add('is-dragging');
    }
    if (drag.moved && type !== 'push-button') setP(kind.move(drag, toScene(ev)), 'drag');
  }

  function endDrag() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    el.classList.remove('is-dragging');
    const d = drag;
    drag = null;
    if (!destroyed) el.dataset.state = state.done ? 'done' : 'idle';
    return d;
  }

  function onUp(ev) {
    if (!drag || ev.pointerId !== drag.id || handled.has(ev)) return;
    handled.add(ev);
    ev.stopPropagation();
    const d = endDrag();
    if (type === 'push-button') {
      // Every press counts, quick or slow: pressing is the whole game.
      kind.press(false);
      if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 40) pressed('press');
      return;
    }
    if (!d.moved && isTap(0, performance.now() - d.t0)) {
      showMe('tap');
      return;
    }
    if (d.moved) settle();
  }

  function onCancel(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    endDrag();
    if (type === 'push-button') kind.press(false);
    settle();
  }

  /** After a drag: snap to the end once the move is complete, like a detent. */
  function settle() {
    if (destroyed) return;
    if (type === 'wheel') {
      // Once done, the wheel settles on the nearest whole turn, so it always
      // comes to rest on the finished picture however far it was spun.
      if (state.done) {
        const target = Math.max(1, Math.round(kind.acc / kind.total)) * kind.total;
        if (Math.abs(target - kind.acc) > 0.5) glide(target, reducedMotion ? 150 : 250 + Math.abs(target - kind.acc) * 2, 'easeOut');
      }
      return;
    }
    if (returnTrip) {
      if (state.phase === 'back' && state.done && p > 0) glide(0, 220, 'easeOut');
      else if (state.phase === 'back' && !state.done && p >= at) glide(1, 220, 'easeOut');
      return;
    }
    if (state.done && p >= at && p < 1) glide(1, 220, 'easeOut').then(afterComplete);
    else if (state.done) afterComplete();
  }

  // ---- Keyboard ---------------------------------------------------------------
  function onKey(ev) {
    if (destroyed) return;
    const k = ev.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      ev.preventDefault();
      ev.stopPropagation();
      firstTouch();
      showMe('key');
      return;
    }
    const dirSign = keyDirection(k, kind.keyDir);
    if (!dirSign && k !== 'Home' && k !== 'End') return;
    ev.preventDefault();
    ev.stopPropagation();
    firstTouch();
    stop();
    if (type === 'push-button') {
      if (dirSign > 0) pressAnim('key');
      return;
    }
    if (type === 'wheel') {
      const a = k === 'Home' ? 0 : k === 'End' ? kind.total : kind.acc + dirSign * KEY_STEP * 360;
      setP(kind.setAcc(a), 'key');
      settle();
      return;
    }
    const target = k === 'Home' ? 0 : k === 'End' ? 1 : p + dirSign * KEY_STEP;
    setP(clamp01(target), 'key');
    settle();
  }

  // Stop iOS from scrolling or zooming the page while a finger is on a control.
  const noScroll = (ev) => ev.cancelable && ev.preventDefault();

  for (const g of grabbers) {
    listen(g, 'pointerdown', onDown);
    listen(g, 'touchstart', noScroll, { passive: false });
    g.classList?.add('sb-grabbable');
  }
  listen(el, 'keydown', onKey);
  listen(el, 'focus', () => el.classList.add('has-focus'));
  listen(el, 'blur', () => el.classList.remove('has-focus'));

  kind.layout();
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => !destroyed && kind.layout());
    ro.observe(svgRoot);
  }
  kind.render(0);
  setHint(hint);

  return {
    el,
    /** Finish the move by itself (Enter/Space, or the reader's autoplay). */
    complete: () => showMe('api'),
    hint: setHint,
    get progress() {
      return p;
    },
    get done() {
      return state.done;
    },
    get phase() {
      return state.phase;
    },
    destroy() {
      if (destroyed) return;
      stop();
      if (drag) endDrag();
      destroyed = true;
      ro?.disconnect();
      for (const fn of cleanups) fn();
      kind.restore?.();
      for (const g of grabbers) g.classList?.remove('sb-grabbable');
      el.remove();
    },
  };
}
