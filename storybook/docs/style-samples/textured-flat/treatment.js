// "Textured flat" treatment for the storybook scenes.
//
// Keeps the flat vector scene as the source and adds a hand-made, printed
// feel: a fine darker hand-drawn line sitting slightly off-register from the
// colour, a gentle wobble on every edge, risograph-like grain and a paper
// tooth, textured (hatched) shading shapes, warm paper whites and soft blacks.
//
// Pure string in, string out. No DOM and no dependencies, so it runs the same
// in Node (pre-rendering / print) and in the browser (the app).
//
//   import { treatScene } from './treatment.js';
//   const out = treatScene(sceneSvgText, defsSvgText, { seed: 7 });
//   out.svg      // self-contained <svg>: paint servers + filters + treated scene
//
// See README.md next to this file for the parameters and how to apply it.

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export const DEFAULTS = Object.freeze({
  seed: 7, // noise seed; use one per page and keep it fixed once printed
  prefix: 'tf', // id prefix for the filters and patterns
  width: 1600, // scene size (viewBox units)
  height: 1000,

  // Line work: every outline becomes a finer, darker, "drawn" line.
  line: {
    scale: 0.7, // outline width multiplier (5-unit outlines become 3.5)
    darken: 0.24, // how much lightness the line loses (0..1)
    warm: 0.12, // mix towards the ink colour (0..1)
    ink: '#3A2A22', // warm dark brown used instead of black
    lightLimit: 0.66, // stroke-only lines lighter than this are colour (highlights, pitch lines), not line work
    nib: 0.38, // opacity of a second, thinner pencil pass (0 = off)
    nibOffset: [0.9, -0.7], // page units: where the second pass sits
    nibWidth: 0.55, // its width, relative to the line
  },

  // Colour plate sits off-register from the line plate, like a two-pass print.
  misregister: [2.6, 1.8], // page units [x, y]; [0, 0] turns it off
  thickStroke: 9, // stroke-only shapes at least this wide on the page are colour (limbs, frames)

  // Shading shapes (a flat, slightly darker shape on top of a base colour)
  // are redrawn as hand-hatched texture.
  shade: {
    on: true,
    maxLightDrop: 0.1, // a shade is at most this much darker than its base…
    minLightDrop: 0.015, // …and at least this much
    minSize: 26, // page units (square root of the bounding-box area); smaller shapes are details (pads, freckles)
    maxHueShift: 28, // degrees
    base: 0.55, // opacity of the flat shade under the hatching
    spacing: 4.8, // average hatch spacing in page units
    width: 1.7, // average hatch line width in page units
    angle: -38, // degrees
    darker: 0.07, // hatch lines are this much darker than the shade colour
  },

  // The page-wide "paint" filter.
  wobble: { freq: 0.022, octaves: 3, scale: 5.5 }, // edge waver (scale = peak-to-peak displacement)
  soften: 0.35, // blur after the wobble (page units): softens the vector crispness
  edgeFade: 10, // wobble fades out this close to the page edge, so the trim stays clean
  // Paper: one height map drives both the embossed tooth and where crayon skips.
  tooth: { freq: 0.3, octaves: 3, relief: 1.2, shadow: 0.12, azimuth: 235, elevation: 58 },
  crayon: { amount: 0.22, threshold: 0.4, contrast: 6, pressureFreq: 0.009, pressure: 0.75 }, // paper showing through in the tooth's valleys
  grain: { freq: 0.95, amount: 0.22, threshold: 0.54, contrast: 5 }, // fine riso speckle (lighter)
  specks: { amount: 0.1, threshold: 0.62, contrast: 6 }, // darker pigment specks
  mottle: { freq: 0.03, amount: 0.03 }, // uneven ink density (large, soft; lighter and darker)
  paper: '#FCF7EC', // pure white becomes this
  black: '#2E2622', // pure black becomes this
  saturation: 1.1,
  curve: [0, 0.235, 0.5, 0.765, 1], // tone curve per channel (evenly spaced points), then 0 → black and 1 → paper

  // Children's-name slots (text.sb-name, .sb-letters): 'paint' textures them
  // with everything else; 'lift' draws them crisp on top of the paint. Only
  // lift when the slot's parents never move (p4's banner cheers, so no).
  text: 'paint', // 'paint' | 'lift'
  // Device pixels per scene unit the result will be drawn at (1 = 1600 px wide,
  // 1.59 = 8.5 in at 300 DPI, ~0.7 = a phone). Below 1, the fine textures get
  // coarser and lighter so they don't alias into salt-and-pepper noise.
  pixelsPerUnit: 1,
  hide: [], // ids to leave out (e.g. moving parts when baking a background plate)
  only: null, // sprite mode: ids to keep (with their ancestors), each with its own small filter
});

// ---------------------------------------------------------------------------
// Tiny XML parser / serialiser (enough for machine-written SVG)
// ---------------------------------------------------------------------------

function parseXml(src) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const n = src.length;
  const top = () => stack[stack.length - 1];
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      if (i < n) top().children.push({ text: src.slice(i) });
      break;
    }
    if (lt > i) top().children.push({ text: src.slice(i, lt) });
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      top().children.push({ text: src.slice(lt, end + 3) });
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      i = src.indexOf('>', lt) + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      const name = src.slice(lt + 2, end).trim();
      while (stack.length > 1 && top().name !== name) stack.pop();
      if (stack.length > 1) stack.pop();
      i = end + 1;
      continue;
    }
    const m = /^<([^\s/>]+)/.exec(src.slice(lt, lt + 200));
    const el = { name: m[1], attrs: {}, children: [] };
    let j = lt + m[0].length;
    const attrRe = /\s*([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/y;
    for (;;) {
      attrRe.lastIndex = j;
      const a = attrRe.exec(src);
      if (!a) break;
      el.attrs[a[1]] = a[3] ?? a[4].replace(/"/g, '&quot;');
      j = attrRe.lastIndex;
    }
    while (j < n && /\s/.test(src[j])) j++;
    top().children.push(el);
    if (src[j] === '/') {
      i = src.indexOf('>', j) + 1;
    } else {
      i = j + 1;
      stack.push(el);
    }
  }
  return root;
}

function serialise(node) {
  if (node.text !== undefined) return node.text;
  if (node.name === '#root') return node.children.map(serialise).join('');
  let s = `<${node.name}`;
  for (const [k, v] of Object.entries(node.attrs)) if (v !== undefined && v !== null) s += ` ${k}="${v}"`;
  if (!node.children.length) return `${s}/>`;
  return `${s}>${node.children.map(serialise).join('')}</${node.name}>`;
}

const clone = (node) => (node.text !== undefined ? { text: node.text } : { name: node.name, attrs: { ...node.attrs }, children: node.children.map(clone) });
const elements = (node) => node.children.filter((c) => c.name);
function findFirst(node, pred) {
  for (const c of elements(node)) {
    if (pred(c)) return c;
    const f = findFirst(c, pred);
    if (f) return f;
  }
  return null;
}
function walkAll(node, fn) {
  for (const c of elements(node)) {
    fn(c);
    walkAll(c, fn);
  }
}

// ---------------------------------------------------------------------------
// 2D affine matrices [a b c d e f]
// ---------------------------------------------------------------------------

const ID = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

function parseTransform(str) {
  let m = ID;
  if (!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(str))) {
    const v = t[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let k = ID;
    switch (t[1]) {
      case 'matrix':
        k = v;
        break;
      case 'translate':
        k = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
        break;
      case 'scale':
        k = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
        break;
      case 'rotate': {
        const r = ((v[0] || 0) * Math.PI) / 180;
        const [cx, cy] = [v[1] || 0, v[2] || 0];
        k = mul(mul([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        k = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        k = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, k);
  }
  return m;
}

/** Page vector [x, y] expressed in the local space of matrix m (linear part only). */
function toLocal(m, [x, y]) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-9) return [0, 0];
  return [(m[3] * x - m[2] * y) / det, (-m[1] * x + m[0] * y) / det];
}
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
const r2 = (v) => Math.round(v * 100) / 100;

/** Rough local bounding box [minX, minY, maxX, maxY] of a shape (control points included). */
function shapeBox(el) {
  const a = el.attrs;
  const num = (k) => Number(a[k] ?? 0);
  switch (el.name) {
    case 'circle':
      return [num('cx') - num('r'), num('cy') - num('r'), num('cx') + num('r'), num('cy') + num('r')];
    case 'ellipse':
      return [num('cx') - num('rx'), num('cy') - num('ry'), num('cx') + num('rx'), num('cy') + num('ry')];
    case 'rect':
      return [num('x'), num('y'), num('x') + num('width'), num('y') + num('height')];
    case 'line':
      return [Math.min(num('x1'), num('x2')), Math.min(num('y1'), num('y2')), Math.max(num('x1'), num('x2')), Math.max(num('y1'), num('y2'))];
    case 'polygon':
    case 'polyline': {
      const v = (a.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      const xs = v.filter((_, i) => i % 2 === 0);
      const ys = v.filter((_, i) => i % 2 === 1);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'path': {
      const toks = (a.d ?? '').match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
      let x = 0;
      let y = 0;
      let sx = 0;
      let sy = 0;
      let cmd = 'M';
      const xs = [];
      const ys = [];
      const pt = (px, py) => {
        xs.push(px);
        ys.push(py);
      };
      const ARGS = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
      let i = 0;
      while (i < toks.length) {
        if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
        const C = cmd.toUpperCase();
        const rel = cmd !== C;
        const n = ARGS[C];
        if (n === undefined) break;
        if (n === 0) {
          x = sx;
          y = sy;
          continue;
        }
        const v = toks.slice(i, i + n).map(Number);
        i += n;
        if (v.length < n) break;
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        if (C === 'H') x = v[0] + (rel ? x : 0);
        else if (C === 'V') y = v[0] + (rel ? y : 0);
        else if (C === 'A') {
          x = v[5] + ox;
          y = v[6] + oy;
        } else {
          for (let k = 0; k < n - 2; k += 2) pt(v[k] + ox, v[k + 1] + oy);
          x = v[n - 2] + ox;
          y = v[n - 1] + oy;
        }
        pt(x, y);
        if (C === 'M') {
          sx = x;
          sy = y;
          cmd = rel ? 'l' : 'L';
        }
      }
      if (!xs.length) return [0, 0, 0, 0];
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    default:
      return [0, 0, 0, 0];
  }
}

/** Page-space bounding box of a local box under matrix m. */
function pageBox(m, [x0, y0, x1, y1]) {
  const pts = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000' };
function parseColour(v) {
  if (!v) return null;
  let s = String(v).trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s];
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((h) => parseInt(h + h, 16) / 255);
  m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/.exec(s);
  if (m) return [m[1], m[2], m[3]].map((x) => Number(x) / 255);
  return null;
}
const hex = (c) => `#${c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
function toHsl([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl([h, s, l]) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

function darkenLine(value, o) {
  const c = parseColour(value);
  if (!c) return value;
  const [h, s, l] = toHsl(c);
  const d = fromHsl([h, Math.min(1, s * 1.08), l * (1 - o.line.darken)]);
  return hex(mix(d, parseColour(o.line.ink), o.line.warm));
}

// ---------------------------------------------------------------------------
// Scene restructuring
// ---------------------------------------------------------------------------

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const GEOMETRY = ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points', 'x1', 'y1', 'x2', 'y2', 'transform'];
const PAINT_SERVERS = new Set(['linearGradient', 'radialGradient', 'pattern', 'clipPath', 'mask', 'filter', 'marker']);
const NO_TOUCH = new Set(['text', 'defs', 'title', 'desc', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'filter', 'marker', 'symbol', 'style']);

/** Replace every <use> with a <g> holding a copy of what it points at (ids dropped from the copies). */
function flattenUses(node, lib, depth = 0) {
  node.children = node.children.map((c) => {
    if (!c.name) return c;
    if (c.name === 'use') {
      const ref = (c.attrs.href ?? c.attrs['xlink:href'] ?? '').replace(/^#/, '');
      const target = lib.get(ref);
      if (!target || depth > 12) return c;
      const g = { name: 'g', attrs: {}, children: [] };
      for (const [k, v] of Object.entries(c.attrs)) if (!['href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform'].includes(k)) g.attrs[k] = v;
      const tr = [c.attrs.transform, c.attrs.x || c.attrs.y ? `translate(${c.attrs.x || 0} ${c.attrs.y || 0})` : ''].filter(Boolean).join(' ');
      if (tr) g.attrs.transform = tr;
      g.attrs['data-use'] = ref;
      const copy = clone(target);
      walkAll(copy, (e) => delete e.attrs.id);
      delete copy.attrs.id;
      if (copy.name === 'symbol') copy.name = 'g';
      g.children = [copy];
      flattenUses(copy, lib, depth + 1);
      return g;
    }
    flattenUses(c, lib, depth);
    return c;
  });
}

const paintOf = (v) => (v === undefined ? undefined : String(v).trim());
const isNone = (v) => v === 'none' || v === 'transparent';

function sameGeometry(a, b) {
  if (a.name !== b.name) return false;
  return GEOMETRY.every((k) => (a.attrs[k] ?? '') === (b.attrs[k] ?? ''));
}

/**
 * Walk the (flattened) scene, splitting fill and outline so the colour plate
 * can sit off-register, thinning and darkening the line work, and marking
 * shading shapes. Mutates the tree.
 */
function restructure(node, o, ctx, st, shadeUse) {
  const out = [];
  const kids = node.children;
  let lastBase = null; // last filled base shape in this group (for shade detection)
  for (let idx = 0; idx < kids.length; idx++) {
    const c = kids[idx];
    if (!c.name) {
      out.push(c);
      continue;
    }
    const inh = {
      fill: paintOf(c.attrs.fill) ?? ctx.fill,
      stroke: paintOf(c.attrs.stroke) ?? ctx.stroke,
      sw: c.attrs['stroke-width'] !== undefined ? Number(c.attrs['stroke-width']) : ctx.sw,
      m: mul(ctx.m, parseTransform(c.attrs.transform)),
      parentM: ctx.m,
    };
    if (NO_TOUCH.has(c.name)) {
      out.push(c);
      continue;
    }
    if (!SHAPES.has(c.name)) {
      restructure(c, o, inh, st, shadeUse);
      out.push(c);
      continue;
    }
    // --- a leaf shape ---
    if (c.attrs.id) {
      // named shapes may be drive targets or paths that other things follow
      // (textPath, "along" drives): leave them exactly as drawn
      out.push(c);
      continue;
    }
    const hasFill = !isNone(inh.fill) && c.attrs['fill-opacity'] !== '0' && !(c.name === 'line' || c.name === 'polyline');
    const hasStroke = inh.stroke !== undefined && !isNone(inh.stroke) && inh.sw > 0 && c.attrs['stroke-opacity'] !== '0';
    const pageSW = inh.sw * scaleOf(inh.m);
    const shift = toLocal(inh.parentM, o.misregister);
    const box = shapeBox(c);
    const pb = pageBox(inh.m, box);
    // shapes that reach the page edge stay put, so no gap opens at the trim
    const atEdge = pb[0] <= 2 || pb[1] <= 2 || pb[2] >= o.width - 2 || pb[3] >= o.height - 2;
    const shifted = (el) => {
      if ((!o.misregister[0] && !o.misregister[1]) || atEdge) return el;
      el.attrs.transform = `translate(${r2(shift[0])} ${r2(shift[1])})${el.attrs.transform ? ` ${el.attrs.transform}` : ''}`;
      return el;
    };
    const fillC = parseColour(inh.fill);
    const strokeC = parseColour(inh.stroke);

    if (hasFill && hasStroke) {
      if ((fillC && strokeC && (hex(fillC) === hex(strokeC) || luma(strokeC) > luma(fillC))) || (strokeC && luma(strokeC) > o.line.lightLimit && !fillC)) {
        // the stroke only fattens the fill, or is a highlight: all colour
        out.push(shifted(c));
        st.colour++;
        lastBase = { c: fillC };
        continue;
      }
      const f = clone(c);
      f.attrs.stroke = 'none';
      out.push(shifted(f));
      const l = clone(c);
      delete l.attrs.id;
      l.attrs.fill = 'none';
      l.attrs.stroke = darkenLine(inh.stroke, o);
      l.attrs['stroke-width'] = r2(inh.sw * o.line.scale);
      out.push(l, ...nib(l, inh, o));
      st.split++;
      lastBase = fillC ? { c: fillC } : null;
      continue;
    }
    if (hasFill) {
      // fill only: colour; maybe a shading shape
      const [bw, bh] = [box[2] - box[0], box[3] - box[1]];
      const big = Math.sqrt(Math.abs(bw * bh)) * scaleOf(inh.m) >= o.shade.minSize;
      if (o.shade.on && lastBase && fillC && big && isShade(fillC, lastBase.c, o)) {
        c.attrs['data-tf-shade'] = '';
        const pat = shadeUse(c.attrs.fill ?? inh.fill, fillC, scaleOf(inh.m));
        const flat = shifted(clone(c));
        flat.attrs.fill = inh.fill;
        flat.attrs['fill-opacity'] = String(o.shade.base * Number(c.attrs['fill-opacity'] ?? 1));
        delete c.attrs.id;
        const hatch = shifted(c);
        hatch.attrs.fill = `url(#${pat})`;
        out.push(flat, hatch);
        st.shade++;
        continue;
      }
      out.push(shifted(c));
      st.colour++;
      if (fillC && !c.attrs.opacity && !c.attrs['fill-opacity']) lastBase = { c: fillC };
      continue;
    }
    if (hasStroke) {
      const next = kids.slice(idx + 1).find((k) => k.name);
      const twin = next && SHAPES.has(next.name) && sameGeometry(c, next) && isNone(paintOf(next.attrs.fill) ?? inh.fill) && Number(next.attrs['stroke-width'] ?? inh.sw) < inh.sw;
      if (twin) {
        // outline drawn as a wider stroke under a colour stroke (limbs, frames)
        const inner = Number(next.attrs['stroke-width'] ?? inh.sw);
        c.attrs['stroke-width'] = r2(inner + (inh.sw - inner) * o.line.scale);
        if (strokeC) c.attrs.stroke = darkenLine(inh.stroke, o);
        // the outline is line work: it stays on register
        out.push(c);
        st.twin++;
        continue;
      }
      const light = strokeC ? luma(strokeC) > o.line.lightLimit : true;
      if (pageSW >= o.thickStroke || light || !strokeC) {
        out.push(shifted(c));
        st.colour++;
        continue;
      }
      c.attrs.stroke = darkenLine(inh.stroke, o);
      out.push(c, ...nib(c, inh, o));
      st.line++;
      continue;
    }
    out.push(c);
  }
  node.children = out;
}

function nib(lineEl, inh, o) {
  if (!o.line.nib) return [];
  const n = clone(lineEl);
  delete n.attrs.id;
  const off = toLocal(inh.parentM, o.line.nibOffset);
  n.attrs.transform = `translate(${r2(off[0])} ${r2(off[1])})${n.attrs.transform ? ` ${n.attrs.transform}` : ''}`;
  n.attrs['stroke-width'] = r2(Number(n.attrs['stroke-width'] ?? inh.sw) * o.line.nibWidth);
  n.attrs['stroke-opacity'] = String(o.line.nib);
  n.attrs['data-tf-nib'] = '';
  return [n];
}

function isShade(c, base, o) {
  const [h1, s1, l1] = toHsl(c);
  const [h0, s0, l0] = toHsl(base);
  const drop = l0 - l1;
  if (drop < o.shade.minLightDrop || drop > o.shade.maxLightDrop) return false;
  if (s0 < 0.08 && s1 < 0.08) return true; // greys/whites
  return hueDist(h1, h0) <= o.shade.maxHueShift;
}

// ---------------------------------------------------------------------------
// Filters and patterns
// ---------------------------------------------------------------------------

function paintFilter(o, mode = 'page') {
  const p = o.prefix;
  const sprite = mode === 'sprite';
  const W = o.width;
  const H = o.height;
  const paper = parseColour(o.paper);
  const black = parseColour(o.black);
  const ink = parseColour(o.line.ink);
  const e = o.edgeFade;
  const { tooth, crayon, grain, specks, mottle } = o;
  // tone: gentle curve, then 0 -> soft black and 1 -> paper, per channel
  const ct = [0, 1, 2]
    .map((i) => `<feFunc${'RGB'[i]} type="table" tableValues="${o.curve.map((v) => r2(black[i] + (paper[i] - black[i]) * v)).join(' ')}"/>`)
    .join('');
  const [pr, pg, pb] = paper.map(r2);
  const [ir, ig, ib] = ink.map(r2);
  // alpha = amount * clamp(contrast * (x - threshold)), from one noise channel
  const ramp = (ch, amt, thr, con, sign = 1) => {
    const row = [0, 0, 0, 0, 0];
    row[ch] = r2(sign * amt * con);
    row[4] = r2(-sign * amt * con * thr);
    return row.join(' ');
  };
  // paper tooth lighting: flat paper (N.L = sin(elevation)) maps to 1, valleys darken, ridges lighten a touch
  const flat = Math.sin((tooth.elevation * Math.PI) / 180);
  const slope = r2(tooth.shadow / flat);
  // page: the region is the page plus a margin, and the wobble fades out at the trim.
  // sprite: the region hugs the element (cheap for small moving parts) and nothing fades.
  const region = sprite
    ? `id="${p}-sprite" x="-0.2" y="-0.2" width="1.4" height="1.4" filterUnits="objectBoundingBox"`
    : `id="${p}-paint" x="-24" y="-24" width="${W + 48}" height="${H + 48}" filterUnits="userSpaceOnUse"`;
  const dmap = sprite
    ? '<feColorMatrix in="wn" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="dmap"/>'
    : `<feColorMatrix in="wn" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="wno"/>
<feFlood flood-color="#808080" result="neutral"/>
<feFlood flood-color="#fff" x="${e}" y="${e}" width="${W - 2 * e}" height="${H - 2 * e}" result="inner"/>
<feGaussianBlur in="inner" stdDeviation="${r2(e / 2.5)}" result="innerSoft"/>
<feComposite in="wno" in2="innerSoft" operator="in" result="wnm"/>
<feComposite in="wnm" in2="neutral" operator="over" result="dmap"/>`;
  return `<filter ${region} primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="${o.wobble.freq}" numOctaves="${o.wobble.octaves}" seed="${o.seed}" result="wn"/>
${dmap}
<feDisplacementMap in="SourceGraphic" in2="dmap" scale="${o.wobble.scale * 2}" xChannelSelector="R" yChannelSelector="G" result="wob"/>
${o.soften ? `<feGaussianBlur in="wob" stdDeviation="${o.soften}" result="wobS"/>` : ''}
<feColorMatrix in="${o.soften ? 'wobS' : 'wob'}" type="saturate" values="${o.saturation}" result="sat"/>
<feComponentTransfer in="sat" result="graded">${ct}</feComponentTransfer>
<feTurbulence type="fractalNoise" baseFrequency="${mottle.freq}" numOctaves="2" seed="${o.seed + 11}" result="mn"/>
<feColorMatrix in="mn" type="matrix" values="0 0 0 0 ${pr}  0 0 0 0 ${pg}  0 0 0 0 ${pb}  ${ramp(0, mottle.amount, 0.5, 4)}" result="mLight"/>
<feComposite in="mLight" in2="graded" operator="over" result="m1"/>
<feColorMatrix in="mn" type="matrix" values="0 ${r2(-mottle.amount * 4)} 0 0 ${r2(1 + mottle.amount * 2)}  0 ${r2(-mottle.amount * 4)} 0 0 ${r2(1 + mottle.amount * 2)}  0 ${r2(-mottle.amount * 4)} 0 0 ${r2(1 + mottle.amount * 2)}  0 0 0 0 1" result="mMul"/>
<feBlend in="m1" in2="mMul" mode="multiply" result="m2"/>
<feTurbulence type="fractalNoise" baseFrequency="${tooth.freq}" numOctaves="${tooth.octaves}" seed="${o.seed + 5}" result="hn"/>
<feColorMatrix in="hn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="height"/>
<feTurbulence type="fractalNoise" baseFrequency="${crayon.pressureFreq}" numOctaves="2" seed="${o.seed + 3}" result="pn"/>
<feColorMatrix in="pn" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${r2(2.2 * crayon.pressure)} 0 0 0 ${r2(1 - 1.1 * crayon.pressure)}" result="pressure"/>
<feColorMatrix in="hn" type="matrix" values="0 0 0 0 ${pr}  0 0 0 0 ${pg}  0 0 0 0 ${pb}  ${ramp(0, crayon.amount, crayon.threshold, crayon.contrast, -1)}" result="skip0"/>
<feComposite in="skip0" in2="pressure" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="skip"/>
<feComposite in="skip" in2="m2" operator="over" result="c1"/>
<feTurbulence type="fractalNoise" baseFrequency="${grain.freq}" numOctaves="2" seed="${o.seed + 23}" result="gn"/>
<feColorMatrix in="gn" type="matrix" values="0 0 0 0 ${pr}  0 0 0 0 ${pg}  0 0 0 0 ${pb}  ${ramp(0, grain.amount, grain.threshold, grain.contrast)}" result="gLight"/>
<feComposite in="gLight" in2="c1" operator="over" result="g1"/>
<feColorMatrix in="gn" type="matrix" values="0 ${r2(-specks.amount * specks.contrast)} 0 0 ${r2(1 + specks.amount * specks.contrast * specks.threshold)}  0 ${r2(-specks.amount * specks.contrast)} 0 0 ${r2(1 + specks.amount * specks.contrast * specks.threshold)}  0 ${r2(-specks.amount * specks.contrast)} 0 0 ${r2(1 + specks.amount * specks.contrast * specks.threshold)}  0 0 0 0 1" result="sMul"/>
<feBlend in="g1" in2="sMul" mode="multiply" result="g2"/>
<feDiffuseLighting in="height" surfaceScale="${tooth.relief}" diffuseConstant="1" lighting-color="#fff" result="lit"><feDistantLight azimuth="${tooth.azimuth}" elevation="${tooth.elevation}"/></feDiffuseLighting>
<feComponentTransfer in="lit" result="toothMul"><feFuncR type="linear" slope="${slope}" intercept="${r2(1 - tooth.shadow)}"/><feFuncG type="linear" slope="${slope}" intercept="${r2(1 - tooth.shadow)}"/><feFuncB type="linear" slope="${slope}" intercept="${r2(1 - tooth.shadow)}"/></feComponentTransfer>
<feBlend in="g2" in2="toothMul" mode="multiply" result="toothed"/>
<feComposite in="toothed" in2="${o.soften ? 'wobS' : 'wob'}" operator="in"/>
</filter>`;
}

function hatchPattern(id, colour, shadeC, pageScale, o) {
  // Hatch geometry is set in page units, so divide by the local scale. Three
  // strokes of different weight and spacing per tile, so it reads as drawn
  // by hand rather than ruled.
  const s = o.shade;
  const k = pageScale || 1;
  const u = s.spacing / k;
  const w = s.width / k;
  const [h, sat, l] = toHsl(shadeC);
  const dark = hex(fromHsl([h, sat, l * (1 - s.darker)]));
  const tile = u * 3;
  const lines = [
    [0, w],
    [u * 1.08, w * 0.7],
    [u * 1.95, w * 1.15],
  ]
    .map(([x, lw]) => `<rect x="${r2(x)}" y="0" width="${r2(lw)}" height="${r2(tile * 3)}" fill="${dark}"/>`)
    .join('');
  return `<pattern id="${id}" width="${r2(tile)}" height="${r2(tile * 3)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${s.angle})">${lines}</pattern>`;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/** Coarsen and lighten the fine texture layers for small on-screen sizes. */
function adaptToScale(o) {
  const ppu = Number(o.pixelsPerUnit) || 1;
  if (ppu >= 1) return o;
  const k = Math.max(ppu, 0.35);
  const fade = 0.55 + 0.45 * k;
  return {
    ...o,
    tooth: { ...o.tooth, freq: r2(o.tooth.freq * k * 1000) / 1000, octaves: Math.max(1, o.tooth.octaves - 1), shadow: o.tooth.shadow * fade },
    grain: { ...o.grain, freq: o.grain.freq * k, amount: o.grain.amount * fade },
    specks: { ...o.specks, amount: o.specks.amount * fade },
    crayon: { ...o.crayon, amount: o.crayon.amount * fade },
  };
}

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? { ...base[k], ...v } : v;
  }
  return out;
}

/**
 * Treat one scene.
 * @param {string} sceneSvg scene file text (<svg viewBox="0 0 1600 1000">…)
 * @param {string} defsSvg the book's art library (defs.svg text)
 * @param {object} [options] see DEFAULTS / README.md
 * @returns {{svg: string, filters: string, stats: object}}
 */
export function treatScene(sceneSvg, defsSvg = '', options = {}) {
  const o = adaptToScale(merge(DEFAULTS, options));
  const st = { colour: 0, split: 0, line: 0, twin: 0, shade: 0 };

  const sceneDoc = parseXml(sceneSvg);
  const svg = findFirst(sceneDoc, (e) => e.name === 'svg');
  const defsDoc = parseXml(defsSvg || '<svg/>');

  // Library: every element with an id in defs.svg (and in the scene's own <defs>).
  const lib = new Map();
  const paintServers = [];
  walkAll(defsDoc, (e) => {
    if (e.attrs.id) lib.set(e.attrs.id, e);
    if (PAINT_SERVERS.has(e.name) && e.attrs.id) paintServers.push(e);
  });
  walkAll(svg, (e) => {
    if (e.attrs.id && !lib.has(e.attrs.id)) lib.set(e.attrs.id, e);
  });

  // Title stays outside the filtered group.
  const title = elements(svg).find((e) => e.name === 'title');
  const art = { name: 'g', attrs: { class: `${o.prefix}-art`, filter: `url(#${o.prefix}-paint)` }, children: svg.children.filter((c) => c !== title) };

  if (o.hide?.length) {
    const hide = new Set(o.hide.map((s) => s.replace(/^#/, '')));
    const prune = (n) => {
      n.children = n.children.filter((c) => !(c.attrs && hide.has(c.attrs.id)));
      n.children.forEach((c) => c.name && prune(c));
    };
    prune(art);
  }
  const sprites = Boolean(o.only?.length);
  if (sprites) {
    // Sprite mode: keep only these ids (and their ancestors). Each one gets its
    // own small filter, so the texture moves with it when the app drives it.
    const keep = new Set(o.only.map((s) => s.replace(/^#/, '')));
    const prune = (n) => {
      if (n.attrs?.id && keep.has(n.attrs.id)) {
        n.attrs.filter = `url(#${o.prefix}-sprite)`;
        return true;
      }
      n.children = n.children.filter((c) => c.name && prune(c));
      return n.children.length > 0;
    };
    prune(art);
    delete art.attrs.filter;
  }

  flattenUses(art, lib);

  // Hatch patterns, one per shade colour and page scale.
  const patterns = new Map();
  const shadeUse = (paint, shadeC, pageScale) => {
    const k = `${hex(shadeC)}-${Math.round(pageScale * 20) / 20}`;
    if (!patterns.has(k)) {
      const id = `${o.prefix}-hatch-${patterns.size}`;
      patterns.set(k, { id, def: hatchPattern(id, paint, shadeC, Math.round(pageScale * 20) / 20, o) });
    }
    return patterns.get(k).id;
  };

  const rootCtx = { fill: '#000', stroke: undefined, sw: 1, m: ID };
  restructure(art, o, rootCtx, st, shadeUse);

  // Name slots: optionally drawn above the paint so they stay crisp.
  let lifted = '';
  if (o.text === 'lift') {
    const liftOut = [];
    const lift = (n, m) => {
      n.children = n.children.filter((c) => {
        if (!c.name) return true;
        const cm = mul(m, parseTransform(c.attrs.transform));
        const cls = ` ${c.attrs.class ?? ''} `;
        if ((c.name === 'text' && cls.includes(' sb-name ')) || cls.includes(' sb-letters ')) {
          const g = { name: 'g', attrs: { transform: `matrix(${m.map(r2).join(' ')})` }, children: [c] };
          liftOut.push(g);
          return false;
        }
        lift(c, cm);
        return true;
      });
    };
    lift(art, ID);
    lifted = liftOut.map(serialise).join('');
  }

  const filterDefs = `${paintFilter(o, sprites ? 'sprite' : 'page')}${[...patterns.values()].map((p) => p.def).join('')}`;
  const filters = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${filterDefs}</defs></svg>`;
  const vb = svg.attrs.viewBox ?? `0 0 ${o.width} ${o.height}`;
  const defsBlock = `<defs>${paintServers.map(serialise).join('')}${filterDefs}</defs>`;
  const paperRect = sprites ? '' : `<rect width="${o.width}" height="${o.height}" fill="${o.paper}"/>`;
  const body = `${title ? serialise(title) : ''}${defsBlock}${paperRect}${serialise(art)}${lifted}`;
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${svg.attrs.width ?? o.width}" height="${svg.attrs.height ?? o.height}" class="${o.prefix}-scene">${body}</svg>`;
  st.bytes = out.length;
  st.patterns = patterns.size;
  return { svg: out, filters, stats: st };
}

export default treatScene;
