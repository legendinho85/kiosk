// "Soft gouache" treatment for the storybook scenes.
//
// Keeps the flat vector scenes as the source of truth and adds the hand-made
// look at render time with SVG filters that Chromium draws reliably:
//
//   1. outlines are pulled most of the way towards their fill colour (a soft
//      painted edge instead of a drawn line)                 -> softenOutlines()
//   2. every edge wavers gently, as if cut in with a brush     -> feDisplacementMap
//   3. each colour gets its own blotchy, uneven coverage       -> per-colour noise
//   4. brush drag, paper tooth and speckled pigment grain       -> noise + soft-light
//   5. dry-brush flecks where the warm paper shows through     -> thresholded noise
//   6. a warm, print-safe grade: no pure black, creamy whites  -> feComponentTransfer
//   7. a gentle glow around the brightest highlights           -> blur + screen
//
// Pure string in, string out: no DOM, runs the same in Node and in the browser.
//
//   import { treatScene } from './treatment.js';
//   const out = treatScene(sceneSvgText, defsSvgText, { seed: 3 });
//   out.svg      // one self-contained <svg> (defs + filters + treated scene)
//   out.scene    // the treated scene alone (expects out.defs and out.filters in the page)
//   out.defs     // the art library with softened outlines
//   out.filters  // <svg width=0 height=0> holding the <filter>s (inline once per page)
//
// All lengths are in scene units (the 1600 x 1000 viewBox), so the texture is
// the same size relative to the art whatever size it is rendered at.

export const DEFAULTS = Object.freeze({
  prefix: 'gw', // id prefix for the filters
  seed: 7, // change per page (or per book) so no two pages share the same brush marks
  outline: 0.38, // 0 = outline disappears into the fill, 1 = original outline colour
  outlineWidth: 1, // multiplier for outline stroke widths
  wobble: { freq: 0.018, octaves: 2, scale: 6 }, // big, gentle waver of every edge
  rough: { freq: 0.09, scale: 2.2 }, // small bristle roughness on top of the waver
  soften: 0.7, // blur after the wobble (softens every edge, no hard lines)
  edgeFade: 4, // wobble fades to 0 within this distance of the page edge (no gaps at the trim)
  blotch: { freq: 0.011, octaves: 3, amount: 1.1 }, // per-colour uneven coverage (0..~1.5)
  brush: { freq: [0.006, 0.05], octaves: 2, amount: 0.6 }, // streaky brush drag (x/y frequency)
  strokes: { freq: [0.03, 0.3], octaves: 2, warp: 35, amount: 0.5 }, // bristle marks inside each stroke
  tooth: { freq: 0.35, octaves: 2, amount: 0.3 }, // paper tooth / speckled grain
  flecks: { freq: 0.2, light: 0.5, dark: 0.28, density: 0.5 }, // dry-brush flecks (0..1 each)
  paper: '#FBF4E6', // warm paper: replaces pure white, shows through the flecks
  ink: '#2A2320', // what pure black becomes (soft, warm, print safe)
  saturation: 0.96, // gouache is a little chalky; also keeps colours inside CMYK
  contrast: 0.12, // gentle S-curve after the paper/ink squeeze (0 = none)
  glow: { threshold: 0.84, radius: 9, amount: 0.3 }, // warm bloom around highlights
  text: 'lift', // 'lift' = name slots drawn crisp on top of the paint, 'paint' = painted with the rest
  animated: [], // the page's JSON (or a list of ids) so name slots inside moving parts are not lifted
  textWobble: 2, // edge waver for lifted name text
});

// ---------------------------------------------------------------- tiny XML

const NAME_RE = /^<([A-Za-z_][\w:.-]*)/;
const ATTR_RE = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

/** Parse an SVG/XML string into a light tree: {type:'el'|'text'|'raw', ...}. */
export function parseXml(src) {
  const root = { type: 'el', name: '#root', attrs: [], children: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      top().children.push({ type: 'text', value: src.slice(i) });
      break;
    }
    if (lt > i) top().children.push({ type: 'text', value: src.slice(i, lt) });
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      top().children.push({ type: 'raw', value: src.slice(lt, end + 3) });
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      top().children.push({ type: 'raw', value: src.slice(lt, end + 3) });
      i = end + 3;
    } else if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt);
      top().children.push({ type: 'raw', value: src.slice(lt, end + 1) });
      i = end + 1;
    } else if (src.startsWith('</', lt)) {
      const end = src.indexOf('>', lt);
      if (stack.length > 1) stack.pop();
      i = end + 1;
    } else {
      // find the end of the tag, skipping quoted attribute values
      let j = lt + 1;
      let q = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (q) {
          if (c === q) q = null;
        } else if (c === '"' || c === "'") q = c;
        else if (c === '>') break;
      }
      const tag = src.slice(lt, j + 1);
      const name = NAME_RE.exec(tag)[1];
      const attrs = [];
      ATTR_RE.lastIndex = name.length + 1;
      let m;
      while ((m = ATTR_RE.exec(tag))) attrs.push([m[1], m[3] ?? m[4] ?? '']);
      const el = { type: 'el', name, attrs, children: [] };
      top().children.push(el);
      if (!/\/\s*>$/.test(tag)) stack.push(el);
      i = j + 1;
    }
  }
  return root;
}

const esc = (v) => String(v).replace(/&(?!(#\d+|#x[\da-f]+|\w+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Serialise a tree from parseXml back to a string. */
export function serialise(node) {
  if (node.type === 'text' || node.type === 'raw') return node.value;
  const inner = node.children.map(serialise).join('');
  if (node.name === '#root') return inner;
  const a = node.attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return node.children.length ? `<${node.name}${a}>${inner}</${node.name}>` : `<${node.name}${a}/>`;
}

const attr = (el, k) => el.attrs.find(([n]) => n === k)?.[1];
function setAttr(el, k, v) {
  const a = el.attrs.find(([n]) => n === k);
  if (a) a[1] = v;
  else el.attrs.push([k, v]);
}
const classes = (el) => (attr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
const elements = (el) => el.children.filter((c) => c.type === 'el');
function* walk(el) {
  for (const c of elements(el)) {
    yield c;
    yield* walk(c);
  }
}

// ---------------------------------------------------------------- colour

function hexToRgb(h) {
  let s = String(h).trim().replace('#', '');
  if (s.length === 3) s = [...s].map((c) => c + c).join('');
  if (!/^[\da-f]{6}$/i.test(s)) return null;
  return [0, 2, 4].map((k) => parseInt(s.slice(k, k + 2), 16));
}
const rgbToHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const NAMED = { white: '#FFFFFF', black: '#000000' };
const colour = (v) => hexToRgb(NAMED[String(v).toLowerCase()] ?? v);
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

/**
 * Pull darker outlines towards their fill: t=0 hides the outline in the fill,
 * t=1 keeps it. Only strokes darker than a solid fill on the same element are
 * touched, so line work (whiskers, smiles, laces: fill="none") and light trims
 * (white stripes) keep their colour.
 */
export function softenOutlinesTree(tree, t = DEFAULTS.outline, widthScale = 1) {
  for (const el of walk(tree)) {
    const f = colour(attr(el, 'fill'));
    const s = colour(attr(el, 'stroke'));
    if (!f || !s) continue;
    if (luma(s) >= luma(f)) continue;
    setAttr(el, 'stroke', rgbToHex(mix(f, s, t)));
    const w = Number(attr(el, 'stroke-width'));
    if (widthScale !== 1 && Number.isFinite(w)) setAttr(el, 'stroke-width', String(+(w * widthScale).toFixed(2)));
  }
  // Groups that set stroke-width for outlined children (the art library does this)
  if (widthScale !== 1) {
    for (const el of walk(tree)) {
      if (el.name === 'g' && attr(el, 'stroke-width') && !attr(el, 'stroke')) {
        setAttr(el, 'stroke-width', String(+(Number(attr(el, 'stroke-width')) * widthScale).toFixed(2)));
      }
    }
  }
  return tree;
}

export function softenOutlines(svg, t = DEFAULTS.outline, widthScale = 1) {
  return serialise(softenOutlinesTree(parseXml(svg), t, widthScale));
}

// ---------------------------------------------------------------- filters

const n = (v) => +Number(v).toFixed(4);
const merge = (base, over) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? { ...base[k], ...v } : v;
  }
  return out;
};

/** Options merged with DEFAULTS (nested objects merge key by key). */
export const options = (opts) => merge(DEFAULTS, opts);

/**
 * The <filter> elements, as a string. `box` is the page in scene units
 * ({x, y, width, height}; the scene's viewBox).
 *
 *  #<prefix>-paint  the full treatment, for everything painted
 *  #<prefix>-ink    a light version for lifted name text (wobble, soften, grade, grain)
 */
export function gouacheFilters(opts = {}, box = { x: 0, y: 0, width: 1600, height: 1000 }) {
  const o = options(opts);
  const P = o.prefix;
  const seed = Math.round(o.seed);
  const paper = colour(o.paper).map((v) => v / 255);
  const ink = colour(o.ink).map((v) => v / 255);
  // grade: a gentle S-curve (contrast), then black -> ink and white -> paper, per channel
  const curve = (x) => x - (o.contrast * Math.sin(2 * Math.PI * x)) / (2 * Math.PI);
  const grade = [0, 1, 2]
    .map((k) => {
      const t = Array.from({ length: 17 }, (_, i) => n(ink[k] + curve(i / 16) * (paper[k] - ink[k])));
      return `<feFunc${'RGB'[k]} type="table" tableValues="${t.join(' ')}"/>`;
    })
    .join('');
  const region = `x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" filterUnits="userSpaceOnUse"`;
  const alpha1 = 'values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1"';

  // grey "texture signal" around 0.5 -> soft-light over the paint
  const B = o.blotch.amount / 3; // per-colour blotches: sum of 3 channels
  const brushF = [].concat(o.brush.freq).join(' ');

  // flecks: threshold a noise channel into sparse spots
  const dens = Math.max(0, Math.min(1, o.flecks.density));
  const thr = 0.74 - 0.12 * dens; // fractal noise sits around .5; the top few % become flecks
  const K = 14;

  const edgeMask = (res) => `
    <feFlood flood-color="#fff" result="${res}-f"/>
    <feGaussianBlur in="${res}-f" stdDeviation="${n(o.edgeFade / 2)}" result="${res}-b"/>
    <feColorMatrix in="${res}-b" type="matrix" values="0 0 0 2 -1  0 0 0 2 -1  0 0 0 2 -1  0 0 0 0 1" result="${res}"/>`;

  const wobbleMaps = (scaleW, scaleR, tag) => `
    <feTurbulence type="fractalNoise" baseFrequency="${o.wobble.freq}" numOctaves="${o.wobble.octaves}" seed="${seed}" result="${tag}wn"/>
    <feColorMatrix in="${tag}wn" type="matrix" ${alpha1} result="${tag}wn1"/>
    <feComposite in="${tag}wn1" in2="edge" operator="arithmetic" k1="1" k2="0" k3="-0.5" k4="0.5" result="${tag}wmap"/>
    <feDisplacementMap in="SourceGraphic" in2="${tag}wmap" scale="${n(scaleW)}" xChannelSelector="R" yChannelSelector="G" result="${tag}w1"/>
    ${
      scaleR > 0
        ? `<feTurbulence type="fractalNoise" baseFrequency="${o.rough.freq}" numOctaves="1" seed="${seed + 1}" result="${tag}rn"/>
    <feColorMatrix in="${tag}rn" type="matrix" ${alpha1} result="${tag}rn1"/>
    <feComposite in="${tag}rn1" in2="edge" operator="arithmetic" k1="1" k2="0" k3="-0.5" k4="0.5" result="${tag}rmap"/>
    <feDisplacementMap in="${tag}w1" in2="${tag}rmap" scale="${n(scaleR)}" xChannelSelector="B" yChannelSelector="R" result="${tag}w2"/>`
        : `<feMerge result="${tag}w2"><feMergeNode in="${tag}w1"/></feMerge>`
    }`;

  // (per channel x = (noise-.5)*colour+.5) -> grey .5 + a*sum(x-.5)
  const grey = (a) => {
    const row = `${n(a)} ${n(a)} ${n(a)} 0 ${n(0.5 - 1.5 * a)}`;
    return `${row}  ${row}  ${row}  0 0 0 0 1`;
  };
  // one noise channel -> grey .5 + a*(noise-.5)
  const grey1 = (a) => {
    const row = `${n(a)} 0 0 0 ${n(0.5 - a / 2)}`;
    return `${row}  ${row}  ${row}  0 0 0 0 1`;
  };
  const paint = `
  <filter id="${P}-paint" ${region} color-interpolation-filters="sRGB">
    ${edgeMask('edge')}
    ${wobbleMaps(o.wobble.scale, o.rough.scale, '')}
    <feGaussianBlur in="w2" stdDeviation="${o.soften}" result="soft"/>
    <feColorMatrix in="soft" type="saturate" values="${o.saturation}" result="sat"/>
    <feComponentTransfer in="sat" result="graded">${grade}</feComponentTransfer>

    <!-- per-colour blotches: each colour picks its own mix of three noise fields -->
    <feTurbulence type="fractalNoise" baseFrequency="${o.blotch.freq}" numOctaves="${o.blotch.octaves}" seed="${seed + 2}" result="bn"/>
    <feColorMatrix in="bn" type="matrix" ${alpha1} result="bn1"/>
    <feComposite in="bn1" in2="graded" operator="arithmetic" k1="1" k2="0" k3="-0.5" k4="0.5" result="bp"/>
    <feColorMatrix in="bp" type="matrix" values="${grey(B)}" result="blot"/>

    <!-- brush drag: long, streaky noise (also per colour, so strokes stop at shape edges) -->
    <feTurbulence type="fractalNoise" baseFrequency="${brushF}" numOctaves="${o.brush.octaves}" seed="${seed + 3}" result="brn"/>
    <feColorMatrix in="brn" type="matrix" ${alpha1} result="brn1"/>
    <feComposite in="brn1" in2="graded" operator="arithmetic" k1="1" k2="0" k3="-0.5" k4="0.5" result="brp"/>
    <feColorMatrix in="brp" type="matrix" values="${grey(o.brush.amount / 3)}" result="brush"/>
    <!-- bristle marks: fine streaks whose direction meanders (warped by the wobble noise) -->
    <feTurbulence type="fractalNoise" baseFrequency="${[].concat(o.strokes.freq).join(' ')}" numOctaves="${o.strokes.octaves}" seed="${seed + 6}" result="stn"/>
    <feColorMatrix in="stn" type="matrix" ${alpha1} result="stn1"/>
    <feDisplacementMap in="stn1" in2="wmap" scale="${n(o.strokes.warp)}" xChannelSelector="G" yChannelSelector="R" result="stw0"/>
    <feFlood flood-color="#808080" result="mid"/>
    <feMerge result="stw"><feMergeNode in="mid"/><feMergeNode in="stw0"/></feMerge>
    <feComposite in="stw" in2="graded" operator="arithmetic" k1="1" k2="0" k3="-0.5" k4="0.5" result="stp"/>
    <feColorMatrix in="stp" type="matrix" values="${grey(o.strokes.amount / 3)}" result="strokes"/>
    <!-- paper tooth / grain -->
    <feTurbulence type="fractalNoise" baseFrequency="${[].concat(o.tooth.freq).join(' ')}" numOctaves="${o.tooth.octaves}" seed="${seed + 4}" result="tn"/>
    <feColorMatrix in="tn" type="matrix" values="${grey1(o.tooth.amount)}" result="tooth"/>
    <!-- sum of the four signals (each is grey around .5) -->
    <feComposite in="blot" in2="brush" operator="arithmetic" k2="1" k3="1" k4="-0.5" result="sig1"/>
    <feComposite in="sig1" in2="strokes" operator="arithmetic" k2="1" k3="1" k4="-0.5" result="sig2"/>
    <feComposite in="sig2" in2="tooth" operator="arithmetic" k2="1" k3="1" k4="-0.5" result="sig"/>
    <feBlend in="sig" in2="graded" mode="soft-light" result="tex"/>

    <!-- dry-brush flecks: paper showing through (light) and pigment specks (dark) -->
    <feTurbulence type="fractalNoise" baseFrequency="${o.flecks.freq}" numOctaves="2" seed="${seed + 5}" result="fn"/>
    <!-- flecks cluster in patches (dry-brush), using the spare alpha channel of the blotch noise -->
    <feColorMatrix in="bn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 6 ${n(-6 * (0.5 + 0.12 * (1 - dens)))}" result="clump"/>
    <feColorMatrix in="fn" type="matrix" values="0 0 0 0 ${n(paper[0])}  0 0 0 0 ${n(paper[1])}  0 0 0 0 ${n(paper[2])}  ${K} 0 0 0 ${n(-K * thr)}" result="flight0"/>
    <feComposite in="flight0" in2="clump" operator="in" result="flight1"/>
    <feComponentTransfer in="flight1" result="flight"><feFuncA type="linear" slope="${n(o.flecks.light)}"/></feComponentTransfer>
    <feColorMatrix in="fn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 ${K} 0 0 ${n(-K * thr)}" result="fdark0"/>
    <feComposite in="tex" in2="fdark0" operator="in" result="fdark1"/>
    <feColorMatrix in="fdark1" type="matrix" values="0.72 0 0 0 0  0 0.7 0 0 0  0 0 0.72 0 0  0 0 0 ${n(o.flecks.dark)} 0" result="fdark"/>
    <feMerge result="flecked"><feMergeNode in="tex"/><feMergeNode in="fdark"/><feMergeNode in="flight"/></feMerge>

    <!-- gentle warm glow around the brightest areas -->
    <feColorMatrix in="graded" type="matrix" values="0 0 0 0 1  0 0 0 0 0.97  0 0 0 0 0.9  ${n(0.2126 * 8)} ${n(0.7152 * 8)} ${n(0.0722 * 8)} 0 ${n(-8 * o.glow.threshold)}" result="hi"/>
    <feGaussianBlur in="hi" stdDeviation="${o.glow.radius}" result="hib"/>
    <feComponentTransfer in="hib" result="hib2"><feFuncA type="linear" slope="${o.glow.amount}"/></feComponentTransfer>
    <feBlend in="hib2" in2="flecked" mode="screen" result="glowed"/>

    <feComposite in="glowed" in2="soft" operator="in"/>
  </filter>`;

  const inkF = `
  <filter id="${P}-ink" x="-0.1" y="-0.25" width="1.2" height="1.5" color-interpolation-filters="sRGB">
    ${edgeMask('edge')}
    ${wobbleMaps(o.textWobble, 0, 'i')}
    <feGaussianBlur in="iw2" stdDeviation="${n(o.soften * 0.55)}" result="soft"/>
    <feColorMatrix in="soft" type="saturate" values="${o.saturation}" result="sat"/>
    <feComponentTransfer in="sat" result="graded">${grade}</feComponentTransfer>
    <feTurbulence type="fractalNoise" baseFrequency="${[].concat(o.tooth.freq).join(' ')}" numOctaves="${o.tooth.octaves}" seed="${seed + 4}" result="tn"/>
    <feColorMatrix in="tn" type="matrix" values="${grey1(o.tooth.amount)}" result="sig"/>
    <feBlend in="sig" in2="graded" mode="soft-light" result="tex"/>
    <feComposite in="tex" in2="soft" operator="in"/>
  </filter>`;

  return paint + inkF;
}

// ---------------------------------------------------------------- scene

/**
 * Element ids a page moves at run time: pass the page's JSON (pages/pN.json),
 * or a list of "#id" / "id" strings. Every "#id" string found is collected
 * (drive targets, show/hide lists, addClass targets, control knobs).
 */
export function animatedIds(page) {
  const out = new Set();
  const scan = (v) => {
    if (typeof v === 'string') {
      const m = /^#?([A-Za-z][\w-]*)$/.exec(v);
      if (m && (v.startsWith('#') || Array.isArray(page))) out.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === 'object') Object.values(v).forEach(scan);
  };
  scan(page ?? []);
  return [...out];
}

const ANIM_CLASS = /^sb-(bob|sway|wiggle|pulse|twinkle|float|spin-slow|cheer|hint|bulge|blink)$/;
const isNameSlot = (el) => (el.name === 'text' && classes(el).includes('sb-name')) || classes(el).includes('sb-letters');
const KEEP_OUT = new Set(['title', 'desc', 'metadata', 'defs', 'style', 'script']);
const INHERIT_SKIP = new Set(['id', 'class', 'filter', 'data-sfx']);

/**
 * Pull name slots out of the painted layer so the child's name stays crisp.
 * A slot is lifted only when none of its ancestors animates, is driven or is
 * shown/hidden by the page (then a lifted copy would not follow it); its
 * ancestors' transforms and inherited attributes are rebuilt around it, so it
 * lands in exactly the same place. Slots that can't be lifted stay painted.
 */
function liftNameSlots(svgEl, moving) {
  const lifted = [];
  const visit = (el, chain) => {
    for (const c of [...elements(el)]) {
      if (isNameSlot(c)) {
        const animated = chain.some((a) => moving.has(attr(a, 'id')) || classes(a).some((k) => ANIM_CLASS.test(k)));
        if (animated) continue;
        el.children.splice(el.children.indexOf(c), 1);
        let node = c;
        for (let k = chain.length - 1; k >= 0; k--) {
          const a = chain[k];
          const g = { type: 'el', name: 'g', attrs: a.attrs.filter(([name]) => !INHERIT_SKIP.has(name) && !name.startsWith('data-')), children: [node] };
          node = g;
        }
        lifted.push(node);
      } else visit(c, [...chain, c]);
    }
  };
  for (const c of elements(svgEl)) {
    if (KEEP_OUT.has(c.name)) continue;
    if (isNameSlot(c)) continue; // top-level slots are handled by the caller
    visit(c, [c]);
  }
  return lifted;
}

/**
 * Wrap a scene's content in the paint filter (and lifted name text in the ink
 * filter). Returns the treated <svg> as a tree.
 */
function treatSceneTree(scene, o) {
  const svgEl = elements(scene).find((e) => e.name === 'svg');
  const vb = (attr(svgEl, 'viewBox') ?? '0 0 1600 1000').split(/[\s,]+/).map(Number);
  const box = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] };
  softenOutlinesTree(svgEl, o.outline, o.outlineWidth);

  const lifted = o.text === 'lift' ? liftNameSlots(svgEl, new Set(animatedIds(o.animated))) : [];
  const head = [];
  const paint = [];
  const ink = [...lifted];
  for (const c of svgEl.children) {
    if (c.type === 'el' && KEEP_OUT.has(c.name)) head.push(c);
    else if (c.type === 'el' && o.text === 'lift' && isNameSlot(c)) ink.push(c);
    else paint.push(c);
  }
  const P = o.prefix;
  const g = (cls, filter, children) => ({ type: 'el', name: 'g', attrs: [['class', cls], ['filter', `url(#${filter})`]], children });
  svgEl.children = [...head, g(`${P}-painted`, `${P}-paint`, paint)];
  if (ink.length) svgEl.children.push(g(`${P}-lettered`, `${P}-ink`, ink));
  return { svgEl, box };
}

/**
 * Treat one scene.
 * @param {string} sceneSvg  the scene file (an <svg> with a viewBox)
 * @param {string} defsSvg   the book's art library (an <svg><defs>…</defs></svg>)
 * @param {object} [opts]    see DEFAULTS
 * @returns {{svg: string, scene: string, defs: string, filters: string, options: object}}
 */
export function treatScene(sceneSvg, defsSvg, opts = {}) {
  const o = options(opts);
  const sceneTree = parseXml(sceneSvg);
  const { svgEl, box } = treatSceneTree(sceneTree, o);
  const defsTree = softenOutlinesTree(parseXml(defsSvg ?? ''), o.outline, o.outlineWidth);
  const defsSvgEl = elements(defsTree).find((e) => e.name === 'svg');
  const defsInner = defsSvgEl ? defsSvgEl.children.map(serialise).join('') : '';
  const filterStr = gouacheFilters(o, box);
  const scene = serialise(sceneTree).trim();
  const defs = serialise(defsTree).trim();
  const filters = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${filterStr}</defs></svg>`;
  // Standalone: art library + filters inside the scene's own <svg>
  const title = svgEl.children.findIndex((c) => c.type === 'el' && c.name === 'title');
  const extra = { type: 'raw', value: `<defs>${filterStr}</defs>${defsInner}` };
  svgEl.children.splice(title + 1, 0, extra);
  const svg = serialise(sceneTree).trim();
  return { svg, scene, defs, filters, options: o };
}

export default treatScene;
