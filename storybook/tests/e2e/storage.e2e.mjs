// Browser test for js/core/storage.js with real IndexedDB (Playwright's Chromium):
//   node tests/e2e/storage.e2e.mjs     (PORT=8162 by default)
// "Forget everything" must really delete the recordings before it says so, even
// while the app (in this tab or another) holds the database open, and recordings
// made straight afterwards must save, never hang.
// Starts and stops its own static server. Exits non-zero on any failure.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 8162);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
async function step(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  FAIL ${name}\n       ${String(err?.stack ?? err).split('\n').slice(0, 4).join('\n       ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// The server gets its own process group, stopped however the test ends.
function stopServer(proc) {
  if (!proc || proc.__stopped) return;
  proc.__stopped = true;
  try {
    if (process.platform === 'win32') proc.kill();
    else process.kill(-proc.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}
async function startServer() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const proc = spawn(npx, ['--yes', 'http-server', ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore', detached: process.platform !== 'win32' });
  const bail = () => stopServer(proc);
  process.once('exit', bail);
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => (bail(), process.exit(130)));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/package.json`);
      if (r.ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  stopServer(proc);
  throw new Error(`http-server did not start on ${PORT}`);
}

// A blank page on the app's origin, with storage.js loaded as window.S.
const BLANK = `${BASE}/__storage.html`;
async function openPage(context) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(BLANK, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>storage</title><script type="module">window.S = await import("/js/core/storage.js"); window.__ready = true;</script>' }));
  await page.goto(BLANK);
  await page.waitForFunction(() => window.__ready === true);
  return { page, errors };
}
/** What a fresh connection (not the app's) finds in the recordings store. */
const peek = (page, id) =>
  page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const req = indexedDB.open('starring');
        let none = false;
        req.onupgradeneeded = () => {
          // Nothing there: don't leave an empty database behind by looking.
          none = true;
          req.transaction.abort();
        };
        req.onsuccess = () => {
          const db = req.result;
          try {
            const get = db.transaction('recordings').objectStore('recordings').get(id);
            get.onsuccess = () => resolve(get.result ? 'there' : 'gone');
            get.onerror = () => resolve('error');
          } catch (e) {
            resolve(`no store (${e.name})`);
          }
          db.close();
        };
        req.onerror = () => resolve(none ? 'no database' : 'open error');
        setTimeout(() => resolve('open pending'), 4000);
      }),
    id,
  );

const server = await startServer();
const browser = await chromium.launch();
console.log(`storage e2e on ${BASE}`);
try {
  await step('forget everything deletes the recordings while the app holds the database open', async () => {
    const context = await browser.newContext();
    const { page, errors } = await openPage(context);
    const r = await page.evaluate(async () => {
      await S.blobs.put('rec_1', new Blob(['secret voice'], { type: 'audio/wav' }));
      await S.blobs.get('rec_1');
      const t0 = performance.now();
      const res = await S.forgetEverything();
      return { res, ms: Math.round(performance.now() - t0) };
    });
    eq(r.res, { recordings: 'deleted' }, 'the database is really gone before "Done"');
    assert(r.ms < 2000, `quick (${r.ms} ms)`);
    // A fresh look finds nothing.
    eq(await peek(page, 'rec_1'), 'no database', 'nothing left on the device');
    // The parent sets up again straight away: the new recording saves and reads back.
    const again = await page.evaluate(async () => {
      const t0 = performance.now();
      await S.blobs.put('rec_2', new Blob(['new'], { type: 'audio/wav' }));
      const ms = Math.round(performance.now() - t0);
      return { ms, text: await (await S.blobs.get('rec_2'))?.text() };
    });
    assert(again.ms < 1500 && again.text === 'new', `a recording after forgetting saves at once (${JSON.stringify(again)})`);
    eq(await peek(page, 'rec_2'), 'there', 'and it is really stored');
    eq(errors, [], 'no page errors');
    await context.close();
  });

  await step('another tab of the app lets go of the database when this one forgets', async () => {
    const context = await browser.newContext();
    const a = await openPage(context);
    const b = await openPage(context);
    await b.page.evaluate(async () => {
      await S.blobs.put('rec_b', new Blob(['from tab b']));
      await S.blobs.get('rec_b');
    });
    const res = await a.page.evaluate(() => S.forgetEverything());
    eq(res, { recordings: 'deleted' }, 'not blocked by the other tab');
    // Tab B carries on: its next save opens a fresh connection.
    const text = await b.page.evaluate(async () => {
      await S.blobs.put('rec_b2', new Blob(['still works']));
      return (await S.blobs.get('rec_b2'))?.text();
    });
    eq(text, 'still works', 'the other tab still saves');
    await context.close();
  });

  await step('an old tab that never lets go: recordings are wiped anyway, and nothing hangs', async () => {
    const context = await browser.newContext();
    const a = await openPage(context);
    await a.page.evaluate(() => S.blobs.put('rec_old', new Blob(['old'])));
    // An old version of the app in another tab: a connection with no versionchange handler.
    const b = await openPage(context);
    await b.page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('starring');
          req.onsuccess = () => {
            window.__stuck = req.result;
            resolve();
          };
        }),
    );
    const r = await a.page.evaluate(async () => {
      const t0 = performance.now();
      const res = await S.forgetEverything({ timeoutMs: 1500 });
      return { res, ms: Math.round(performance.now() - t0) };
    });
    eq(r.res, { recordings: 'blocked' }, 'reported honestly');
    assert(r.ms < 3000, `does not hang (${r.ms} ms)`);
    const inOldTab = await b.page.evaluate(
      () =>
        new Promise((resolve) => {
          const get = window.__stuck.transaction('recordings').objectStore('recordings').get('rec_old');
          get.onsuccess = () => resolve(get.result ? 'there' : 'gone');
        }),
    );
    eq(inOldTab, 'gone', 'the recording was wiped even though the database could not be deleted yet');
    // A new recording while the delete waits: saved in memory for this visit, never stuck on "Tidying up…".
    const save = await a.page.evaluate(async () => {
      const t0 = performance.now();
      await S.blobs.put('rec_new', new Blob(['new']));
      return { ms: Math.round(performance.now() - t0), text: await (await S.blobs.get('rec_new'))?.text() };
    });
    assert(save.ms < 4500 && save.text === 'new', `a recording made meanwhile still finishes (${JSON.stringify(save)})`);
    // The old tab closes: the delete goes through.
    await b.page.evaluate(() => window.__stuck.close());
    await a.page.waitForTimeout(300);
    const after = await a.page.evaluate(async () => {
      await S.blobs.put('rec_later', new Blob(['later']));
      return (await S.blobs.get('rec_later'))?.text();
    });
    eq(after, 'later', 'saving works normally afterwards');
    await context.close();
  });

  await step('no IndexedDB (private mode, old browser): memory only, forgetting still works', async () => {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    const { page } = await openPage(context);
    const r = await page.evaluate(async () => {
      await S.blobs.put('m', new Blob(['mem']));
      const before = await (await S.blobs.get('m'))?.text();
      const res = await S.forgetEverything();
      return { before, res, after: await S.blobs.get('m') };
    });
    eq(r, { before: 'mem', res: { recordings: 'none' }, after: null }, 'memory fallback');
    await context.close();
  });
} finally {
  await browser.close().catch(() => {});
  stopServer(server);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} storage e2e checks passed`);
process.exit(failed.length ? 1 : 0);
