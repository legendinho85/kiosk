// Assemble books/<id>/book.json from book.draft.json (story text) and
// pages/pN.json (per-page scene/mechanic details written by the illustrators),
// then validate it. Usage: node tools/build-book.mjs [bookId]
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { validateBook } from '../js/core/book.js';

const id = process.argv[2] ?? 'tiffin-football';
const dir = new URL(`../books/${id}/`, import.meta.url);
const book = JSON.parse(await readFile(new URL('book.draft.json', dir), 'utf8'));

const pagesDir = new URL('pages/', dir);
const files = existsSync(pagesDir) ? (await readdir(pagesDir)).filter((f) => /^p\d+\.json$/.test(f)) : [];
for (const f of files) {
  const n = Number(f.match(/\d+/)[0]);
  const page = book.pages.find((p) => p.n === n);
  if (!page) throw new Error(`${f}: no page ${n} in the draft`);
  const patch = JSON.parse(await readFile(new URL(f, pagesDir), 'utf8'));
  // Story text lives in the draft; fragments may only add presentation details.
  for (const key of ['text', 'prompt', 'after', 'n', 'kind']) delete patch[key];
  Object.assign(page, patch);
}

const errors = validateBook(book);
await writeFile(new URL('book.json', dir), `${JSON.stringify(book, null, 2)}\n`);
console.log(`Wrote books/${id}/book.json (${files.length} page fragment(s) merged)`);
if (errors.length) {
  console.error(`Validation problems:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
}
