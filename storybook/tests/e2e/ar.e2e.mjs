// Browser tests for the "through the screen" features (js/ar/*):
//   - QR codes decode for real (jsQR): qrSvg, tools/make-qr.mjs and the printed back cover;
//   - the printable test pages (layers, rest state, A4 landscape, a 9-page PDF);
//   - the magic window with Chromium's fake camera: explainer, allow, video playing,
//     overlay with only the name layer visible, drag / slider / rotate / ghost, the fit
//     remembered, page arrows, Magic!, read-along caption, denied / unsupported / blocked
//     storage, and the camera stopping on destroy and when the page is hidden;
//   - "filmed paper": a fake camera that films a printed test page (a Y4M video made on
//     the spot), lined up by hand through the UI and checked against where the name spot
//     really is, at phone portrait, phone landscape and tablet sizes;
//   - experimental image tracking: a MindAR target compiled on the spot from the printed
//     art, the page filmed at an angle, and the overlay pinned to it.
//
//   node tests/e2e/ar.e2e.mjs                 (PORT=8107 by default)
//   SHOTS=/some/dir node tests/e2e/ar.e2e.mjs also saves screenshots and the PDF
//   TRACKING=0 skips the slower tracking check; ONLY=<text> runs matching steps
// Starts and stops its own static server. Exits non-zero on any failure.
// Test-only helpers (jsQR, mind-ar) come from the npm registry into a cache folder.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 8107);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOK = 'tiffin-football';
const SHOTS = process.env.SHOTS ?? '';
const CACHE = process.env.AR_E2E_CACHE ?? path.join(os.tmpdir(), 'storybook-ar-e2e');
const TRACKING = process.env.TRACKING !== '0';
mkdirSync(CACHE, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const FAKE_CAMERA = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
// MindAR (tracking) needs WebGL; headless Chromium provides it through SwiftShader.
const WEBGL = ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];
const PROFILE = {
  id: 'child_1',
  display: 'Siobhan',
  key: 'siobhan',
  pronunciation: { say: 'Shiv-awn', ipa: '', respell: 'shiv-AWN', label: 'Shiv-awn', source: 'dictionary', useRecording: false, recordingId: null },
  createdAt: 1,
  updatedAt: 1,
};
const STATE = { profiles: [PROFILE], activeProfileId: PROFILE.id, settings: {}, lastBook: BOOK };

// ---- tiny runner ----------------------------------------------------------------------
const results = [];
let lastPage = null;
async function step(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    if (SHOTS && lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: path.join(SHOTS, `FAILED-${results.length}.png`) }).catch(() => {});
    console.log(`  FAIL ${name}\n       ${String(err?.stack ?? err).split('\n').slice(0, 5).join('\n       ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg}: ${a} is not within ${tol} of ${b}`);
}
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// ---- server & test-only packages ----------------------------------------------------------
async function startServer() {
  // Don't quietly test whatever else is listening on the port.
  const busy = await fetch(`${BASE}/`).then(() => true, () => false);
  if (busy) throw new Error(`port ${PORT} is already in use; stop that server or set PORT`);
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  // Its own process group, so stopping it also stops the http-server that npx starts.
  const proc = spawn(npx, ['--yes', 'http-server', ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore', detached: process.platform !== 'win32' });
  proc.stop = () => {
    try {
      if (process.platform !== 'win32') process.kill(-proc.pid, 'SIGTERM');
      else proc.kill();
    } catch {
      proc.kill();
    }
  };
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/package.json`)).ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  proc.stop();
  throw new Error(`http-server did not start on ${PORT}`);
}

/** Unpack an npm package into the cache (once) and return its folder. */
function npmPackage(name, version) {
  const dir = path.join(CACHE, `${name}-${version}`);
  if (existsSync(path.join(dir, 'package', 'package.json'))) return path.join(dir, 'package');
  mkdirSync(dir, { recursive: true });
  execFileSync('npm', ['pack', `${name}@${version}`, '--pack-destination', dir, '--silent'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'));
  execFileSync('tar', ['xzf', path.join(dir, tgz), '-C', dir]);
  return path.join(dir, 'package');
}

// ---- pages --------------------------------------------------------------------------------
const HARNESS = `${BASE}/__ar_harness.html`;
const HARNESS_HTML = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Magic window harness</title>
<link rel="stylesheet" href="/css/app.css"><link rel="stylesheet" href="/css/reader.css"><link rel="stylesheet" href="/css/ar.css">
</head><body><div id="app"></div>
<script type="module">
  import { loadBook, bookUrl } from '/js/core/book.js';
  import { person, togetherPerson } from '/js/core/personalise.js';
  import * as mw from '/js/ar/magic-window.js';
  globalThis.SB_TEST = { forceSilent: true, timeScale: 0.05, ...(globalThis.SB_TEST ?? {}) };
  const q = new URLSearchParams(location.search);
  const book = await loadBook(q.get('book') ?? '${BOOK}');
  let narrator = null;
  try { narrator = (await import('/js/reader/reader.js')).createSilentNarrator?.() ?? null; } catch {}
  const h = (window.__h = { mw, book, sfx: [], pages: [], exits: 0, handle: null });
  h.mount = async (opts = {}) => {
    h.handle = await mw.mountMagicWindow(document.getElementById('app'), {
      book, bookId: book.id, baseUrl: bookUrl(book.id), page: Number(q.get('page') ?? 4),
      person: q.get('sibs') ? togetherPerson(q.get('sibs').split(',').map((d) => ({ display: d }))) : person(q.get('name') ?? 'Siobhan', 'Shiv-awn'), narrator,
      sfx: { play: (n) => h.sfx.push(n), unlock() {} },
      onExit: () => { h.exits++; h.handle?.destroy(); },
      onPage: (n) => h.pages.push(n),
      explain: q.get('explain') ?? 'auto',
      ...opts,
    });
  };
  await h.mount();
  window.__ready = true;
</script></body></html>`;

async function newPage(browser, { viewport = { width: 390, height: 844 }, init = null, seed = false, reducedMotion = 'no-preference', routes = null } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await context.newPage();
  lastPage = page;
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url ?? '';
    errors.push(`${m.text()} ${url ? `(${url})` : ''}`);
  });
  // Every request, to check that nothing goes looking for tracking files or third parties.
  page.__requests = [];
  page.on('request', (r) => page.__requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.route(`${HARNESS}*`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HARNESS_HTML }));
  if (routes) await routes(page);
  // Keep every camera stream the page opens, to check they get stopped.
  await page.addInitScript(() => {
    window.__streams = [];
    const md = navigator.mediaDevices;
    if (md?.getUserMedia) {
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        window.__constraints = c;
        const s = await orig(c);
        window.__streams.push(s);
        return s;
      };
    }
  });
  if (seed) await page.addInitScript((s) => !sessionStorage.getItem('seeded') && (sessionStorage.setItem('seeded', '1'), localStorage.setItem('starring.v1', JSON.stringify(s))), STATE);
  if (init) await page.addInitScript(init);
  return { context, page, errors };
}
const noErrors = (errors, where) => assert(errors.length === 0, `console errors on ${where}:\n  ${errors.join('\n  ')}`);
const state = (page) => page.getByTestId('magic-window').getAttribute('data-state');
const waitState = (page, s, timeout = 10000) => page.waitForFunction((s) => document.querySelector('[data-testid=magic-window]')?.dataset.state === s, s, { timeout });
const alignOf = (page) => page.getByTestId('magic-window').evaluate((el) => (el.dataset.align ?? '').split(',').map(Number));
const liveTracks = (page) => page.evaluate(() => window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length);
// The app's magic-window route asks a grown-up to press and hold first (js/app/screens/magic.js);
// tests shorten the hold with SB_TEST.gateMs.
const GATE_HOOK = `globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), gateMs: 150 };`;
async function passCameraGate(page) {
  const gate = page.getByTestId('parent-gate');
  await gate.waitFor({ timeout: 15000 });
  const box = await gate.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
}
async function drag(page, from, to, steps = 12) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

// ---- QR decoding (jsQR in the page) ------------------------------------------------------
let JSQR = '';
async function decodeSvgInPage(page, svg) {
  if (!(await page.evaluate(() => typeof window.jsQR === 'function'))) await page.addScriptTag({ content: JSQR });
  return page.evaluate(async (svg) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const size = 600;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, size, size);
    const d = g.getImageData(0, 0, size, size);
    return window.jsQR(d.data, size, size)?.data ?? null;
  }, svg);
}
async function decodePngInPage(page, png) {
  if (!(await page.evaluate(() => typeof window.jsQR === 'function'))) await page.addScriptTag({ content: JSQR });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    return window.jsQR(d.data, c.width, c.height)?.data ?? null;
  }, png.toString('base64'));
}

// ---- "Filmed paper": a Y4M video of a printed test page ---------------------------------------
/** Render one test sheet as a PNG and return where its picture (the scene) sits on it. */
async function renderSheet(browser, n) {
  const { context, page } = await newPage(browser, { viewport: { width: 1400, height: 1000 } });
  await page.goto(`${BASE}/?test=1#/print/${BOOK}`);
  await page.waitForSelector('.tp[data-state="ready"]', { timeout: 20000 });
  const sheet = page.locator(`[data-testid=print-sheet][data-page="${n}"]`);
  const geo = await sheet.evaluate((el) => {
    const s = el.getBoundingClientRect();
    const a = el.querySelector('.tp-art').getBoundingClientRect();
    return { w: s.width, h: s.height, art: { x: a.x - s.x, y: a.y - s.y, w: a.width, h: a.height } };
  });
  const sheetPng = await sheet.screenshot();
  const artPng = await sheet.locator('.tp-art').screenshot();
  await context.close();
  return { sheetPng, artPng, geo };
}

/**
 * Compose a photo-like camera frame (the sheet lying on a table, turned a little, lit
 * softly) and return the frame as I420 plus the picture's corners in frame pixels.
 */
async function composeFrame(browser, sheet, { width, height, sheetWidth, cx = 0.5, cy = 0.5, rotate = 0, tilt = 0 }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const scale = sheetWidth / sheet.geo.w;
  const sw = sheetWidth;
  const sh = sheet.geo.h * scale;
  const a = sheet.geo.art;
  const corner = (x, y, i) => `<i id="c${i}" style="position:absolute;left:${x * scale}px;top:${y * scale}px;width:1px;height:1px"></i>`;
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;position:relative;
    background: radial-gradient(90% 80% at 40% 30%, rgba(255,236,200,.35), rgba(0,0,0,0) 70%),
      repeating-linear-gradient(91deg, #b8875a 0 18px, #ad7d52 18px 31px, #c19163 31px 40px, #a97a50 40px 57px), #b1845a;">
    <div style="position:absolute;left:${width * cx - sw / 2}px;top:${height * cy - sh / 2}px;width:${sw}px;height:${sh}px;
      transform: perspective(${Math.max(width, height) * 2}px) rotateX(${tilt}deg) rotate(${rotate}deg);
      box-shadow: 0 ${sw * 0.02}px ${sw * 0.05}px rgba(40,20,0,.45);">
      <img src="data:image/png;base64,${sheet.sheetPng.toString('base64')}" style="display:block;width:100%;height:100%">
      ${corner(a.x, a.y, 0)}${corner(a.x + a.w, a.y, 1)}${corner(a.x + a.w, a.y + a.h, 2)}${corner(a.x, a.y + a.h, 3)}
      <div style="position:absolute;inset:0;background:linear-gradient(115deg, rgba(255,255,255,.10), rgba(0,0,0,.06))"></div>
    </div></body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const quad = await page.evaluate(() => [0, 1, 2, 3].map((i) => {
    const r = document.getElementById(`c${i}`).getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }));
  const png = await page.screenshot();
  // RGB -> I420 (BT.601, limited range), which Chromium's fake camera reads from .y4m files.
  const yuv = await page.evaluate(async ([b64, w, h]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    const out = new Uint8Array(w * h * 1.5);
    const Y = (r, gg, b) => 16 + 0.257 * r + 0.504 * gg + 0.098 * b;
    for (let i = 0, p = 0; i < w * h; i++, p += 4) out[i] = Y(d[p], d[p + 1], d[p + 2]);
    let u = w * h;
    let v = u + (w * h) / 4;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        let r = 0, gg = 0, b = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const p = ((y + dy) * w + x + dx) * 4;
          r += d[p]; gg += d[p + 1]; b += d[p + 2];
        }
        r /= 4; gg /= 4; b /= 4;
        out[u++] = 128 - 0.148 * r - 0.291 * gg + 0.439 * b;
        out[v++] = 128 + 0.439 * r - 0.368 * gg - 0.071 * b;
      }
    }
    let bin = '';
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return btoa(bin);
  }, [png.toString('base64'), width, height]);
  await context.close();
  return { i420: Buffer.from(yuv, 'base64'), png, quad };
}

function writeY4m(file, width, height, i420, frames = 2) {
  const head = Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\n`);
  const parts = [head];
  for (let i = 0; i < frames; i++) parts.push(Buffer.from('FRAME\n'), i420);
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

/** Where the name should land: scene (1600x1000) coords -> screen, through the filmed picture's corners. */
function sceneToQuad(quad, x, y) {
  const u = x / 1600;
  const v = y / 1000;
  const [p0, p1, p2, p3] = quad;
  const top = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u];
  const bot = [p3[0] + (p2[0] - p3[0]) * u, p3[1] + (p2[1] - p3[1]) * u];
  return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v];
}

// ==== Tests ========================================================================================

const server = await startServer();
let browser = null;
try {
  JSQR = readFileSync(path.join(npmPackage('jsqr', '1.4.0'), 'dist', 'jsQR.js'), 'utf8');
  browser = await chromium.launch({ args: FAKE_CAMERA });

  // ---- QR -----------------------------------------------------------------------------------
  await step('QR: qrSvg output decodes back to the landing URL (M and Q, on screen colours)', async () => {
    const { page, context, errors } = await newPage(browser, { viewport: { width: 800, height: 600 } });
    await page.goto(`${BASE}/package.json`);
    const decoded = await page.evaluate(async () => {
      const qr = await import('/js/ar/qr.js');
      const url = qr.landingUrlFor('tiffin-football', { origin: 'https://example.com', pathname: '/app/index.html' });
      return { url, m: qr.qrSvg(url), q: qr.qrSvg(url, { ecl: 'Q', dark: '#000000' }), short: qr.qrSvg('HTTPS://MHAPPY.UK/B1', { ecl: 'Q' }), here: qr.landingUrlFor('tiffin-football') };
    });
    assert(decoded.url === 'https://example.com/app/?b=tiffin-football', `landing URL ${decoded.url}`);
    assert(decoded.here === `${BASE}/?b=${BOOK}`, `landing URL for this server: ${decoded.here}`);
    for (const [svg, want] of [[decoded.m, decoded.url], [decoded.q, decoded.url], [decoded.short, 'HTTPS://MHAPPY.UK/B1']]) {
      const got = await decodeSvgInPage(page, svg);
      assert(got === want, `decoded ${JSON.stringify(got)}, wanted ${want}`);
    }
    noErrors(errors, 'QR');
    await context.close();
  });

  await step('QR: tools/make-qr.mjs writes print-ready SVGs that decode', async () => {
    const out = path.join(CACHE, 'make-qr-out');
    const log = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'make-qr.mjs'), '--base', 'https://example.com/app/', '--out', out], { encoding: 'utf8' });
    assert(/level Q/.test(log) && /mm including the quiet zone/.test(log), `tool output:\n${log}`);
    const svg = readFileSync(path.join(out, `${BOOK}-qr.svg`), 'utf8');
    assert(/width="[\d.]+mm"/.test(svg) && /fill="#000000"/.test(svg) && /data-qr-ecl="Q"/.test(svg), 'mm size, pure black, level Q');
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'make-qr.mjs'), '--url', 'HTTPS://MHAPPY.UK/B1', '--book', 'short', '--out', out], { encoding: 'utf8' });
    const shortSvg = readFileSync(path.join(out, 'short-qr.svg'), 'utf8');
    assert(/viewBox="0 0 33 33"/.test(shortSvg), 'alphanumeric short link: 25 modules + quiet zone');
    const { page, context } = await newPage(browser, { viewport: { width: 800, height: 600 } });
    await page.goto(`${BASE}/package.json`);
    assert((await decodeSvgInPage(page, svg)) === `https://example.com/app/?b=${BOOK}`, 'tool QR decodes');
    assert((await decodeSvgInPage(page, shortSvg)) === 'HTTPS://MHAPPY.UK/B1', 'short QR decodes');
    await context.close();
  });

  // ---- Print pages -------------------------------------------------------------------------------
  await step('print pages: every page at rest, blank name spots, stars on, screen extras off; back cover QR decodes', async () => {
    const { page, context, errors } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await page.goto(`${BASE}/?test=1#/print/${BOOK}`);
    await page.waitForSelector('.tp[data-state="ready"]', { timeout: 20000 });
    const facts = await page.evaluate(() => {
      const sheets = [...document.querySelectorAll('[data-testid=print-sheet]')];
      const shown = (el) => {
        for (let n = el; n && n.tagName !== 'svg'; n = n.parentNode) if (n.getAttribute?.('display') === 'none' || getComputedStyle(n).display === 'none') return false;
        return true;
      };
      return {
        count: sheets.length,
        ready: sheets.every((s) => s.querySelector('.tp-art').dataset.state === 'ready'),
        names: sheets.flatMap((s) => [...s.querySelectorAll('text.sb-name, .sb-letters text')].map((t) => t.textContent)).join(''),
        digitalShown: sheets.flatMap((s) => [...s.querySelectorAll('.sb-digital')].filter(shown)).length,
        stars: sheets.map((s) => [...s.querySelectorAll('.sb-print-only')].filter(shown).length),
        blanks: sheets.map((s) => s.querySelectorAll('.tp-text .tp-blank').length),
        p2ShirtUp: document.querySelector('[data-page="2"] #p2-shirt-up')?.getAttribute('display'),
        p6Score1: document.querySelector('[data-page="6"] #p6-score-1')?.getAttribute('display'),
        p4Ball: document.querySelector('[data-page="4"] #p4-ball')?.getAttribute('transform') ?? '',
        url: document.querySelector('[data-testid=print-url]')?.textContent,
        intro: Boolean(document.querySelector('[data-testid=print-intro]')),
        duplicatePrint: Boolean(document.querySelector('[data-testid=print-pages-print]')),
      };
    });
    assert(facts.count === 8 && facts.ready, `8 sheets with pictures (${facts.count}, ready ${facts.ready})`);
    assert(facts.names === '', `name spots are empty, found "${facts.names}"`);
    assert(facts.digitalShown === 0, `${facts.digitalShown} screen-only extras showing`);
    assert(facts.stars.filter((n) => n > 0).length >= 4, `faint stars visible on the name spots: ${facts.stars}`);
    assert(facts.blanks.reduce((a, b) => a + b, 0) >= 5, `blanks where the name goes in the text: ${facts.blanks}`);
    assert(facts.p2ShirtUp === 'none', 'page 2: the shirt is still in the bag (flap at rest)');
    assert(facts.p6Score1 === 'none', 'page 6: scoreboard at 0');
    assert(facts.url === `127.0.0.1:${PORT}/?b=${BOOK}`, `short URL in words: ${facts.url}`);
    assert(facts.intro && !facts.duplicatePrint, 'intro shown; the app bar already has the Print button');
    const qrPng = await page.getByTestId('print-qr').screenshot();
    assert((await decodePngInPage(page, qrPng)) === `${BASE}/?b=${BOOK}`, 'the back-cover QR decodes to the landing URL');
    await shot(page, 'print-screen');
    if (SHOTS) {
      await page.locator('[data-testid=print-sheet][data-page="4"]').screenshot({ path: path.join(SHOTS, 'print-sheet-p4.png') });
      await page.getByTestId('print-back-cover').screenshot({ path: path.join(SHOTS, 'print-back-cover.png') });
    }
    // Print layout: one A4 landscape sheet per page.
    await page.emulateMedia({ media: 'print' });
    const sizes = await page.evaluate(() => [...document.querySelectorAll('.tp-sheet')].map((s) => [s.offsetWidth, s.offsetHeight]));
    assert(sizes.length === 9 && sizes.every(([w, h]) => Math.abs(w - 1122.5) < 2 && Math.abs(h - 793.7) < 2), `sheets are 297 x 210 mm in print: ${JSON.stringify(sizes.slice(0, 2))}`);
    assert(await page.evaluate(() => getComputedStyle(document.querySelector('.tp-intro')).display === 'none'), 'intro hidden in print');
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert(pages === 9, `PDF has 9 pages, got ${pages}`);
    assert(/\/MediaBox \[0 0 841\.9\d* 594\.9\d*\]/.test(pdf.toString('latin1')), 'PDF pages are A4 landscape');
    if (SHOTS) writeFileSync(path.join(SHOTS, 'print-test-pages.pdf'), pdf);
    noErrors(errors, 'print pages');
    await context.close();
  });

  await step('print pages without the reader modules: sheets and QR still render', async () => {
    const { page, context, errors } = await newPage(browser, {
      viewport: { width: 1024, height: 768 },
      routes: (p) => p.route(/\/js\/reader\/scene\.js$/, (r) => r.fulfill({ status: 404, body: 'missing' })),
    });
    await page.goto(`${BASE}/package.json`);
    await page.evaluate(async () => {
      const [{ renderPrintPages }, { loadBook, bookUrl }] = await Promise.all([import('/js/ar/print.js'), import('/js/core/book.js')]);
      const book = await loadBook('tiffin-football');
      document.body.innerHTML = '<div id="root"></div>';
      window.__cleanup = await renderPrintPages(document.getElementById('root'), { book, bookId: book.id, baseUrl: bookUrl(book.id), landingUrl: 'https://example.com/?b=tiffin-football' });
    });
    assert((await page.locator('.tp-art[data-state="missing"]').count()) === 8, 'friendly placeholders');
    assert((await page.getByTestId('print-qr').locator('svg').count()) === 1, 'QR still there');
    assert((await page.getByTestId('print-pages-print').count()) === 1, 'own Print button when the app bar is absent');
    await page.evaluate(() => window.__cleanup());
    assert((await page.locator('.tp').count()) === 0, 'cleanup removes the pages');
    // The 404 for the missing module is the point of this test.
    noErrors(errors.filter((e) => !/scene\.js|Failed to load resource|Failed to fetch dynamically/.test(e)), 'print without reader');
    await context.close();
  });

  // ---- Magic window with the stock fake camera ----------------------------------------------------------
  await step('magic window: explainer, allow, video plays, only the name layer shows', async () => {
    const { page, context, errors } = await newPage(browser);
    await page.goto(`${HARNESS}?page=4&explain=always`);
    await page.waitForFunction(() => window.__ready === true);
    await waitState(page, 'explain');
    const lead = await page.getByTestId('mw-card-lead').innerText();
    assert(/We use the camera only on this phone to draw Siobhan’s name onto your book\. Nothing is recorded or sent anywhere\./.test(lead), `privacy line: ${lead}`);
    assert(await page.getByTestId('mw-allow').isVisible(), 'allow button');
    assert(await page.getByTestId('mw-card-exit').isVisible(), 'a way back from the explainer');
    await page.waitForTimeout(450);
    await shot(page, 'mw-explainer-portrait');
    await page.getByTestId('mw-allow').click();
    await waitState(page, 'live');
    const video = await page.getByTestId('mw-video').evaluate(async (v) => {
      const t0 = v.currentTime;
      await new Promise((r) => setTimeout(r, 400));
      return { w: v.videoWidth, h: v.videoHeight, ready: v.readyState, moved: v.currentTime > t0, paused: v.paused, muted: v.muted, playsInline: v.playsInline };
    });
    assert(video.w > 0 && video.ready >= 2 && video.moved && !video.paused, `video playing ${JSON.stringify(video)}`);
    assert(video.muted && video.playsInline, 'muted inline video');
    assert((await liveTracks(page)) === 1, 'one live camera track');
    const constraints = await page.evaluate(() => window.__constraints.video);
    assert(constraints.facingMode?.ideal === 'environment' && constraints.width?.ideal === 1280 && constraints.height?.ideal === 720, `rear camera, 1280x720 ideal: ${JSON.stringify(constraints)}`);
    // First time: line-up mode with the ghost guide.
    assert(await page.getByTestId('mw-align-panel').isVisible(), 'line-up panel opens the first time');
    assert(await page.getByTestId('mw-ghost').isVisible(), 'ghost guide on the first time');
    await page.waitForFunction(() => document.querySelector('.mw-layer text.sb-name')?.classList.contains('sb-name-written'), null, { timeout: 8000 });
    const layer = await page.evaluate(() => {
      const svg = document.querySelector('.mw-layer svg');
      const vis = (el) => getComputedStyle(el).visibility;
      const name = svg.querySelector('text.sb-name');
      const r = name.getBoundingClientRect();
      const art = [...svg.querySelectorAll('path, use, rect, circle')].filter((el) => !el.closest('.sb-name, .sb-letters, .sb-digital'));
      return { name: name.textContent, nameVis: vis(name), nameBox: r.width > 10 && r.height > 5, artCount: art.length, artVisible: art.filter((el) => vis(el) !== 'hidden').length, rootVis: vis(svg) };
    });
    assert(layer.name === 'Siobhan' && layer.nameVis === 'visible' && layer.nameBox, `name visible: ${JSON.stringify(layer)}`);
    assert(layer.artCount > 50 && layer.artVisible === 0, `the page's own art is hidden (${layer.artVisible} of ${layer.artCount} showing)`);
    assert((await page.evaluate(() => window.__h.sfx)).includes('ding'), 'a soft ding as the name writes itself in');
    await shot(page, 'mw-lineup-fakecam');
    // A book without tracking targets asks for nothing more: no probe for a targets
    // file, and no tracking library from a third party.
    const extra = page.__requests.filter((u) => /targets\.mind|cdn\.jsdelivr\.net|mind-ar/.test(u) || !u.startsWith(BASE));
    eq(extra, [], 'no tracking requests for a book without targets');
    noErrors(errors, 'magic window live');
    await context.close();
  });

  await step('magic window: siblings get "names"; higher contrast and easy read reach the cards and the hint', async () => {
    const sibs = await newPage(browser);
    await sibs.page.goto(`${HARNESS}?page=2&explain=always&sibs=Amara,Zak`);
    await sibs.page.waitForFunction(() => window.__ready === true);
    await waitState(sibs.page, 'explain');
    const title = await sibs.page.locator('.mw-card-title').innerText();
    eq(title, 'See Amara and Zak’s names on the real page', 'siblings title');
    assert(/draw Amara and Zak’s names onto your book/.test(await sibs.page.getByTestId('mw-card-lead').innerText()), 'siblings lead');
    noErrors(sibs.errors, 'siblings explainer');
    await sibs.context.close();

    const plain = await newPage(browser);
    await plain.page.goto(`${HARNESS}?page=2&explain=always`);
    await plain.page.waitForFunction(() => window.__ready === true);
    await waitState(plain.page, 'explain');
    const styles = (p) =>
      p.evaluate(() => {
        const cs = (sel) => getComputedStyle(document.querySelector(sel));
        return {
          note: cs('.mw-card-note').color,
          noteSize: parseFloat(cs('.mw-card-note').fontSize),
          steps: cs('.mw-steps').color,
          stepsSize: parseFloat(cs('.mw-steps').fontSize),
          stepsSpacing: parseFloat(cs('.mw-steps').letterSpacing) || 0,
          card: cs('.mw-card').backgroundColor,
          cardBorder: parseFloat(cs('.mw-card').borderTopWidth),
          scrollW: document.scrollingElement.scrollWidth,
          w: innerWidth,
        };
      });
    const before = await styles(plain.page);
    await plain.context.close();
    const hc = await newPage(browser);
    await hc.page.goto(`${HARNESS}?page=2&explain=always`);
    await hc.page.waitForFunction(() => window.__ready === true);
    await waitState(hc.page, 'explain');
    // As js/main.js applies settings.highContrast / settings.easyRead.
    await hc.page.evaluate(() => {
      document.documentElement.dataset.contrast = 'high';
      document.documentElement.dataset.easyRead = 'true';
    });
    await hc.page.waitForTimeout(100);
    const after = await styles(hc.page);
    eq([after.note, after.steps, after.card], ['rgb(46, 46, 46)', 'rgb(20, 20, 20)', 'rgb(255, 255, 255)'], 'darker words on a plain white card');
    assert(after.cardBorder >= 3, `a solid edge round the card (${after.cardBorder})`);
    assert(after.noteSize > before.noteSize && after.stepsSize > before.stepsSize && after.stepsSpacing > 0, `easy read: bigger, spaced-out words (${JSON.stringify({ before, after })})`);
    assert(after.scrollW <= after.w, 'no sideways scroll');
    await shot(hc.page, 'mw-explainer-contrast-easyread');
    noErrors(hc.errors, 'contrast explainer');
    await hc.context.close();
  });

  await step('tracking library: loaded only with every file checked against its hash (a changed file is refused)', async () => {
    const mindar = path.join(npmPackage('mind-ar', '1.2.5'), 'dist');
    const serve = (tamper) => (p) =>
      p.route(/cdn\.jsdelivr\.net\/npm\/mind-ar@1\.2\.5\/dist\/([\w.-]+)$/, (r) => {
        const name = path.basename(new URL(r.request().url()).pathname);
        const f = path.join(mindar, name);
        if (!existsSync(f)) return r.fulfill({ status: 404, body: '' });
        let body = readFileSync(f);
        if (tamper && name.startsWith('controller-')) body = Buffer.concat([body, Buffer.from('\n;globalThis.__tampered = true;\n')]);
        return r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
      });
    for (const tamper of [false, true]) {
      const { page, context } = await newPage(browser, { routes: serve(tamper) });
      await page.goto(`${BASE}/package.json`);
      const got = await page.evaluate(async () => {
        const mw = await import('/js/ar/magic-window.js');
        try {
          const mod = await mw.loadMindAr();
          return { ok: true, controller: typeof mod.Controller, tampered: globalThis.__tampered ?? false };
        } catch (err) {
          return { ok: false, error: String(err?.message ?? err), tampered: globalThis.__tampered ?? false };
        }
      });
      if (tamper) assert(!got.ok && !got.tampered, `a changed file is refused before it runs: ${JSON.stringify(got)}`);
      else eq(got, { ok: true, controller: 'function', tampered: false }, 'the pinned files load');
      await context.close();
    }
  });

  await step('magic window: drag, slider, rotate, ghost, reset; the fit is remembered; page arrows; Magic!; destroy stops the camera', async () => {
    const { page, context, errors } = await newPage(browser);
    await page.goto(`${HARNESS}?page=4&explain=always`);
    await page.waitForFunction(() => window.__ready === true);
    await page.getByTestId('mw-allow').click();
    await waitState(page, 'live');
    await page.getByTestId('mw-align-panel').waitFor();
    const before = await alignOf(page);
    assert(before.join() === '0,0,1,0', `starts centred: ${before}`);
    const box = await page.getByTestId('mw-overlay').boundingBox();
    await drag(page, [box.x + box.width / 2, box.y + box.height / 2], [box.x + box.width / 2 + 39, box.y + box.height / 2 - 84.4]);
    let a = await alignOf(page);
    near(a[0], 0.1, 0.01, 'dragged right by 10% of the width');
    near(a[1], -0.1, 0.01, 'dragged up by 10% of the height');
    await page.getByTestId('mw-size').fill('150');
    a = await alignOf(page);
    near(a[2], 1.5, 0.001, 'slider scales');
    const box2 = await page.getByTestId('mw-overlay').boundingBox();
    near(box2.width, box.width * 1.5, 2, 'the overlay grew');
    await page.getByTestId('mw-rotate-right').click();
    await page.getByTestId('mw-rotate-right').click();
    await page.getByTestId('mw-rotate-left').click();
    a = await alignOf(page);
    near(a[3], 1, 0.001, 'rotate nudges by a degree');
    // Pinch with two touch points (CDP) grows it further.
    const client = await context.newCDPSession(page);
    const c = [box.x + box.width / 2 + 39, box.y + box.height / 2 - 84];
    const touch = async (type, d) => client.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: c[0] - d, y: c[1], id: 1 }, { x: c[0] + d, y: c[1], id: 2 }] });
    await touch('touchStart', 40);
    for (const d of [50, 60, 70, 80]) await touch('touchMove', d);
    await touch('touchEnd', 80);
    a = await alignOf(page);
    near(a[2], 3, 0.05, 'pinch doubles the size (1.5 -> 3)');
    await page.getByTestId('mw-size').fill('120');
    // Ghost toggle
    const ghostOn = await page.getByTestId('mw-ghost-toggle').getAttribute('aria-pressed');
    await page.getByTestId('mw-ghost-toggle').click();
    assert((await page.getByTestId('mw-ghost-toggle').getAttribute('aria-pressed')) !== ghostOn, 'ghost toggles');
    await page.getByTestId('mw-ghost-toggle').click();
    assert(await page.getByTestId('mw-ghost').locator('svg').count(), 'ghost shows the whole page');
    await page.getByTestId('mw-align-done').click();
    assert(!(await page.getByTestId('mw-align-panel').isVisible()) && !(await page.getByTestId('mw-ghost').isVisible()), 'done closes the panel and the ghost');
    const saved = await alignOf(page);
    // Line-up mode is off: a stray finger doesn't move the page.
    await drag(page, [c[0], c[1]], [c[0] + 60, c[1] + 60]);
    assert((await alignOf(page)).join() === saved.join(), 'no accidental moves outside line-up mode');
    await shot(page, 'mw-live-fakecam');

    // Page arrows follow the book.
    await page.getByTestId('mw-next').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=magic-window]').dataset.page === '5');
    assert((await page.evaluate(() => window.__h.pages)).join() === '5', 'onPage(5)');
    assert(/Page 5 of 8/.test(await page.getByTestId('mw-page').innerText()), 'page chip');
    await page.getByTestId('mw-prev').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=magic-window]').dataset.page === '4');
    // Magic! plays the page's moving part and its digital extras over the page.
    assert(await page.getByTestId('mw-hint').isVisible(), 'hint: do the mechanism, then tap Magic!');
    assert(/Slide the ball across/.test(await page.getByTestId('mw-hint').innerText()), 'hint uses the page prompt');
    await page.getByTestId('mw-play').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=magic-window]').dataset.playing === '1');
    await page.waitForTimeout(1500);
    await shot(page, 'mw-magic-playing');
    await page.waitForFunction(() => !document.querySelector('[data-testid=magic-window]').dataset.playing, null, { timeout: 10000 });
    const after = await page.evaluate(() => ({
      burst: document.querySelector('.mw-layer #p4-burst-tiffin')?.getAttribute('display'),
      sfx: window.__h.sfx,
      hint: !document.querySelector('[data-testid=mw-hint]').hidden,
    }));
    assert(after.burst === null, 'completion shows the burst');
    assert(after.sfx.includes('kick') && after.sfx.includes('cheer'), `sounds played: ${after.sfx}`);
    assert(!after.hint, 'hint goes once played');

    // Read-along caption (silent narrator in tests).
    await page.getByTestId('mw-read').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=mw-caption] .mw-word.is-current'), null, { timeout: 5000 });
    assert(/Pass, pass, pass!|Peep! Kick-off!|Tiffin to Siobhan/.test(await page.getByTestId('mw-caption').innerText()), 'caption shows the page text');
    await shot(page, 'mw-read-caption');
    await page.waitForFunction(() => document.querySelector('[data-testid=mw-caption]').hidden, null, { timeout: 15000 });

    // The fit is remembered for the book (a small per-device preference via storage.js prefs).
    await page.waitForTimeout(500);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('starring.prefs.v1') ?? '{}')['magic-align:tiffin-football'] ?? null);
    assert(stored?.v === 1 && stored.portrait && Math.abs(stored.portrait.scale - saved[2]) < 0.001, `fit saved in prefs: ${JSON.stringify(stored)}`);
    await page.evaluate(() => window.__h.handle.destroy());
    assert((await liveTracks(page)) === 0, 'destroy stops the camera');
    assert((await page.getByTestId('magic-window').count()) === 0, 'destroy removes the view');
    assert(!(await page.evaluate(() => document.documentElement.classList.contains('mw-open'))), 'page scroll restored');
    await page.reload();
    await page.waitForFunction(() => window.__ready === true);
    await page.getByTestId('mw-allow').click();
    await waitState(page, 'live');
    const back = await alignOf(page);
    assert(back.join() === saved.join(), `fit remembered: ${back} vs ${saved}`);
    assert(!(await page.getByTestId('mw-align-panel').isVisible()), 'no line-up step once a fit is saved');

    // Leaving the page (tab hidden) stops the camera; coming back restarts it.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert((await state(page)) === 'paused' && (await liveTracks(page)) === 0, 'hidden: camera stopped');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitState(page, 'live');
    assert((await liveTracks(page)) === 1, 'visible again: camera back on');
    // Back to reading
    await page.getByTestId('mw-exit').click();
    assert((await page.evaluate(() => window.__h.exits)) === 1, 'onExit called');
    assert((await liveTracks(page)) === 0, 'camera off after back to reading');
    noErrors(errors, 'magic window controls');
    await context.close();
  });

  await step('magic window: denied, unsupported, no camera and blocked storage all fail soft', async () => {
    // Denied
    let t = await newPage(browser, { init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')); } });
    await t.page.goto(`${HARNESS}?page=2&explain=always`);
    await t.page.waitForFunction(() => window.__ready === true);
    await t.page.getByTestId('mw-allow').click();
    await waitState(t.page, 'denied');
    assert(/isn’t allowed/.test(await t.page.locator('.mw-card-title').innerText()), 'denied card');
    assert(await t.page.getByTestId('mw-retry').isVisible(), 'try again');
    await t.page.waitForTimeout(450);
    await shot(t.page, 'mw-denied');
    await t.page.getByTestId('mw-card-exit').click();
    assert((await t.page.evaluate(() => window.__h.exits)) === 1, 'a way back when denied');
    noErrors(t.errors, 'denied');
    await t.context.close();
    // Unsupported (no mediaDevices, e.g. plain http or an old in-app browser)
    t = await newPage(browser, { viewport: { width: 844, height: 390 }, init: () => Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }) });
    await t.page.goto(`${HARNESS}?page=2`);
    await t.page.waitForFunction(() => window.__ready === true);
    await waitState(t.page, 'unsupported');
    assert(await t.page.getByTestId('mw-card-exit').isVisible(), 'a way back when unsupported');
    assert((await t.page.evaluate(() => window.__h.mw.isCameraSupported())) === false, 'isCameraSupported() false');
    await t.page.waitForTimeout(450);
    await shot(t.page, 'mw-unsupported-landscape');
    noErrors(t.errors, 'unsupported');
    await t.context.close();
    // No camera at all
    t = await newPage(browser, { init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('none', 'NotFoundError')); } });
    await t.page.goto(`${HARNESS}?page=2&explain=always`);
    await t.page.waitForFunction(() => window.__ready === true);
    await t.page.getByTestId('mw-allow').click();
    await waitState(t.page, 'nocamera');
    noErrors(t.errors, 'no camera');
    await t.context.close();
    // Storage blocked: localStorage throws and there is no IndexedDB.
    t = await newPage(browser, {
      init: () => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
        Object.defineProperty(window, 'indexedDB', { value: undefined });
      },
    });
    await t.page.goto(`${HARNESS}?page=7&explain=always`);
    await t.page.waitForFunction(() => window.__ready === true);
    await t.page.getByTestId('mw-allow').click();
    await waitState(t.page, 'live');
    await t.page.getByTestId('mw-size').fill('90');
    await t.page.getByTestId('mw-align-done').click();
    assert((await alignOf(t.page))[2] === 0.9, 'fit kept in memory');
    // Page 7: the cup's name hides under the cloth until Magic!, the banner name shows now.
    const p7 = await t.page.evaluate(() => [...document.querySelectorAll('.mw-layer text.sb-name')].map((n) => n.classList.contains('is-pending')));
    assert(p7.join() === 'false,true', `banner written, cup waiting under the cloth: ${p7}`);
    await t.page.getByTestId('mw-play').click();
    await t.page.waitForFunction(() => ![...document.querySelectorAll('.mw-layer text.sb-name')].some((n) => n.classList.contains('is-pending')), null, { timeout: 10000 });
    await t.page.waitForFunction(() => !document.querySelector('[data-testid=magic-window]').dataset.playing, null, { timeout: 10000 });
    await shot(t.page, 'mw-p7-after-magic');
    noErrors(t.errors, 'storage blocked');
    await t.context.close();
  });

  await step('magic window: a fit saved by an earlier version (with the recordings) is moved to prefs once', async () => {
    const { page, context, errors } = await newPage(browser);
    await page.goto(`${BASE}/package.json`);
    const OLD = { v: 1, portrait: { x: 0.2, y: -0.1, scale: 1.3, rotate: 2 } };
    // The old home of the fit: the IndexedDB store that also holds recordings.
    await page.evaluate((old) => new Promise((resolve, reject) => {
      const req = indexedDB.open('starring', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('recordings');
      req.onsuccess = () => {
        const t = req.result.transaction('recordings', 'readwrite');
        t.objectStore('recordings').put(old, 'magic-align:tiffin-football');
        t.oncomplete = () => (req.result.close(), resolve());
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    }), OLD);
    await page.goto(`${HARNESS}?page=4&explain=always`);
    await page.waitForFunction(() => window.__ready === true);
    await page.getByTestId('mw-allow').click();
    await waitState(page, 'live');
    eq((await alignOf(page)).join(), '0.2,-0.1,1.3,2', 'the old fit is used');
    assert(!(await page.getByTestId('mw-align-panel').isVisible()), 'no line-up step: the old fit counts');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => new Promise((resolve) => {
      const prefs = JSON.parse(localStorage.getItem('starring.prefs.v1') ?? '{}')['magic-align:tiffin-football'] ?? null;
      const req = indexedDB.open('starring', 1);
      req.onsuccess = () => {
        const g = req.result.transaction('recordings').objectStore('recordings').get('magic-align:tiffin-football');
        g.onsuccess = () => (req.result.close(), resolve({ prefs, old: g.result ?? null }));
      };
    }));
    eq(after.prefs, OLD, 'moved to prefs');
    eq(after.old, null, 'the old copy is tidied away');
    noErrors(errors, 'fit migration');
    await context.close();
  });

  await step('magic window works on every page of Book 2 (names, digital layer only, Magic! plays)', async () => {
    const { page, context, errors } = await newPage(browser, { viewport: { width: 844, height: 390 } });
    await page.goto(`${HARNESS}?book=tiffin-digger&page=1&explain=always`);
    await page.waitForFunction(() => window.__ready === true);
    await page.getByTestId('mw-allow').click();
    await waitState(page, 'live');
    await page.getByTestId('mw-align-done').click();
    const book = await page.evaluate(() => window.__h.book);
    eq(book.id, 'tiffin-digger', 'Book 2 is loaded');
    for (const p of book.pages) {
      if (p.n > 1) {
        await page.getByTestId('mw-next').click();
        await page.waitForFunction((n) => document.querySelector('[data-testid=magic-window]').dataset.page === String(n), p.n);
      }
      await page.waitForFunction(() => document.querySelector('.mw-layer svg'), null, { timeout: 8000 });
      await page.waitForTimeout(400);
      const layer = await page.evaluate(() => {
        const svg = document.querySelector('.mw-layer svg');
        const vis = (el) => getComputedStyle(el).visibility;
        const art = [...svg.querySelectorAll('path, use, rect, circle')].filter((el) => !el.closest('.sb-name, .sb-letters, .sb-digital'));
        return { art: art.length, artVisible: art.filter((el) => vis(el) !== 'hidden').length, names: svg.querySelectorAll('text.sb-name').length };
      });
      assert(layer.art > 20 && layer.artVisible === 0, `page ${p.n}: only the digital layer shows (${layer.artVisible} of ${layer.art} art shapes visible)`);
      assert(layer.names > 0, `page ${p.n}: has a name spot`);
      const before = (await page.evaluate(() => window.__h.sfx.length));
      await page.getByTestId('mw-play').click();
      await page.waitForFunction(() => !document.querySelector('[data-testid=magic-window]').dataset.playing, null, { timeout: 10000 });
      await page.waitForTimeout(250);
      const names = await page.evaluate(() => [...document.querySelectorAll('.mw-layer text.sb-name')].filter((t) => !t.closest('[display=none]')).map((t) => ({ text: t.textContent, pending: t.classList.contains('is-pending'), vis: getComputedStyle(t).visibility })));
      assert(names.length > 0, `page ${p.n}: a name shows after Magic!`);
      for (const n of names) assert(/^(Siobhan|SIOBHAN|Siobhan's)$/.test(n.text) && !n.pending && n.vis === 'visible', `page ${p.n}: name "${n.text}" written and visible (${JSON.stringify(n)})`);
      const sfx = (await page.evaluate(() => window.__h.sfx)).slice(before);
      if (p.mechanic?.complete?.sfx?.length) for (const x of p.mechanic.complete.sfx) assert(sfx.includes(x), `page ${p.n}: Magic! played ${x} (${sfx})`);
      if (p.n === 3 || p.n === 7) await shot(page, `mw-book2-p${p.n}-magic`);
    }
    const letters = await page.evaluate(() => [...document.querySelectorAll('.mw-layer .sb-letter')].map((t) => t.textContent).join(''));
    eq(letters, '', 'page 8 has no bunting');
    noErrors(errors, 'Book 2 magic window');
    await context.close();
  });

  await step('magic window via the app route (#/b/…/magic/3), reduced motion, tablet', async () => {
    const { page, context, errors } = await newPage(browser, { viewport: { width: 1024, height: 768 }, seed: true, reducedMotion: 'reduce', init: GATE_HOOK });
    await page.goto(`${BASE}/?test=1#/b/${BOOK}/magic/3`);
    await passCameraGate(page);
    await page.getByTestId('magic-window').waitFor({ timeout: 15000 });
    await waitState(page, 'explain');
    await page.waitForTimeout(450);
    await shot(page, 'app-magic-explainer-tablet');
    await page.getByTestId('mw-allow').click();
    await waitState(page, 'live');
    await page.getByTestId('mw-align-done').click();
    await page.getByTestId('mw-next').click();
    await page.waitForFunction(() => location.hash === '#/b/tiffin-football/magic/4');
    await page.getByTestId('mw-exit').click();
    await page.waitForFunction(() => location.hash === '#/b/tiffin-football/read/4');
    assert((await liveTracks(page)) === 0, 'camera off when back to reading');
    noErrors(errors, 'app route');
    await context.close();
  });

  await browser.close();
  browser = null;

  // ---- Filmed paper: line up by hand against a real picture ------------------------------------------
  const renderer = await chromium.launch({ args: WEBGL });
  const sheet4 = await renderSheet(renderer, 4);
  const feeds = {};
  for (const [name, vp, frame] of [
    ['portrait', { width: 390, height: 844 }, { width: 780, height: 1688, sheetWidth: 680, cy: 0.47, rotate: -2 }],
    ['landscape', { width: 844, height: 390 }, { width: 1688, height: 780, sheetWidth: 900, cx: 0.52, rotate: 1.5 }],
    ['tablet', { width: 1024, height: 768 }, { width: 1024, height: 768, sheetWidth: 800, cy: 0.53, rotate: -1 }],
  ]) {
    const f = await composeFrame(renderer, sheet4, frame);
    feeds[name] = { vp, frame, quad: f.quad, file: writeY4m(path.join(CACHE, `feed-${name}.y4m`), frame.width, frame.height, f.i420) };
    if (SHOTS) writeFileSync(path.join(SHOTS, `feed-${name}.png`), f.png);
  }

  for (const [name, feed] of Object.entries(feeds)) {
    await step(`filmed paper (${name} ${feed.vp.width}x${feed.vp.height}): line up by hand; the name lands on the printed name spot`, async () => {
      const b = await chromium.launch({ args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${feed.file}`] });
      try {
        const { page, errors } = await newPage(b, { viewport: feed.vp, seed: true, init: `globalThis.SB_TEST = { gateMs: 150, camera: { audio: false, video: { width: { ideal: ${feed.frame.width} }, height: { ideal: ${feed.frame.height} } } } };` });
        await page.goto(`${BASE}/?test=1#/b/${BOOK}/magic/4`);
        await passCameraGate(page);
        await page.getByTestId('mw-allow').click({ timeout: 15000 });
        await waitState(page, 'live');
        const vw = await page.getByTestId('mw-video').evaluate((v) => [v.videoWidth, v.videoHeight]);
        assert(vw[0] === feed.frame.width && vw[1] === feed.frame.height, `the fake camera films our page (${vw})`);
        await page.waitForTimeout(700);
        await shot(page, `paper-${name}-1-lineup-start`);
        // Where the printed picture is on screen (the frame is shown with object-fit: cover).
        const k = Math.max(feed.vp.width / feed.frame.width, feed.vp.height / feed.frame.height);
        const off = [(feed.vp.width - feed.frame.width * k) / 2, (feed.vp.height - feed.frame.height * k) / 2];
        const quad = feed.quad.map(([x, y]) => [x * k + off[0], y * k + off[1]]);
        const centre = [(quad[0][0] + quad[2][0]) / 2, (quad[0][1] + quad[2][1]) / 2];
        const width = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]);
        const angle = (Math.atan2(quad[1][1] - quad[0][1], quad[1][0] - quad[0][0]) * 180) / Math.PI;
        // Resize with the slider, turn with the nudge buttons, then drag it into place.
        const baseW = await page.getByTestId('mw-overlay').evaluate((o) => o.offsetWidth);
        await page.getByTestId('mw-size').fill(String(Math.round((width / baseW) * 100)));
        for (let i = 0; i < Math.round(Math.abs(angle)); i++) await page.getByTestId(angle > 0 ? 'mw-rotate-right' : 'mw-rotate-left').click();
        const o = await page.getByTestId('mw-overlay').boundingBox();
        const from = [o.x + o.width / 2, o.y + o.height / 2];
        await drag(page, from, centre);
        await page.waitForTimeout(300);
        await shot(page, `paper-${name}-2-lined-up-ghost`);
        await page.getByTestId('mw-align-done').click();
        await page.waitForTimeout(1200);
        // The name's centre vs the name spot on the filmed page (scene coords -> the picture's corners).
        const where = await page.evaluate(() => {
          const svg = document.querySelector('.mw-layer svg');
          const n = svg.querySelector('#p4-name');
          const bb = n.getBBox();
          // The name's centre in scene coordinates, whatever groups it sits in.
          const m = svg.getScreenCTM().inverse().multiply(n.getScreenCTM());
          const cx = bb.x + bb.width / 2;
          const cy = bb.y + bb.height / 2;
          const r = n.getBoundingClientRect();
          return { scene: [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f], screen: [r.x + r.width / 2, r.y + r.height / 2] };
        });
        const want = sceneToQuad(quad, ...where.scene);
        const tol = Math.max(4, width * 0.012);
        near(where.screen[0], want[0], tol, 'name x on the printed spot');
        near(where.screen[1], want[1], tol, 'name y on the printed spot');
        await shot(page, `paper-${name}-3-name-on-page`);
        await page.getByTestId('mw-play').click();
        await page.waitForTimeout(1900);
        await shot(page, `paper-${name}-4-magic`);
        await page.waitForFunction(() => !document.querySelector('[data-testid=magic-window]').dataset.playing, null, { timeout: 10000 });
        await page.waitForTimeout(600);
        await shot(page, `paper-${name}-5-after`);
        noErrors(errors, `filmed paper ${name}`);
      } finally {
        await b.close();
      }
    });
  }

  // ---- Experimental: image tracking (MindAR) ------------------------------------------------------
  if (TRACKING) {
    await step('tracking (experimental): a target compiled from the printed pages pins the overlay to the filmed page', async () => {
      const mindar = path.join(npmPackage('mind-ar', '1.2.5'), 'dist');
      const routeMindar = (p) =>
        p.route(/cdn\.jsdelivr\.net\/npm\/mind-ar@1\.2\.5\/dist\/([\w.-]+)$/, (r) => {
          const f = path.join(mindar, path.basename(new URL(r.request().url()).pathname));
          return existsSync(f) ? r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(f) }) : r.fulfill({ status: 404, body: '' });
        });
      // Targets for pages 1-4 (index i = page i + 1), compiled from the printed art. Cached by content.
      const arts = [];
      for (const n of [1, 2, 3]) arts.push((await renderSheet(renderer, n)).artPng);
      arts.push(sheet4.artPng);
      const hash = createHash('sha1').update(Buffer.concat(arts)).digest('hex').slice(0, 12);
      const targetFile = path.join(CACHE, `targets-${hash}.mind`);
      if (!existsSync(targetFile)) {
        const { page, context } = await newPage(renderer, { viewport: { width: 800, height: 600 }, routes: routeMindar });
        await page.goto(`${BASE}/package.json`);
        const b64 = await page.evaluate(async (list) => {
          const { Compiler } = await import('https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js');
          const imgs = await Promise.all(list.map(async (b) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b}`;
            await img.decode();
            return img;
          }));
          const c = new Compiler();
          await c.compileImageTargets(imgs, () => {});
          const u8 = new Uint8Array(await c.exportData());
          let bin = '';
          for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          return btoa(bin);
        }, arts.map((a) => a.toString('base64')));
        writeFileSync(targetFile, Buffer.from(b64, 'base64'));
        await context.close();
      }
      // Film page 4 at an angle, as a hand-held phone would see it.
      const vp = { width: 844, height: 390 };
      const frame = { width: 1280, height: 720, sheetWidth: 760, cx: 0.5, cy: 0.52, rotate: -4, tilt: 14 };
      const f = await composeFrame(renderer, sheet4, frame);
      const file = writeY4m(path.join(CACHE, 'feed-tracking.y4m'), frame.width, frame.height, f.i420);
      if (SHOTS) writeFileSync(path.join(SHOTS, 'feed-tracking.png'), f.png);
      const b = await chromium.launch({ args: [...FAKE_CAMERA, ...WEBGL, `--use-file-for-fake-video-capture=${file}`] });
      try {
        const { page, errors } = await newPage(b, {
          viewport: vp,
          seed: true,
          init: `globalThis.SB_TEST = { gateMs: 150, camera: { audio: false, video: { width: { ideal: ${frame.width} }, height: { ideal: ${frame.height} } } } };`,
          routes: async (p) => {
            await routeMindar(p);
            await p.route(/\/books\/tiffin-football\/targets\.mind$/, (r) => r.fulfill({ status: 200, contentType: 'application/octet-stream', body: readFileSync(targetFile) }));
            // Only a book that declares its targets is tracked.
            await p.route(/\/books\/tiffin-football\/book\.json$/, async (r) => {
              const res = await r.fetch();
              const json = await res.json();
              await r.fulfill({ response: res, contentType: 'application/json', body: JSON.stringify({ ...json, targets: 'targets.mind' }) });
            });
          },
        });
        await page.goto(`${BASE}/?test=1#/b/${BOOK}/magic/1`);
        await passCameraGate(page);
        await page.getByTestId('mw-allow').click({ timeout: 15000 });
        await waitState(page, 'live');
        await page.getByTestId('mw-align-done').click();
        await page.waitForFunction(() => document.querySelector('[data-testid=magic-window]')?.dataset.tracking === 'found', null, { timeout: 90000 });
        // The detected page turns ours: we opened page 1 but the camera sees page 4.
        await page.waitForFunction(() => document.querySelector('[data-testid=magic-window]').dataset.page === '4', null, { timeout: 5000 });
        await page.waitForTimeout(1500);
        const k = Math.max(vp.width / frame.width, vp.height / frame.height);
        const off = [(vp.width - frame.width * k) / 2, (vp.height - frame.height * k) / 2];
        const want = f.quad.map(([x, y]) => [x * k + off[0], y * k + off[1]]);
        const got = await page.getByTestId('mw-overlay').evaluate((o) => {
          const m = new DOMMatrix(getComputedStyle(o).transform);
          const w = o.offsetWidth;
          const h = o.offsetHeight;
          return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => {
            const p = m.transformPoint(new DOMPoint(x, y, 0, 1));
            return [p.x / p.w, p.y / p.w];
          });
        });
        const err = Math.max(...got.map((p, i) => Math.hypot(p[0] - want[i][0], p[1] - want[i][1])));
        await shot(page, 'tracking-found');
        assert(err < 18, `tracked corners within 18 px of the filmed page (worst ${err.toFixed(1)} px): ${JSON.stringify(got.map((p) => p.map(Math.round)))} vs ${JSON.stringify(want.map((p) => p.map(Math.round)))}`);
        noErrors(errors.filter((e) => !/WebGL|GL Driver|GPU stall/i.test(e)), 'tracking');
        console.log(`       tracked corners within ${err.toFixed(1)} px`);
      } finally {
        await b.close();
      }
    });
  }
  await renderer.close();
} finally {
  await browser?.close().catch(() => {});
  server.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
