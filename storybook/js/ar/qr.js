// QR codes for the printed book: the code on the back cover, the demo screen
// (#/qr/<book>), the printable test pages and tools/make-qr.mjs.
//
// A thin wrapper around the vendored qrcode-generator (MIT) that draws a
// crisp standalone <svg>: one <path> of merged runs in module units, a quiet
// zone of 4 modules by default and shape-rendering="crispEdges", so it stays
// sharp at any size on screen and in print. Output is deterministic (same
// text + options -> same string), which the tests rely on.
//
// Privacy: a printed code identifies the book, never the child. It carries
// "?b=<book-id>" and nothing else (see landingUrlFor).

import qrcode from '../vendor/qrcode.js';

export const ERROR_LEVELS = Object.freeze(['L', 'M', 'Q', 'H']);

// QR's compact "alphanumeric" mode: digits, UPPER-CASE letters and nine
// symbols. A short link typed in capitals (HTTPS://MHAPPY.UK/B1) fits it and
// makes a smaller, easier-to-scan code than byte mode.
const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]+$/;

/**
 * The most compact QR mode that can hold the text.
 * @param {string} text
 * @returns {'Numeric'|'Alphanumeric'|'Byte'}
 */
export function qrMode(text) {
  const s = String(text ?? '');
  if (/^[0-9]+$/.test(s)) return 'Numeric';
  if (ALPHANUMERIC.test(s)) return 'Alphanumeric';
  return 'Byte';
}

/** UTF-8 bytes of a string as a "binary string" (one char per byte), which is what the generator's byte mode expects. */
export function utf8BinaryString(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/**
 * Encode text as a QR matrix.
 * @param {string} text
 * @param {{ecl?: 'L'|'M'|'Q'|'H'}} [opts]
 * @returns {{size: number, version: number, ecl: string, mode: string, rows: boolean[][]}}
 *   rows[r][c] is true for a dark module; size excludes the quiet zone.
 */
export function qrMatrix(text, { ecl = 'M' } = {}) {
  const level = ERROR_LEVELS.includes(ecl) ? ecl : 'M';
  const s = String(text ?? '');
  const mode = qrMode(s);
  let qr;
  try {
    qr = qrcode(0, level); // 0 = pick the smallest version that fits
    qr.addData(mode === 'Byte' ? utf8BinaryString(s) : s, mode);
    qr.make();
  } catch (err) {
    // The generator throws plain strings ("code length overflow...").
    throw new Error(`Could not make a QR code for that text (${err?.message ?? err}). Try a shorter link.`);
  }
  const size = qr.getModuleCount();
  const rows = [];
  for (let r = 0; r < size; r++) {
    const row = new Array(size);
    for (let c = 0; c < size; c++) row[c] = qr.isDark(r, c);
    rows.push(row);
  }
  return { size, version: (size - 17) / 4, ecl: level, mode, rows };
}

/**
 * One SVG path for the dark modules, merging horizontal runs so the path
 * stays small (a typical URL code is ~2-4 KB).
 * @param {boolean[][]} rows
 * @param {number} offset quiet-zone width in modules
 */
export function modulesPath(rows, offset = 0) {
  let d = '';
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      const len = c - start;
      d += `M${start + offset} ${r + offset}h${len}v1h-${len}z`;
    }
  });
  return d;
}

const COLOUR = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*[\d.\s,%]+\))$/i;
/** Only plain colour values reach the markup (the SVG may be inlined with innerHTML). */
function safeColour(value, fallback) {
  const v = String(value ?? '').trim();
  return COLOUR.test(v) ? v : fallback;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

const round = (n) => String(Math.round(n * 1000) / 1000);

/**
 * A standalone, crisp <svg> QR code.
 * @param {string} text what the code encodes (a URL)
 * @param {{ecl?: 'L'|'M'|'Q'|'H', margin?: number, moduleSize?: number, dark?: string,
 *   light?: string|null, units?: ''|'px'|'mm', title?: string}} [opts]
 *   margin: quiet zone in modules (4 is the standard minimum; never go below it for print).
 *   moduleSize: size of one module in `units` (px by default; e.g. 0.75 with units 'mm' for print).
 *   light: background colour, or null/'none' for a transparent background.
 * @returns {string} `<svg ...>...</svg>`
 */
export function qrSvg(text, { ecl = 'M', margin = 4, moduleSize = 8, dark = '#2B2A33', light = '#FFFFFF', units = '', title = '' } = {}) {
  const m = qrMatrix(text, { ecl });
  const quiet = Math.max(0, Math.floor(Number(margin) || 0));
  const n = m.size + quiet * 2;
  const unit = units === 'mm' ? 'mm' : units === 'px' ? 'px' : '';
  const each = Number(moduleSize) > 0 ? Number(moduleSize) : 8;
  const side = `${round(n * each)}${unit}`;
  const ink = safeColour(dark, '#2B2A33');
  const bg = light == null || light === 'none' || light === 'transparent' ? null : safeColour(light, '#FFFFFF');
  const label = title ? escapeXml(title) : 'QR code';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${side}" height="${side}" shape-rendering="crispEdges" role="img" aria-label="${label}" data-qr-version="${m.version}" data-qr-ecl="${m.ecl}">` +
    (title ? `<title>${label}</title>` : '') +
    (bg ? `<rect width="${n}" height="${n}" fill="${bg}"/>` : '') +
    `<path fill="${ink}" d="${modulesPath(m.rows, quiet)}"/>` +
    '</svg>'
  );
}

/**
 * The folder the app is served from, given a page path: "/app/index.html"
 * -> "/app/", and the production form "/app/b/tiffin-football" -> "/app/".
 * @param {string} pathname
 */
export function appBasePath(pathname) {
  let p = String(pathname || '/');
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/b\/[a-z0-9-]+\/?$/i, '/'); // production entry: /b/<book-id>
  p = p.replace(/[^/]*$/, ''); // drop index.html (or any file name)
  return p || '/';
}

/**
 * The URL a printed QR code should open for a book: the app's folder plus
 * "?b=<id>" — e.g. https://host/path/?b=tiffin-football. Only the book id is
 * ever included: never the child's name, the hash route or other query data.
 * @param {string} bookId
 * @param {Location|URL|string|{origin?: string, pathname: string, href?: string}} [loc]
 * @returns {string}
 */
export function landingUrlFor(bookId, loc = globalThis.location) {
  const l = typeof loc === 'string' ? new URL(loc) : loc;
  const origin = l?.origin && l.origin !== 'null' ? l.origin : null;
  const base = origin ? `${origin}/` : String(l?.href ?? 'http://localhost/');
  const url = new URL(appBasePath(l?.pathname ?? '/'), base);
  url.search = `?b=${encodeURIComponent(String(bookId ?? ''))}`;
  url.hash = '';
  return url.href;
}

/** A URL as people read it: no scheme, no trailing slash ("example.com/app/?b=tiffin-football"). */
export function displayUrl(url) {
  return String(url ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

/**
 * Printed size of a code, in millimetres, including the quiet zone.
 * @param {number} moduleCount modules across, without the quiet zone
 * @param {{margin?: number, moduleMm?: number}} [opts]
 */
export function printedSizeMm(moduleCount, { margin = 4, moduleMm = 0.75 } = {}) {
  return Math.round((moduleCount + margin * 2) * moduleMm * 10) / 10;
}
