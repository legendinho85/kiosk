// Browser tests for the printable name stickers (js/ar/stickers.js), with the real
// Book 1 through the harness page tests/fixtures/stickers/index.html:
//   - every name spot gets a sticker at its printed size, in the spot's font, colour and
//     case, on the colour of the art underneath; bunting letters on their own flags'
//     colours with a spare set of the initial; siblings get a set each;
//   - names that stretch the spots ("Siobhán", "Oluwaseun", "Anna-Sophia") fit inside;
//   - print: only the A4 portrait sheets print (even with ar.css's landscape @page on the
//     page), one PDF page per sheet, and the 50 mm ruler measures 50 mm in the PDF, both
//     from the layout and by rendering the PDF back with pdf.js and measuring the pixels;
//   - fail soft: a missing picture, no picture at all, a browser that won't sample colours;
//   - keyboard, labels, cleanup; screenshots at 390×844, 844×390 and 1024×768.
//
//   node tests/e2e/stickers.e2e.mjs                  (PORT=8132 by default)
//   SHOTS=/some/dir node tests/e2e/stickers.e2e.mjs  also saves screenshots and the PDFs
//   ONLY=<text> runs matching steps
// Starts and stops its own static server. Exits non-zero on any failure.
// pdf.js (test-only) comes from the npm registry into a cache folder.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 8132);
const BASE = `http://127.0.0.1:${PORT}`;
const HARNESS = `${BASE}/tests/fixtures/stickers/index.html`;
const SHOTS = process.env.SHOTS ?? '';
const CACHE = process.env.STICKERS_E2E_CACHE ?? path.join(os.tmpdir(), 'storybook-stickers-e2e');
mkdirSync(CACHE, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const PX_PER_MM = 96 / 25.4;
const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
  tablet: { width: 1024, height: 768 },
};

// ---- tiny runner ----------------------------------------------------------------------------
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
    console.log(`  FAIL ${name}\n       ${String(err?.stack ?? err).split('\n').slice(0, 6).join('\n       ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg}: ${a} is not within ${tol} of ${b}`);
}

// ---- server & test-only packages --------------------------------------------------------------
async function startServer() {
  const busy = await fetch(`${BASE}/`).then(
    () => true,
    () => false,
  );
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

// ---- pages ------------------------------------------------------------------------------------
async function open(browser, { qs = 'name=Ava', viewport = VIEWPORTS.phone, init = null, routes = null, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await context.newPage();
  lastPage = page;
  const errors = [];
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${m.text()} (${m.location()?.url ?? ''})`);
    if (m.type() === 'warning') warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // The harness serves the app's own fonts from /fonts (no network needed).
  if (routes) await routes(page);
  if (init) await page.addInitScript(init);
  await page.goto(`${HARNESS}?${qs}`);
  await page.waitForFunction(() => window.__h?.ready, null, { timeout: 30000 });
  return { context, page, errors, warnings };
}
const noErrors = (errors, where) => assert(errors.length === 0, `console errors on ${where}:\n  ${errors.join('\n  ')}`);
const stateOf = (page) => page.getByTestId('sticker-sheets').getAttribute('data-state');

/** Every sticker as the page draws it: its data, the printed size of its cut line and where its name sits. */
function readStickers(page) {
  return page.evaluate((pxPerMm) => {
    // Name stickers: the text's whole line box sits inside the cut line. Round letter
    // stickers: the letter's width across its capital-height band sits inside the circle.
    const inside = (svg, text, tr, cut) => {
      const circle = svg.querySelector('circle.st-cut');
      if (!circle) return tr.left >= cut.left - 1 && tr.right <= cut.right + 1 && tr.top >= cut.top - 1 && tr.bottom <= cut.bottom + 1;
      const r = Number(circle.getAttribute('r'));
      const b = text.getBBox();
      const fs = Number(text.getAttribute('font-size'));
      const base = Number(text.getAttribute('y'));
      const top = base - 0.72 * fs;
      return [b.x, b.x + b.width].every((x) => [top, base].every((y) => Math.hypot(x, y) <= r + 0.5));
    };
    return [...document.querySelectorAll('[data-testid=sticker]')].map((svg) => {
      const cut = svg.querySelector('.st-cut').getBoundingClientRect();
      const text = svg.querySelector('.st-name');
      const tr = text.getBoundingClientRect();
      return {
        page: svg.dataset.page,
        kind: svg.dataset.kind,
        child: svg.dataset.child,
        label: svg.dataset.label,
        flag: svg.dataset.flag ?? null,
        text: svg.dataset.text,
        aria: svg.getAttribute('aria-label'),
        role: svg.getAttribute('role'),
        bg: svg.dataset.bg,
        fill: text.getAttribute('fill'),
        stroke: text.getAttribute('stroke'),
        font: getComputedStyle(text).fontFamily,
        fontSize: Number(svg.dataset.fontSize),
        spec: { w: Number(svg.dataset.mmW), h: Number(svg.dataset.mmH) },
        mm: { w: cut.width / pxPerMm, h: cut.height / pxPerMm },
        textInside: inside(svg, text, tr, cut),
        textBox: { w: tr.width / pxPerMm, h: tr.height / pxPerMm },
        cutBox: { w: cut.width / pxPerMm, h: cut.height / pxPerMm },
        rendered: text.textContent,
      };
    });
  }, PX_PER_MM);
}

async function shots(browser, name, qs) {
  if (!SHOTS) return;
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const { page, context } = await open(browser, { qs, viewport });
    await page.screenshot({ path: path.join(SHOTS, `${name}-${vpName}.png`) });
    if (vpName === 'tablet') {
      const sheets = page.getByTestId('sticker-sheet');
      for (let i = 0; i < (await sheets.count()); i++) await sheets.nth(i).screenshot({ path: path.join(SHOTS, `${name}-sheet${i + 1}.png`) });
    }
    await context.close();
  }
}

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const colourNear = (a, b, tol = 12) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return pa.every((v, i) => Math.abs(v - pb[i]) <= tol);
};

// ---- PDF: page count, page size and a ruler measured on the rendered page ------------------------
function pdfPages(pdf) {
  const s = pdf.toString('latin1');
  const count = (s.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const boxes = [...s.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => ({ w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) }));
  return { count, boxes };
}

/**
 * Render page 1 of the PDF with pdf.js and measure the ruler bar: the distance from the
 * left edge of its first dark block to the right edge of its last one.
 * @param {{x: number, y: number}} at the ruler's top-left in mm from the sheet's corner
 */
async function measureRulerInPdf(browser, pdf, at) {
  const pdfjs = npmPackage('pdfjs-dist', '4.10.38');
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(`${BASE}/__pdfjs/**`, (r) => {
    const file = path.join(pdfjs, 'build', path.basename(new URL(r.request().url()).pathname));
    r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(file) });
  });
  await page.route(`${BASE}/__sheet.pdf`, (r) => r.fulfill({ status: 200, contentType: 'application/pdf', body: pdf }));
  await page.route(`${BASE}/__measure.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>measure</title><body></body>' }));
  await page.goto(`${BASE}/__measure.html`);
  const out = await page.evaluate(
    async ({ at }) => {
      const pdfjsLib = await import('/__pdfjs/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.min.mjs';
      const doc = await pdfjsLib.getDocument('/__sheet.pdf').promise;
      const p = await doc.getPage(1);
      const SCALE = 6; // pixels per PDF point (432 dpi)
      const vp = p.getViewport({ scale: SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      const ptPerMm = 72 / 25.4;
      const pxPerMm = ptPerMm * SCALE;
      // Scan a row through the middle of the bar (1.3 mm below its top).
      const y = Math.round((at.y + 1.3) * pxPerMm);
      const x0 = Math.max(0, Math.round((at.x - 6) * pxPerMm));
      const x1 = Math.min(canvas.width, Math.round((at.x + 56) * pxPerMm));
      const row = ctx.getImageData(x0, y, x1 - x0, 1).data;
      let first = -1;
      let last = -1;
      for (let i = 0; i < x1 - x0; i++) {
        const dark = row[i * 4] < 110 && row[i * 4 + 1] < 110 && row[i * 4 + 2] < 110;
        if (dark && first < 0) first = i;
        if (dark) last = i;
      }
      // A smaller picture of every page, to look at (SHOTS).
      const pictures = [];
      if (at.pictures) {
        for (let n = 1; n <= doc.numPages; n++) {
          const pn = await doc.getPage(n);
          const v = pn.getViewport({ scale: 1.6 });
          const c = document.createElement('canvas');
          c.width = Math.round(v.width);
          c.height = Math.round(v.height);
          await pn.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
          pictures.push(c.toDataURL('image/png'));
        }
      }
      return { pageW: p.view[2] - p.view[0], pageH: p.view[3] - p.view[1], barMm: first < 0 ? null : (last - first + 1) / pxPerMm, first: (x0 + first) / pxPerMm, pictures };
    },
    { at },
  );
  await context.close();
  return out;
}

// ---- tests ------------------------------------------------------------------------------------
const server = await startServer();
const browser = await chromium.launch();
try {
  console.log('stickers e2e');

  await step('Ava: a sticker for every name spot at its printed size, in the spot’s font, colour and case', async () => {
    const { page, context, errors } = await open(browser, { qs: 'name=Ava' });
    assert((await stateOf(page)) === 'ready', 'ready');
    const all = await readStickers(page);
    const names = all.filter((s) => s.kind === 'name');
    assert(names.length === 8, `8 name stickers, got ${names.length}`);
    assert(names.map((s) => s.label).join('|') === 'Cover · ribbon|Page 2 · shirt|Page 4 · banner|Page 5 · scoreboard|Page 6 · scoreboard|Page 7 · banner|Page 7 · trophy|Page 8 · shirt', `labels: ${names.map((s) => s.label)}`);
    assert(names.map((s) => s.rendered).join() === 'Ava,Ava,Ava,AVA,AVA,Ava,Ava,AVA', `case follows data-form: ${names.map((s) => s.rendered)}`);
    // Printed sizes (print media: 1 CSS mm = 1 mm on paper).
    await page.emulateMedia({ media: 'print' });
    const printed = await readStickers(page);
    for (const s of printed) {
      near(s.mm.w, s.spec.w, 0.15, `${s.label} ${s.text}: printed width`);
      near(s.mm.h, s.spec.h, 0.15, `${s.label} ${s.text}: printed height`);
      assert(s.textInside, `${s.label} ${s.text}: the name stays inside the cut line (${JSON.stringify(s.textBox)} in ${JSON.stringify(s.cutBox)})`);
    }
    const by = (label) => printed.find((s) => s.label === label);
    // The shirt spot on page 2: data-max-width 176 + room, drawn at 0.62 in a 1600-unit, 360 mm spread.
    near(by('Page 2 · shirt').mm.w, (176 + 2 * 0.16 * 42) * 0.62 * 0.225, 0.2, 'page 2 shirt width');
    // The cover ribbon: 560 + room + its 12-unit white outline, at full scale.
    near(by('Cover · ribbon').mm.w, (560 + 2 * (0.16 * 84 + 6)) * 0.225, 0.2, 'cover ribbon width');
    near(by('Page 5 · scoreboard').mm.w, (220 + 2 * 0.16 * 44) * 0.95 * 0.225, 0.2, 'scoreboard width');
    // Colours: the name's own fill and outline, on the art's colour.
    const ribbon = by('Cover · ribbon');
    assert(colourNear(ribbon.bg, '#ffcb3d'), `ribbon is yellow, got ${ribbon.bg}`);
    assert(ribbon.fill === '#E4483A' && ribbon.stroke === '#FFFFFF', 'ribbon name is red with a white outline');
    const board = by('Page 5 · scoreboard');
    assert(luminance(board.bg) < 0.05 && board.fill === '#FFCB3D', `scoreboard: yellow on dark, got ${board.fill} on ${board.bg}`);
    assert(colourNear(by('Page 7 · trophy').bg, '#f7e6cc'), 'trophy plaque is cream');
    assert(by('Page 2 · shirt').bg === '#ffffff', 'shirt name panel is white');
    assert(printed.every((s) => /Fredoka/.test(s.font)), 'Fredoka on every sticker');
    assert(await page.evaluate(() => document.fonts.check('700 20px Fredoka')), 'Fredoka loaded');
    // Bunting: A-V-A on flags 5-7, each on its own flag's colours, and three spare As.
    const letters = printed.filter((s) => s.kind === 'letter');
    assert(letters.map((s) => `${s.text}${s.flag}`).join() === 'A5,V6,A7', `letters: ${letters.map((s) => `${s.text}${s.flag}`)}`);
    assert(colourNear(letters[0].bg, '#ffcb3d') && colourNear(letters[1].bg, '#ffffff') && colourNear(letters[2].bg, '#e4483a'), `flag colours: ${letters.map((s) => s.bg)}`);
    assert(letters[2].fill === '#FFFFFF', 'white letter on the red flag');
    near(letters[0].mm.w, 1.08 * 62 * 0.225, 0.15, 'letter sticker diameter');
    const spares = printed.filter((s) => s.kind === 'spare');
    assert(spares.length === 3 && spares.every((s) => s.text === 'A'), 'a spare set of the initial');
    // The sheet: header, how-to, ruler, label text, footer.
    const sheet = await page.getByTestId('sticker-sheet').first().innerText();
    assert(sheet.includes('Name stickers for Goal, Ava!'), 'header');
    assert(sheet.includes('Print on A4 sticker paper at 100% scale — not ‘fit to page’. Cut round each sticker and pop it on the matching star in the book.'), 'instructions');
    assert(sheet.includes('Page 2 · shirt') && sheet.includes('Sheet 1 of 1'), 'labels and footer');
    assert((await page.getByTestId('sticker-sheet').count()) === 1, 'one A4 sheet');
    noErrors(errors, 'Ava');
    await context.close();
  });

  for (const name of ['Siobhán', 'Oluwaseun', 'Anna-Sophia']) {
    await step(`${name}: fits every spot, spelt out on the bunting`, async () => {
      const { page, context, errors } = await open(browser, { qs: `name=${encodeURIComponent(name)}` });
      assert((await stateOf(page)) === 'ready', 'ready');
      await page.emulateMedia({ media: 'print' });
      const all = await readStickers(page);
      const upper = name.toLocaleUpperCase('en-GB');
      const names = all.filter((s) => s.kind === 'name');
      assert(names.length === 8, `8 name stickers, got ${names.length}`);
      assert(names.every((s) => s.rendered === name || s.rendered === upper), `every name spelt right: ${names.map((s) => s.rendered)}`);
      for (const s of all) {
        assert(s.textInside, `${s.label} ${s.rendered}: inside the cut line (${JSON.stringify(s.textBox)} in ${JSON.stringify(s.cutBox)})`);
        near(s.mm.w, s.spec.w, 0.15, `${s.label}: printed width`);
      }
      const letters = all.filter((s) => s.kind === 'letter').map((s) => s.text).join('');
      assert(letters === upper.replace(/-/g, ''), `bunting letters ${letters}`);
      // Long names shrink on the small spots, just as in the reader.
      const shirt = all.find((s) => s.label === 'Page 2 · shirt');
      if (name !== 'Siobhán') assert(shirt.fontSize < 42, `${name} shrinks on the page 2 shirt (${shirt.fontSize})`);
      assert(all.filter((s) => s.kind === 'spare').every((s) => s.text === upper[0]), 'spare initials');
      noErrors(errors, name);
      await context.close();
    });
  }

  await step('siblings: Amara & Zak get a set each, each on their own sheet', async () => {
    const { page, context, errors } = await open(browser, { qs: 'names=Amara,Zak' });
    assert((await stateOf(page)) === 'ready', 'ready');
    const all = await readStickers(page);
    for (const [child, name] of [
      ['Amara', 'Amara'],
      ['Zak', 'Zak'],
    ]) {
      const mine = all.filter((s) => s.child === child);
      assert(mine.filter((s) => s.kind === 'name').length === 8, `${child}: 8 name stickers`);
      assert(mine.filter((s) => s.kind === 'name').every((s) => s.rendered.toLowerCase() === name.toLowerCase()), `${child}: own name only`);
      assert(mine.filter((s) => s.kind === 'letter').map((s) => s.text).join('') === name.toUpperCase(), `${child}: bunting`);
      assert(mine.filter((s) => s.kind === 'spare').length === 3, `${child}: spares`);
    }
    assert(!all.some((s) => /&/.test(s.rendered)), 'no joint "Amara & Zak" stickers');
    const sheets = page.getByTestId('sticker-sheet');
    assert((await sheets.count()) === 2, 'two sheets');
    assert((await sheets.nth(0).innerText()).includes('Amara’s stickers') && !(await sheets.nth(0).innerText()).includes('Zak’s stickers'), 'sheet 1 is Amara’s');
    assert((await sheets.nth(1).innerText()).includes('Zak’s stickers'), 'sheet 2 is Zak’s');
    assert((await sheets.nth(0).innerText()).includes('Name stickers for Goal, Amara and Zak!'), 'joint header');
    assert((await page.getByTestId('sticker-status').innerText()).includes('a set for each of Amara and Zak'), 'status');
    noErrors(errors, 'siblings');
    await context.close();
  });

  await step('print: only the A4 portrait sheets, one PDF page each, and the 50 mm ruler measures 50 mm', async () => {
    for (const qs of ['name=Ava', 'names=Amara,Zak']) {
      const { page, context, errors } = await open(browser, { qs, viewport: VIEWPORTS.tablet });
      // The app also loads css/ar.css, whose @page is A4 landscape for the test pages.
      await page.addStyleTag({ url: `${BASE}/css/ar.css` });
      await page.emulateMedia({ media: 'print' });
      const layout = await page.evaluate(() => {
        const vis = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0 : false;
        };
        const sheet = document.querySelector('[data-testid=sticker-sheet]').getBoundingClientRect();
        const ruler = document.querySelector('[data-testid=sticker-ruler]');
        // The dark end blocks of the bar: first and last <rect>s drawn in the ink colour.
        const blocks = [...ruler.querySelectorAll('rect')].filter((r) => r.getAttribute('fill') === '#2B2A33' && Number(r.getAttribute('height')) > 2);
        const a = blocks[0].getBoundingClientRect();
        const b = blocks.at(-1).getBoundingClientRect();
        return {
          intro: vis('[data-testid=sticker-intro]'),
          bar: vis('[data-testid=harness-bar]'),
          sheets: document.querySelectorAll('[data-testid=sticker-sheet]').length,
          sheetPx: { w: sheet.width, h: sheet.height, x: sheet.left, y: sheet.top },
          barPx: b.right - a.left,
          rulerAt: { x: a.left - sheet.left, y: a.top - sheet.top },
        };
      });
      assert(!layout.intro && !layout.bar, 'the intro and the rest of the page are hidden in print');
      near(layout.sheetPx.w / PX_PER_MM, 210, 0.3, 'sheet width in print (mm)');
      near(layout.sheetPx.h / PX_PER_MM, 297, 0.3, 'sheet height in print (mm)');
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      if (SHOTS) writeFileSync(path.join(SHOTS, `stickers-${qs.replace(/\W+/g, '-')}.pdf`), pdf);
      const { count, boxes } = pdfPages(pdf);
      assert(count === layout.sheets, `PDF has one page per sheet: ${count} pages for ${layout.sheets} sheets`);
      assert(boxes.length >= 1 && boxes.every((b) => Math.abs(b.w - 595.28) < 1.5 && Math.abs(b.h - 841.89) < 1.5), `every page is A4 portrait: ${JSON.stringify(boxes)}`);
      // From the layout and the PDF's page size: the bar's share of the sheet × 210 mm.
      const pageMm = (boxes[0].w * 25.4) / 72;
      const fromLayout = (layout.barPx / layout.sheetPx.w) * pageMm;
      near(fromLayout, 50, 0.2, 'ruler length from the layout and the PDF page size (mm)');
      // And on the rendered PDF itself.
      const measured = await measureRulerInPdf(browser, pdf, { x: layout.rulerAt.x / PX_PER_MM, y: layout.rulerAt.y / PX_PER_MM, pictures: Boolean(SHOTS) });
      measured.pictures.forEach((url, i) => writeFileSync(path.join(SHOTS, `pdf-${qs.replace(/\W+/g, '-')}-page${i + 1}.png`), Buffer.from(url.split(',')[1], 'base64')));
      near(measured.pageW, 595.28, 1.5, 'rendered page width (pt)');
      assert(measured.barMm != null, 'found the ruler on the rendered page');
      near(measured.barMm, 50, 0.25, 'ruler length measured on the rendered PDF (mm)');
      console.log(`       ${qs}: ${count} page(s), ${boxes[0].w.toFixed(2)} × ${boxes[0].h.toFixed(2)} pt; ruler ${fromLayout.toFixed(2)} mm (layout), ${measured.barMm.toFixed(2)} mm (rendered PDF)`);
      noErrors(errors, `print ${qs}`);
      await context.close();
    }
  });

  await step('a bigger book makes bigger stickers (trimMm)', async () => {
    const { page, context } = await open(browser, { qs: 'name=Ava&trim=200' });
    await page.emulateMedia({ media: 'print' });
    const shirt = (await readStickers(page)).find((s) => s.label === 'Page 2 · shirt');
    near(shirt.mm.w, (176 + 2 * 0.16 * 42) * 0.62 * (400 / 1600), 0.2, 'page 2 shirt at a 200 mm trim');
    assert((await page.getByTestId('sticker-sheets').getAttribute('data-trim-mm')) === '200', 'trim recorded');
    await context.close();
  });

  await step('Print button: big, labelled, keyboard reachable, calls window.print()', async () => {
    const { page, context } = await open(browser, { qs: 'name=Ava', init: () => (window.print = () => (window.__printed = (window.__printed ?? 0) + 1)) });
    const btn = page.getByTestId('sticker-print');
    const box = await btn.boundingBox();
    assert(box.height >= 56, `button is at least 56 px tall (${box.height})`);
    assert((await btn.innerText()).trim() === 'Print', 'labelled Print');
    for (let i = 0; i < 5 && !(await btn.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press('Tab');
    assert(await btn.evaluate((b) => b === document.activeElement), 'reachable with Tab');
    await page.keyboard.press('Enter');
    assert((await page.evaluate(() => window.__printed)) === 1, 'Enter prints');
    // Screen readers: the sheets and stickers are labelled.
    const aria = await page.evaluate(() => ({
      sheet: document.querySelector('[data-testid=sticker-sheet]').getAttribute('aria-label'),
      sticker: document.querySelector('[data-testid=sticker]').getAttribute('aria-label'),
      role: document.querySelector('[data-testid=sticker]').getAttribute('role'),
      letter: document.querySelector('[data-testid=sticker][data-kind=letter]').getAttribute('aria-label'),
      status: document.querySelector('[data-testid=sticker-status]').getAttribute('role'),
    }));
    assert(aria.sheet === 'Sticker sheet 1 of 1' && aria.sticker === 'Ava' && aria.role === 'img' && aria.letter === 'A, flag 5' && aria.status === 'status', JSON.stringify(aria));
    // Without its own button (the app bar has one).
    await page.evaluate(() => window.__h.mount({ printButton: false }));
    assert((await page.getByTestId('sticker-print').count()) === 0, 'printButton: false');
    await context.close();
  });

  await step('cleanup removes the sheets and gives printing back', async () => {
    const { page, context } = await open(browser, { qs: 'name=Ava' });
    const before = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('st-printing'), page: document.querySelectorAll('style[data-sb-stickers-page]').length, path: document.querySelectorAll('.st-path').length }));
    assert(before.cls && before.page === 1 && before.path >= 2, `claimed while shown: ${JSON.stringify(before)}`);
    await page.evaluate(() => window.__h.cleanup());
    const after = await page.evaluate(() => ({ st: document.querySelectorAll('.st').length, cls: document.documentElement.classList.contains('st-printing'), page: document.querySelectorAll('style[data-sb-stickers-page]').length, path: document.querySelectorAll('.st-path').length, hidden: document.querySelectorAll('.st-hidden-render').length, css: document.querySelectorAll('link[data-sb-stickers-css]').length }));
    assert(after.st === 0 && !after.cls && after.page === 0 && after.path === 0 && after.hidden === 0, `released: ${JSON.stringify(after)}`);
    assert(after.css === 1, 'the stylesheet stays loaded (once)');
    // Mounting again doesn't add a second stylesheet.
    await page.evaluate(() => window.__h.mount());
    assert((await page.evaluate(() => document.querySelectorAll('link[data-sb-stickers-css]').length)) === 1, 'one stylesheet link');
    await context.close();
  });

  await step('fail soft: a missing picture, no pictures, and a browser that won’t sample colours', async () => {
    // Page 4's picture 404s: everything else still comes out, and the status says so.
    let r = await open(browser, { qs: 'name=Ava', routes: (p) => p.route('**/books/tiffin-football/scenes/p4.svg', (x) => x.fulfill({ status: 404, body: 'gone' })) });
    assert((await stateOf(r.page)) === 'ready', 'ready without page 4');
    const labels = (await readStickers(r.page)).map((s) => s.label);
    assert(!labels.some((l) => l.startsWith('Page 4')) && labels.includes('Page 5 · scoreboard'), 'page 4 skipped, page 5 there');
    assert((await r.page.getByTestId('sticker-status').innerText()).includes('Page 4 couldn’t be made'), 'status mentions page 4');
    await r.context.close();
    // No pictures at all: a message, and Print is disabled.
    r = await open(browser, { qs: 'name=Ava', routes: (p) => p.route('**/scenes/*.svg', (x) => x.fulfill({ status: 404, body: 'gone' })) });
    assert((await stateOf(r.page)) === 'error', 'error state');
    assert(/didn’t load/.test(await r.page.getByTestId('sticker-status').innerText()), 'explains');
    assert(await r.page.getByTestId('sticker-print').isDisabled(), 'Print disabled');
    await r.context.close();
    // Canvas reads blocked (privacy settings): plain colours from the name's own colour.
    r = await open(browser, {
      qs: 'name=Ava',
      init: () => {
        CanvasRenderingContext2D.prototype.getImageData = () => {
          throw new DOMException('blocked', 'SecurityError');
        };
      },
    });
    assert((await stateOf(r.page)) === 'ready', 'ready without sampling');
    const s = await readStickers(r.page);
    assert(s.find((x) => x.label === 'Page 5 · scoreboard').bg === '#2B2A33', 'yellow scoreboard name on a dark sticker');
    assert(s.find((x) => x.label === 'Page 2 · shirt').bg === '#FFFFFF', 'red shirt name on a white sticker');
    await r.context.close();
    // No name yet.
    r = await open(browser, { qs: 'name=%20' });
    assert((await stateOf(r.page)) === 'error' && /Add your child’s name/.test(await r.page.getByTestId('sticker-status').innerText()), 'asks for a name');
    await r.context.close();
  });

  await step('long names: 13 letters go on a banner across the bunting; the second book renders', async () => {
    let r = await open(browser, { qs: 'name=Maximilianoss' });
    const all = await readStickers(r.page);
    assert(all.some((s) => s.label === 'Page 3 · across the bunting' && s.rendered === 'Maximilianoss'), 'banner sticker');
    assert(!all.some((s) => s.kind === 'letter'), 'no letter stickers');
    await r.page.emulateMedia({ media: 'print' });
    assert((await readStickers(r.page)).every((s) => s.textInside), 'all inside');
    noErrors(r.errors, 'long name');
    await r.context.close();
    r = await open(browser, { qs: 'name=Ava&book=tiffin-digger' });
    assert((await stateOf(r.page)) === 'ready', 'Book 2 ready');
    assert((await readStickers(r.page)).length > 5, 'Book 2 has stickers');
    noErrors(r.errors, 'book 2');
    await r.context.close();
  });

  await step('layout: no sideways scrolling at 390×844, 844×390 and 1024×768 (screenshots when SHOTS is set)', async () => {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const { page, context } = await open(browser, { qs: 'names=Amara,Zak', viewport });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(over <= 0, `${vpName}: no horizontal scroll (${over}px)`);
      const sheetW = await page.getByTestId('sticker-sheet').first().evaluate((el) => el.getBoundingClientRect().width);
      assert(sheetW <= viewport.width - 24, `${vpName}: sheet fits (${sheetW})`);
      await context.close();
    }
    await shots(browser, 'ava', 'name=Ava');
    await shots(browser, 'siobhan', `name=${encodeURIComponent('Siobhán')}`);
    await shots(browser, 'oluwaseun', 'name=Oluwaseun');
    await shots(browser, 'anna-sophia', 'name=Anna-Sophia');
    await shots(browser, 'amara-zak', 'names=Amara,Zak');
  });
} finally {
  await browser.close();
  server.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
