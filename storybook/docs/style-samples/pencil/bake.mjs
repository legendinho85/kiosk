#!/usr/bin/env node
// Bake a book's pages with the pencil & crayon treatment to JPEG/PNG files.
//
//   node docs/style-samples/pencil/bake.mjs --book tiffin-football --pages all --out /tmp/baked \
//        [--name Ava] [--mode screen|print] [--width 2550] [--format jpeg|png] [--quality 85]
//        [--port 8171] [--opts '{"strokes":{"angle":-40}}'] [--svg]   (--svg also saves the treated SVG)
//
// Each page is loaded with the app's own code (js/reader/scene.js), put in its
// rest state the way the printable pages do it (js/ar/print.js
// prepareRestState: moving parts at their start, pop-ins hidden), the name is
// written in with js/reader/name-fit.js (so long names shrink and bunting
// letters are handed out exactly as in the app), and only then is the scene
// treated and rasterised. Seeds differ per page (seed = 100 + page number).
//
// Needs Playwright with its Chromium (as preinstalled here). Starts its own
// http-server on --port and stops it afterwards. Does not modify the book.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), []),
);
const bookId = args.book ?? 'tiffin-football';
const outDir = path.resolve(args.out ?? 'baked');
const width = Number(args.width ?? 1600);
const mode = args.mode ?? 'screen';
const format = args.format ?? 'jpeg';
const quality = Number(args.quality ?? 85);
const port = Number(args.port ?? 8171);
const name = args.name && args.name !== true ? String(args.name) : null;
const extra = args.opts ? JSON.parse(args.opts) : {};
const playwrightPath = args.playwright ?? '/opt/node22/lib/node_modules/playwright/index.mjs';

const book = JSON.parse(fs.readFileSync(path.join(ROOT, 'books', bookId, 'book.json'), 'utf8'));
const pages = args.pages && args.pages !== 'all' ? String(args.pages).split(',').map(Number) : book.pages.map((p) => p.n);
fs.mkdirSync(outDir, { recursive: true });

const { chromium } = await import(playwrightPath);
const serverBin = path.join(path.dirname(process.execPath), 'http-server');
const server = spawn(fs.existsSync(serverBin) ? serverBin : 'http-server', [ROOT, '-p', String(port), '-c-1', '-s'], { detached: true, stdio: 'ignore' });
const stopServer = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stopServer);
await new Promise((r) => setTimeout(r, 800));

const height = Math.round(width / 1.6);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/fonts.css">
<style>html,body{margin:0;background:#fff}#work{position:absolute;left:0;top:0;width:1600px;height:1000px;visibility:hidden}#out svg{display:block;width:${width}px;height:${height}px}</style></head>
<body><div id="out"></div><div id="work"></div><div style="position:absolute;left:-999px;font:700 20px Fredoka">Aa</div></body></html>`;
  await page.route(`http://localhost:${port}/__bake/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(`http://localhost:${port}/__bake/index.html`);
  await page.evaluate(async () => { await document.fonts.load('700 60px Fredoka'); await document.fonts.ready; });

  for (const n of pages) {
    const bookPage = book.pages.find((p) => p.n === n);
    if (!bookPage) { console.warn(`no page ${n}`); continue; }
    const t0 = Date.now();
    const svgText = await page.evaluate(async ({ bookId, bookPage, name, mode, extra }) => {
      const scene = await import('/js/reader/scene.js');
      const drive = await import('/js/reader/drive.js');
      const { prepareRestState } = await import('/js/ar/print.js');
      const { fillNameSlots } = await import('/js/reader/name-fit.js');
      const { treatScene } = await import('/docs/style-samples/pencil/treatment.js');
      const base = `/books/${bookId}/`;
      const bookJson = await (await fetch(`${base}book.json`)).json();
      const svg = await scene.loadScene(bookJson, bookPage, base);
      const work = document.getElementById('work');
      work.replaceChildren(svg);
      svg.setAttribute('width', '1600');
      svg.setAttribute('height', '1000');
      prepareRestState(svg, bookPage, { drive, scene });
      if (name) {
        fillNameSlots(svg, { display: name }, { animate: false });
        for (const el of svg.querySelectorAll('.sb-print-only')) el.remove();
      }
      if (mode === 'print') {
        for (const el of svg.querySelectorAll('.sb-digital')) el.remove();
        // A named printed book shows what the app reveals at the end (e.g. the bunting letters).
        if (name) for (const el of svg.querySelectorAll('[data-reveal]')) el.removeAttribute('display');
      }
      if (mode === 'screen') for (const el of svg.querySelectorAll('.sb-print-only')) el.remove();
      const defsText = await (await fetch(`${base}${bookJson.defs}`)).text();
      const out = treatScene(new XMLSerializer().serializeToString(svg), defsText, { seed: 100 + bookPage.n, ...extra });
      work.replaceChildren();
      return out;
    }, { bookId, bookPage, name, mode, extra });
    await page.evaluate((s) => { document.getElementById('out').innerHTML = s; }, svgText);
    if (args.svg) fs.writeFileSync(path.join(outDir, `p${n}.svg`), svgText);
    const file = path.join(outDir, `p${n}.${format === 'png' ? 'png' : 'jpg'}`);
    await page.locator('#out svg').screenshot({ path: file, type: format === 'png' ? 'png' : 'jpeg', ...(format === 'png' ? {} : { quality }) });
    console.log(`${file}  ${Math.round(fs.statSync(file).size / 1024)} KB  ${Date.now() - t0} ms`);
  }
} finally {
  await browser.close();
  stopServer();
}
