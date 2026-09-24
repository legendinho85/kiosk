import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// index.html modulepreloads every module the first screen needs (js/main.js
// and its static imports), so a slow phone fetches them in parallel instead
// of one import level at a time. Screens loaded on demand stay out.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm;

function staticGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of src.matchAll(IMPORT)) walk(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1] ?? m[2])));
  };
  walk(entry);
  return seen;
}

const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const preloaded = new Set([...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]));

test('index.html modulepreloads every module the first screen imports', () => {
  const graph = staticGraph('js/main.js');
  const missing = [...graph].filter((f) => !preloaded.has(f));
  assert.deepEqual(missing, [], 'add these to index.html');
});

test('modulepreloads point at real files, and on-demand screens are not preloaded', () => {
  for (const href of preloaded) assert.ok(existsSync(path.join(ROOT, href)), `${href} exists`);
  const graph = staticGraph('js/main.js');
  const extra = [...preloaded].filter((f) => !graph.has(f));
  assert.deepEqual(extra, [], 'preloaded but not imported by the first screen (loaded on demand?)');
  for (const lazy of ['js/app/screens/settings.js', 'js/app/screens/record.js', 'js/app/screens/gift.js', 'js/family/pack.js', 'js/app/screens/pronunciation.js']) {
    assert.ok(!graph.has(lazy), `${lazy} loads when its screen opens, not with the first screen`);
  }
});

test('the reader and magic-window styles are not render-blocking in index.html', () => {
  assert.ok(!/<link rel="stylesheet" href="css\/(reader|ar)\.css"/.test(html));
  const main = readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  assert.ok(main.includes("withStyles('css/reader.css')"), 'the reader waits for its styles');
});
