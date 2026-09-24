// Browser test for "Find your first letter" (js/activities/letter-trace.js),
// run against tests/fixtures/activities/ with Playwright's Chromium:
//   node tests/e2e/activities.e2e.mjs                 (PORT=8131 by default)
//   SHOTS=/some/dir node tests/e2e/activities.e2e.mjs  also saves screenshots
//   NO_FONTS=1 ...                                     leave out the app's self-hosted fonts
//     (css/fonts.css), to check the fallback system fonts
//   ONLY=<text> runs only the steps whose name contains it
// Starts and stops its own static server. Exits non-zero on any failure.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 8131);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS ?? '';
const NO_FONTS = process.env.NO_FONTS === '1';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const HARNESS = `${BASE}/tests/fixtures/activities/index.html`;
const FAST = 'test=1&stub=1&scale=0.05&idle=60000&seed=3';

// ---- tiny runner ----------------------------------------------------------------
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
    console.log(`  FAIL ${name}\n       ${String(err?.stack ?? err).split('\n').slice(0, 4).join('\n       ')}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ---- server (own process group, so the whole tree goes on exit) -------------------
async function startServer() {
  const local = '/opt/node22/bin/http-server';
  const [cmd, args] = existsSync(local) ? [local, []] : [process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'http-server']];
  const proc = spawn(cmd, [...args, ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/package.json`)).ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  stopServer(proc);
  throw new Error(`http-server did not start on ${PORT}`);
}
function stopServer(proc) {
  try {
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    try {
      proc.kill();
    } catch {
      /* gone */
    }
  }
}

// ---- page helpers -----------------------------------------------------------------
let browser;
const consoleErrors = [];
async function open(query, { viewport = { width: 390, height: 844 }, reducedMotion = 'no-preference', hasTouch = false, waitFor = 'find' } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch, deviceScaleFactor: SHOTS ? 2 : 1 });
  const page = await context.newPage();
  lastPage = page;
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`${query}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${query}: pageerror ${e.message}`));
  // The harness links the app's self-hosted fonts (css/fonts.css); NO_FONTS=1 checks the fallback fonts.
  if (NO_FONTS) await page.route(/\/css\/fonts\.css$/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    window.__ptypes = [];
    document.addEventListener('pointerdown', (e) => window.__ptypes.push(e.pointerType), true);
  });
  await page.goto(`${HARNESS}?${query}`);
  if (waitFor) await page.waitForSelector(`.sb-lt[data-step="${waitFor}"]`, { timeout: 8000 });
  return page;
}
const close = (page) => page.context().close();
const log = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__log)));
const attr = (page, name) => page.getAttribute('.sb-lt', name);
const stepIs = (page, s, timeout = 6000) => page.waitForSelector(`.sb-lt[data-step="${s}"]`, { timeout });
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

async function findLetter(page) {
  const letter = await attr(page, 'data-letter');
  await page.click(`.sb-lt-tile[data-glyph="${letter}"]`);
  await stepIs(page, 'trace');
  await page.waitForSelector('.sb-lt[data-mode]');
  return letter;
}

/** The guide strokes in page coordinates. */
function guideStrokes(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid=lt-guide]');
    const r = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('polyline.sb-lt-guide-line')].map((pl) =>
      pl
        .getAttribute('points')
        .trim()
        .split(/\s+/)
        .map((p) => p.split(',').map(Number))
        .map(([x, y]) => [r.left + x, r.top + y]),
    );
  });
}

/** Drag the mouse along each guide stroke, with a toddler's wobble (jitter px). */
async function traceStrokes(page, strokes, { jitter = 7 } = {}) {
  let k = 0;
  for (const s of strokes) {
    await page.mouse.move(s[0][0], s[0][1]);
    await page.mouse.down();
    for (const [x, y] of s.slice(1)) {
      k += 1;
      await page.mouse.move(x + Math.sin(k * 1.7) * jitter, y + Math.cos(k * 1.3) * jitter, { steps: 3 });
    }
    await page.mouse.up();
  }
}

/** Rows across the letter's ink, read back from the glyph canvas (for letters with no stroke guide). */
function glyphRows(page, spacing = 12) {
  return page.evaluate((spacing) => {
    const cv = document.querySelector('.sb-lt-glyph');
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const inkAt = (x, y) => data[(Math.round(y * k) * cv.width + Math.round(x * k)) * 4 + 3] > 200;
    const rows = [];
    for (let y = spacing / 2; y < r.height; y += spacing) {
      let start = null;
      for (let x = 0; x <= r.width; x += 2) {
        const ink = x < r.width - 1 && inkAt(x, y);
        if (ink && start === null) start = x;
        if (!ink && start !== null) {
          rows.push([[r.left + start + 2, r.top + y], [r.left + x - 4, r.top + y]]);
          start = null;
        }
      }
    }
    return rows;
  }, spacing);
}

// ---- tests --------------------------------------------------------------------------
const server = await startServer();
browser = await chromium.launch();
try {
  await step('adds its own stylesheet once and styles itself', async () => {
    const page = await open(`${FAST}&auto=0`, { waitFor: null });
    eq(await page.locator('link[data-sb-activities]').count(), 0, 'no stylesheet before mounting');
    await page.evaluate(() => window.__mount());
    await stepIs(page, 'find');
    await page.evaluate(() => {
      window.__api.destroy();
      window.__mount();
    });
    await stepIs(page, 'find');
    eq(await page.locator('link[data-sb-activities]').count(), 1, 'one stylesheet link after two mounts');
    eq(await page.locator('.sb-lt').count(), 1, 'the first mount cleaned up after itself');
    const href = await page.getAttribute('link[data-sb-activities]', 'href');
    assert(href.endsWith('/css/activities.css'), href);
    eq(await page.$eval('.sb-lt', (el) => getComputedStyle(el).position), 'fixed', 'styled as a full-screen overlay');
    eq(await page.$eval('.sb-lt', (el) => el.style.visibility), '', 'shown once ready');
    await close(page);
  });

  await step('find it: the voice asks, wrong taps wobble quietly, the right one sparkles', async () => {
    const page = await open(FAST);
    eq(await attr(page, 'data-letter'), 'A', 'Ava starts with A');
    eq(await page.locator('.sb-lt-tile').count(), 6, 'six tiles');
    eq(await page.locator('.sb-lt-tile[data-glyph="A"]').count(), 1, 'one A to find');
    eq(await page.textContent('[data-testid=lt-prompt]'), 'Can you find the letter A? A is for Ava!', 'shown text');
    eq((await log(page)).speak[0], 'Can you find the letter ay? ay is for Ava!', 'spoken text says "ay", not "uh"');
    eq(await page.textContent('[data-testid=lt-kicker]'), "Ava's letter", 'kicker');
    const wrong = page.locator('.sb-lt-tile[data-kind=letter]:not([data-target])').first();
    const other = await wrong.getAttribute('data-glyph');
    await wrong.click();
    assert(await wrong.evaluate((b) => b.classList.contains('is-wobble')), 'a wrong tile wobbles');
    eq(await page.$eval('.sb-lt-tile.is-wobble', (b) => getComputedStyle(b).animationName), 'sb-lt-wobble', 'wobble animation');
    eq((await log(page)).sfx, [], 'no sound at all for a wrong tap');
    const said = (await log(page)).speak.at(-1);
    assert(said.startsWith(`That's ${other === 'A' ? 'ay' : other === 'Z' ? 'zed' : other}.`) && said.includes('Can you find ay?'), `kind correction: ${said}`);
    await page.click('.sb-lt-tile[data-kind=shape]');
    assert(/^That's a (star|heart|moon|flower|cloud|leaf)\. Can you find ay\?$/.test((await log(page)).speak.at(-1)), 'names the shape');
    assert(await page.$eval('.sb-lt-tile[data-target]', (b) => b.classList.contains('is-hint')), 'after two misses the right tile glows');
    eq((await log(page)).sfx, [], 'still no sounds');
    await shot(page, 'find-wrong-390x844');
    await page.click('.sb-lt-tile[data-glyph="A"]');
    assert(await page.$eval('.sb-lt-tile[data-target]', (b) => b.classList.contains('is-found')), 'the right tile is found');
    eq(await page.locator('.sb-lt-tile.is-faded').count(), 5, 'the others fade');
    await page.waitForFunction(() => window.__log.sfx.includes('ding'));
    eq((await log(page)).sfx, ['sparkle', 'ding'], 'sparkle + ding');
    assert((await log(page)).speak.includes('Yes! ay for Ava!'), 'praise');
    await stepIs(page, 'trace');
    eq(await attr(page, 'data-mode'), 'guided', 'A has a stroke guide');
    eq(await page.locator('polyline.sb-lt-guide-line').count(), 3, 'three strokes for A');
    eq(await page.locator('.sb-lt-dot').count(), 3, 'three numbered start dots');
    eq(await page.locator('.sb-lt-dot.is-first').count(), 1, 'one green first dot');
    assert((await page.locator('.sb-lt-arrow').count()) >= 3, 'direction arrows');
    eq(await page.$eval('[data-testid=lt-canvas]', (c) => getComputedStyle(c).touchAction), 'none', 'touch-action none on the canvas');
    eq(await page.$eval('.sb-lt', (c) => getComputedStyle(c).touchAction), 'manipulation', '...and only the canvas');
    assert((await log(page)).speak.at(-1) === 'Now trace the ay with your finger. Start at the green dot!', 'trace prompt');
    await close(page);
  });

  await step('trace it: half a letter is not enough; following the guide completes it and Done calls onDone', async () => {
    const page = await open(FAST);
    await findLetter(page);
    const strokes = await guideStrokes(page);
    await traceStrokes(page, strokes.slice(0, 1));
    const partial = Number(await attr(page, 'data-coverage'));
    assert(partial > 0.2 && partial < 0.7, `one stroke of three: ${partial}`);
    eq(await attr(page, 'data-step'), 'trace', 'still tracing');
    assert(await page.isVisible('[data-testid=lt-rubout]'), 'Start again appears once there is ink');
    await shot(page, 'trace-partial-390x844');
    await traceStrokes(page, strokes.slice(1));
    await stepIs(page, 'celebrate');
    const cov = Number(await attr(page, 'data-coverage'));
    assert(cov >= 0.7, `covered ${cov}`);
    const l = await log(page);
    assert(l.speak.includes("Brilliant! That's the letter ay, the first letter of Ava!"), 'celebration line');
    eq(await page.textContent('[data-testid=lt-prompt]'), "Brilliant! That's the letter A — the first letter of Ava!", 'shown text');
    await page.waitForFunction(() => window.__log.sfx.includes('cheer'));
    assert((await page.locator('.sb-lt-confetti-piece').count()) > 10, 'confetti');
    assert(await page.isVisible('[data-testid=lt-again]'), 'Trace it again');
    assert(await page.isVisible('[data-testid=lt-done]'), 'Done');
    assert(!(await page.isVisible('[data-testid=lt-next]')), 'no Next for one child');
    assert(!(await page.isVisible('[data-testid=lt-show-me]')), 'Show me goes away');
    await page.waitForTimeout(250);
    await shot(page, 'celebrate-390x844');
    await page.click('[data-testid=lt-done]');
    const done = (await log(page)).done;
    eq(done, [{ letters: ['A'], results: [{ letter: 'A', names: ['Ava'], how: 'traced' }] }], 'onDone result');
    eq(await page.locator('.sb-lt').count(), 0, 'the harness destroyed it');
    await close(page);
  });

  await step('Start again and Trace it again clear the ink', async () => {
    const page = await open(FAST);
    await findLetter(page);
    const strokes = await guideStrokes(page);
    await traceStrokes(page, strokes.slice(0, 1));
    assert(Number(await attr(page, 'data-coverage')) > 0, 'some ink');
    await page.click('[data-testid=lt-rubout]');
    eq(await attr(page, 'data-coverage'), '0.00', 'rubbed out');
    assert(!(await page.$eval('.sb-lt', (el) => el.classList.contains('has-ink'))), 'no ink');
    await traceStrokes(page, strokes);
    await stepIs(page, 'celebrate');
    await page.click('[data-testid=lt-again]');
    await stepIs(page, 'trace');
    eq(await attr(page, 'data-coverage'), '0.00', 'fresh letter');
    const blank = await page.$eval('[data-testid=lt-canvas]', (c) => !c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v));
    assert(blank, 'the ink canvas is empty again');
    await traceStrokes(page, await guideStrokes(page));
    await stepIs(page, 'celebrate');
    await close(page);
  });

  await step('scribbling round the edges of the card does not count', async () => {
    const page = await open(FAST);
    await findLetter(page);
    const box = await page.locator('.sb-lt-stage').boundingBox();
    const pts = [];
    for (let i = 0; i <= 24; i++) pts.push([box.x + 20 + ((i % 2) * (box.width - 40)), box.y + 20 + i * 4]);
    for (let i = 0; i <= 24; i++) pts.push([box.x + 20 + ((i % 2) * (box.width - 40)), box.y + box.height - 20 - i * 4]);
    await traceStrokes(page, [pts], { jitter: 0 });
    eq(await attr(page, 'data-step'), 'trace', 'not complete');
    assert(Number(await attr(page, 'data-coverage')) < 0.7, 'little of the letter covered');
    await close(page);
  });

  await step('keyboard only: find with Tab + Enter, Show me traces it and counts, Done', async () => {
    const page = await open(FAST);
    await page.waitForFunction(() => document.activeElement?.closest('.sb-lt'));
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      await page.keyboard.press('Tab');
      found = await page.evaluate(() => document.activeElement?.dataset?.glyph === 'A');
    }
    assert(found, 'the A tile is reachable with Tab');
    eq(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Letter A', 'tile label');
    await page.keyboard.press('Enter');
    await stepIs(page, 'trace');
    await page.waitForFunction(() => document.activeElement?.dataset?.testid === 'lt-show-me');
    eq(await page.getAttribute('[data-testid=lt-canvas]', 'aria-label'), 'Trace the letter A here with your finger, or press Show me to watch it being traced.', 'canvas label');
    await page.keyboard.press('Enter');
    await stepIs(page, 'showing');
    await stepIs(page, 'celebrate');
    await page.waitForFunction(() => document.activeElement?.dataset?.testid === 'lt-done');
    await page.keyboard.press('Enter');
    eq((await log(page)).done[0].results[0].how, 'shown', 'Show me counts as done');
    await close(page);
  });

  await step('Skip calls onSkip from any step', async () => {
    for (const where of ['find', 'trace']) {
      const page = await open(FAST);
      if (where === 'trace') await findLetter(page);
      await page.click('[data-testid=lt-skip]');
      const l = await log(page);
      eq(l.skip.length, 1, `skipped from ${where}`);
      eq(l.skip[0].letters, ['A'], 'skip result');
      eq(l.done.length, 0, 'not done');
      await close(page);
    }
  });

  await step('siblings take turns: A for Amara, then Z for Zak', async () => {
    const page = await open(`${FAST}&sibs=Amara,Zak`);
    eq(await attr(page, 'data-letter'), 'A', 'Amara first');
    eq(await page.textContent('[data-testid=lt-kicker]'), "Amara's letter1/2", 'kicker with progress');
    eq(await page.locator('.sb-lt-tile[data-glyph="Z"]').count(), 0, "Zak's letter isn't a distractor");
    await findLetter(page);
    await page.click('[data-testid=lt-show-me]');
    await stepIs(page, 'celebrate');
    assert(await page.isVisible('[data-testid=lt-next]'), 'Next letter');
    assert(!(await page.isVisible('[data-testid=lt-done]')), 'not Done yet');
    await page.click('[data-testid=lt-next]');
    await stepIs(page, 'find');
    eq(await attr(page, 'data-letter'), 'Z', 'then Zak');
    eq((await log(page)).speak.at(-1), "Now it's Zak's turn! Can you find the letter zed? zed is for Zak!", 'turn line, UK "zed"');
    await shot(page, 'siblings-find-Z-390x844');
    await findLetter(page);
    const strokes = await guideStrokes(page);
    eq(strokes.length, 1, 'Z is one stroke');
    await traceStrokes(page, strokes);
    await stepIs(page, 'celebrate');
    await page.click('[data-testid=lt-done]');
    eq((await log(page)).done[0], { letters: ['A', 'Z'], results: [{ letter: 'A', names: ['Amara'], how: 'shown' }, { letter: 'Z', names: ['Zak'], how: 'traced' }] }, 'both results');
    await close(page);
  });

  await step('accents: É is found, and traced over the E guide', async () => {
    const page = await open(`${FAST}&name=${encodeURIComponent('élodie')}`);
    eq(await attr(page, 'data-letter'), 'É', 'upper-case accented letter');
    eq(await page.locator('.sb-lt-tile[data-glyph="E"]').count(), 0, 'no plain E to confuse it with');
    await findLetter(page);
    eq(await attr(page, 'data-mode'), 'guided', 'guided');
    const strokes = await guideStrokes(page);
    eq(strokes.length, 4, 'E strokes');
    await traceStrokes(page, strokes);
    await stepIs(page, 'celebrate');
    await close(page);
  });

  await step('Arabic: م is found among Arabic letters and coloured in by outline', async () => {
    const page = await open(`${FAST}&name=${encodeURIComponent('مريم')}`);
    eq(await attr(page, 'data-letter'), 'م', 'first letter');
    const letters = await page.$$eval('.sb-lt-tile[data-kind=letter]', (els) => els.map((e) => e.dataset.glyph));
    assert(letters.every((c) => /\p{Script=Arabic}/u.test(c)), `Arabic distractors: ${letters}`);
    await findLetter(page);
    eq(await attr(page, 'data-mode'), 'outline', 'no stroke order: outline mode');
    eq(await page.locator('polyline.sb-lt-guide-line').count(), 0, 'no guide');
    assert((await log(page)).speak.at(-1).startsWith('Now colour in the م'), 'colour-in prompt');
    await shot(page, 'arabic-trace-390x844');
    await traceStrokes(page, await glyphRows(page), { jitter: 0 });
    await stepIs(page, 'celebrate');
    await shot(page, 'arabic-done-390x844');
    await close(page);
  });

  await step('Welsh: Llinos gets "Ll" when the language is Welsh', async () => {
    const page = await open(`${FAST}&name=Llinos&lang=cy`);
    eq(await attr(page, 'data-letter'), 'Ll', 'one Welsh letter');
    eq(await page.locator('.sb-lt-tile[data-glyph="L"]').count(), 0, 'no plain L tile');
    await findLetter(page);
    eq(await attr(page, 'data-mode'), 'outline', 'coloured in');
    await page.click('[data-testid=lt-show-me]');
    await stepIs(page, 'celebrate');
    await close(page);
  });

  await step('a letter the device cannot draw never shows a broken box', async () => {
    const page = await open(`${FAST}&name=${encodeURIComponent('小明')}`, { waitFor: null });
    await page.waitForFunction(() => ['find', 'celebrate'].includes(document.querySelector('.sb-lt')?.dataset.step));
    const s = await attr(page, 'data-step');
    if (s === 'find') {
      // This machine has a CJK font: the game runs with Han distractors.
      eq(await attr(page, 'data-letter'), '小', 'first character');
      await findLetter(page);
      await page.click('[data-testid=lt-show-me]');
      await stepIs(page, 'celebrate');
    } else {
      eq(await attr(page, 'data-mode'), 'none', 'nothing to trace');
      eq(await page.textContent('[data-testid=lt-prompt]'), 'Well done, 小明!', 'a friendly ending');
      eq(await page.locator('.sb-lt-tile').count(), 0, 'no tofu tiles');
      await page.click('[data-testid=lt-done]');
      eq((await log(page)).done[0], { letters: [], results: [] }, 'nothing played');
    }
    await close(page);
  });

  await step('touch: a finger traces the letter (pointer events, no scrolling)', async () => {
    const page = await open(`${FAST}&name=Leo`, { hasTouch: true });
    await page.tap('.sb-lt-tile[data-glyph="L"]');
    await stepIs(page, 'trace');
    await page.waitForSelector('.sb-lt[data-mode]');
    const [stroke] = await guideStrokes(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, [x, y]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8 }] });
    await touch('touchStart', stroke[0]);
    for (let i = 1; i < stroke.length; i++) {
      const [x0, y0] = stroke[i - 1];
      const [x1, y1] = stroke[i];
      for (let k = 1; k <= 3; k++) await touch('touchMove', [x0 + ((x1 - x0) * k) / 3, y0 + ((y1 - y0) * k) / 3]);
    }
    await touch('touchEnd', stroke.at(-1));
    await stepIs(page, 'celebrate');
    assert((await page.evaluate(() => window.__ptypes)).includes('touch'), 'touch pointers');
    eq(await page.evaluate(() => [scrollX, scrollY]), [0, 0], 'the page did not scroll');
    await close(page);
  });

  await step('idle: the voice re-prompts and Show me is nudged', async () => {
    const page = await open('test=1&stub=1&scale=0.05&idle=400&seed=3');
    await page.waitForFunction(() => window.__log.speak.filter((s) => s.startsWith('Can you find')).length >= 2, null, { timeout: 4000 });
    await findLetter(page);
    await page.waitForFunction(() => window.__log.speak.at(-1) === 'Put your finger on the green dot and follow the arrows.', null, { timeout: 4000 });
    assert(await page.$eval('[data-testid=lt-show-me]', (b) => b.classList.contains('is-nudge')), 'Show me nudged');
    await close(page);
  });

  await step('bedtime: dim palette, soft sounds only, no confetti', async () => {
    const page = await open(`${FAST}&name=Ava&bedtime=1`);
    eq(await page.getAttribute('.sb-lt', 'data-bedtime'), '', 'bedtime flag');
    const bg = await page.$eval('.sb-lt', (el) => getComputedStyle(el).backgroundImage);
    assert(bg.includes('rgb(27, 33, 70)'), `night sky background: ${bg.slice(0, 80)}`);
    await shot(page, 'bedtime-find-390x844');
    await findLetter(page);
    await page.click('[data-testid=lt-show-me]');
    await stepIs(page, 'celebrate');
    await page.waitForTimeout(400);
    eq(await page.locator('.sb-lt-confetti-piece').count(), 0, 'no confetti at bedtime');
    const sfx = (await log(page)).sfx;
    assert(!sfx.includes('cheer'), `no cheering at bedtime: ${sfx}`);
    assert(sfx.at(-1) === 'ding', 'a soft ding');
    await shot(page, 'bedtime-celebrate-390x844');
    await close(page);
  });

  await step('reduced motion: nothing floats or wobbles, confetti only fades', async () => {
    const page = await open(`${FAST}`, { reducedMotion: 'reduce' });
    eq(await page.getAttribute('.sb-lt', 'data-reduced'), '', 'follows the device setting');
    eq(await page.$eval('.sb-lt-tile-bob', (el) => getComputedStyle(el).animationName), 'none', 'no bobbing');
    const wrong = page.locator('.sb-lt-tile[data-kind=letter]:not([data-target])').first();
    await wrong.click();
    eq(await wrong.evaluate((el) => getComputedStyle(el).animationName), 'none', 'no wobble');
    eq(await page.locator('.sb-lt-burst').count(), 0, 'no burst yet');
    await page.click('.sb-lt-tile[data-target]');
    eq(await page.locator('.sb-lt-burst').count(), 0, 'no star burst');
    await stepIs(page, 'trace');
    await page.waitForSelector('.sb-lt[data-mode]');
    eq(await page.$eval('.sb-lt-dot-ring', (el) => getComputedStyle(el).animationName), 'none', 'no pulsing ring');
    await page.click('[data-testid=lt-show-me]');
    await stepIs(page, 'celebrate');
    assert(!(await page.isVisible('.sb-lt-pen')), 'no moving pen');
    const names = await page.$$eval('.sb-lt-confetti-piece', (els) => [...new Set(els.map((e) => getComputedStyle(e).animationName))]);
    eq(names, ['sb-lt-fade'], 'confetti fades in place');
    await close(page);
    // An explicit option wins over the device.
    const page2 = await open(`${FAST}&reduced=1`);
    eq(await page2.getAttribute('.sb-lt', 'data-reduced'), '', 'reducedMotion: true');
    await close(page2);
    const page3 = await open(`${FAST}&reduced=0`, { reducedMotion: 'reduce' });
    eq(await page3.getAttribute('.sb-lt', 'data-reduced'), null, 'reducedMotion: false');
    await close(page3);
  });

  await step('turning the phone mid-trace keeps the child\'s ink', async () => {
    const page = await open(FAST);
    await findLetter(page);
    await traceStrokes(page, (await guideStrokes(page)).slice(0, 1));
    const before = Number(await attr(page, 'data-coverage'));
    assert(before > 0.2, `some ink before turning: ${before}`);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('.sb-lt-stage').clientHeight < 380);
    await page.waitForTimeout(200);
    const after = Number(await attr(page, 'data-coverage'));
    assert(Math.abs(after - before) < 0.12, `coverage kept: ${before} -> ${after}`);
    eq(await attr(page, 'data-step'), 'trace', 'still tracing');
    const inked = await page.$eval('[data-testid=lt-canvas]', (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v));
    assert(inked, 'ink redrawn at the new size');
    await traceStrokes(page, (await guideStrokes(page)).slice(1));
    await stepIs(page, 'celebrate');
    await close(page);
  });

  await step('destroy() mid-sentence stops the voice and removes everything', async () => {
    const page = await open('test=1&stub=1&scale=1&idle=60000&seed=3');
    await page.evaluate(() => window.__api.destroy());
    eq(await page.locator('.sb-lt').count(), 0, 'removed');
    assert((await log(page)).stops >= 1, 'narrator.stop() was called');
    await page.waitForTimeout(200);
    eq(await page.evaluate(() => typeof window.__api.destroy), 'function', 'destroy is idempotent');
    await page.evaluate(() => window.__api.destroy());
    await close(page);
  });

  await step('real narrator and sfx modules (silent test mode) work end to end', async () => {
    const page = await open('test=1&scale=0.05&idle=60000&seed=3');
    await findLetter(page);
    await page.click('[data-testid=lt-show-me]');
    await stepIs(page, 'celebrate');
    await page.click('[data-testid=lt-done]');
    eq((await log(page)).done.length, 1, 'done');
    await close(page);
  });

  for (const [w, h] of [[390, 844], [844, 390], [1024, 768]]) {
    await step(`layout at ${w}x${h}: fits, no sideways scroll, big targets`, async () => {
      const page = await open(`${FAST}&name=Muhammad`, { viewport: { width: w, height: h } });
      const check = async (label) => {
        const r = await page.evaluate(() => {
          const out = { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, small: [], outside: [] };
          for (const el of document.querySelectorAll('.sb-lt button')) {
            const b = el.getBoundingClientRect();
            if (!b.width) continue;
            // Layout size (offset*), not the on-screen box, which shrinks while a button pops in.
            if (el.offsetWidth < 56 || el.offsetHeight < 56) out.small.push(`${el.dataset.testid}:${el.offsetWidth}x${el.offsetHeight}`);
            if (b.left < -1 || b.right > innerWidth + 1 || b.top < -1 || b.bottom > innerHeight + 1) out.outside.push(el.dataset.testid);
          }
          return out;
        });
        assert(r.scrollW <= r.innerW, `${label}: no horizontal scroll (${r.scrollW} > ${r.innerW})`);
        eq(r.small, [], `${label}: targets >= 56 px`);
        eq(r.outside, [], `${label}: everything on screen`);
      };
      await page.waitForTimeout(300);
      await check('find');
      await shot(page, `find-${w}x${h}`);
      await findLetter(page);
      await page.waitForTimeout(500); // let the buttons finish popping in
      await check('trace');
      const strokes = await guideStrokes(page);
      await traceStrokes(page, strokes.slice(0, 1));
      await shot(page, `trace-${w}x${h}`);
      await traceStrokes(page, strokes.slice(1));
      await stepIs(page, 'celebrate');
      await page.waitForTimeout(250);
      await check('celebrate');
      await shot(page, `celebrate-${w}x${h}`);
      await close(page);
    });
  }

  for (const [w, h] of [[390, 844], [844, 390]]) {
    await step(`easy read and high contrast at ${w}x${h}: spaced-out words, black on white, bold edges`, async () => {
      const plain = await open(`${FAST}&name=Ava`, { viewport: { width: w, height: h } });
      const base = await plain.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.sb-lt-say')).fontSize));
      await close(plain);
      const page = await open(`${FAST}&name=Ava&easy=1`, { viewport: { width: w, height: h } });
      const easy = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.sb-lt-say'));
        const px = (v) => parseFloat(v) || 0;
        return { size: px(cs.fontSize), letter: px(cs.letterSpacing) / px(cs.fontSize), word: px(cs.wordSpacing) / px(cs.fontSize), line: px(cs.lineHeight) / px(cs.fontSize), align: cs.textAlign, scrollW: document.scrollingElement.scrollWidth, w: innerWidth };
      });
      assert(easy.size >= base * 1.05, `bigger (${easy.size} vs ${base})`);
      assert(easy.letter >= 0.05 && easy.word >= 0.1 && easy.line >= 1.45 && easy.align !== 'justify', `spaced out, not justified (${JSON.stringify(easy)})`);
      assert(easy.scrollW <= easy.w, 'no sideways scroll (easy read)');
      await findLetter(page);
      await stepIs(page, 'trace');
      await page.waitForTimeout(700); // the card slides in
      await shot(page, `easy-read-trace-${w}x${h}`);
      await close(page);

      const hc = await open(`${FAST}&name=Ava&contrast=high`, { viewport: { width: w, height: h } });
      const high = await hc.evaluate(() => {
        const root = getComputedStyle(document.querySelector('.sb-lt'));
        const tile = getComputedStyle(document.querySelector('.sb-lt-tile-face'));
        const skip = getComputedStyle(document.querySelector('[data-testid=lt-skip]'));
        return { colour: root.color, bgImage: root.backgroundImage, bg: root.backgroundColor, tile: parseFloat(tile.borderTopWidth), tileColour: tile.borderTopColor, skip: parseFloat(skip.borderTopWidth), skipColour: skip.borderTopColor, scrollW: document.scrollingElement.scrollWidth, w: innerWidth };
      });
      eq([high.colour, high.bgImage, high.bg], ['rgb(0, 0, 0)', 'none', 'rgb(255, 255, 255)'], 'black on plain white');
      assert(high.tile >= 5 && high.tileColour === 'rgb(0, 0, 0)' && high.skip >= 3 && high.skipColour === 'rgb(0, 0, 0)', `bold edges (${JSON.stringify(high)})`);
      assert(high.scrollW <= high.w, 'no sideways scroll (high contrast)');
      await shot(hc, `high-contrast-find-${w}x${h}`);
      await findLetter(hc);
      await stepIs(hc, 'trace');
      const edge = await hc.evaluate(() => getComputedStyle(document.querySelector('.sb-lt')).getPropertyValue('--lt-glyph-edge').trim());
      eq(edge, '#1B4F72', 'the big letter gets a dark edge');
      await hc.waitForTimeout(700); // the card slides in
      await shot(hc, `high-contrast-trace-${w}x${h}`);
      await close(hc);
    });
  }

  await step('no console errors', async () => {
    eq(consoleErrors, [], 'console errors');
  });
} finally {
  await browser.close().catch(() => {});
  stopServer(server);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
