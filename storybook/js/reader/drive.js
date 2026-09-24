// Declarative animation ("drives"). A page's moving part reports a progress
// value 0..1 and each drive maps it onto one property of one scene element:
// a path to ride along, a translation, rotation, scale, opacity, or a
// flip-book frame that is only visible for part of the travel. The format is
// documented in docs/architecture.md ("Drives").
//
// The maths is kept pure (and unit-tested); createDriver() is the thin DOM
// layer that caches the geometry it needs and writes attributes.

/** Clamp to 0..1 (NaN counts as 0). */
export function clamp01(x) {
  return x > 0 ? (x < 1 ? x : 1) : 0;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpPoint(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

function bounce(t) {
  // Classic "ease out bounce": lands, hops twice, settles. Ends exactly at 1.
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

export const EASINGS = Object.freeze({
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - (1 - t) ** 3,
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  bounce,
});

/** Apply a named easing to t (clamped); unknown names use easeInOut, the book default. */
export function ease(name, t) {
  const f = EASINGS[name] ?? EASINGS.easeInOut;
  return f(clamp01(t));
}

/** Map progress p onto a sub-range [start, end] of the travel, clamped to 0..1. */
export function mapRange(p, range) {
  const [a, b] = Array.isArray(range) && range.length === 2 && range[1] > range[0] ? range : [0, 1];
  return clamp01((p - a) / (b - a));
}

/**
 * Progress a drive sees for a return-trip control.
 * `out` drives run on the way there and then hold at their end; `back` drives
 * wait at their start until the knob turns round, then run as it comes home.
 * @param {number} p knob position 0..1
 * @param {'out'|'back'|undefined} drivePhase the drive's `phase`
 * @param {'out'|'back'} phase which half of the trip the control is in
 */
export function phaseProgress(p, drivePhase, phase = 'out') {
  if (drivePhase === 'out') return phase === 'back' ? 1 : p;
  if (drivePhase === 'back') return phase === 'back' ? 1 - p : 0;
  return p;
}

/** Eased local progress (0..1) of one drive. */
export function driveProgress(drive, p, phase = 'out') {
  return ease(drive.ease, mapRange(phaseProgress(p, drive.phase, phase), drive.range));
}

/**
 * Is a `visible: [from, to]` frame showing? Shown while from <= t < to; a frame
 * that ends at 1 includes 1 so the last pose stays up when the wheel finishes.
 * Frames are not eased: they are thresholds on the travel.
 */
export function isVisibleAt(drive, p, phase = 'out') {
  const t = mapRange(phaseProgress(p, drive.phase, phase), drive.range);
  const [from, to] = drive.visible;
  return t >= from && (t < to || (to >= 1 && t >= 1));
}

const asPair = (v, fallback) => (Array.isArray(v) ? [Number(v[0]), Number(v[1] ?? v[0])] : Number.isFinite(v) ? [v, v] : fallback);

/**
 * Work out the combined state of every drive at progress p, grouped by target.
 * `pointAt(selector, t)` returns [x, y] on a path (in the target's parent
 * coordinates) so this stays free of the DOM.
 * @returns {Map<string, {tx:number, ty:number, rotate:number|null, rotateOrigin:number[]|null,
 *   sx:number, sy:number, scaled:boolean, scaleOrigin:number[]|null, opacity:number|null, visible:boolean|null}>}
 */
export function driveValues(drives, p, phase = 'out', pointAt = () => null) {
  const out = new Map();
  const get = (target) => {
    if (!out.has(target)) {
      out.set(target, { tx: 0, ty: 0, moved: false, rotate: null, rotateOrigin: null, sx: 1, sy: 1, scaled: false, scaleOrigin: null, opacity: null, visible: null });
    }
    return out.get(target);
  };
  for (const d of drives ?? []) {
    if (!d || typeof d.target !== 'string') continue;
    const v = get(d.target);
    if ('visible' in d) {
      const shown = isVisibleAt(d, p, phase);
      v.visible = v.visible === null ? shown : v.visible && shown;
      continue;
    }
    const t = driveProgress(d, p, phase);
    if ('along' in d) {
      const pt = pointAt(d.along, t);
      if (pt) {
        v.tx += pt[0];
        v.ty += pt[1];
        v.moved = true;
      }
    } else if ('translate' in d) {
      const [a, b] = d.translate;
      const [x, y] = lerpPoint(asPair(a, [0, 0]), asPair(b, [0, 0]), t);
      v.tx += x;
      v.ty += y;
      v.moved = true;
    } else if ('rotate' in d) {
      const [a0, a1] = asPair(d.rotate, [0, 0]);
      v.rotate = (v.rotate ?? 0) + lerp(a0, a1, t);
      v.rotateOrigin ??= Array.isArray(d.origin) ? d.origin : null;
    } else if ('scale' in d) {
      const [s0, s1] = d.scale;
      const [x, y] = lerpPoint(asPair(s0, [1, 1]), asPair(s1, [1, 1]), t);
      v.sx *= x;
      v.sy *= y;
      v.scaled = true;
      v.scaleOrigin ??= Array.isArray(d.origin) ? d.origin : null;
    } else if ('opacity' in d) {
      const [o0, o1] = asPair(d.opacity, [1, 1]);
      v.opacity = (v.opacity ?? 1) * clamp01(lerp(o0, o1, t));
    }
  }
  return out;
}

/** Format a number for an SVG attribute: 3 decimals, no "-0". */
export function num(n) {
  const r = Math.round(n * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
}

/**
 * Build one transform attribute. Order (outermost first): translations, the
 * element's own original transform, rotation, scale — so rotate/scale pivot
 * in the element's own coordinates and translations move it in its parent's.
 * @param {{translate?: number[]|null, base?: string, rotate?: number|null, rotateOrigin?: number[]|null,
 *   scale?: number[]|null, scaleOrigin?: number[]|null}} parts
 */
export function composeTransform({ translate = null, base = '', rotate = null, rotateOrigin = null, scale = null, scaleOrigin = null } = {}) {
  const out = [];
  if (translate && (translate[0] || translate[1])) out.push(`translate(${num(translate[0])} ${num(translate[1])})`);
  if (base && base.trim()) out.push(base.trim());
  if (rotate) {
    const [ox, oy] = rotateOrigin ?? [0, 0];
    out.push(ox || oy ? `rotate(${num(rotate)} ${num(ox)} ${num(oy)})` : `rotate(${num(rotate)})`);
  }
  if (scale && (scale[0] !== 1 || scale[1] !== 1)) {
    const [ox, oy] = scaleOrigin ?? [0, 0];
    const s = `scale(${num(scale[0])} ${num(scale[1])})`;
    out.push(ox || oy ? `translate(${num(ox)} ${num(oy)}) ${s} translate(${num(-ox)} ${num(-oy)})` : s);
  }
  return out.join(' ');
}

// ---- DOM ------------------------------------------------------------------

/** Find an element by "#id" inside the scene (ids are page-prefixed, so scoping is safe). */
export function pick(root, sel) {
  if (!root || typeof sel !== 'string' || !sel.startsWith('#')) return null;
  const id = sel.slice(1);
  try {
    return root.querySelector(`#${CSS.escape(id)}`);
  } catch {
    return [...root.querySelectorAll('[id]')].find((el) => el.id === id) ?? null;
  }
}

function bboxCentre(el) {
  try {
    const b = el.getBBox();
    if (b && (b.width || b.height)) return [b.x + b.width / 2, b.y + b.height / 2];
  } catch {
    /* not rendered */
  }
  return null;
}

/** Transform a point by an SVG/DOM matrix (no DOMPoint needed). */
export function applyMatrix(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

/**
 * Matrix taking `from`'s user space into the coordinate system `to` lives in
 * (to's parent space, i.e. where its transform attribute applies).
 */
function matrixBetween(from, to) {
  try {
    const a = from.getScreenCTM?.();
    const parent = to.parentNode;
    const b = parent?.getScreenCTM?.();
    if (!a || !b) return null;
    return b.inverse().multiply(a);
  } catch {
    return null;
  }
}

/**
 * Bind drives to a mounted scene. Geometry (path lengths, bounding boxes,
 * coordinate matrices) is measured lazily on first use and cached, so apply()
 * is cheap enough to call on every pointer move.
 * @param {SVGSVGElement} svgRoot the scene (must be in the document for measuring)
 * @param {Array<object>} drives mechanic.drives
 * @param {{skip?: string[]}} [opts] targets another component moves itself (e.g. a knob)
 * @returns {{apply(p: number, opts?: {phase?: 'out'|'back'}): void, targets: string[], reset(): void}}
 */
export function createDriver(svgRoot, drives, { skip = [] } = {}) {
  const list = (Array.isArray(drives) ? drives : []).filter((d) => d && typeof d.target === 'string' && !skip.includes(d.target));
  /** @type {Map<string, {el: Element, base: string, centre: number[]|null, opacity: string|null, display: string|null}>} */
  const targets = new Map();
  const paths = new Map();
  const missing = new Set();

  for (const d of list) {
    if (targets.has(d.target) || missing.has(d.target)) continue;
    const el = pick(svgRoot, d.target);
    if (!el) {
      missing.add(d.target);
      continue;
    }
    targets.set(d.target, {
      el,
      base: el.getAttribute('transform') ?? '',
      centre: null,
      opacity: el.getAttribute('opacity'),
      display: el.getAttribute('display'),
    });
  }
  if (missing.size) console.warn(`[reader] drive targets not found in scene: ${[...missing].join(', ')}`);

  const pathInfo = (sel, targetSel) => {
    const key = `${sel}>${targetSel}`;
    let info = paths.get(key);
    if (!info || !info.matrix) {
      const path = pick(svgRoot, sel);
      const tgt = targets.get(targetSel)?.el;
      let len = 0;
      try {
        len = path?.getTotalLength?.() ?? 0;
      } catch {
        len = 0;
      }
      info = { path, len, matrix: path && tgt ? matrixBetween(path, tgt) : null };
      paths.set(key, info);
    }
    return info;
  };

  // pointAt is target-specific because the path point is converted into the
  // target's parent coordinates.
  const pointFor = (targetSel) => (sel, t) => {
    const { path, len, matrix } = pathInfo(sel, targetSel);
    if (!path || !len) return null;
    let pt;
    try {
      pt = path.getPointAtLength(len * clamp01(t));
    } catch {
      return null;
    }
    return matrix ? applyMatrix(matrix, pt.x, pt.y) : [pt.x, pt.y];
  };

  const byTarget = new Map();
  for (const d of list) {
    if (!targets.has(d.target)) continue;
    if (!byTarget.has(d.target)) byTarget.set(d.target, []);
    byTarget.get(d.target).push(d);
  }

  function apply(p, { phase = 'out' } = {}) {
    for (const [sel, ds] of byTarget) {
      const t = targets.get(sel);
      const v = driveValues(ds, p, phase, pointFor(sel)).get(sel);
      if (!v) continue;
      const needsTransform = v.moved || v.rotate !== null || v.scaled;
      if (needsTransform) {
        if ((v.rotate !== null && !v.rotateOrigin) || (v.scaled && !v.scaleOrigin)) t.centre ??= bboxCentre(t.el);
        const tr = composeTransform({
          translate: v.moved ? [v.tx, v.ty] : null,
          base: t.base,
          rotate: v.rotate,
          rotateOrigin: v.rotateOrigin ?? t.centre,
          scale: v.scaled ? [v.sx, v.sy] : null,
          scaleOrigin: v.scaleOrigin ?? t.centre,
        });
        if (tr) t.el.setAttribute('transform', tr);
        else t.el.removeAttribute('transform');
      }
      if (v.opacity !== null) t.el.setAttribute('opacity', num(v.opacity));
      if (v.visible !== null) {
        // display (not visibility) so nothing inside a hidden frame can show
        // through, e.g. a name slot the magic window forces visible.
        if (v.visible) {
          t.el.removeAttribute('display');
          if (t.el.style?.display === 'none') t.el.style.display = '';
        } else {
          // Measure before hiding: getBBox() of a hidden element is empty.
          t.centre ??= bboxCentre(t.el);
          t.el.setAttribute('display', 'none');
        }
      }
    }
  }

  /** Put every target back the way the artist drew it. */
  function reset() {
    for (const t of targets.values()) {
      for (const [attr, value] of [['transform', t.base || null], ['opacity', t.opacity], ['display', t.display]]) {
        if (value == null) t.el.removeAttribute(attr);
        else t.el.setAttribute(attr, value);
      }
    }
  }

  // Measure centres up front while everything is still displayed.
  for (const t of targets.values()) t.centre ??= bboxCentre(t.el);

  return { apply, reset, targets: [...targets.keys()] };
}
