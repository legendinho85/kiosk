#!/usr/bin/env node
// Print-ready QR codes for the back covers of the books.
//
//   node tools/make-qr.mjs --base https://example.com/app/ [--book tiffin-football] [--out print/]
//   node tools/make-qr.mjs --url HTTPS://MHAPPY.UK/B1 --book tiffin-football --out print/
//
// Writes <out>/<book>-qr.svg: error correction "Q" (survives ~25% damage:
// scuffs, sticky fingers, glare), a 4-module quiet zone, pure black #000000 on
// white, sized in millimetres. See tools/README.md for size, testing and why
// the printed link should be a short redirect you control.

import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { qrSvg, qrMatrix, landingUrlFor, displayUrl, printedSizeMm } from '../js/ar/qr.js';

const HELP = `Make print-ready QR codes (SVG, sized in mm) for the books' back covers.

Usage:
  node tools/make-qr.mjs --base <app URL> [options]
  node tools/make-qr.mjs --url <exact link> --book <id> [options]

Options:
  --base <url>       where the app is hosted, e.g. https://example.com/app/
                     (the code opens <base>?b=<book>, or <base>b/<book> with --style path)
  --url <url>        encode this exact link instead, e.g. your short redirect HTTPS://MHAPPY.UK/B1
                     (UPPER-CASE letters, digits and : / . - fit QR's compact mode)
  --book <id>        one book (default: every book in books/index.json)
  --out <dir>        output folder (default: print/)
  --style <s>        query (default) or path
  --ecl <L|M|Q|H>    error correction (default: Q)
  --module-mm <n>    size of one module in mm (default: 0.75; never below 0.6)
  --help             show this help
`;

// Everything a warning needs to know, kept pure for easy checking.
export function adviceFor({ url, size, moduleMm, margin }) {
  const notes = [];
  const mm = printedSizeMm(size, { margin, moduleMm });
  if (!/^https:\/\//i.test(url)) notes.push('The link is not https. Phones will open it, but the camera, microphone and "add to home screen" need https.');
  if (/[?&](name|child|kid)=/i.test(url)) notes.push('The link looks like it carries a name. Printed codes must only identify the book.');
  if (url.length > 32 || /\?/.test(url)) notes.push('This is a long link. Print a short redirect you control (e.g. HTTPS://YOURDOMAIN.UK/B1) so the code is smaller and the app can move without reprinting.');
  if (moduleMm < 0.6) notes.push(`Modules of ${moduleMm} mm are too small for reliable scanning; use at least 0.6-0.75 mm.`);
  if (mm < 20) notes.push(`At ${mm} mm across the code is small; aim for 20-25 mm or more including the quiet zone.`);
  return { mm, notes };
}

function fail(message) {
  console.error(`make-qr: ${message}\n\n${HELP}`);
  process.exit(1);
}

/** Treat "https://host/app" as the folder "https://host/app/" (a trailing name without a dot). */
export function asFolderUrl(base) {
  const u = new URL(base);
  if (!u.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(u.pathname)) u.pathname += '/';
  u.search = '';
  u.hash = '';
  return u;
}

async function bookIds(root) {
  try {
    const list = JSON.parse(await readFile(path.join(root, 'books', 'index.json'), 'utf8'));
    return (list.books ?? []).map((b) => b.id).filter(Boolean);
  } catch {
    return [];
  }
}

async function main(argv) {
  let args;
  try {
    ({ values: args } = parseArgs({
      args: argv,
      options: {
        base: { type: 'string' },
        url: { type: 'string' },
        book: { type: 'string' },
        out: { type: 'string', default: 'print/' },
        style: { type: 'string', default: 'query' },
        ecl: { type: 'string', default: 'Q' },
        'module-mm': { type: 'string', default: '0.75' },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    }));
  } catch (err) {
    fail(err.message);
  }
  if (args.help) {
    console.log(HELP);
    return;
  }
  const ecl = String(args.ecl).toUpperCase();
  if (!['L', 'M', 'Q', 'H'].includes(ecl)) fail('--ecl must be L, M, Q or H');
  if (!['query', 'path'].includes(args.style)) fail('--style must be query or path');
  const moduleMm = Number(args['module-mm']);
  if (!(moduleMm > 0)) fail('--module-mm must be a positive number');
  if (!args.base && !args.url) fail('give --base <app URL> (or --url <exact link>)');

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const jobs = [];
  if (args.url) {
    try {
      new URL(args.url);
    } catch {
      fail(`--url is not a valid URL: ${args.url}`);
    }
    jobs.push({ id: args.book ?? 'book', url: args.url });
  } else {
    let base;
    try {
      base = asFolderUrl(args.base);
    } catch {
      fail(`--base is not a valid URL: ${args.base}`);
    }
    const ids = args.book ? [args.book] : await bookIds(root);
    if (!ids.length) fail('no books found (books/index.json); pass --book <id>');
    for (const id of ids) {
      if (!/^[a-z0-9-]+$/.test(id)) fail(`book ids are kebab-case: ${id}`);
      const url = args.style === 'path' ? new URL(`b/${id}`, base).href : landingUrlFor(id, base);
      jobs.push({ id, url });
    }
  }

  const outDir = path.resolve(process.cwd(), args.out);
  await mkdir(outDir, { recursive: true });
  const margin = 4;
  for (const { id, url } of jobs) {
    const m = qrMatrix(url, { ecl });
    const svg = qrSvg(url, { ecl, margin, moduleSize: moduleMm, units: 'mm', dark: '#000000', light: '#FFFFFF', title: `QR code: ${displayUrl(url)}` });
    const file = path.join(outDir, `${id}-qr.svg`);
    await writeFile(file, `${svg}\n`);
    const { mm, notes } = adviceFor({ url, size: m.size, moduleMm, margin });
    console.log(`${path.relative(process.cwd(), file) || file}`);
    console.log(`  opens     ${url}`);
    console.log(`  code      version ${m.version}, ${m.size} x ${m.size} modules, level ${m.ecl}, ${m.mode.toLowerCase()} mode`);
    console.log(`  printed   ${mm} x ${mm} mm including the quiet zone (${moduleMm} mm per module)`);
    console.log(`  print it  100% black (K only) on white; put "${displayUrl(url)}" beside it in words`);
    for (const n of notes) console.log(`  note      ${n}`);
  }
}

// Run only when executed directly (the helpers above are importable for tests).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`make-qr: ${err.message}`);
    process.exit(1);
  });
}
