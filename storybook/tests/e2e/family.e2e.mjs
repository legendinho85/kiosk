// Browser test for the family features (docs/architecture.md §11): a
// grandparent records a reading with the (fake) microphone and sends it as a
// family pack; the family opens it, the reader plays it, and it is saved as
// one WAV for a Yoto card; a gift is set up, wrapped and opened; siblings read
// together; a long name gets a nickname; online-voice consent; the "open in
// your browser" hint; settings for recordings. Runs in Playwright's Chromium
// with ?test=1 (silent computer voice) and a fake microphone.
//
//   node tests/e2e/family.e2e.mjs                   (PORT=8123 by default)
//   SHOTS=/some/dir node tests/e2e/family.e2e.mjs    also screenshots the new screens at 390×844, 844×390 and 1024×768
//   ONLY=gift node tests/e2e/family.e2e.mjs          run only steps whose name contains "gift"
//
// Starts and stops its own static server (in its own process group, killed
// however the script ends). Exits non-zero on any failure.

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 8123);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const BOOK = 'tiffin-football';
const PHONE = { width: 390, height: 844 };
const TMP = mkdtempSync(path.join(tmpdir(), 'family-e2e-'));

// ---- tiny runner --------------------------------------------------------------------
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
    if (SHOTS && lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: path.join(SHOTS, `FAILED-family-${results.length}.png`) }).catch(() => {});
    console.log(`  FAIL ${name}\n       ${String(err?.stack ?? err).split('\n').slice(0, 6).join('\n       ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- server (own process group, always killed) ------------------------------------------
async function startServer() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const groups = process.platform !== 'win32';
  const proc = spawn(npx, ['--yes', 'http-server', ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore', detached: groups });
  let stopped = false;
  proc.stop = (signal = 'SIGTERM') => {
    if (stopped) return;
    stopped = true;
    try {
      if (groups) process.kill(-proc.pid, signal);
      else proc.kill(signal);
    } catch {
      try {
        proc.kill(signal);
      } catch {
        /* already gone */
      }
    }
  };
  process.on('exit', () => {
    proc.stop('SIGKILL');
    rmSync(TMP, { recursive: true, force: true });
  });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(sig, () => {
      proc.stop('SIGKILL');
      process.exit(130);
    });
  }
  process.once('uncaughtException', (err) => {
    console.error(err);
    proc.stop('SIGKILL');
    process.exit(1);
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/package.json`);
      if (r.ok) return proc;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  proc.stop();
  throw new Error(`http-server did not start on ${PORT}`);
}

// ---- pages -------------------------------------------------------------------------------
const kid = (id, display, say = display, extra = {}) => ({
  id,
  display,
  key: display.toLowerCase(),
  pronunciation: { say, ipa: '', respell: '', label: '', source: 'as-written', useRecording: false, recordingId: null },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

/**
 * A fresh browser context + page with error capture.
 * @param {{viewport?: object, seed?: object|null, hooks?: object|null, init?: string|Function|null}} [opts]
 */
async function openPage(browser, { viewport = PHONE, seed = null, hooks = null, init = null } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: SHOTS ? 2 : 1, permissions: ['microphone', 'camera'], acceptDownloads: true });
  const page = await context.newPage();
  lastPage = page;
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${m.text()} (${m.location()?.url ?? ''})`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  if (seed || hooks) {
    await page.addInitScript(([state, extra]) => {
      if (extra) globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), ...extra };
      if (state && !sessionStorage.getItem('e2e-seeded')) {
        sessionStorage.setItem('e2e-seeded', '1');
        localStorage.setItem('starring.v1', JSON.stringify(state));
      }
    }, [seed, hooks]);
  }
  if (init) await page.addInitScript(init);
  return { context, page, errors };
}

const url = (hash = '') => `${BASE}/?test=1${hash}`;
const hashOf = (page) => page.evaluate(() => location.hash);
const stateOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('starring.v1') ?? 'null'));
const blobKeys = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('starring', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('recordings');
        req.onsuccess = () => {
          try {
            const t = req.result.transaction('recordings', 'readonly').objectStore('recordings').getAllKeys();
            t.onsuccess = () => resolve(t.result.map(String));
            t.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        };
        req.onerror = () => resolve([]);
      }),
  );
async function waitHash(page, want, timeout = 6000) {
  await page.waitForFunction((h) => location.hash === h, want, { timeout }).catch(async () => {
    throw new Error(`expected hash ${want}, got ${await hashOf(page)}`);
  });
}
function noErrors(errors, where) {
  assert(errors.length === 0, `console errors on ${where}:\n  ${errors.join('\n  ')}`);
}
async function shot(page, name, { full = false } = {}) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  const vp = page.viewportSize();
  await page.screenshot({ path: path.join(SHOTS, `${name}-${vp.width}x${vp.height}.png`), fullPage: full });
}
async function holdGate(page, ms = 400) {
  const box = await page.getByTestId('parent-gate').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
/** Record one part on the record screen with the fake microphone (about a second). */
async function recordPart(page, ms = 1100) {
  await page.getByTestId('rec-start').click();
  await page.getByTestId('rec-stop').waitFor({ timeout: 8000 });
  await page.waitForTimeout(ms);
  await page.getByTestId('rec-stop').click();
  await page.getByTestId('rec-next').waitFor({ timeout: 12000 });
}
/** Click something that downloads a file; returns {name, bytes}. */
async function download(page, testid, file) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByTestId(testid).click()]);
  const where = path.join(TMP, file ?? dl.suggestedFilename());
  await dl.saveAs(where);
  return { name: dl.suggestedFilename(), path: where, bytes: readFileSync(where) };
}

// A speech engine with only online (Google) voices: the app must ask before using them.
const ONLINE_ONLY_SPEECH = () => {
  const voices = [['Google UK English Female', 'en-GB'], ['Google US English', 'en-US']].map(([name, lang]) => ({ name, lang, voiceURI: name, localService: false, default: false }));
  class Utterance extends EventTarget {
    constructor(text = '') {
      super();
      Object.assign(this, { text, voice: null, lang: '', rate: 1, pitch: 1, volume: 1 });
    }
  }
  const synth = Object.assign(new EventTarget(), {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    speak(u) {
      setTimeout(() => {
        u.onstart?.(new Event('start'));
        u.onend?.(new Event('end'));
      }, 20);
    },
    cancel() {},
    pause() {},
    resume() {},
  });
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
};

// ---- tests -------------------------------------------------------------------------------
const server = await startServer();
let browser;
try {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
} catch (err) {
  server.stop();
  throw err;
}
console.log(`family e2e on ${BASE}${SHOTS ? ` (screenshots in ${SHOTS})` : ''}`);

let readingPack = null; // the file Grandma sends
let giftPack = null; // the file Auntie Jo sends

try {
  // ===== 1. Grandma records a reading on her own phone ======================================
  {
    const { page, errors, context } = await openPage(browser, { seed: { profiles: [kid('child_ava', 'Ava')], activeProfileId: 'child_ava', settings: {}, lastBook: BOOK } });

    await step('record: who is reading, then a big teleprompter with the name filled in', async () => {
      await page.goto(url(`#/b/${BOOK}`));
      await page.getByTestId('go-record').click();
      await waitHash(page, `#/b/${BOOK}/record`);
      eq(await page.getByTestId('record-child').inputValue(), 'Ava', 'reading to the active child');
      await page.getByTestId('record-begin').click();
      await page.getByTestId('record-error').waitFor();
      assert(/your name/.test(await page.getByTestId('record-error').innerText()), 'asks for the reader’s name');
      await page.getByTestId('reader-name').fill('Grandma Rose');
      await shot(page, 'family-record-setup');
      await page.getByTestId('record-begin').click();
      await page.getByTestId('teleprompter').waitFor();
      const lines = await page.getByTestId('teleprompter').innerText();
      assert(/Goal, Ava!/.test(lines) && /Starring Tiffin the otter… and Ava!|Starring Tiffin the otter\.\.\. and Ava!/.test(lines), `cover lines: ${lines}`);
      eq(await page.locator('.tp-name').count(), 2, 'the name picked out twice');
      eq(await page.getByTestId('rec-step').count(), 14, 'every page part');
      assert(/0 of 14 parts/.test(await page.getByTestId('rec-progress').innerText()), 'progress');
      await shot(page, 'family-record-step');
    });

    await step('record: record / stop / listen / redo / next through two pages (fake microphone)', async () => {
      await page.getByTestId('rec-start').click();
      await page.getByTestId('rec-stop').waitFor({ timeout: 8000 });
      await page.waitForFunction(() => /0:0\d \/ 1:00/.test(document.querySelector('[data-testid=rec-clock]')?.textContent ?? ''));
      await page.waitForTimeout(1100);
      await shot(page, 'family-record-recording');
      await page.getByTestId('rec-stop').click();
      await page.getByTestId('rec-next').waitFor({ timeout: 12000 });
      assert(/Got it/.test(await page.getByTestId('rec-status').innerText()), 'status after recording');
      await page.getByTestId('rec-listen').click();
      await page.waitForFunction(() => !document.querySelector('[data-testid=rec-listen].is-playing'), null, { timeout: 8000 });
      await shot(page, 'family-record-done');
      // Redo replaces the take.
      await page.getByTestId('rec-redo').click();
      await page.getByTestId('rec-stop').waitFor({ timeout: 8000 });
      await page.waitForTimeout(900);
      await page.getByTestId('rec-stop').click();
      await page.getByTestId('rec-next').waitFor({ timeout: 12000 });
      await page.getByTestId('rec-next').click();
      assert(/Where is Ava's shirt\?/.test(await page.getByTestId('teleprompter').innerText()), 'page 2 with the name, singular');
      assert(await page.locator('.tp-prompt', { hasText: 'Lift the flap' }).count(), 'the prompt is marked as their turn');
      await recordPart(page);
      await page.getByTestId('rec-next').click();
      eq(await page.getByTestId('tp-title').textContent(), 'Page 2, after your listener lifts the flap', 'the after part');
      await recordPart(page);
      assert(/3 of 14 parts/.test(await page.getByTestId('rec-progress').innerText()), 'three parts recorded');
      const st = await stateOf(page);
      eq(st.readings.length, 1, 'saved as it goes');
      eq(st.readings[0].readerName, 'Grandma Rose', 'reader name');
      eq(Object.keys(st.readings[0].parts).sort(), ['1', '2'], 'pages 1 and 2');
      const keys = await blobKeys(page);
      eq(keys.filter((k) => k.startsWith(st.readings[0].id)).length, 3, 'three recordings stored');
    });

    await step('record: finish -> saved and active; "Send to family" downloads a family pack', async () => {
      await page.getByTestId('rec-finish').click();
      await page.getByTestId('record-done').waitFor();
      assert(/Thank you, Grandma Rose!/.test(await page.locator('h1').innerText()), 'thank you');
      assert(/stays on this phone unless you send it/.test(await page.getByTestId('record-done').innerText()), 'privacy explained');
      const st = await stateOf(page);
      eq(st.activeReading[BOOK], st.readings[0].id, 'the reading is now the one played');
      await shot(page, 'family-record-finished', { full: true });
      readingPack = await download(page, 'rec-send');
      eq(readingPack.name, `${BOOK}-Grandma-Rose.starring.json`, 'pack filename');
      const pack = JSON.parse(readingPack.bytes.toString('utf8'));
      eq([pack.format, pack.version, pack.kind, pack.bookId, pack.readerName], ['starring-pack', 1, 'reading', BOOK, 'Grandma Rose'], 'pack header');
      eq(Object.keys(pack.parts), ['1', '2'], 'pack pages');
      assert(pack.parts['2'].after.mime === 'audio/wav' && pack.parts['2'].after.data.length > 1000, 'audio inside');
      eq(pack.child?.display, 'Ava', 'who it was recorded for');
    });

    await step('record: "Play it now" plays Grandma’s voice in the reader', async () => {
      await page.getByTestId('rec-play-now').click();
      await waitHash(page, `#/b/${BOOK}/read/1`);
      await page.getByTestId('reader').waitFor({ timeout: 8000 });
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^=reading-badge]')].some((b) => !b.hidden && /Grandma Rose/.test(b.textContent)), null, { timeout: 8000 });
      noErrors(errors, 'recording');
    });

    await step('forget everything removes the reading and its recordings', async () => {
      await page.evaluate(() => (globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), gateMs: 150 }));
      await page.goto(url('#/settings'));
      await page.getByTestId('parent-gate').waitFor();
      await holdGate(page, 400);
      await page.getByTestId('forget-everything').click();
      await page.getByTestId('confirm-forget-yes').click();
      await page.getByTestId('name-input').waitFor();
      eq(await stateOf(page), null, 'nothing stored');
      await page.waitForTimeout(300);
      eq((await blobKeys(page)).length, 0, 'no recordings left');
    });
    await context.close();
  }

  // ===== 2. The family opens Grandma's file ======================================================
  {
    const { page, errors, context } = await openPage(browser);

    await step('open: a damaged or wrong file gets a friendly message', async () => {
      await page.goto(url(`#/b/${BOOK}`));
      await page.getByTestId('open-pack').click();
      await waitHash(page, '#/open');
      await page.getByTestId('pack-file').setInputFiles({ name: 'photo.json', mimeType: 'application/json', buffer: Buffer.from('<html><script>alert(1)</script></html>') });
      await page.getByTestId('pack-error').waitFor();
      assert(/doesn’t look like a Tiffin & Me family recording/.test(await page.getByTestId('pack-error').innerText()), 'not a pack');
      const evil = JSON.stringify({ format: 'starring-pack', version: 1, kind: 'reading', bookId: 'tiffin-football', readerName: '<img src=x onerror="window.__pwned=1">', parts: { 1: { main: { mime: 'text/html', data: Buffer.from('<b>hi</b>').toString('base64') } } } });
      await page.getByTestId('pack-file').setInputFiles({ name: 'evil.starring.json', mimeType: 'application/json', buffer: Buffer.from(evil) });
      await page.waitForFunction(() => /couldn’t find any recordings/.test(document.querySelector('[data-testid=pack-error]')?.textContent ?? ''));
      await page.waitForTimeout(200);
      eq(await page.evaluate(() => [window.__pwned ?? null, document.querySelectorAll('img[src="x"]').length]), [null, 0], 'nothing from the file became HTML');
      await shot(page, 'family-open-error');
    });

    await step('open: Grandma’s pack -> "Grandma Rose has recorded Goal, Ava! for you" -> added and active', async () => {
      await page.getByTestId('pack-file').setInputFiles(readingPack.path);
      await page.getByTestId('pack-confirm').waitFor();
      eq(await page.getByTestId('pack-title').innerText(), 'Grandma Rose has recorded “Goal, Ava!” for you', 'headline');
      await page.getByTestId('pack-listen').click();
      await page.locator('[data-testid=pack-confirm] .cover-art svg').first().waitFor({ timeout: 8000 });
      await shot(page, 'family-open-reading');
      await page.getByTestId('pack-import').click();
      await waitHash(page, `#/b/${BOOK}`);
      await page.getByTestId('start-reading').waitFor();
      eq(await page.getByTestId('active-child').innerText(), 'Ava', 'the child was set up from the pack');
      eq(await page.getByTestId('reading-pill').innerText(), 'Read by Grandma Rose', 'Grandma reads');
      const st = await stateOf(page);
      eq(st.readings.length, 1, 'one reading');
      eq(st.activeReading[BOOK], st.readings[0].id, 'active for the book');
      // A reading says one child's name: it belongs to Ava (who the pack says it was recorded for).
      const ava = st.profiles.find((p) => p.display === 'Ava');
      eq([st.readings[0].childId, st.readings[0].childKey], [ava.id, 'ava'], 'the reading is Ava’s');
      assert(await page.locator('[data-testid=reader-choice][data-reader=voice]').count(), 'computer voice still offered');
      assert(await page.locator(`[data-testid=reader-choice][data-reader="${st.readings[0].id}"]`).isChecked(), 'Grandma chosen');
      await shot(page, 'family-ready-reading', { full: true });
    });

    await step('reader: plays the recorded reading (computer voice silent), highlighting as it goes', async () => {
      await page.getByTestId('start-reading').click();
      await page.getByTestId('reader').waitFor({ timeout: 8000 });
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^=reading-badge]')].some((b) => !b.hidden && /Read by Grandma Rose/.test(b.textContent)), null, { timeout: 8000 });
      await page.waitForFunction(() => document.querySelector('[data-testid=reader]')?.dataset.state === 'done', null, { timeout: 15000 });
      // The words lit up in time with Grandma's clip (they stay marked as read).
      const lit = await page.evaluate(() => [document.querySelectorAll('[data-testid=page-text] .sb-word.is-read').length, document.querySelectorAll('[data-testid=page-text] .sb-word').length]);
      assert(lit[0] > 0, `words lit: ${lit}`);
      await shot(page, 'family-reader-reading');
      // Leaving the story is a grown-up's hold.
      await page.evaluate(() => (globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), gateMs: 150 }));
      await page.getByTestId('exit-reader').click();
      await holdGate(page, 400);
      await page.getByTestId('save-audio').waitFor();
    });

    await step('Yoto / Tonie: the reading saves as one WAV named after the story and the reader', async () => {
      if (!(await page.getByTestId('save-audio').count())) await page.goto(url(`#/b/${BOOK}`));
      const wav = await download(page, 'save-audio');
      eq(wav.name, 'Goal-Ava-read-by-Grandma-Rose.wav', 'filename');
      assert(wav.bytes.length > 44, `WAV size ${wav.bytes.length}`);
      eq(wav.bytes.subarray(0, 4).toString('latin1'), 'RIFF', 'RIFF header');
      eq(wav.bytes.subarray(8, 12).toString('latin1'), 'WAVE', 'WAVE');
      const rate = wav.bytes.readUInt32LE(24);
      eq(rate, 22050, 'sample rate');
      const seconds = wav.bytes.readUInt32LE(40) / 2 / rate;
      assert(seconds > 3 && seconds < 20, `about the length of three clips, a chime and pauses (${seconds.toFixed(1)} s)`);
      await page.waitForFunction(() => /Done/.test(document.querySelector('[data-testid=save-audio-status]')?.textContent ?? ''));
      assert(/Make Your Own/.test(await page.locator('.yoto-tip').innerText()), 'Yoto tip');
    });

    await step('who reads: switching to the computer voice (and back) is remembered', async () => {
      await page.locator('label[for=reader-voice]').click();
      await page.getByTestId('save-audio-note').waitFor();
      assert(/can’t be saved as a file/.test(await page.getByTestId('save-audio-note').innerText()), 'explains why the computer voice can’t be saved');
      eq((await stateOf(page)).activeReading[BOOK], null, 'computer voice');
      assert(!(await page.getByTestId('reading-pill').count()), 'no reading pill');
      const id = (await stateOf(page)).readings[0].id;
      await page.locator(`label[for="reader-${id}"]`).click();
      await page.getByTestId('reading-pill').waitFor();
      eq((await stateOf(page)).activeReading[BOOK], id, 'Grandma again');
    });

    await step('settings: family recordings list plays, sends and deletes (with the audio)', async () => {
      await page.evaluate(() => (globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), gateMs: 150 }));
      await page.getByTestId('open-settings').click();
      // (A grown-up held the gate a moment ago to leave the story: no second hold within the minute.)
      await page.waitForTimeout(300);
      if (await page.getByTestId('parent-gate').count()) await holdGate(page, 400);
      await waitHash(page, '#/settings');
      const row = page.getByTestId('settings-reading').first();
      await row.waitFor();
      assert(/Read by Grandma Rose/.test(await row.innerText()) && /Reads the story/.test(await row.innerText()), 'row with badge');
      await page.waitForFunction(() => /Goal, Ava! · 3 of 14 parts/.test(document.querySelector('.settings-reading-meta')?.textContent ?? ''));
      await row.getByTestId('reading-play').click();
      await page.waitForSelector('[data-testid=reading-play].is-playing');
      await row.getByTestId('reading-play').click();
      await page.waitForSelector('[data-testid=reading-play]:not(.is-playing)');
      const sent = await download(page, 'reading-send', 'resent.json');
      eq(JSON.parse(sent.bytes.toString('utf8')).readerName, 'Grandma Rose', 'sent again from settings');
      assert(await page.getByTestId('setting-allowOnlineVoices').count(), 'online voices switch');
      assert(!(await page.getByTestId('setting-allowOnlineVoices').isChecked()), 'online voices off by default');
      assert(/Google or Microsoft/.test(await page.locator('.online-toggle').innerText()), 'honest explanation');
      await page.getByTestId('settings-reading').first().scrollIntoViewIfNeeded();
      await shot(page, 'family-settings');
      const before = (await blobKeys(page)).length;
      eq(before, 3, 'three recordings stored');
      await row.getByTestId('reading-delete').click();
      await page.getByTestId('confirm-delete-reading-yes').click();
      await page.waitForFunction(() => /No family recordings yet/.test(document.querySelector('[data-testid=settings-readings]')?.textContent ?? ''));
      await page.waitForTimeout(300);
      eq((await blobKeys(page)).length, 0, 'the audio is deleted too');
      const st = await stateOf(page);
      eq([st.readings.length, st.activeReading[BOOK]], [0, null], 'reading gone');
      noErrors(errors, 'opening a pack');
    });
    await context.close();
  }

  // ===== 3. A gift: Auntie Jo sets it up on her phone, the parent opens it ========================
  {
    const { page, errors, context } = await openPage(browser);
    await step('gift: name + how it’s said, message, spoken message, a reading page, wrap it up', async () => {
      await page.goto(url(`#/b/${BOOK}`));
      await page.getByTestId('go-gift').click();
      await waitHash(page, `#/b/${BOOK}/gift`);
      await page.getByTestId('gift-wrap').click();
      await page.getByTestId('gift-child-error').waitFor();
      await page.getByTestId('gift-child').fill('siobhan');
      await page.getByTestId('pp-choice').first().waitFor();
      eq(await page.getByTestId('pp-choice').first().getAttribute('data-say'), 'Shi vawn', 'dictionary first');
      assert(await page.getByTestId('pp-choice').first().isChecked(), 'best guess chosen');
      assert(/A gift for Siobhan/.test(await page.locator('h1').innerText()), 'heading with the name');
      await page.getByTestId('gift-from').fill('Auntie Jo');
      await page.getByTestId('gift-text').fill('Happy birthday, Siobhan!\nLove you lots.');
      await page.getByTestId('gift-record').click();
      await page.getByTestId('gift-rec-stop').waitFor();
      await page.waitForTimeout(1100);
      await page.getByTestId('gift-rec-stop').click();
      await page.getByTestId('gift-rec-listen').waitFor({ timeout: 12000 });
      await shot(page, 'family-gift-form', { full: true });
      await page.getByTestId('gift-record-reading').click();
      await waitHash(page, `#/b/${BOOK}/record?for=gift`);
      eq([await page.getByTestId('reader-name').inputValue(), await page.getByTestId('record-child').inputValue()], ['Auntie Jo', 'Siobhan'], 'prefilled from the gift');
      await page.getByTestId('record-begin').click();
      await recordPart(page);
      await page.getByTestId('rec-finish').click();
      await waitHash(page, `#/b/${BOOK}/gift`);
      assert(await page.getByTestId('gift-include-reading').isChecked(), 'reading included');
      eq(await page.getByTestId('gift-text').inputValue(), 'Happy birthday, Siobhan!\nLove you lots.', 'the draft survived');
      giftPack = await download(page, 'gift-wrap');
      eq(giftPack.name, `${BOOK}-Siobhan.starring.json`, 'gift filename');
      await page.getByTestId('gift-done').waitFor();
      assert(/Send this file to Siobhan’s grown-up\. They open .*\?b=tiffin-football and tap “Open a family recording”/.test(await page.getByTestId('gift-instructions').innerText()), 'instructions');
      await shot(page, 'family-gift-done');
      const pack = JSON.parse(giftPack.bytes.toString('utf8'));
      eq([pack.kind, pack.child.display, pack.child.pronunciation.say, pack.message.from, pack.readerName], ['gift', 'Siobhan', 'Shi vawn', 'Auntie Jo', 'Auntie Jo'], 'gift contents');
      eq(pack.child.pronunciation.label, '', 'no origin guess travels in the file');
      assert(pack.message.audio?.mime === 'audio/wav', 'spoken message');
      eq(Object.keys(pack.parts), ['1'], 'one page read');
      eq((await stateOf(page))?.profiles?.length ?? 0, 0, 'the giver’s phone keeps no child');
      // The giver's reading and messages stay in the gift (memory only): nothing saved on this phone.
      eq((await stateOf(page))?.readings?.length ?? 0, 0, 'no reading saved on the giver’s phone');
      eq(await blobKeys(page), [], 'no recordings saved on the giver’s phone');
      eq(await page.getByTestId('gift-tidy').count(), 0, 'nothing to tidy away');
      noErrors(errors, 'gift');
    });
    await context.close();
  }
  {
    const { page, errors, context } = await openPage(browser, { seed: { profiles: [kid('child_z', 'Zak')], activeProfileId: 'child_z', settings: {}, lastBook: BOOK } });
    await step('gift: the parent opens it -> Siobhan is set up with the message, the voice and the reading', async () => {
      await page.goto(url('#/'));
      await page.getByTestId('open-pack').click();
      await page.getByTestId('pack-file').setInputFiles(giftPack.path);
      await page.getByTestId('pack-confirm').waitFor();
      eq(await page.getByTestId('pack-title').innerText(), 'A gift for Siobhan from Auntie Jo', 'headline');
      eq(await page.getByTestId('pack-message').innerText(), 'Happy birthday, Siobhan!\nLove you lots.', 'message, as plain text');
      await page.getByTestId('pack-message-play').click();
      await shot(page, 'family-open-gift', { full: true });
      await page.getByTestId('pack-import').click();
      await page.getByTestId('gift-card').waitFor();
      eq(await page.getByTestId('active-child').innerText(), 'Siobhan', 'reading for Siobhan');
      eq(await page.getByTestId('gift-from').innerText(), 'From Auntie Jo', 'from');
      await page.getByTestId('gift-pill').click();
      await page.getByTestId('gift-play').click();
      await page.waitForSelector('[data-testid=gift-play].is-playing');
      const st = await stateOf(page);
      const siobhan = st.profiles.find((p) => p.display === 'Siobhan');
      eq(st.profiles.length, 2, 'Zak is still here');
      eq(siobhan.pronunciation.say, 'Shi vawn', 'said the giver’s way');
      assert(siobhan.gift.recordingId && (await blobKeys(page)).includes(siobhan.gift.recordingId), 'the spoken message is stored');
      eq(st.readings[0].readerName, 'Auntie Jo', 'Auntie Jo’s reading came too');
      eq(st.readings[0].childId, siobhan.id, 'the reading is Siobhan’s');
      eq(await page.getByTestId('reading-pill').innerText(), 'Read by Auntie Jo', 'Auntie Jo reads for Siobhan');
      // ...and not for Zak.
      await page.locator('[data-testid=switch-child][data-child=child_z]').click();
      await page.waitForFunction(() => document.querySelector('[data-testid=active-child]')?.textContent === 'Zak');
      eq(await page.getByTestId('reading-pill').count(), 0, 'Zak hears the computer voice');
      eq(await page.getByTestId('reader-choice').count(), 1, 'only the computer voice is offered for Zak');
      await shot(page, 'family-ready-gift');
      noErrors(errors, 'opening a gift');
    });
    await context.close();
  }

  // ===== 4. Siblings reading together ============================================================
  {
    const seed = { profiles: [kid('c_amara', 'Amara'), kid('c_zak', 'Zak', 'Zack'), kid('c_li', 'Li'), kid('c_mo', 'Mo')], activeProfileId: 'c_amara', settings: {}, lastBook: BOOK };
    const { page, errors, context } = await openPage(browser, { seed });
    await step('together: Amara & Zak share the story (text, pictures, reader)', async () => {
      await page.goto(url(`#/b/${BOOK}`));
      await page.locator('label[for=together-c_zak]').click();
      await page.getByTestId('together-names').waitFor();
      eq(await page.getByTestId('together-names').innerText(), 'Amara & Zak', 'joined names');
      eq(await page.getByTestId('ready-title').innerText(), 'Amara and Zak’s story is ready', 'title');
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=cover-art] text.sb-name')].some((t) => t.textContent.includes('Amara & Zak')), null, { timeout: 8000 });
      eq((await stateOf(page)).together, ['c_amara', 'c_zak'], 'saved');
      // Three at most.
      await page.locator('label[for=together-c_li]').click();
      await page.waitForFunction(() => document.querySelector('[data-testid=together-names]')?.textContent === 'Amara & Zak & Li');
      assert(await page.locator('[data-testid=together-child][data-child=c_mo]').isDisabled(), 'a fourth can’t join');
      await page.locator('label[for=together-c_li]').click();
      await page.waitForFunction(() => document.querySelector('[data-testid=together-names]')?.textContent === 'Amara & Zak');
      await shot(page, 'family-ready-together', { full: true });
      await page.getByTestId('start-reading').click();
      await page.getByTestId('reader').waitFor({ timeout: 8000 });
      await page.getByTestId('next-page').click();
      await page.waitForFunction(() => /Where are Amara and Zak's shirts\?/.test(document.querySelector('[data-testid=page-text]')?.textContent ?? ''), null, { timeout: 8000 });
      await page.evaluate(() => (globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), gateMs: 150 }));
      await page.getByTestId('exit-reader').click();
      await holdGate(page, 400);
      await page.getByTestId('together-names').waitFor();
      // Back to one child: untick Zak.
      await page.locator('label[for=together-c_zak]').click();
      await page.waitForFunction(() => /^Amara’s story is ready$/.test(document.querySelector('[data-testid=ready-title]')?.textContent ?? ''));
      eq((await stateOf(page)).together, [], 'cleared');
      noErrors(errors, 'together');
    });

    await step('shelf: every book, with the child’s name on each cover', async () => {
      await page.goto(url('#/'));
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=shelf-book]').length >= 2);
      const titles = await page.getByTestId('shelf-title').allInnerTexts();
      const index = JSON.parse(readFileSync(path.join(ROOT, 'books/index.json'), 'utf8')).books;
      eq(titles.length, index.length, 'one card per book in books/index.json');
      assert(titles.every((t) => t.includes('Amara')), `names on every title: ${titles}`);
      await page.waitForFunction((n) => [...document.querySelectorAll('[data-testid=shelf-book]')].filter((c) => c.querySelector('.cover-art svg, .shelf-cover-missing')).length === n, index.length, { timeout: 10000 });
      await shot(page, 'family-shelf', { full: true });
      noErrors(errors, 'shelf');
    });
    await context.close();
  }

  // ===== 4b. Home languages: Nana records Book 2 in Urdu ============================================
  {
    const BOOK2 = 'tiffin-digger';
    const { page, errors, context } = await openPage(browser, { seed: { profiles: [kid('child_ava', 'Ava')], activeProfileId: 'child_ava', settings: {}, lastBook: BOOK2 }, hooks: { gateMs: 150 } });
    await step('home language: Nana is invited to read in hers; "Read by Nana in Urdu" everywhere, and the reader is told the language', async () => {
      await page.goto(url(`#/b/${BOOK2}/record`));
      await page.getByTestId('record-lang-invite').waitFor();
      assert(/Urdu, Polish, Cymraeg/.test(await page.getByTestId('record-lang-invite').innerText()), 'the invitation names some languages');
      assert(!(await page.getByTestId('reader-language').isVisible()), 'the language box starts folded away');
      await page.getByTestId('record-lang-open').click();
      assert(await page.getByTestId('reader-language').isVisible(), '"Choose your language" opens it');
      eq(await page.evaluate(() => document.activeElement?.dataset.testid), 'reader-language', 'and puts the cursor there');
      assert(/Urdu, Polish, Cymraeg/.test(await page.getByTestId('reader-language').getAttribute('placeholder')), 'placeholder');
      await page.getByTestId('reader-language').fill('Urdu');
      await page.getByTestId('reader-name').fill('Nana');
      await shot(page, 'family-record-language');
      await page.getByTestId('record-begin').click();
      await page.getByTestId('teleprompter').waitFor();
      assert(/Beep beep, Ava!/.test(await page.getByTestId('teleprompter').innerText()), 'Book 2 words');
      assert(/Reading in Urdu/.test(await page.getByTestId('tp-lang').innerText()), 'the teleprompter says the English is only a guide');
      await recordPart(page);
      const st = await stateOf(page);
      eq([st.readings.length, st.readings[0].language, st.readings[0].bookId], [1, 'Urdu', BOOK2], 'the language is saved on the reading');
      await page.getByTestId('rec-finish').click();
      await page.getByTestId('record-done').waitFor();
      eq(await page.getByTestId('record-done-label').innerText(), 'Read by Nana in Urdu', 'done screen label');
      // The ready screen: the pill and the "who reads" choice.
      await page.goto(url(`#/b/${BOOK2}`));
      await page.getByTestId('reading-pill').waitFor();
      eq(await page.getByTestId('reading-pill').innerText(), 'Read by Nana in Urdu', 'ready pill');
      assert(/Read by Nana in Urdu/.test(await page.getByTestId('who-reads').innerText()), 'who reads lists it by its label');
      // The shelf.
      await page.goto(url('#/'));
      await page.locator(`[data-testid=shelf-book][data-book=${BOOK2}] .shelf-pill`).waitFor();
      eq(await page.locator(`[data-testid=shelf-book][data-book=${BOOK2}] .shelf-pill`).innerText(), 'Read by Nana in Urdu', 'shelf pill');
      // Settings.
      await page.goto(url('#/settings'));
      await page.getByTestId('gate-screen').waitFor();
      await holdGate(page, 400);
      await page.getByTestId('settings-reading').first().waitFor();
      assert(/Read by Nana in Urdu/.test(await page.getByTestId('settings-reading').first().innerText()), 'settings row');
      // The reader gets the label and the language: the badge says so.
      await page.goto(url(`#/b/${BOOK2}/read/1`));
      await page.getByTestId('reader').waitFor({ timeout: 8000 });
      await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^=reading-badge]')].some((b) => !b.hidden && /Nana/.test(b.textContent) && /Urdu/.test(b.textContent)), null, { timeout: 8000 });
      noErrors(errors, 'home language');
    });
    await context.close();
  }

  // ===== 5. Nicknames ===========================================================================
  {
    const { page, errors, context } = await openPage(browser);
    await step('nickname: a long name -> "What do you call them at home?" -> Max in the story, full name kept', async () => {
      await page.goto(url(`#/b/${BOOK}`));
      await page.getByTestId('name-input').fill('maximilian-james');
      await page.getByTestId('nickname-offer').waitFor();
      await page.getByTestId('nickname-suggestion').click();
      eq(await page.getByTestId('nickname-input').inputValue(), 'Maximilian', 'suggestion fills the box');
      await page.getByTestId('nickname-input').fill('Max2');
      await page.getByTestId('name-continue').click();
      await page.getByTestId('nickname-error').waitFor();
      await page.getByTestId('nickname-input').fill('max');
      await page.waitForFunction(() => document.querySelector('[data-testid=cover-title]')?.textContent.includes('Max!'));
      await shot(page, 'family-nickname');
      await page.getByTestId('nickname-input').press('Enter');
      await waitHash(page, `#/b/${BOOK}/say`);
      // The route loads the name dictionary first: wait for the new screen, not just the new address.
      await page.waitForFunction(() => /How do we say Max\?/.test(document.querySelector('h1')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {
        throw new Error('pronunciation of the nickname');
      });
      const p = (await stateOf(page)).profiles[0];
      eq([p.display, p.fullName, p.key], ['Max', 'Maximilian-James', 'max'], 'profile');
      await page.getByTestId('pronunciation-done').click();
      await page.getByTestId('start-reading').waitFor();
      assert(/Full name: Maximilian-James/.test(await page.locator('.child-card').innerText()), 'full name shown');
      // Editing shows both names, and removing the nickname goes back to the full name.
      await page.getByTestId('change-child').click();
      eq([await page.getByTestId('name-input').inputValue(), await page.getByTestId('nickname-input').inputValue()], ['Maximilian-James', 'Max'], 'edit form');
      await page.getByTestId('nickname-input').fill('');
      await page.getByTestId('name-continue').click();
      await page.waitForFunction(() => location.hash.startsWith('#/b/tiffin-football/say?child='));
      const q = (await stateOf(page)).profiles[0];
      eq([q.display, 'fullName' in q], ['Maximilian-James', false], 'nickname removed');
      noErrors(errors, 'nickname');
    });
    await context.close();
  }

  // ===== 6. Privacy and environment ===============================================================
  {
    const seed = { profiles: [kid('child_ava', 'Ava')], activeProfileId: 'child_ava', settings: {}, lastBook: BOOK };
    const { page, errors, context } = await openPage(browser, { seed, init: ONLINE_ONLY_SPEECH });
    await step('online voices: only online voices -> ask the grown-up; staying private is the default', async () => {
      await page.goto(url(`#/b/${BOOK}`));
      await page.getByTestId('voice-consent').waitFor({ state: 'visible', timeout: 8000 });
      assert(/including Ava’s name/.test(await page.getByTestId('voice-consent').innerText()), 'says the name is sent');
      eq((await stateOf(page)).settings.allowOnlineVoices ?? false, false, 'off until they agree');
      await page.getByTestId('voice-consent').scrollIntoViewIfNeeded();
      await shot(page, 'family-consent');
      await page.getByTestId('consent-decline').click();
      await page.getByTestId('voice-consent').waitFor({ state: 'hidden' });
      await page.reload();
      await page.getByTestId('start-reading').waitFor();
      await page.waitForTimeout(2000);
      assert(!(await page.getByTestId('voice-consent').isVisible()), 'not asked again after "stay private"');
      eq((await stateOf(page)).settings.allowOnlineVoices ?? false, false, 'still private');
    });
    await step('online voices: agreeing on the pronunciation screen switches them on', async () => {
      await page.evaluate(() => localStorage.removeItem('starring.prefs.v1'));
      await page.goto(url(`#/b/${BOOK}/say`));
      await page.getByTestId('voice-consent').waitFor({ state: 'visible', timeout: 8000 });
      assert(!(await page.getByTestId('no-voice').isVisible()), 'asks rather than saying there is no voice');
      await page.getByTestId('consent-allow').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('starring.v1'))?.settings?.allowOnlineVoices === true);
      eq((await stateOf(page)).settings.allowOnlineVoices, true, 'agreed');
      // The reassurance under the story preview tells the truth about where the words go
      // (in ?test=1 the narrator stays silent, so nothing is sent and it says so).
      await page.waitForFunction(() => {
        const online = globalThis.__tiffin.services.narrator.voiceStatus?.().usingOnline;
        const text = document.querySelector('[data-testid=story-voice-note]')?.textContent ?? '';
        return online ? /Google or Microsoft/.test(text) : /on this device/.test(text);
      });
      eq(await page.evaluate(() => globalThis.__tiffin.services.narrator.voiceStatus?.().needsConsent), false, 'narrator no longer needs consent');
      noErrors(errors, 'consent');
    });
    await context.close();
  }
  {
    const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 312.0.0.0.0 Android';
    const { page, errors, context } = await openPage(browser, { init: `Object.defineProperty(navigator, 'userAgent', { get: () => ${JSON.stringify(UA)} });` });
    await step('environment: inside Instagram, the landing page says how to open the real browser', async () => {
      await page.goto(url(`#/b/${BOOK}`));
      await page.getByTestId('env-hint').waitFor({ state: 'visible', timeout: 8000 });
      assert(/Instagram.*Open in browser/.test(await page.getByTestId('env-hint').innerText()), 'hint text');
      const hint = await page.getByTestId('env-hint').boundingBox();
      const input = await page.getByTestId('name-input').boundingBox();
      assert(hint.y < input.y, 'at the top');
      await shot(page, 'family-env-hint');
      await page.getByTestId('env-hint-close').click();
      await page.getByTestId('env-hint').waitFor({ state: 'detached' });
      noErrors(errors, 'environment');
    });
    await context.close();
  }

  // ===== 7. Layout: no sideways scroll, and screenshots at three sizes ============================
  await step('no horizontal scroll on the family screens at 360x640, 844x390 and 1024x768', async () => {
    for (const viewport of [{ width: 360, height: 640 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      const seed = { profiles: [kid('c_amara', 'Amara', 'Amara', { gift: { from: 'Auntie Jo', text: 'Happy birthday!', recordingId: null, createdAt: 1 } }), kid('c_zak', 'Zak')], activeProfileId: 'c_amara', together: [], settings: {}, lastBook: BOOK };
      const { page: p, errors: errs, context: c } = await openPage(browser, { viewport, seed });
      for (const [hash, ready] of [
        [`#/b/${BOOK}`, '[data-testid=gift-card]'],
        [`#/b/${BOOK}/record`, '[data-testid=reader-name]'],
        [`#/b/${BOOK}/gift`, '[data-testid=gift-child]'],
        ['#/open', '[data-testid=pack-pick]'],
        ['#/', '[data-testid=shelf-book]'],
      ]) {
        await p.goto(url(hash));
        await p.waitForSelector(ready, { timeout: 8000 });
        await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(over <= 0, `${hash} scrolls sideways by ${over}px at ${viewport.width}x${viewport.height}`);
      }
      // The teleprompter too.
      await p.goto(url(`#/b/${BOOK}/record`));
      await p.getByTestId('reader-name').fill('Nana');
      await p.getByTestId('record-begin').click();
      await p.getByTestId('rec-start').waitFor();
      assert((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `teleprompter scrolls sideways at ${viewport.width}x${viewport.height}`);
      for (const n of [0, 1]) {
        await p.locator('[data-testid=rec-step]').nth(n).click();
        await p.waitForTimeout(300);
        const btn = await p.getByTestId('rec-start').boundingBox();
        assert(btn && btn.y >= 0 && btn.y + btn.height <= viewport.height, `record button on screen at ${viewport.width}x${viewport.height} (part ${n + 1}): ${JSON.stringify(btn)}`);
      }
      noErrors(errs, `layout at ${viewport.width}x${viewport.height}`);
      await c.close();
    }
  });

  if (SHOTS) {
    for (const viewport of [PHONE, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      await step(`screenshots at ${viewport.width}x${viewport.height}`, async () => {
        const seed = {
          profiles: [kid('c_amara', 'Amara', 'Amara', { gift: { from: 'Auntie Jo', text: 'Happy birthday, Amara! I can’t wait to read this with you.', recordingId: 'gift_x', createdAt: 1 } }), kid('c_zak', 'Zak')],
          activeProfileId: 'c_amara',
          together: [],
          settings: {},
          lastBook: BOOK,
          readings: [{ id: 'reading_x', bookId: BOOK, readerName: 'Grandma Rose', parts: { 1: { main: 'b1', after: null } }, createdAt: 1, updatedAt: Date.now() }],
          activeReading: { [BOOK]: 'reading_x' },
        };
        const { page: p, errors: errs, context: c } = await openPage(browser, { viewport, seed, hooks: { gateMs: 150 } });
        const visit = async (hash, name, ready, opts) => {
          await p.goto(url(hash));
          await p.waitForSelector(ready, { timeout: 8000 });
          await p.waitForTimeout(500);
          await shot(p, name, opts);
        };
        await visit(`#/b/${BOOK}`, 'family-ready', '[data-testid=start-reading]');
        await visit(`#/b/${BOOK}`, 'family-ready-full', '[data-testid=gift-card]', { full: true });
        await visit('#/', 'family-home', '[data-testid=shelf-book] svg');
        await visit('#/open', 'family-open', '[data-testid=pack-pick]');
        await visit(`#/b/${BOOK}/gift`, 'family-gift', '[data-testid=gift-child]');
        await visit(`#/b/${BOOK}/record`, 'family-record-setup', '[data-testid=reader-name]');
        await p.getByTestId('reader-name').fill('Grandma Rose');
        await p.getByTestId('record-begin').click();
        await p.getByTestId('rec-start').waitFor();
        await p.getByTestId('rec-next').count();
        await p.locator('[data-testid=rec-step]').nth(1).click();
        await p.waitForTimeout(600);
        await shot(p, 'family-record-step');
        await visit(`#/b/${BOOK}/name`, 'family-name', '[data-testid=name-input]');
        await p.getByTestId('name-input').fill('Anna-Sophia');
        await p.getByTestId('nickname-offer').waitFor();
        await shot(p, 'family-nickname');
        await visit('#/settings', 'family-settings-gate', '[data-testid=gate-screen]');
        await holdGate(p, 400);
        await p.getByTestId('settings-reading').first().waitFor();
        await p.getByTestId('settings-reading').first().scrollIntoViewIfNeeded();
        await shot(p, 'family-settings');
        noErrors(errs, `screens at ${viewport.width}x${viewport.height}`);
        await c.close();
      });
    }
  }
} finally {
  await browser?.close();
  server.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} family e2e steps passed`);
if (failed.length) process.exitCode = 1;
