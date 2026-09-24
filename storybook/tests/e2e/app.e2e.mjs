// Browser test for the app shell and the grown-up screens (index.html,
// js/main.js, js/app/*), in Playwright's Chromium with ?test=1 (silent,
// fast narration: headless Chromium has no speech voices).
//
//   node tests/e2e/app.e2e.mjs                 (PORT=8106 by default)
//   SHOTS=/some/dir node tests/e2e/app.e2e.mjs  also screenshots every screen at 390×844, 844×390 and 1024×768
//   ONLY=gate node tests/e2e/app.e2e.mjs        run only steps whose name contains "gate"
//
// Starts and stops its own static server. Exits non-zero on any failure.
// Modules other people are still writing (js/ar/*, css/ar.css) may 404; those
// are reported but don't fail the run while the file doesn't exist on disk.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 8106);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const BOOK = 'tiffin-football';
const PHONE = { width: 390, height: 844 };

// ---- tiny runner --------------------------------------------------------------------
const results = [];
const pending = new Set(); // 404s for files that don't exist yet (other people's modules)
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- server ----------------------------------------------------------------------------
// The server runs in its own process group (npx starts http-server as a child),
// and the whole group is killed however this script ends: normally, on an
// uncaught error, or on Ctrl-C / SIGTERM from tests/e2e/run.mjs. No stray
// server survives a run.
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
  process.on('exit', () => proc.stop('SIGKILL'));
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
const PROFILE = {
  id: 'child_e2e',
  display: 'Siobhan',
  key: 'siobhan',
  pronunciation: { say: 'Shi vawn', ipa: 'ʃɪˈvɔːn', respell: 'shih-VAWN', label: 'Irish', source: 'dictionary', useRecording: false, recordingId: null },
  createdAt: 1,
  updatedAt: 1,
};

/**
 * A fresh browser context + page with error capture.
 * @param {object} browser
 * @param {{viewport?: object, seed?: object|null, hooks?: object|null, init?: Function|null, reducedMotion?: string}} [opts]
 *   seed: app state written to localStorage before the first load (once per context)
 *   hooks: extra globalThis.SB_TEST fields (e.g. {gateMs: 150})
 */
async function openPage(browser, { viewport = PHONE, seed = null, hooks = null, init = null, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, deviceScaleFactor: SHOTS ? 2 : 1, permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  lastPage = page;
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url ?? '';
    if (/Failed to load resource/.test(m.text()) && url.startsWith(BASE)) {
      const file = path.join(ROOT, decodeURIComponent(new URL(url).pathname));
      if (!existsSync(file)) {
        pending.add(new URL(url).pathname);
        return;
      }
    }
    errors.push(`${m.text()} ${url ? `(${url})` : ''}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // No network in tests: web fonts resolve to nothing (the fallback fonts are fine).
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
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

const seeded = (extra = {}) => ({ profiles: [PROFILE], activeProfileId: PROFILE.id, settings: {}, lastBook: BOOK, ...extra });
const url = (hash = '', q = 'test=1') => `${BASE}/?${q}${hash}`;
const hashOf = (page) => page.evaluate(() => location.hash);
const stateOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('starring.v1') ?? 'null'));
async function waitHash(page, want, timeout = 5000) {
  await page.waitForFunction((h) => (h instanceof RegExp ? false : location.hash === h), want, { timeout }).catch(async () => {
    throw new Error(`expected hash ${want}, got ${await hashOf(page)}`);
  });
}
async function noErrors(errors, where) {
  assert(errors.length === 0, `console errors on ${where}:\n  ${errors.join('\n  ')}`);
}
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  const vp = page.viewportSize();
  await page.screenshot({ path: path.join(SHOTS, `${name}-${vp.width}x${vp.height}.png`) });
}
async function holdGate(page, ms = 3300) {
  const box = await page.getByTestId('parent-gate').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}
const readerExists = existsSync(path.join(ROOT, 'js/reader/reader.js'));

// ---- tests -------------------------------------------------------------------------------
const server = await startServer();
let browser;
try {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
} catch (err) {
  server.stop();
  throw err;
}
console.log(`app e2e on ${BASE}${SHOTS ? ` (screenshots in ${SHOTS})` : ''}`);

try {
  // One continuous journey, like a parent who has just scanned the QR code.
  const { page, errors, context } = await openPage(browser);

  await step('QR entry: ?b=<id> lands on the book with the name box at the top', async () => {
    await page.goto(`${BASE}/?b=${BOOK}&test=1`);
    await page.getByTestId('name-input').waitFor();
    eq(await hashOf(page), `#/b/${BOOK}`, 'hash after the QR redirect');
    eq(await page.evaluate(() => location.search), '?test=1', 'other query parameters kept');
    const h1 = await page.locator('h1').innerText();
    assert(/child’s name/.test(h1), `landing heading: ${h1}`);
    const input = await page.getByTestId('name-input').boundingBox();
    const cover = await page.getByTestId('cover').boundingBox();
    assert(input.y < cover.y, 'the name box sits above the cover');
    assert(input.y < 400, `name box near the top (y=${input.y})`);
    const attrs = await page.getByTestId('name-input').evaluate((el) => ({ ac: el.autocomplete, cap: el.getAttribute('autocapitalize'), ekh: el.getAttribute('enterkeyhint'), sp: el.getAttribute('spellcheck'), max: el.maxLength }));
    eq(attrs, { ac: 'off', cap: 'words', ekh: 'next', sp: 'false', max: 24 }, 'name input attributes');
    await page.getByTestId('cover-art').locator('svg').first().waitFor();
    await shot(page, 'landing');
  });

  await step('name validation shows NAME_ERRORS inline', async () => {
    await page.getByTestId('name-continue').click();
    await page.getByTestId('name-error').waitFor();
    eq(await page.getByTestId('name-error').innerText(), 'Please type a name.', 'empty error');
    await page.getByTestId('name-input').fill('Ava2');
    await page.getByTestId('name-continue').click();
    await page.waitForFunction(() => /letters only/.test(document.querySelector('[data-testid=name-error]')?.textContent ?? ''));
    eq(await page.getByTestId('name-input').getAttribute('aria-invalid'), 'true', 'aria-invalid');
    eq(await hashOf(page), `#/b/${BOOK}`, 'still on the landing page');
  });

  await step('a long name is offered a nickname ("What do you call them at home?")', async () => {
    await page.getByTestId('name-input').fill('Maximiliana-Rose');
    await page.getByTestId('nickname-offer').waitFor();
    assert(/keep “Maximiliana-Rose” as their full name/.test(await page.getByTestId('name-hint').innerText()), 'hint text');
    eq(await page.getByTestId('nickname-suggestion').innerText(), 'Maximiliana', 'first part offered');
    await page.getByTestId('name-input').fill('Maximilian');
    await page.getByTestId('nickname-offer').waitFor({ state: 'hidden' });
  });

  await step('typing "siobhan" writes "Siobhan" onto the live cover', async () => {
    await page.getByTestId('name-input').fill('');
    await page.getByTestId('name-input').pressSequentially('siobhan', { delay: 30 });
    await page.waitForFunction(() => document.querySelector('[data-testid=cover-title]')?.textContent.includes('Siobhan'));
    await page.getByTestId('name-error').waitFor({ state: 'hidden' });
    const inArt = await page.evaluate(() => [...document.querySelectorAll('[data-testid=cover-art] text.sb-name')].map((t) => t.textContent.trim()));
    assert(inArt.includes('Siobhan'), `name in the cover artwork: ${JSON.stringify(inArt)}`);
    const kind = await page.getByTestId('cover-art').getAttribute('data-kind');
    console.log(`       (cover drawn from ${kind === 'scene' ? 'the real p1.svg' : 'the fallback artwork'})`);
    await shot(page, 'landing-typed');
  });

  await step('continue -> pronunciation: candidates listed, dictionary first', async () => {
    await page.getByTestId('name-continue').click();
    await waitHash(page, `#/b/${BOOK}/say`);
    await page.getByTestId('candidate').first().waitFor();
    const cands = await page.getByTestId('candidate').evaluateAll((els) => els.map((e) => ({ say: e.dataset.say, source: e.dataset.source, selected: e.classList.contains('is-selected') })));
    assert(cands.length >= 2, `at least two candidates (${cands.length})`);
    eq(cands[0].source, 'dictionary', 'first candidate source');
    eq(cands[0].say, 'Shi vawn', 'dictionary pronunciation');
    assert(cands[0].selected, 'the best guess starts selected');
    assert(cands.some((c) => c.source === 'as-written'), 'as-written candidate offered');
    assert(/How do we say Siobhan/.test(await page.locator('h1').innerText()), 'heading');
    assert(await page.locator('.respell strong', { hasText: 'VAWN' }).first().isVisible(), 'respelling with the stressed syllable');
    const saved = await stateOf(page);
    eq(saved.profiles.length, 1, 'profile saved on continue');
    eq(saved.profiles[0].display, 'Siobhan', 'display name');
    await shot(page, 'say');
  });

  await step('play a candidate, choose another, choose back', async () => {
    const first = page.getByTestId('candidate').first();
    await first.getByTestId('candidate-play').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid=candidate-play].is-playing'), null, { timeout: 5000 });
    const second = page.getByTestId('candidate').nth(1);
    await second.getByTestId('candidate-choose').click();
    eq(await page.getByTestId('candidate').nth(1).getByTestId('candidate-choose').getAttribute('aria-pressed'), 'true', 'second chosen');
    eq(await page.getByTestId('candidate').first().getByTestId('candidate-choose').getAttribute('aria-pressed'), 'false', 'first unchosen');
    await page.getByTestId('candidate').first().getByTestId('candidate-choose').click();
    assert(await page.getByTestId('candidate').first().evaluate((e) => e.classList.contains('is-selected')), 'first chosen again');
  });

  await step('hear it in the story highlights the words', async () => {
    const preview = page.getByTestId('story-preview');
    assert(/Goal, Siobhan!/.test(await preview.innerText()), 'the title line with the name');
    await page.getByTestId('hear-in-story').click();
    await page.waitForSelector('[data-testid=story-preview] .sb-word.is-current', { timeout: 4000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid=hear-in-story].is-playing'), null, { timeout: 8000 });
  });

  await step('type it how it sounds: live respelling, listen, use', async () => {
    const input = page.getByTestId('custom-say');
    await input.scrollIntoViewIfNeeded();
    assert(await page.getByTestId('custom-use').isDisabled(), '"use" waits for text');
    await input.fill('shih-VAWN');
    await page.waitForFunction(() => /Shi vawn/.test(document.querySelector('[data-testid=custom-preview]')?.textContent ?? ''));
    await page.getByTestId('custom-play').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid=custom-play].is-playing'), null, { timeout: 5000 });
    // Same sound as the dictionary entry: it picks that card rather than adding a twin.
    await page.getByTestId('custom-use').click();
    eq(await page.getByTestId('candidate').count(), 2, 'no duplicate card');
    await input.fill('SHIV-awn');
    await page.getByTestId('custom-use').click();
    await page.locator('[data-testid=candidate][data-source=custom]').waitFor();
    assert(await page.locator('[data-testid=candidate][data-source=custom]').evaluate((e) => e.classList.contains('is-selected')), 'custom card selected');
  });

  await step('record your voice: countdown, meter, stop, play back, toggle', async () => {
    const rec = page.getByTestId('record-name');
    if (!(await rec.count())) {
      console.log('       (recording not supported here: skipped)');
      return;
    }
    await rec.scrollIntoViewIfNeeded();
    await rec.click();
    await page.getByTestId('record-stop').waitFor({ timeout: 5000 });
    await page.waitForTimeout(700);
    await page.getByTestId('record-stop').click();
    await page.getByTestId('use-recording').waitFor({ timeout: 8000 });
    assert(await page.getByTestId('use-recording').isChecked(), 'recording is used by default once made');
    assert(await page.getByTestId('record-name').isVisible(), '"record again" offered');
    await page.getByTestId('record-play').click();
    await shot(page, 'say-recorded');
    // Keep the typed pronunciation for the rest of the journey.
    await page.locator('label[for=use-recording]').click();
    assert(!(await page.getByTestId('use-recording').isChecked()), 'toggle off');
  });

  await step('done saves the pronunciation and shows the ready screen', async () => {
    await page.getByTestId('pronunciation-done').click();
    await waitHash(page, `#/b/${BOOK}`);
    await page.getByTestId('start-reading').waitFor();
    eq(await page.getByTestId('active-child').innerText(), 'Siobhan', 'reading for');
    assert(/Goal, Siobhan!/.test(await page.getByTestId('cover-title').innerText()), 'cover title');
    const p = (await stateOf(page)).profiles[0].pronunciation;
    eq({ say: p.say, source: p.source, respell: p.respell, useRecording: p.useRecording }, { say: 'Shivawn', source: 'custom', respell: 'SHIV-awn', useRecording: false }, 'saved pronunciation');
    assert(p.recordingId === null || typeof p.recordingId === 'string', 'recording id');
    await shot(page, 'ready');
  });

  await step('start reading mounts the reader; page turns update the hash without re-mounting', async () => {
    await page.getByTestId('start-reading').click();
    await waitHash(page, `#/b/${BOOK}/read/1`);
    if (!readerExists) {
      console.log('       (js/reader/reader.js missing: skipped)');
      return;
    }
    await page.getByTestId('reader').waitFor({ timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=page-text]')?.textContent.includes('Siobhan'), null, { timeout: 8000 });
    await page.evaluate(() => (document.querySelector('[data-testid=reader]').__e2eMark = 'same'));
    await page.getByTestId('next-page').click();
    await waitHash(page, `#/b/${BOOK}/read/2`);
    eq(await page.evaluate(() => document.querySelector('[data-testid=reader]')?.__e2eMark), 'same', 'reader not re-mounted');
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]')?.dataset.page === '2');
    await shot(page, 'reader');
    // The camera needs a grown-up: the reader's magic-window button asks for the hold first.
    if (await page.getByTestId('magic-window').count()) {
      await page.getByTestId('magic-window').click();
      await page.getByTestId('parent-gate').waitFor();
      assert(/camera/.test(await page.locator('.dialog-title').innerText()), 'camera gate title');
      await page.keyboard.press('Escape');
      await page.getByTestId('parent-gate').waitFor({ state: 'detached' });
      eq(await hashOf(page), `#/b/${BOOK}/read/2`, 'still reading');
    }
    await page.getByTestId('exit-reader').click();
    await waitHash(page, `#/b/${BOOK}`);
    await page.getByTestId('start-reading').waitFor();
    assert(!(await page.getByTestId('reader').count()), 'reader removed');
  });

  await step('settings sit behind the press-and-hold gate', async () => {
    await page.getByTestId('open-settings').click();
    await page.getByTestId('parent-gate').waitFor();
    await shot(page, 'gate');
    await page.getByTestId('parent-gate').click(); // a tap is not enough
    await page.waitForTimeout(400);
    eq(await hashOf(page), `#/b/${BOOK}`, 'a tap does not open settings');
    // Let go early: the ring drains and nothing opens.
    await holdGate(page, 1200);
    await page.waitForTimeout(300);
    eq(await hashOf(page), `#/b/${BOOK}`, 'a short hold does not open settings');
    await holdGate(page, 3300);
    await waitHash(page, '#/settings');
    await page.getByTestId('settings-child').first().waitFor();
    eq(await page.locator('h1').innerText(), 'Settings', 'settings heading');
    assert(/prototype v/.test(await page.getByTestId('version').innerText()), 'version shown');
  });

  await step('settings change and persist', async () => {
    const auto = page.getByTestId('setting-autoTurn');
    const before = await auto.isChecked();
    await page.locator('label[for=setting-autoTurn]').click();
    eq(await auto.isChecked(), !before, 'toggle flipped');
    await page.locator('label:has([data-testid=speed-slower])').click();
    const s = (await stateOf(page)).settings;
    eq(s.autoTurn, !before, 'autoTurn saved');
    eq(s.rate, 0.75, 'slower speed saved');
    await page.getByTestId('voice-preview').click();
    await shot(page, 'settings');
  });

  await step('the profile persists after a reload; direct settings need the gate again', async () => {
    await page.reload();
    await page.getByTestId('gate-screen').waitFor();
    await page.goto(url(`#/b/${BOOK}`));
    await page.getByTestId('start-reading').waitFor();
    eq(await page.getByTestId('active-child').innerText(), 'Siobhan', 'child remembered');
    await noErrors(errors, 'the main journey');
  });

  await step('add a second child, switch between them', async () => {
    await page.getByTestId('add-child').click();
    await waitHash(page, `#/b/${BOOK}/name`);
    await page.getByTestId('child-chip').first().waitFor();
    assert(/Siobhan/.test(await page.getByTestId('child-chip').first().innerText()), '"Reading for Siobhan?" chip');
    await page.getByTestId('name-input').fill('niamh');
    await page.getByTestId('name-input').press('Enter');
    await waitHash(page, `#/b/${BOOK}/say`);
    eq(await page.getByTestId('candidate').first().getAttribute('data-say'), 'Neeve', 'Niamh -> Neeve');
    await page.getByTestId('pronunciation-done').click();
    await page.getByTestId('switch-child').first().waitFor();
    eq(await page.getByTestId('active-child').innerText(), 'Niamh', 'new child active');
    await page.getByTestId('switch-child').first().click();
    await page.waitForFunction(() => document.querySelector('[data-testid=active-child]')?.textContent === 'Siobhan');
    // Typing an existing name picks that child instead of making a twin.
    await page.goto(url(`#/b/${BOOK}/name`));
    await page.getByTestId('name-input').fill('NIAMH');
    await page.getByTestId('name-continue').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=active-child]')?.textContent === 'Niamh');
    eq((await stateOf(page)).profiles.length, 2, 'still two children');
  });

  await step('change a name keeps the child, then delete in settings', async () => {
    await page.getByTestId('change-child').click();
    await page.getByTestId('name-input').waitFor();
    eq(await page.getByTestId('name-input').inputValue(), 'Niamh', 'prefilled');
    await page.getByTestId('name-input').fill('Neve');
    await page.getByTestId('name-continue').click();
    await waitHash(page, `#/b/${BOOK}/say`);
    const st = await stateOf(page);
    eq(st.profiles.length, 2, 'renamed, not added');
    assert(st.profiles.some((p) => p.display === 'Neve'), 'new name saved');
    await page.evaluate(() => {
      globalThis.SB_TEST = { ...(globalThis.SB_TEST ?? {}), gateMs: 150 };
    });
    await page.getByTestId('open-settings').click();
    await holdGate(page, 400);
    await waitHash(page, '#/settings');
    const neve = page.locator('[data-testid=settings-child]', { hasText: 'Neve' });
    await neve.getByTestId('delete-child').click();
    await page.getByTestId('confirm-delete-no').click();
    eq(await page.getByTestId('settings-child').count(), 2, 'cancel keeps the child');
    await neve.getByTestId('delete-child').click();
    await page.getByTestId('confirm-delete-yes').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=settings-child]').length === 1);
    eq((await stateOf(page)).profiles.map((p) => p.display), ['Siobhan'], 'Neve removed');
    await noErrors(errors, 'children');
  });

  await step('forget everything wipes the device', async () => {
    await page.getByTestId('forget-everything').click();
    await page.getByTestId('confirm-forget-yes').click();
    await page.getByTestId('name-input').waitFor();
    eq(await stateOf(page), null, 'nothing left on the device');
    await noErrors(errors, 'forget everything');
  });
  await context.close();

  await step('keyboard: Esc closes the gate; holding Space opens it', async () => {
    const { page: p, errors: errs, context: c } = await openPage(browser, { seed: seeded() });
    await p.goto(url(`#/b/${BOOK}`));
    await p.getByTestId('open-settings').click();
    await p.getByTestId('parent-gate').waitFor();
    await p.keyboard.press('Escape');
    await p.getByTestId('parent-gate').waitFor({ state: 'detached' });
    eq(await hashOf(p), `#/b/${BOOK}`, 'Esc leaves settings closed');
    await p.goto(url('#/settings'));
    await p.getByTestId('gate-screen').waitFor();
    await p.getByTestId('parent-gate').focus();
    await p.keyboard.down(' ');
    await p.waitForTimeout(1000);
    await p.keyboard.up(' ');
    await p.waitForTimeout(300);
    assert(await p.getByTestId('gate-screen').isVisible(), 'a short key press does not unlock');
    await p.keyboard.down(' ');
    await p.waitForTimeout(3300);
    await p.keyboard.up(' ');
    await p.getByTestId('settings-child').first().waitFor();
    await noErrors(errs, 'keyboard gate');
    await c.close();
  });

  await step('say it for us: heard spellings become candidates (stubbed recogniser)', async () => {
    const { page: p, errors: errs, context: c } = await openPage(browser, {
      seed: seeded(),
      init: () => {
        class FakeRecognition {
          start() {
            setTimeout(() => this.onstart?.(), 20);
            setTimeout(() => {
              const alt = (t, c) => ({ transcript: t, confidence: c });
              const result = [alt('Shivawn', 0.9), alt('Siobhan', 0.6)];
              result.isFinal = true;
              this.onresult?.({ resultIndex: 0, results: [result] });
            }, 120);
          }
          stop() {}
          abort() {}
        }
        window.SpeechRecognition = FakeRecognition;
      },
    });
    await p.goto(url(`#/b/${BOOK}/say`));
    await p.getByTestId('say-it').waitFor();
    assert(/speech service/.test(await p.getByTestId('privacy-note').innerText()), 'privacy note shown');
    await p.getByTestId('say-it').click();
    await p.locator('[data-testid=candidate][data-source=heard]').first().waitFor();
    eq(await p.locator('[data-testid=candidate][data-source=heard]').first().getAttribute('data-say'), 'Shivawn', 'heard spelling');
    assert(/We heard/.test(await p.getByTestId('say-it-status').innerText()), 'status message');
    await noErrors(errs, 'say it');
    await c.close();
  });

  await step('phone keyboard up: the name box and the cover stay in view together', async () => {
    const { page: p, errors: errs, context: c } = await openPage(browser, { viewport: { width: 390, height: 460 } });
    await p.goto(url(`#/b/${BOOK}`));
    await p.getByTestId('name-input').focus();
    await p.getByTestId('name-input').pressSequentially('Oluwaseun', { delay: 20 });
    await p.waitForSelector('.screen-name.is-typing');
    await p.waitForFunction(() => document.querySelector('[data-testid=cover-title]')?.textContent.includes('Oluwaseun'));
    await p.waitForTimeout(300);
    const vis = await p.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const input = r('[data-testid=name-input]');
      const art = r('[data-testid=cover-art]');
      return { inputTop: input.top, artTop: art.top, artBottom: art.bottom, h: innerHeight };
    });
    assert(vis.inputTop >= 0 && vis.artTop < vis.h && vis.artBottom <= vis.h + 40, `both visible: ${JSON.stringify(vis)}`);
    await shot(p, 'landing-keyboard');
    await noErrors(errs, 'typing mode');
    await c.close();
  });

  await step('unknown book, unknown page and the other routes', async () => {
    const { page: p, errors: errs, context: c } = await openPage(browser, { seed: seeded() });
    await p.goto(url('#/b/no-such-book'));
    await p.getByTestId('unknown-book').waitFor();
    await shot(p, 'unknown-book');
    await p.getByTestId('go-home').click();
    await waitHash(p, '#/');
    await p.getByTestId('shelf-book').first().waitFor();
    await shot(p, 'home');
    await p.goto(url('#/somewhere/else'));
    await p.getByTestId('not-found').waitFor();
    await p.goto(url(`#/qr/${BOOK}`));
    await p.getByTestId('qr-url').waitFor();
    assert((await p.getByTestId('qr-url').innerText()).includes(`?b=${BOOK}`), 'landing URL with ?b=');
    await p.waitForFunction(() => document.querySelector('[data-testid=qr-code] svg, .qr-missing'));
    await shot(p, 'qr');
    await p.goto(url(`#/print/${BOOK}`));
    await p.waitForFunction(() => document.querySelector('[data-testid=print-missing]') || document.querySelector('[data-testid=print-pages]')?.children.length && !document.querySelector('[data-testid=print-pages] .reader-loading'), null, { timeout: 8000 });
    await shot(p, 'print');
    await p.goto(url(`#/b/${BOOK}/magic/2`));
    await p.waitForFunction(() => document.querySelector('[data-testid=magic-unavailable]') || (document.querySelector('[data-testid=magic-host]') && !document.querySelector('[data-testid=magic-host] .reader-loading')), null, { timeout: 8000 });
    await shot(p, 'magic');
    // No profile: reading redirects to the name box.
    await p.evaluate(() => localStorage.removeItem('starring.v1'));
    await p.goto(url(`#/b/${BOOK}/read/3`));
    await p.reload();
    await p.getByTestId('name-input').waitFor();
    eq(await hashOf(p), `#/b/${BOOK}`, 'redirected to the landing page');
    await noErrors(errs, 'other routes');
    await c.close();
  });

  await step('production path /b/<id> is understood (via the <base> fix-up)', async () => {
    // http-server has no rewrite, so fake one: serve index.html at /b/<id>.
    const { page: p, errors: errs, context: c } = await openPage(browser);
    await p.route(`${BASE}/b/${BOOK}?test=1`, async (r) => r.fulfill({ status: 200, contentType: 'text/html', body: await (await fetch(`${BASE}/index.html`)).text() }));
    await p.goto(`${BASE}/b/${BOOK}?test=1`);
    await p.getByTestId('name-input').waitFor();
    eq(await p.evaluate(() => location.pathname + location.search + location.hash), `/?test=1#/b/${BOOK}`, 'rewritten address');
    await noErrors(errs, 'path entry');
    await c.close();
  });

  await step('offline: the service worker serves the app after one visit (?sw=1 on localhost)', async () => {
    const { page: p, errors: errs, context: c } = await openPage(browser);
    await p.goto(`${BASE}/?sw=1#/b/${BOOK}`);
    await p.getByTestId('name-input').waitFor();
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await p.reload(); // now controlled: everything the page loads is cached
    await p.getByTestId('cover-art').locator('svg').first().waitFor();
    await p.waitForTimeout(500);
    await c.setOffline(true);
    await p.reload();
    await p.getByTestId('name-input').waitFor({ timeout: 8000 });
    await p.getByTestId('cover-art').locator('svg').first().waitFor();
    await p.getByTestId('name-input').fill('Ava');
    await p.waitForFunction(() => document.querySelector('[data-testid=cover-title]')?.textContent.includes('Ava'));
    await c.setOffline(false);
    await p.evaluate(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
    });
    await noErrors(errs, 'offline');
    await c.close();
  });

  await step('no horizontal scroll on any screen at 360x640 and 768x1024', async () => {
    for (const viewport of [{ width: 360, height: 640 }, { width: 768, height: 1024 }]) {
      const { page: p, errors: errs, context: c } = await openPage(browser, { viewport, seed: seeded(), hooks: { gateMs: 150 } });
      const check = async (hash, ready) => {
        await p.goto(url(hash));
        await p.waitForSelector(ready, { timeout: 8000 });
        await p.waitForTimeout(250);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(over <= 0, `${hash} scrolls sideways by ${over}px at ${viewport.width}x${viewport.height}`);
      };
      await check(`#/b/${BOOK}`, '[data-testid=start-reading]');
      await check(`#/b/${BOOK}/name`, '[data-testid=name-input]');
      await check(`#/b/${BOOK}/say`, '[data-testid=candidate]');
      await check('#/', '[data-testid=shelf-book]');
      await check(`#/qr/${BOOK}`, '[data-testid=qr-url]');
      await check(`#/b/${BOOK}/record`, '[data-testid=reader-name]');
      await check(`#/b/${BOOK}/gift`, '[data-testid=gift-child]');
      await check('#/open', '[data-testid=pack-pick]');
      await check('#/settings', '[data-testid=gate-screen]');
      await holdGate(p, 400);
      await p.getByTestId('settings-child').first().waitFor();
      eq(await p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 0), true, 'settings fits');
      await noErrors(errs, `layout at ${viewport.width}x${viewport.height}`);
      await c.close();
    }
  });

  await step('fails soft: blocked storage, no speech engine, reduced motion', async () => {
    const { page: p, errors: errs, context: c } = await openPage(browser, {
      reducedMotion: 'reduce',
      init: () => {
        // Private mode / sandboxed: storage throws; no speechSynthesis at all.
        Storage.prototype.setItem = () => {
          throw new DOMException('blocked', 'SecurityError');
        };
        delete window.speechSynthesis;
        delete window.SpeechSynthesisUtterance;
        try {
          Object.defineProperty(window, 'indexedDB', { get: () => undefined });
        } catch {
          /* ignore */
        }
      },
    });
    await p.goto(`${BASE}/?b=${BOOK}`);
    await p.getByTestId('name-input').fill('Niamh');
    await p.getByTestId('name-continue').click();
    await p.getByTestId('candidate').first().waitFor();
    await p.getByTestId('no-voice').waitFor(); // explains why nothing is heard
    await p.getByTestId('hear-in-story').click();
    await p.waitForSelector('[data-testid=story-preview] .sb-word.is-current', { timeout: 5000 });
    await p.getByTestId('pronunciation-done').click();
    await p.getByTestId('start-reading').waitFor();
    eq(await p.getByTestId('active-child').innerText(), 'Niamh', 'works from memory');
    await noErrors(errs, 'fail-soft');
    await c.close();
  });

  // ---- Screenshots of every screen at three sizes ------------------------------------------
  if (SHOTS) {
    for (const viewport of [PHONE, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
      await step(`screenshots at ${viewport.width}x${viewport.height}`, async () => {
        const blank = await openPage(browser, { viewport });
        await blank.page.goto(url(`#/b/${BOOK}`));
        await blank.page.getByTestId('cover-art').locator('svg').first().waitFor();
        await shot(blank.page, 'landing');
        await blank.page.getByTestId('name-input').fill('Siobhan');
        await blank.page.waitForTimeout(400);
        await shot(blank.page, 'landing-typed');
        await noErrors(blank.errors, 'landing screenshots');
        await blank.context.close();

        const { page: p, errors: errs, context: c } = await openPage(browser, { viewport, seed: seeded({ profiles: [PROFILE, { ...PROFILE, id: 'child_2', display: 'Oluwaseun', key: 'oluwaseun', pronunciation: { say: 'Oluwaseun', source: 'as-written', label: 'As written', respell: '', ipa: '', useRecording: false, recordingId: null } }] }), hooks: { gateMs: 150 } });
        const visit = async (hash, name, ready) => {
          await p.goto(url(hash));
          await p.waitForSelector(ready, { timeout: 8000 });
          await p.waitForTimeout(500);
          await shot(p, name);
        };
        await visit(`#/b/${BOOK}`, 'ready', '[data-testid=start-reading]');
        await visit(`#/b/${BOOK}/say`, 'say', '[data-testid=candidate]');
        await visit(`#/b/${BOOK}/name`, 'add-child', '[data-testid=child-chip]');
        await visit('#/', 'home', '[data-testid=shelf-book] svg');
        await visit(`#/qr/${BOOK}`, 'qr', '[data-testid=qr-url]');
        await visit('#/b/nope', 'unknown-book', '[data-testid=unknown-book]');
        await p.goto(url(`#/b/${BOOK}`));
        await p.getByTestId('open-settings').click();
        await p.getByTestId('parent-gate').waitFor();
        await shot(p, 'gate-dialog');
        await p.keyboard.press('Escape');
        await visit('#/settings', 'settings-gate', '[data-testid=gate-screen]');
        await holdGate(p, 400);
        await p.getByTestId('settings-child').first().waitFor();
        await shot(p, 'settings');
        if (readerExists) await visit(`#/b/${BOOK}/read/2`, 'reader', '[data-testid=reader]');
        await visit(`#/print/${BOOK}`, 'print', '[data-testid=print-pages], [data-testid=print-missing]');
        await noErrors(errs, `screens at ${viewport.width}x${viewport.height}`);
        await c.close();
      });
    }
  }
} finally {
  await browser.close();
  server.stop();
}

if (pending.size) console.log(`\n  note: not written yet (404, not counted as failures): ${[...pending].join(', ')}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} app e2e steps passed`);
if (failed.length) process.exitCode = 1;
