import test from 'node:test';
import assert from 'node:assert/strict';
import {
  qrMode, qrMatrix, qrSvg, modulesPath, utf8BinaryString, appBasePath, landingUrlFor, displayUrl, printedSizeMm, ERROR_LEVELS,
} from '../../js/ar/qr.js';

// ---- helpers ----------------------------------------------------------------------

/** ISO 18004 format information for (error level, mask): BCH(15,5) then XOR mask 101010000010010. */
function formatBits(levelBits, mask) {
  const data = (levelBits << 3) | mask;
  let d = data << 10;
  for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= 0b10100110111 << (i - 10);
  return ((data << 10) | d) ^ 0b101010000010010;
}
// The standard's two-bit error-correction indicators.
const LEVEL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

/** Read the 15 format bits beside the top-left finder (column 8) and name the error level they encode. */
function levelFromMatrix(rows) {
  const n = rows.length;
  let bits = 0;
  for (let i = 0; i < 15; i++) {
    const dark = i < 6 ? rows[i][8] : i < 8 ? rows[i + 1][8] : rows[n - 15 + i][8];
    if (dark) bits |= 1 << i;
  }
  for (const [level, lb] of Object.entries(LEVEL_BITS)) {
    for (let mask = 0; mask < 8; mask++) if (formatBits(lb, mask) === bits) return level;
  }
  return null;
}

/** A 7x7 finder pattern: dark ring, light ring, dark 3x3 core. */
function isFinder(rows, top, left) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      const want = ring !== 2;
      if (rows[top + r][left + c] !== want) return false;
    }
  }
  return true;
}

function viewBoxSize(svg) {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  assert.ok(m, 'has a viewBox');
  assert.equal(m[1], m[2], 'square');
  return Number(m[1]);
}

// ---- qrMode / matrix ----------------------------------------------------------------

test('qrMode picks the most compact mode', () => {
  assert.equal(qrMode('0123456789'), 'Numeric');
  assert.equal(qrMode('HTTPS://MHAPPY.UK/B1'), 'Alphanumeric');
  assert.equal(qrMode('https://mhappy.uk/b1'), 'Byte');
  assert.equal(qrMode('https://example.com/app/?b=tiffin-football'), 'Byte');
  assert.equal(qrMode(''), 'Byte');
});

test('qrMatrix: finder patterns in three corners and the right error level in the format bits', () => {
  for (const ecl of ERROR_LEVELS) {
    const m = qrMatrix('https://example.com/app/?b=tiffin-football', { ecl });
    assert.equal(m.ecl, ecl);
    assert.equal(m.rows.length, m.size);
    assert.equal(m.size, 17 + 4 * m.version);
    assert.ok(isFinder(m.rows, 0, 0), 'top-left finder');
    assert.ok(isFinder(m.rows, 0, m.size - 7), 'top-right finder');
    assert.ok(isFinder(m.rows, m.size - 7, 0), 'bottom-left finder');
    assert.equal(levelFromMatrix(m.rows), ecl, `format bits say ${ecl}`);
  }
});

test('qrMatrix sizes match the print research (docs/print-production.md §7)', () => {
  // HTTPS://MHAPPY.UK/B1 at level Q is a 25 x 25 grid (alphanumeric mode)...
  assert.equal(qrMatrix('HTTPS://MHAPPY.UK/B1', { ecl: 'Q' }).size, 25);
  // ...and capitals buy room: 23 characters still fit 25 x 25 in alphanumeric
  // mode, while the same link in lower case needs byte mode and a bigger code.
  assert.equal(qrMatrix('HTTPS://MHAPPY.UK/BOOK1', { ecl: 'Q' }).size, 25);
  assert.equal(qrMatrix('https://mhappy.uk/book1', { ecl: 'Q' }).size, 29);
  assert.equal(qrMatrix('https://madehappy.co.uk/b/football', { ecl: 'Q' }).size, 33);
});

test('higher error correction never makes a smaller code', () => {
  const url = 'https://example.com/app/?b=tiffin-football';
  const sizes = ERROR_LEVELS.map((ecl) => qrMatrix(url, { ecl }).size);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1], sizes.join(' < '));
});

test('text that cannot fit throws a readable Error', () => {
  assert.throws(() => qrMatrix('x'.repeat(4000), { ecl: 'H' }), (err) => err instanceof Error && /shorter link/.test(err.message));
});

test('utf8BinaryString gives UTF-8 bytes, one character each', () => {
  assert.equal(utf8BinaryString('abc'), 'abc');
  assert.deepEqual([...utf8BinaryString('é')].map((c) => c.charCodeAt(0)), [0xc3, 0xa9]);
  assert.deepEqual([...utf8BinaryString('🦦')].map((c) => c.charCodeAt(0)), [0xf0, 0x9f, 0xa6, 0xa6]);
  // Non-ASCII text encodes (as UTF-8 bytes) without throwing.
  assert.ok(qrSvg('https://example.com/?b=Siobhán').startsWith('<svg'));
});

// ---- SVG ------------------------------------------------------------------------------

test('modulesPath merges horizontal runs of dark modules', () => {
  assert.equal(modulesPath([[true, true, false, true]]), 'M0 0h2v1h-2zM3 0h1v1h-1z');
  assert.equal(modulesPath([[false], [true]], 4), 'M4 5h1v1h-1z');
  assert.equal(modulesPath([[false, false]]), '');
});

test('qrSvg: a crisp standalone <svg> with a 4-module quiet zone', () => {
  const url = 'https://example.com/app/?b=tiffin-football';
  const { size } = qrMatrix(url);
  const svg = qrSvg(url);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
  assert.match(svg, /<\/svg>$/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.equal(viewBoxSize(svg), size + 8, 'quiet zone of 4 modules on each side');
  assert.match(svg, new RegExp(`width="${(size + 8) * 8}" height="${(size + 8) * 8}"`), 'default 8 px modules');
  assert.equal((svg.match(/<path /g) ?? []).length, 1, 'one path');
  assert.match(svg, /<rect width="\d+" height="\d+" fill="#FFFFFF"\/>/);
  assert.match(svg, /<path fill="#2B2A33" d="M4 4h7v1h-7z/, 'the top-left finder starts inside the quiet zone');
  assert.match(svg, /role="img" aria-label="QR code"/);
  assert.doesNotMatch(svg, /<script|on\w+=/i);
});

test('qrSvg output is deterministic and depends on the text and options', () => {
  const a = qrSvg('https://example.com/?b=tiffin-football', { ecl: 'Q' });
  assert.equal(qrSvg('https://example.com/?b=tiffin-football', { ecl: 'Q' }), a);
  assert.notEqual(qrSvg('https://example.com/?b=tiffin-digger', { ecl: 'Q' }), a);
  assert.notEqual(qrSvg('https://example.com/?b=tiffin-football', { ecl: 'M' }), a);
  assert.match(a, /data-qr-ecl="Q"/);
});

test('qrSvg options: margin, module size in mm, colours, transparent background, title', () => {
  const { size } = qrMatrix('HTTPS://MHAPPY.UK/B1', { ecl: 'Q' });
  const svg = qrSvg('HTTPS://MHAPPY.UK/B1', { ecl: 'Q', margin: 4, moduleSize: 0.75, units: 'mm', dark: '#000000', light: '#FFFFFF', title: 'Scan & listen' });
  assert.equal(size, 25);
  assert.match(svg, /width="24\.75mm" height="24\.75mm"/);
  assert.match(svg, /<path fill="#000000"/);
  assert.match(svg, /<title>Scan &amp; listen<\/title>/);
  assert.match(svg, /aria-label="Scan &amp; listen"/);

  const bare = qrSvg('x', { margin: 0, light: null });
  assert.equal(viewBoxSize(bare), qrMatrix('x').size);
  assert.doesNotMatch(bare, /<rect/);
  assert.match(bare, /d="M0 0h7v1h-7z/);

  // Nothing but a plain colour value can reach the markup.
  const evil = qrSvg('x', { dark: '"/><script>alert(1)</script>', light: 'url(https://x)' });
  assert.doesNotMatch(evil, /script|url\(/);
  assert.match(evil, /fill="#2B2A33"/);
  assert.match(evil, /fill="#FFFFFF"/);
});

// ---- landing URL --------------------------------------------------------------------

test('appBasePath finds the app folder', () => {
  assert.equal(appBasePath('/'), '/');
  assert.equal(appBasePath('/index.html'), '/');
  assert.equal(appBasePath('/app/'), '/app/');
  assert.equal(appBasePath('/app/index.html'), '/app/');
  assert.equal(appBasePath('/app/b/tiffin-football'), '/app/');
  assert.equal(appBasePath('/app/b/tiffin-football/'), '/app/');
  assert.equal(appBasePath('/b/tiffin-football'), '/');
  assert.equal(appBasePath(''), '/');
});

test('landingUrlFor: origin + app folder + ?b=<id>, nothing else', () => {
  const loc = { origin: 'https://example.com', pathname: '/app/index.html', href: 'https://example.com/app/index.html?b=x#/b/x/read/2' };
  assert.equal(landingUrlFor('tiffin-football', loc), 'https://example.com/app/?b=tiffin-football');
  assert.equal(landingUrlFor('tiffin-football', { origin: 'http://127.0.0.1:8107', pathname: '/' }), 'http://127.0.0.1:8107/?b=tiffin-football');
  assert.equal(landingUrlFor('tiffin-football', 'https://example.com/app/b/tiffin-football'), 'https://example.com/app/?b=tiffin-football');
  assert.equal(landingUrlFor('tiffin-football', new URL('https://example.com/storybook/#/b/tiffin-football/name')), 'https://example.com/storybook/?b=tiffin-football');
  // Ids are URL-encoded; odd input can't smuggle in extra parameters.
  assert.equal(landingUrlFor('a&name=Ava', { origin: 'https://example.com', pathname: '/' }), 'https://example.com/?b=a%26name%3DAva');
});

test('landingUrlFor never carries the child’s name or the route', () => {
  const href = 'https://example.com/app/?b=tiffin-football&name=Siobhan#/b/tiffin-football/read/3?name=Siobhan';
  const url = landingUrlFor('tiffin-football', href);
  assert.equal(url, 'https://example.com/app/?b=tiffin-football');
  assert.doesNotMatch(url, /Siobhan|#/);
});

test('landingUrlFor works for file:// pages', () => {
  assert.equal(landingUrlFor('tiffin-football', 'file:///home/me/storybook/index.html'), 'file:///home/me/storybook/?b=tiffin-football');
});

test('displayUrl and printedSizeMm', () => {
  assert.equal(displayUrl('https://example.com/app/?b=tiffin-football'), 'example.com/app/?b=tiffin-football');
  assert.equal(displayUrl('HTTPS://MHAPPY.UK/B1'), 'MHAPPY.UK/B1');
  assert.equal(displayUrl('https://example.com/'), 'example.com');
  // 25 modules + 2 x 4 quiet zone at 0.75 mm = 24.75 mm (the research's "about 24.8 mm").
  assert.equal(printedSizeMm(25), 24.8);
  assert.equal(printedSizeMm(33, { moduleMm: 0.6 }), 24.6);
});
