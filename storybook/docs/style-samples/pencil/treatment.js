// Pencil & crayon treatment for Tiffin & Me scenes.
//
// Takes a flat-vector scene (1600x1000 viewBox, <use href="#d-..."> into the
// book's defs.svg) and returns a new standalone SVG string in which the same
// vector art is drawn with a hand-made coloured-pencil / wax-crayon look:
//
//   paper     warm off-white paper; pure white in the art becomes paper colour,
//             as if it were left uncoloured
//   wobble    every edge is pushed about by low-frequency noise, so shapes and
//             lines are a little uneven, as if drawn freehand
//   pigment   softened warm blacks and slightly lower saturation: crayon on
//             paper rather than screen colour (and CMYK-friendly)
//   pencil    a darker, grainy pencil rim on every colour boundary, in a darker
//             shade of the colour it sits on, drawn slightly off the fill edge
//             (coloured in first, outlined after)
//   shading   soft darkening that pools along the edges of shapes, and fine
//             pencil hatching laid into the art's darker (shade) areas
//   crayon    diagonal crayon strokes (bands of heavier and lighter pressure),
//             paper tooth speckles that open up between strokes, big pale
//             blotches of uneven colouring, and paper fibre mottling
//
// It is one SVG filter (plus a lighter one for moving parts), built only from
// SVG 1.1 primitives that Chromium, WebKit and Firefox all render:
// feTurbulence, feDisplacementMap, feGaussianBlur, feColorMatrix,
// feComponentTransfer, feComposite, feMerge, feFlood. No <style>, no script,
// no feImage and no external references, so the output also survives
// js/reader/scene.js's sanitiser. Runs in Node or the browser: string in,
// string out, no DOM needed.
//
//   import { treatScene } from './treatment.js';
//   const svg = treatScene(sceneText, defsText, { name: 'Ava', mode: 'screen', seed: 12 });
//
// README.md next to this file lists every parameter.

/** Default parameters. All lengths are in scene units (the 1600x1000 viewBox). */
export const DEFAULTS = Object.freeze({
  /** Prefix for the ids this treatment adds. */
  idPrefix: 'pc',
  /** Master seed. Use a different one per page so no two pages share the same grain. */
  seed: 7,
  /** Paper colour. White in the art becomes this. */
  paper: '#FBF4E6',
  /** Freehand wobble of every edge: noise frequency (per unit), octaves, displacement (units). */
  wobble: { freq: 0.009, octaves: 3, scale: 9 },
  /**
   * Pigment: saturation multiplier, where pure black ends up (R, G, B in 0-1:
   * a warm soft charcoal instead of #000), and how strongly the paper colour
   * tints everything (0 = not at all, 1 = colours multiplied by the paper).
   */
  colour: { saturate: 0.98, black: [0.2, 0.17, 0.15], paperTint: 0.7 },
  /**
   * Pencil rim on colour boundaries: width (blur, units), strength, how far it
   * wanders off the fill edge (units) and how grainy it is (0-1).
   */
  pencil: { width: 1.6, strength: 2.2, offset: 2, offsetFreq: 0.035, grain: 0.4 },
  /** Soft shading pooled along edges: blur radius (units) and strength (0 = off). */
  shading: { radius: 7, strength: 0.45 },
  /**
   * Crayon strokes: direction (degrees, 0 = horizontal, negative = rising to the
   * right), noise frequency along and across the stroke, octaves, how much
   * darker/lighter the pressure bands make the colour (0-1), how much more
   * paper tooth shows in the light bands (0-1), and the patches: strokes show
   * strongly in some big patches and fade out in others (patch = noise
   * frequency, patchCover = roughly the share of the page with strokes).
   */
  strokes: { angle: -36, along: 0.006, across: 0.05, octaves: 2, pressure: 0.12, gaps: 0.25, patch: 0.0035, patchCover: 0.6 },
  /**
   * Hatched shadows: fine pencil hatching laid into areas that are darker than
   * their surroundings (the art's shade shapes, the inside of dark outlines).
   * radius = neighbourhood (units), sensitivity/threshold = how dark counts as
   * shadow, along/across = hatch-line noise frequency, depth = how dark the
   * hatch lines are (0 = off).
   */
  hatching: { radius: 10, sensitivity: 9, threshold: 0.14, along: 0.014, across: 0.24, contrast: 5, depth: 0.18 },
  /** Paper tooth: fine speckles of paper showing through the pigment. */
  tooth: { freq: 0.55, octaves: 3, threshold: 0.62, contrast: 6, amount: 0.45 },
  /** Uneven colouring: large pale blotches where the colour went on thinner. */
  blotch: { freq: 0.006, octaves: 3, amount: 0.12 },
  /** Paper fibre mottling (multiplied; 0 = off). */
  fibre: { freq: 0.03, amount: 0.06 },
  /** Units beyond the viewBox that the filter paints into (keeps page edges clean). */
  pad: 24,
});

// ---------------------------------------------------------------------------
// Helpers

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge options over defaults (arrays and scalars replace). */
export function mergeOptions(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = isObj(v) && isObj(base[k]) ? mergeOptions(base[k], v) : v;
  }
  return out;
}

const r3 = (n) => Number(Number(n).toFixed(4));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
}

function attrs(tag) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = m[3] ?? m[4];
  return out;
}

const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;

/**
 * Remove every element (with its subtree) for which `test(attrs, tagName)` is
 * true. A small tag scanner, fine for well-formed generated SVG.
 */
export function removeElements(svg, test) {
  const re = new RegExp(TAG.source, 'g');
  let out = '';
  let last = 0;
  let depth = 0;
  let cutDepth = -1;
  let m;
  while ((m = re.exec(svg))) {
    if (!m[2]) continue; // comment
    if (m[1] === '/') {
      depth -= 1;
      if (cutDepth >= 0 && depth === cutDepth) {
        last = re.lastIndex;
        cutDepth = -1;
      }
      continue;
    }
    const selfClosing = m[4] === '/';
    if (cutDepth < 0 && test(attrs(m[3]), m[2])) {
      out += svg.slice(last, m.index);
      last = re.lastIndex;
      if (!selfClosing) cutDepth = depth;
    }
    if (!selfClosing) depth += 1;
  }
  return cutDepth >= 0 ? out : out + svg.slice(last);
}

const hasClass = (a, c) => (a.class ?? '').split(/\s+/).includes(c);

/** Write a name into every sb-name text slot, replacing the placeholder. */
export function fillNames(svg, name) {
  return svg.replace(
    /(<text\b(?:"[^"]*"|'[^']*'|[^'">])*\bclass\s*=\s*"[^"]*\bsb-name\b[^"]*"(?:"[^"]*"|'[^']*'|[^'">])*>)([\s\S]*?)(<\/text>)/g,
    (_, open, _txt, close) => `${open}${esc(name)}${close}`,
  );
}

/** The inside of the <defs> in a book's defs.svg ('' if none). */
export function extractDefsInner(defsSvg) {
  const s = String(defsSvg ?? '');
  const a = s.search(/<defs\b[^>]*>/);
  if (a < 0) return '';
  const start = s.indexOf('>', a) + 1;
  const end = s.lastIndexOf('</defs>');
  return end > start ? s.slice(start, end) : '';
}

function viewBoxOf(openTag) {
  const a = attrs(openTag);
  const vb = (a.viewBox ?? `0 0 ${a.width ?? 1600} ${a.height ?? 1000}`).trim().split(/[\s,]+/).map(Number);
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3], width: a.width ?? vb[2], height: a.height ?? vb[3] };
}

/** Bounding box of rect `vb` (grown by pad) rotated by `deg` about its centre. */
function rotatedBox(vb, pad, deg) {
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  const t = (deg * Math.PI) / 180;
  const hw = vb.w / 2 + pad;
  const hh = vb.h / 2 + pad;
  const ex = Math.abs(hw * Math.cos(t)) + Math.abs(hh * Math.sin(t));
  const ey = Math.abs(hw * Math.sin(t)) + Math.abs(hh * Math.cos(t));
  return { x: r3(cx - ex), y: r3(cy - ey), w: r3(2 * ex), h: r3(2 * ey) };
}

// ---------------------------------------------------------------------------
// Filters

/** Colour-matrix rows: R=G=B = a*R + b, alpha 1 (reads the noise's red channel). */
const greyFromR = (a, b) => {
  const row = `${r3(a)} 0 0 0 ${r3(b)}`;
  return `${row}  ${row}  ${row}  0 0 0 0 1`;
};
/** Colour-matrix rows: RGB 0, alpha = clamp(contrast * (R - threshold)) * amount. */
const alphaFromR = (threshold, contrast, amount) =>
  `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${r3(contrast * amount)} 0 0 0 ${r3(-contrast * threshold * amount)}`;
const invertRgb = (inName, result, k = 1) =>
  `<feComponentTransfer in="${inName}" result="${result}"><feFuncR type="linear" slope="${-k}" intercept="1"/><feFuncG type="linear" slope="${-k}" intercept="1"/><feFuncB type="linear" slope="${-k}" intercept="1"/></feComponentTransfer>`;

/**
 * The <filter> elements, as a string to put inside <defs>.
 *   `${idPrefix}-art`   the whole-page treatment. Its user space is the page
 *                       rotated by strokes.angle, so wrap the art as treatScene
 *                       does (rotate(a) > filter > rotate(-a) > art).
 *   `${idPrefix}-part`  for one moving part drawn live on its own (the ball, a
 *                       flap): pigment, rim and grain, keeps transparency; no
 *                       crayon strokes, hatching or fibre (cheap on small areas).
 * @param {object} [options] see DEFAULTS
 * @param {{x:number,y:number,w:number,h:number}} [vb] the scene's viewBox
 */
export function pencilFilterDefs(options = {}, vb = { x: 0, y: 0, w: 1600, h: 1000 }) {
  const o = mergeOptions(DEFAULTS, options);
  const p = o.idPrefix;
  const s = o.seed;
  const box = rotatedBox(vb, o.pad, -o.strokes.angle);
  const tint = o.colour.paperTint ?? 1;
  const [pr, pg, pb] = hexToRgb(o.paper).map((c) => 1 - tint * (1 - c));
  // Lift the darks only: 0 -> the soft black; mid-tones and highlights stay.
  const lift = (b) => `${r3(b)} ${r3(0.25 + b * 0.42)} ${r3(0.5 + b * 0.1)} 0.75 1`;
  const { wobble: w, pencil: pe, shading: sh, strokes: st, hatching: ha, tooth: t, blotch: bl, fibre: fb } = o;

  // Wobble, then screen colour -> pigment on paper (white becomes paper).
  const pigment = (opaque) => `
  <feTurbulence type="fractalNoise" baseFrequency="${w.freq}" numOctaves="${w.octaves}" seed="${s}" result="wobN"/>
  <feDisplacementMap in="SourceGraphic" in2="wobN" scale="${w.scale}" xChannelSelector="R" yChannelSelector="G" result="wob"/>
  <feFlood flood-color="${o.paper}" result="paper"/>${opaque ? `
  <feMerge result="wobO"><feMergeNode in="paper"/><feMergeNode in="wob"/></feMerge>` : ''}
  <feColorMatrix in="${opaque ? 'wobO' : 'wob'}" type="saturate" values="${o.colour.saturate}" result="sat"/>
  <feComponentTransfer in="sat" result="lifted"><feFuncR type="table" tableValues="${lift(o.colour.black[0])}"/><feFuncG type="table" tableValues="${lift(o.colour.black[1])}"/><feFuncB type="table" tableValues="${lift(o.colour.black[2])}"/></feComponentTransfer>
  <feColorMatrix in="lifted" type="matrix" values="${r3(pr)} 0 0 0 0  0 ${r3(pg)} 0 0 0  0 0 ${r3(pb)} 0 0  0 0 0 1 0" result="pig"/>`;

  // Paper tooth (+ more of it in the light stroke bands) and pale blotches ->
  // alpha of paper-coloured speckles laid over the pigment.
  const coverage = (withBands) => `
  <feTurbulence type="fractalNoise" baseFrequency="${t.freq}" numOctaves="${t.octaves}" seed="${s + 3}" result="toothN"/>
  <feColorMatrix in="toothN" type="matrix" values="${greyFromR(1, 0)}" result="tooth"/>${withBands ? `
  <feComposite in="tooth" in2="band" operator="arithmetic" k2="1" k3="${r3(-st.gaps)}" k4="${r3(st.gaps)}" result="toothB"/>` : ''}
  <feColorMatrix in="${withBands ? 'toothB' : 'tooth'}" type="matrix" values="${alphaFromR(t.threshold + (withBands ? st.gaps * 0.5 : 0), t.contrast, t.amount)}" result="toothA"/>
  <feTurbulence type="fractalNoise" baseFrequency="${bl.freq}" numOctaves="${bl.octaves}" seed="${s + 5}" result="blotN"/>
  <feColorMatrix in="blotN" type="matrix" values="${alphaFromR(0.45, 3, bl.amount)}" result="blotA"/>
  <feComposite in="toothA" in2="blotA" operator="arithmetic" k2="1" k3="1" result="covA"/>
  <feComposite in="paper" in2="covA" operator="in" result="specks"/>`;

  // Pencil rim + soft shading, from `pig` to `shaded`.
  const rim = `
  <!-- pencil rim: |pigment - blur(pigment)| per channel, summed to grey -->
  <feGaussianBlur in="pig" stdDeviation="${pe.width}" result="pigB"/>
  ${invertRgb('pigB', 'pigBi')}
  ${invertRgb('pig', 'pigI')}
  <feComposite in="pig" in2="pigBi" operator="arithmetic" k2="1" k3="1" k4="-1" result="d1"/>
  <feComposite in="pigB" in2="pigI" operator="arithmetic" k2="1" k3="1" k4="-1" result="d2"/>
  <feComposite in="d1" in2="d2" operator="arithmetic" k2="1" k3="1" result="dd"/>
  <feColorMatrix in="dd" type="matrix" values="${[0, 1, 2].map(() => `${r3(pe.strength / 3)} ${r3(pe.strength / 3)} ${r3(pe.strength / 3)} 0 0`).join('  ')}  0 0 0 0 1" result="edge"/>
  <!-- graphite grain along the rim, then nudge it off the fill edge -->
  <feTurbulence type="fractalNoise" baseFrequency="${r3(t.freq * 1.3)}" numOctaves="2" seed="${s + 7}" result="gN"/>
  <feColorMatrix in="gN" type="matrix" values="${greyFromR(pe.grain * 4, 1 - pe.grain * 2)}" result="grain"/>
  <feComposite in="edge" in2="grain" operator="arithmetic" k1="1" result="edgeG"/>
  <feTurbulence type="fractalNoise" baseFrequency="${pe.offsetFreq}" numOctaves="2" seed="${s + 11}" result="offN"/>
  <feDisplacementMap in="edgeG" in2="offN" scale="${pe.offset * 2}" xChannelSelector="G" yChannelSelector="R" result="edgeD"/>
  ${invertRgb('edgeD', 'edgeInv')}
  <feGaussianBlur in="edgeD" stdDeviation="${sh.radius}" result="shadeB"/>
  ${invertRgb('shadeB', 'shadeInv', sh.strength)}
  <feComposite in="pig" in2="edgeInv" operator="arithmetic" k1="1" result="lined"/>
  <feComposite in="lined" in2="shadeInv" operator="arithmetic" k1="1" result="shaded"/>`;

  const art = `
<filter id="${p}-art" filterUnits="userSpaceOnUse" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" color-interpolation-filters="sRGB">${pigment(true)}
${rim}
  <!-- crayon strokes: pressure bands along the stroke direction (this filter's x axis) -->
  <feTurbulence type="fractalNoise" baseFrequency="${st.along} ${st.across}" numOctaves="${st.octaves}" seed="${s + 13}" result="bandN"/>
  <feColorMatrix in="bandN" type="matrix" values="${greyFromR(1, 0)}" result="band0"/>
  <feTurbulence type="fractalNoise" baseFrequency="${st.patch}" numOctaves="2" seed="${s + 19}" result="patchN"/>
  <feColorMatrix in="patchN" type="matrix" values="${alphaFromR(0.58 - 0.25 * st.patchCover, 6, 1)}" result="patchA"/>
  <feComposite in="band0" in2="patchA" operator="in" result="bandIn"/>
  <feFlood flood-color="rgb(50%,50%,50%)" result="half"/>
  <feMerge result="band"><feMergeNode in="half"/><feMergeNode in="bandIn"/></feMerge>
  <feColorMatrix in="band" type="matrix" values="${greyFromR(-2 * st.pressure, 1 + st.pressure)}" result="press"/>
  <feComposite in="shaded" in2="press" operator="arithmetic" k1="1" result="pressed0"/>${ha.depth > 0 ? `
  <!-- hatching where the colour is darker than its neighbourhood -->
  <feGaussianBlur in="pig" stdDeviation="${ha.radius}" result="pigL"/>
  <feComposite in="pigL" in2="pigI" operator="arithmetic" k2="1" k3="1" k4="-1" result="darker"/>
  <feColorMatrix in="darker" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${r3(ha.sensitivity)} ${r3(ha.sensitivity)} ${r3(ha.sensitivity)} 0 ${r3(-ha.sensitivity * ha.threshold)}" result="shadowA"/>
  <feTurbulence type="fractalNoise" baseFrequency="${ha.along} ${ha.across}" numOctaves="2" seed="${s + 23}" result="hatchN"/>
  <feColorMatrix in="hatchN" type="matrix" values="${greyFromR(-ha.contrast * ha.depth, 1 + ha.contrast * ha.depth * 0.52)}" result="hatchG"/>
  <feComposite in="pressed0" in2="hatchG" operator="arithmetic" k1="1" result="hatched"/>
  <feComposite in="hatched" in2="shadowA" operator="in" result="hatchedIn"/>
  <feMerge result="pressed"><feMergeNode in="pressed0"/><feMergeNode in="hatchedIn"/></feMerge>` : `
  <feMerge result="pressed"><feMergeNode in="pressed0"/></feMerge>`}
  <!-- paper fibre mottling -->
  <feTurbulence type="fractalNoise" baseFrequency="${fb.freq} ${r3(fb.freq * 2.5)}" numOctaves="4" seed="${s + 17}" result="fibN"/>
  <feColorMatrix in="fibN" type="matrix" values="${greyFromR(-2.5 * fb.amount, 1 + 0.75 * fb.amount)}" result="fib"/>
  <feComposite in="pressed" in2="fib" operator="arithmetic" k1="1" result="fibred"/>${coverage(true)}
  <feMerge><feMergeNode in="fibred"/><feMergeNode in="specks"/></feMerge>
</filter>`;

  // A moving part drawn live on its own: the same pigment, rim and grain, cut
  // back to the part's own (wobbled) shape so it keeps its transparency. Its
  // grain lives in the part's coordinates, so it travels and spins with it.
  const part = `
<filter id="${p}-part" filterUnits="objectBoundingBox" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">${pigment(true)}
${rim}${coverage(false)}
  <feMerge result="partAll"><feMergeNode in="shaded"/><feMergeNode in="specks"/></feMerge>
  <feComposite in="partAll" in2="wob" operator="in"/>
</filter>`;

  return `${art}${part}`;
}

/**
 * Treat one scene.
 * @param {string} sceneSvg the scene file's text (an <svg> with a viewBox)
 * @param {string} [defsSvg] the book's defs.svg text; inlined so the result stands alone
 * @param {object} [options] everything in DEFAULTS, plus:
 *   name        write this into every sb-name slot (default: leave the placeholder)
 *   mode        'screen' drops .sb-print-only, 'print' drops .sb-digital, 'all' keeps both (default)
 *   drop        ['#id', '.class', ...] more elements to leave out (e.g. parts that only
 *               appear after the mechanism, or '.sb-print-only' stars once a name is printed)
 *   inlineDefs  false to leave the library defs out (when the page already has defs.svg)
 *   treat       false to return the prepared scene without the treatment (for comparisons)
 * @returns {string} standalone SVG
 */
export function treatScene(sceneSvg, defsSvg = '', options = {}) {
  const o = mergeOptions({ ...DEFAULTS, name: null, mode: 'all', drop: [], inlineDefs: true, treat: true }, options);
  let scene = String(sceneSvg);
  if (o.name != null) scene = fillNames(scene, o.name);
  const drop = [...(o.drop ?? [])].map(String);
  if (o.mode === 'screen') drop.push('.sb-print-only');
  if (o.mode === 'print') drop.push('.sb-digital');
  const dropIds = new Set(drop.filter((d) => d.startsWith('#')).map((d) => d.slice(1)));
  const dropClasses = drop.filter((d) => d.startsWith('.')).map((d) => d.slice(1));
  if (drop.length) {
    scene = removeElements(scene, (a) => (a.id != null && dropIds.has(a.id)) || dropClasses.some((c) => hasClass(a, c)));
  }

  const open = /<svg\b(?:"[^"]*"|'[^']*'|[^'">])*>/.exec(scene);
  if (!open) throw new Error('treatScene: no <svg> element');
  const vb = viewBoxOf(open[0]);
  let inner = scene.slice(open.index + open[0].length, scene.lastIndexOf('</svg>'));
  let title = '';
  inner = inner.replace(/<title\b[^>]*>[\s\S]*?<\/title>/, (m) => { title = m; return ''; });

  const p = o.idPrefix;
  const lib = o.inlineDefs ? extractDefsInner(defsSvg) : '';
  const cx = r3(vb.x + vb.w / 2);
  const cy = r3(vb.y + vb.h / 2);
  const a = o.strokes.angle;
  const body = o.treat
    ? `<rect id="${p}-paper" x="${vb.x - o.pad}" y="${vb.y - o.pad}" width="${vb.w + 2 * o.pad}" height="${vb.h + 2 * o.pad}" fill="${o.paper}"/>
<g id="${p}-art" transform="rotate(${a} ${cx} ${cy})"><g filter="url(#${p}-art)"><g transform="rotate(${-a} ${cx} ${cy})">${inner}</g></g></g>`
    : inner;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" width="${vb.width}" height="${vb.height}">`,
    title,
    `<defs>${lib}${o.treat ? pencilFilterDefs(o, vb) : ''}</defs>`,
    body,
    '</svg>',
  ].join('\n');
}

export default treatScene;
