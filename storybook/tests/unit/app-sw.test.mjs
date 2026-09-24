// The offline service worker (sw.js) must precache every file the app can
// load, and nothing that doesn't exist: a family that opened the app once
// should be able to read, play the letter game and print stickers offline.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const list = /const PRECACHE = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
const PRECACHE = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);

function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...walk(rel, ext));
    else if (name.endsWith(ext)) out.push(rel);
  }
  return out;
}

test('the precache list parses and has no duplicates', () => {
  assert.ok(PRECACHE.length > 50, `found ${PRECACHE.length} entries`);
  assert.equal(new Set(PRECACHE).size, PRECACHE.length, 'no duplicates');
  assert.match(src, /const VERSION = 'v[\d.]+-\d+';/);
});

test('every precached file exists', () => {
  for (const file of PRECACHE.filter((f) => f !== './')) assert.ok(existsSync(path.join(ROOT, file)), `${file} is missing`);
});

test('every module, stylesheet and font is precached', () => {
  const want = [...walk('js', '.js'), ...walk('css', '.css'), ...walk('fonts', '.woff2')];
  const missing = want.filter((f) => !PRECACHE.includes(f));
  assert.deepEqual(missing, [], 'add these to PRECACHE in sw.js');
});

test('every book on the shelf is precached: book, shared art and every page', () => {
  const { books } = JSON.parse(readFileSync(path.join(ROOT, 'books/index.json'), 'utf8'));
  assert.ok(books.some((b) => b.id === 'tiffin-digger'), 'Book 2 is on the shelf');
  for (const { id } of books) {
    const book = JSON.parse(readFileSync(path.join(ROOT, `books/${id}/book.json`), 'utf8'));
    const files = [`books/${id}/book.json`, `books/${id}/${book.defs ?? 'defs.svg'}`, ...new Set(book.pages.map((p) => `books/${id}/${p.scene}`))];
    for (const f of files) assert.ok(PRECACHE.includes(f), `${f} precached`);
  }
});

test('the app shell pieces are precached', () => {
  for (const f of ['./', 'index.html', 'manifest.webmanifest', 'data/names.json', 'books/index.json', 'icons/icon.svg']) assert.ok(PRECACHE.includes(f), f);
});
