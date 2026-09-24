// Browser test for the reader (js/reader/*), run against the fixture book in
// tests/fixtures/reader/ with Playwright's Chromium:
//   node tests/e2e/reader.e2e.mjs            (PORT=8104 by default)
//   SHOTS=/some/dir node tests/e2e/reader.e2e.mjs   also saves screenshots
//   REAL_BOOK=0 skips the smoke tests of the real books (REAL_BOOKS=tiffin-digger picks which)
// Starts and stops its own static server. Exits non-zero on any failure.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PW = process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 8104);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS ?? '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const HARNESS = `${BASE}/tests/fixtures/reader/index.html`;

// ---- tiny runner ----------------------------------------------------------------
const results = [];
let lastPage = null; // for a screenshot when a step fails
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

// ---- server ---------------------------------------------------------------------
// npx starts http-server as a child of its own, so killing npx alone would
// leave the server running. It gets its own process group (detached) and the
// whole group is stopped at the end, however the test ends.
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

// ---- page helpers -----------------------------------------------------------------
async function openHarness(browser, query, { viewport = { width: 390, height: 844 }, reducedMotion = 'no-preference', setup = null } = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, hasTouch: false });
  const page = await context.newPage();
  lastPage = page;
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.__missing = [];
  page.on('response', (r) => r.status() === 404 && page.__missing.push(new URL(r.url()).pathname));
  await page.addInitScript(() => {
    // Remember every word that was highlighted, per page (and when, and in which part).
    window.__seen = {};
    window.__hl = [];
    new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target;
        if (t.classList?.contains('is-current') && t.classList.contains('sb-word')) {
          const n = document.querySelector('[data-testid=reader]')?.dataset.page;
          (window.__seen[n] ??= []).push(t.textContent);
          const part = document.querySelector('[data-testid=page-text]')?.dataset.part;
          window.__hl.push({ t: Math.round(performance.now()), page: n, part, unit: t.dataset.unit, text: t.textContent });
        }
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await setup?.(page);
  await page.goto(`${HARNESS}?${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 10000 });
  return { page, context, errors };
}

const reader = (page) => page.locator('[data-testid=reader]');
async function waitState(page, n, state, timeout = 10000) {
  await page.waitForFunction(
    ([n, s]) => {
      const r = document.querySelector('[data-testid=reader]');
      return r && r.dataset.page === String(n) && r.dataset.state === s;
    },
    [n, state],
    { timeout },
  );
}
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}
/** Scene coordinates (1600x1000) -> client pixels for the current page. */
async function toScreen(page, x, y) {
  return page.evaluate(([x, y]) => {
    const svg = document.querySelector('[data-testid=scene] svg');
    const m = svg.getScreenCTM();
    return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  }, [x, y]);
}
async function drag(page, from, to, steps = 14) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}
const control = (page) => page.locator('[data-testid=scene] [data-testid=control]');
const attr = (page, sel, name) => page.locator(`[data-testid=scene] ${sel}`).getAttribute(name);
const shown = (page, sel) =>
  page.evaluate((sel) => {
    const el = document.querySelector(`[data-testid=scene] ${sel}`);
    if (!el) return null;
    for (let n = el; n && n.tagName !== 'svg'; n = n.parentNode) if (n.getAttribute('display') === 'none' || getComputedStyle(n).display === 'none') return false;
    return true;
  }, sel);
const text = (page, sel) => page.locator(`[data-testid=scene] ${sel}`).evaluate((el) => el.textContent);
async function next(page, n) {
  await page.getByTestId('next-page').click();
  await page.waitForFunction((n) => document.querySelector('[data-testid=reader]').dataset.page === String(n), n);
}
function noErrors(errors, where) {
  assert(errors.length === 0, `console errors on ${where}:\n${errors.join('\n')}`);
}

// ---- tests ------------------------------------------------------------------------
const server = await startServer();
// Fake microphone for the recorded-reading clips; autoplay allowed so the clips play without a tap.
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
console.log(`reader e2e on ${BASE}`);

try {
  // A full read-through of the fixture, working every mechanism.
  await step('fixture read-through: every control type, drives, reveals and names', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&name=Siobh%C3%A1n');

    // Page 1: cover, name written in, words highlighted, print-only art hidden.
    await waitState(page, 1, 'done');
    eq(await text(page, '#p1-name'), 'Siobhán', 'cover name');
    const names = await page.locator('[data-testid=page-text] .sb-word.is-name').allTextContents();
    eq(names, ['Siobhán!', 'Siobhán!'], 'name words in the text');
    const seen = await page.evaluate(() => window.__seen['1'] ?? []);
    assert(seen.includes('Test,') && seen.includes('Siobhán!'), `words were highlighted in turn (saw ${seen.join(' ')})`);
    eq(await shown(page, '.sb-print-only'), false, 'print-only art hidden');
    assert(await page.getByTestId('next-page').evaluate((b) => b.closest('.sb-r-next-wrap').classList.contains('is-ready')), 'next button pulses when done');
    eq(await page.getByTestId('page-indicator').getAttribute('aria-label'), 'Page 1 of 8', 'page indicator');
    await shot(page, 'fixture-p1');

    // Page 2: lift-the-flap by dragging it up from its free edge.
    await next(page, 2);
    await waitState(page, 2, 'waiting');
    const c2 = control(page);
    eq(await c2.getAttribute('role'), 'button', 'flap role');
    eq(await c2.getAttribute('aria-label'), 'Lift the flap on the bag!', 'flap label');
    assert((await attr(page, '#p2-name', 'class')).includes('is-pending'), 'name under the flap waits for the flap');
    eq(await shown(page, '#p2-socks'), false, 'data-reveal hidden before completion');
    const [fx, fy] = await toScreen(page, 1200, 860);
    const [, fy2] = await toScreen(page, 1200, 420);
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    for (let i = 1; i <= 7; i++) await page.mouse.move(fx, fy + ((fy2 - fy) * i) / 14);
    await shot(page, 'fixture-p2-lifting');
    assert(Number(await c2.getAttribute('data-progress')) > 0.2, 'flap follows the finger');
    assert(/scale/.test(await attr(page, '#p2-flap', 'transform')), 'flap is transformed while lifting');
    for (let i = 8; i <= 14; i++) await page.mouse.move(fx, fy + ((fy2 - fy) * i) / 14);
    await page.mouse.up();
    await waitState(page, 2, 'done');
    eq(await c2.getAttribute('data-state'), 'done', 'flap control done');
    eq(await shown(page, '#p2-socks'), true, 'data-reveal shown on completion');
    eq(await shown(page, '#p2-sparkles'), true, 'complete.show');
    eq(await text(page, '#p2-name'), 'SIOBHÁN', 'upper-case name on the shirt');
    assert(!(await attr(page, '#p2-name', 'class')).includes('is-pending'), 'name written once revealed');
    const log2 = await page.evaluate(() => window.__log.sfx);
    assert(log2.includes('pop') && log2.includes('ding'), `complete sfx played (${log2})`);
    await shot(page, 'fixture-p2-done');

    // Page 3: wheel via tap ("show me"); flip-book frames and bunting letters.
    await next(page, 3);
    await waitState(page, 3, 'waiting');
    eq(await control(page).getAttribute('role'), 'slider', 'wheel role');
    eq(await shown(page, '#p3-f1'), true, 'first frame at the start');
    eq(await shown(page, '#p3-f3'), false, 'last frame hidden at the start');
    const letters = await page.locator('[data-testid=scene] .sb-letter').allTextContents();
    eq(letters, ['', 'S', 'I', 'O', 'B', 'H', 'Á', 'N', ''], 'letters centred across the flags');
    eq(await shown(page, '#p3-banner'), false, 'overflow banner hidden');
    const [wx, wy] = await toScreen(page, 800, 580 + 230);
    await page.mouse.click(wx, wy);
    await waitState(page, 3, 'done');
    eq(await shown(page, '#p3-f1'), false, 'first frame hidden at the end');
    eq(await shown(page, '#p3-f3'), true, 'last frame shown at the end');
    assert(/rotate/.test(await attr(page, '#p3-sun', 'transform')), 'rotate drive applied');
    await shot(page, 'fixture-p3-done');

    // Page 4: return-trip slider with phase drives and midway effects.
    await next(page, 4);
    await waitState(page, 4, 'waiting');
    const from4 = await toScreen(page, 420, 860);
    const to4 = await toScreen(page, 1340, 900);
    eq(await shown(page, '#p4-arrow-out'), true, 'out arrow shown on the way out');
    await drag(page, from4, [to4[0] + 20, to4[1]]);
    await page.waitForFunction(() => document.querySelector('[data-testid=scene] [data-testid=control]').dataset.phase === 'back');
    eq(await shown(page, '#p4-thud-you'), true, 'midway.show');
    eq(await shown(page, '#p4-arrow-out'), false, 'phase "out" frame hidden on the way back');
    assert((await page.evaluate(() => window.__log.sfx)).includes('kick'), 'midway sfx');
    eq(await reader(page).getAttribute('data-state'), 'waiting', 'still waiting until it comes back');
    const ballOut = await attr(page, '#p4-ball', 'transform');
    assert(/translate\(13[0-9]{2}/.test(ballOut), `ball rode the path to the end (${ballOut})`);
    await shot(page, 'fixture-p4-midway');
    await drag(page, to4, [from4[0] - 30, from4[1]]);
    await waitState(page, 4, 'done');
    eq(await shown(page, '#p4-thud-tiffin'), true, 'complete.show');
    assert(/rotate\(-40/.test(await attr(page, '#p4-leg', 'transform')), 'back-phase kick drive ran');
    await shot(page, 'fixture-p4-done');

    // Page 5: pull-tab with the keyboard; springs back afterwards.
    await next(page, 5);
    await waitState(page, 5, 'waiting');
    await control(page).focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    await waitState(page, 5, 'done');
    eq(await shown(page, '#p5-caught'), true, 'complete.show (caught)');
    eq(await shown(page, '#p5-ball'), false, 'complete.hide');
    await page.waitForFunction(() => Number(document.querySelector('[data-testid=scene] [data-testid=control]').dataset.progress) < 0.05, null, { timeout: 4000 });
    eq(await page.evaluate(() => document.activeElement?.dataset.testid), 'control', 'focus stays on the control');
    await shot(page, 'fixture-p5-done');

    // Page 6: push-button pressed three times; confetti.
    await next(page, 6);
    await waitState(page, 6, 'waiting');
    const b6 = await toScreen(page, 1340, 800);
    for (let i = 1; i <= 3; i++) {
      await page.mouse.click(b6[0], b6[1]);
      await page.waitForTimeout(450);
      const prog = Number(await control(page).getAttribute('data-progress'));
      assert(Math.abs(prog - i / 3) < 0.02, `press ${i} -> progress ${prog}`);
    }
    await page.waitForFunction(() => document.querySelectorAll('.sb-confetti-piece').length > 10, null, { timeout: 3000 });
    await shot(page, 'fixture-p6-confetti');
    await waitState(page, 6, 'done');
    eq(await shown(page, '#p6-one'), true, 'score flips to 1');
    eq(await shown(page, '#p6-zero'), false, 'score 0 hidden');
    eq(await text(page, '#p6-name'), 'Siobhán\'s', 'possessive name slot');

    // Page 7: Enter completes; the plaque is revealed and the name engraves itself.
    await next(page, 7);
    await waitState(page, 7, 'waiting');
    eq(await shown(page, '#p7-plaque'), false, 'plaque hidden before');
    await control(page).focus();
    await page.keyboard.press('Enter');
    await waitState(page, 7, 'done');
    eq(await shown(page, '#p7-plaque'), true, 'plaque revealed');
    eq(await text(page, '#p7-name'), 'Siobhán', 'name on the plaque');
    await shot(page, 'fixture-p7-done');

    // Page 8: end page, slower voice, Read again / Goodnight.
    await next(page, 8);
    await waitState(page, 8, 'done');
    const plays = await page.evaluate(() => window.__log.play);
    const last = plays[plays.length - 1];
    eq([last.rateScale, last.pitchScale], [0.85, 0.95], 'page voice multipliers');
    assert(await page.getByTestId('read-again').isVisible(), 'read again shown');
    assert(await page.getByTestId('goodnight').isVisible(), 'goodnight shown');
    assert(!(await page.getByTestId('next-page').isVisible()), 'no next on the last page');
    await shot(page, 'fixture-p8-end');
    await page.getByTestId('goodnight').click();
    await page.waitForTimeout(1200);
    await shot(page, 'fixture-goodnight');
    await page.waitForFunction(() => window.__log.exit === 1, null, { timeout: 6000 });

    eq(await page.evaluate(() => window.__log.pages), [1, 2, 3, 4, 5, 6, 7, 8], 'onPageChange for each page');
    noErrors(errors, 'read-through');
    await context.close();
  });

  await step('show-me taps complete sliders, return trips and flaps by themselves', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&name=Bo&page=4');
    await waitState(page, 4, 'waiting');
    const k = await toScreen(page, 420, 860);
    await page.mouse.click(k[0], k[1]);
    await waitState(page, 4, 'done', 8000);
    eq(await shown(page, '#p4-thud-you'), true, 'midway ran during show-me');
    await page.getByTestId('prev-page').click();
    await waitState(page, 3, 'waiting');
    await page.getByTestId('prev-page').click();
    await waitState(page, 2, 'waiting');
    const f = await toScreen(page, 1200, 700);
    await page.mouse.click(f[0], f[1]);
    await waitState(page, 2, 'done');
    eq(await text(page, '#p2-name'), 'BO', 'short name');
    noErrors(errors, 'show-me');
    await context.close();
  });

  await step('tap a word to hear it; the name is spoken as the parent chose', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&name=Niamh&say=Neeve');
    await waitState(page, 1, 'done');
    await page.locator('[data-testid=page-text] .sb-word', { hasText: 'Starring' }).click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid=page-text] .sb-word.is-name').first().click();
    await page.waitForFunction(() => window.__log.speakText.length >= 2);
    eq(await page.evaluate(() => window.__log.speakText), ['Starring', 'Neeve'], 'spoken words');
    noErrors(errors, 'tap a word');
    await context.close();
  });

  await step('swipe, arrow keys and buttons change page; changing page stops the old one', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&scale=1&name=Ava');
    // scale=1: narration is slow, so we can interrupt it.
    await page.waitForFunction(() => document.querySelector('.sb-word.is-current'));
    const box = await page.getByTestId('scene').boundingBox();
    await drag(page, [box.x + box.width * 0.85, box.y + box.height * 0.3], [box.x + box.width * 0.15, box.y + box.height * 0.32], 8);
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '2');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '3');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '2');
    await page.getByTestId('prev-page').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '1');
    // Old pages are gone once their exit animation ends.
    await page.waitForTimeout(700);
    eq(await page.locator('.sb-r-page').count(), 1, 'only the current page remains');
    eq(await page.getByTestId('page-text').locator('.sb-word').first().textContent(), 'Test,', 'text band shows page 1');
    // Dragging a control never turns the page.
    await page.evaluate(() => window.__reader.goTo(4));
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '4');
    await page.waitForTimeout(600);
    const a = await toScreen(page, 420, 860);
    const b = await toScreen(page, 900, 880);
    await drag(page, a, b, 6);
    eq(await reader(page).getAttribute('data-page'), '4', 'control drag is not a swipe');
    noErrors(errors, 'navigation');
    await context.close();
  });

  await step('replay re-reads the page and resets its mechanism', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&page=7');
    await waitState(page, 7, 'waiting');
    await control(page).focus();
    await page.keyboard.press('Enter');
    await waitState(page, 7, 'done');
    await page.getByTestId('replay').click();
    await waitState(page, 7, 'waiting');
    eq(await control(page).getAttribute('data-progress'), '0', 'mechanism reset');
    eq(await page.locator('[data-testid=scene] svg').count(), 1, 'one scene');
    noErrors(errors, 'replay');
    await context.close();
  });

  await step('re-prompts once when the child has not touched the mechanism', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&page=2&idle=400');
    await waitState(page, 2, 'waiting');
    const prompts = () => page.evaluate(() => window.__log.play.filter((p) => p.text[0] === 'Lift the flap on the bag!').length);
    await page.waitForFunction(() => window.__log.play.filter((p) => p.text[0] === 'Lift the flap on the bag!').length === 2, null, { timeout: 4000 });
    await page.waitForTimeout(1200);
    eq(await prompts(), 2, 'prompt spoken twice, not more');
    assert((await control(page).getAttribute('class')).includes('is-hinting'), 'hint shows again');
    noErrors(errors, 're-prompt');
    await context.close();
  });

  await step('scenes are sanitised: no scripts, handlers, styles or links survive', async () => {
    const evil = (page) => page.route('**/scenes/p8.svg', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1600 1000" onload="window.__pwned=1">
          <script>window.__pwned = 2</script>
          <style>body { display: none !important; }</style>
          <rect id="p8-bg" width="1600" height="1000" fill="#2F3A66" onclick="window.__pwned=3"/>
          <a href="https://example.com"><rect id="p8-link" x="10" y="10" width="100" height="100" fill="url(https://example.com/x.svg#g)"/></a>
          <use id="p8-ext" href="https://example.com/x.svg#thing"/>
          <set attributeName="href" to="javascript:alert(1)"/>
          <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
          <text class="sb-name" data-form="plain" x="800" y="500" text-anchor="middle" font-size="60" fill="#fff">NAME</text>
        </svg>`,
      }),
    );
    const { page, context, errors } = await openHarness(browser, 'test=1&page=7', { setup: evil });
    await waitState(page, 7, 'waiting');
    await page.evaluate(() => window.__reader.goTo(8));
    await waitState(page, 8, 'done');
    const report = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid=scene] svg');
      return {
        pwned: window.__pwned ?? null,
        scripts: svg.querySelectorAll('script, style, foreignObject, set, a').length,
        handlers: [...svg.querySelectorAll('*')].concat(svg).filter((e) => [...e.attributes].some((a) => a.name.startsWith('on'))).length,
        ext: svg.querySelector('#p8-ext').getAttribute('href'),
        fill: svg.querySelector('#p8-link').getAttribute('fill'),
        bodyShown: getComputedStyle(document.body).display !== 'none',
        name: svg.querySelector('.sb-name').textContent,
      };
    });
    eq(report, { pwned: null, scripts: 0, handlers: 0, ext: null, fill: 'none', bodyShown: true, name: 'Ava' }, 'sanitised scene');
    await page.mouse.click(300, 200);
    eq(await page.evaluate(() => window.__pwned ?? null), null, 'no handler ran on click');
    noErrors(errors, 'sanitise');
    await context.close();
  });

  await step('opened without a tap: the cover waits behind "Tap to start"', async () => {
    // gate=1 simulates a fresh load without a user gesture (as after a reload).
    const { page, context, errors } = await openHarness(browser, 'test=1&name=Ava&gate=1');
    await page.getByTestId('start-story').waitFor({ state: 'visible' });
    await page.waitForTimeout(600);
    eq(await page.evaluate(() => window.__log.play.length), 0, 'nothing is read before the tap');
    assert(await page.locator('[data-testid=scene] svg').count(), 'the cover is already showing');
    await page.getByTestId('start-story').click();
    await page.getByTestId('start-story').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.__log.play.length > 0, null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#p1-name')?.textContent === 'Ava', null, { timeout: 5000 });
    noErrors(errors, 'start gate');
    await context.close();
  });

  await step('magic window button hands over the current page', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&page=3');
    await waitState(page, 3, 'waiting');
    await page.getByTestId('magic-window').click();
    eq(await page.evaluate(() => window.__log.magic), [3], 'onMagic(n)');
    await page.getByTestId('exit-reader').click();
    eq(await page.evaluate(() => window.__log.exit), 1, 'onExit');
    noErrors(errors, 'magic/exit');
    await context.close();
  });

  await step('autoTurn turns the page after the payoff', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&autoTurn=1');
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '2', null, { timeout: 8000 });
    noErrors(errors, 'autoTurn');
    await context.close();
  });

  await step('names of every shape fit their slots (letters, overflow, wrapping, non-Latin)', async () => {
    const cases = [
      { name: 'Bo', letters: 'BO', overflow: false },
      { name: 'Zoë', letters: 'ZOË', overflow: false },
      { name: 'Oluwaseun', letters: 'OLUWASEUN', overflow: false },
      { name: 'Maximilian', letters: '', overflow: true },
      { name: 'Anna-Sophia', letters: '', overflow: true }, // 10 letters, 9 flags
      { name: 'Xiao Ming', letters: 'XIAOMING', overflow: false },
      { name: '小明', letters: '', overflow: true },
    ];
    for (const c of cases) {
      const { page, context, errors } = await openHarness(browser, `test=1&page=3&name=${encodeURIComponent(c.name)}`);
      await waitState(page, 3, 'waiting');
      const letters = (await page.locator('[data-testid=scene] .sb-letter').allTextContents()).join('');
      eq(letters, c.letters, `${c.name}: bunting letters`);
      eq(await shown(page, '#p3-banner'), c.overflow, `${c.name}: overflow banner`);
      // Every visible name slot on every page fits its data-max-width.
      for (const n of [1, 2, 4, 5, 6, 7, 8]) {
        await page.evaluate((n) => window.__reader.goTo(n), n);
        await page.waitForFunction((n) => document.querySelector('[data-testid=scene] svg')?.dataset.page === String(n), n);
        await page.waitForTimeout(50);
        const over = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid=scene] text.sb-name')].map((t) => {
            // Measure with the scene-local bbox (independent of any pop animation).
            const w = t.getBBox().width;
            return { id: t.id, w, max: Number(t.dataset.maxWidth), text: t.textContent };
          }).filter((x) => x.max && x.w > x.max * 1.03 && x.text),
        );
        eq(over, [], `${c.name}: name slots on page ${n} fit`);
      }
      if (c.name === 'Anna-Sophia') {
        await page.evaluate(() => window.__reader.goTo(2));
        await page.waitForFunction(() => document.querySelector('[data-testid=scene] svg')?.dataset.page === '2');
        await page.waitForTimeout(100);
        eq(await page.locator('[data-testid=scene] #p2-name > tspan').count(), 2, 'Anna-Sophia wraps onto two lines on the shirt');
        await shot(page, 'fixture-names-anna-sophia-p2');
      }
      if (c.name === 'Maximilian') await shot(page, 'fixture-names-maximilian');
      noErrors(errors, `names (${c.name})`);
      await context.close();
    }
  });

  await step('layouts: phone portrait, phone landscape, tablet — no sideways scroll, big targets', async () => {
    for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }], ['tablet', { width: 1024, height: 768 }], ['small', { width: 360, height: 640 }]]) {
      const { page, context, errors } = await openHarness(browser, 'test=1&page=4&name=Maximilian', { viewport });
      await waitState(page, 4, 'waiting');
      await page.waitForTimeout(400);
      await shot(page, `fixture-layout-${label}`);
      const m = await page.evaluate(() => {
        const r = (id) => document.querySelector(`[data-testid=${id}]`).getBoundingClientRect();
        const frame = document.querySelector('.sb-r-frame').getBoundingClientRect();
        const svg = document.querySelector('[data-testid=scene] svg');
        const hitLine = svg.querySelector('.sb-control-hit line');
        const scale = svg.getScreenCTM().a;
        return {
          scrollW: document.scrollingElement.scrollWidth,
          w: innerWidth,
          buttons: ['next-page', 'prev-page', 'replay', 'exit-reader', 'pause'].map((id) => Math.min(r(id).width, r(id).height)),
          topRows: (() => {
            // The page dots stay on one line beside the four round buttons.
            const dots = [...document.querySelectorAll('.sb-r-dot')].map((d) => Math.round(d.getBoundingClientRect().top));
            return new Set(dots).size;
          })(),
          pauseInView: (() => {
            const b = r('pause');
            return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;
          })(),
          frame: [frame.left, frame.right, frame.top, frame.bottom],
          hitH: Number(hitLine.getAttribute('stroke-width')) * scale,
          text: r('page-text').height,
        };
      });
      assert(m.scrollW <= m.w, `${label}: no horizontal scroll (${m.scrollW} > ${m.w})`);
      assert(m.buttons.every((s) => s >= 56), `${label}: buttons >= 56px (${m.buttons})`);
      assert(m.frame[0] >= -1 && m.frame[1] <= viewport.width + 1, `${label}: the book fits across`);
      assert(m.hitH >= 56, `${label}: slider hit area >= 56px (${m.hitH})`);
      eq(m.topRows, 1, `${label}: page dots on one line`);
      assert(m.pauseInView, `${label}: pause button on screen`);
      noErrors(errors, `layout ${label}`);
      await context.close();
    }
  });

  await step('reduced motion: everything still works, calmly', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&page=6', { reducedMotion: 'reduce' });
    await waitState(page, 6, 'waiting');
    await control(page).focus();
    await page.keyboard.press('Enter');
    await waitState(page, 6, 'done');
    eq(await shown(page, '#p6-one'), true, 'completed');
    noErrors(errors, 'reduced motion');
    await context.close();
  });

  await step('missing scene falls back to a friendly placeholder; destroy() cleans up', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&page=2', {
      setup: (page) => page.route('**/scenes/p3.svg', (r) => r.fulfill({ status: 404, body: 'nope' })),
    });
    await page.evaluate(() => window.__reader.goTo(3));
    await page.waitForFunction(() => document.querySelector('[data-testid=scene] svg.sb-scene-missing'));
    await waitState(page, 3, 'done');
    eq(await control(page).count(), 0, 'no mechanism on a missing picture');
    eq(await page.getByTestId('page-text').textContent(), 'Stretch! Bend! Jump!', 'the story carries on to the payoff');
    await page.evaluate(() => window.__reader.destroy());
    eq(await page.locator('[data-testid=reader]').count(), 0, 'reader removed');
    await page.waitForTimeout(300);
    // A 404 is logged by the browser itself; nothing else may be.
    noErrors(errors.filter((e) => !/404|Failed to load resource/.test(e)), 'fallback');
    await context.close();
  });

  // ---- Round 2: family features (docs/architecture.md section 11) -----------------

  const played = (page) => page.evaluate(() => window.__log.play.map((p) => p.text.join(' ')));
  const realClips = (page) => page.evaluate(() => window.__log.clips.filter((c) => c.end == null || c.end - c.start > 300));

  await step('recorded reading: fake-mic clips play instead of the voice, words lit across each clip', async () => {
    const MAIN = 2400;
    const AFTER = 1300;
    const { page, context, errors } = await openHarness(browser, `test=1&reading=mic&mainMs=${MAIN}&afterMs=${AFTER}&page=2`);
    eq(await page.evaluate(() => window.__log.reading.source), 'mic', 'clips recorded from the fake microphone');
    // The badge is up as soon as the page's parts are known.
    await page.getByTestId('reading-badge-band').waitFor({ state: 'visible' });
    eq(await page.getByTestId('reading-badge-band').textContent(), 'Read by Grandma Rose', 'badge text');
    eq(await page.getByTestId('reading-badge').isVisible(), false, 'portrait shows the badge above the words, not on the picture');
    await waitState(page, 2, 'waiting', 10000);
    await page.waitForFunction(() => window.__log.clips.some((c) => c.end != null && c.end - c.start > 300), null, { timeout: 8000 });
    const [main] = await realClips(page);
    assert(Math.abs(main.end - main.start - MAIN) < 350, `main clip played its whole length (${main.end - main.start} ms)`);
    const hl = await page.evaluate(() => window.__hl.filter((h) => h.page === '2'));
    eq(hl.filter((h) => h.part === 'text').map((h) => h.text), ['Where', 'is', "Ava's", 'shirt?'], 'text words lit in order');
    eq(hl.filter((h) => h.part === 'prompt').map((h) => h.text), ['Lift', 'the', 'flap', 'on', 'the', 'bag!'], 'then the prompt words');
    // Stretched across the clip: the first word near the start, the last well into it.
    const first = hl[0].t - main.start;
    const last = hl[hl.length - 1].t - main.start;
    assert(first >= 0 && first < 450, `first word at the start of the clip (${first} ms)`);
    assert(last > MAIN * 0.6 && last < MAIN, `last word near the end of the clip (${last} ms of ${MAIN})`);
    eq((await played(page)).filter((t) => /shirt|flap/.test(t)), [], 'the computer voice did not read the page');
    await shot(page, 'reading-p2-waiting');

    // Done: the "after" part is Grandma's too.
    await control(page).focus();
    await page.keyboard.press('Enter');
    await waitState(page, 2, 'done', 10000);
    const clips = await realClips(page);
    eq(clips.length, 2, 'main + after clips');
    assert(Math.abs(clips[1].end - clips[1].start - AFTER) < 350, `after clip (${clips[1].end - clips[1].start} ms)`);
    const after = await page.evaluate(() => window.__hl.filter((h) => h.part === 'after').map((h) => h.text));
    eq(after, ['Here', 'it', 'is!'], 'after words lit');
    eq((await played(page)).filter((t) => /Here it is/.test(t)), [], 'no voice for the after lines');

    // A different layout puts the badge on the corner of the book.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(100);
    assert(await page.getByTestId('reading-badge').isVisible(), 'tablet: badge on the picture');
    await shot(page, 'reading-p2-tablet');
    noErrors(errors, 'recorded reading');
    await context.close();
  });

  await step('recorded reading: missing or broken parts use the voice; the badge only shows on recorded pages', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&reading=tone&mainMs=900&afterMs=900&parts=2:main&broken=4:main&page=2');
    await waitState(page, 2, 'waiting', 10000);
    await page.waitForFunction(() => window.__log.clips.some((c) => c.end != null), null, { timeout: 8000 });
    await control(page).focus();
    await page.keyboard.press('Enter');
    await waitState(page, 2, 'done', 10000);
    assert((await played(page)).includes('Here it is!'), 'after lines fell back to the voice');
    eq((await realClips(page)).length, 1, 'only the recorded part played');
    await next(page, 3);
    await waitState(page, 3, 'waiting', 10000);
    assert((await played(page)).includes('Warm up, Ava!'), 'page 3 has no recording: the voice reads it');
    eq(await page.getByTestId('reading-badge-band').isVisible(), false, 'no badge without a recording');
    eq(await page.evaluate(() => window.__log.parts.filter((p) => p.startsWith('3:')).sort()), ['3:after', '3:main'], 'both parts were asked for');
    // A part that isn't audio: the voice reads the page, and no badge.
    await page.evaluate(() => window.__reader.goTo(4));
    await waitState(page, 4, 'waiting', 10000);
    assert((await played(page)).includes('Tiffin to Ava... thud!'), 'a broken recording falls back to the voice');
    eq(await page.getByTestId('reading-badge-band').isVisible(), false, 'no badge when the recording could not play');
    noErrors(errors.filter((e) => !/could not play the recorded reading/.test(e)), 'reading fallback');
    await context.close();
  });

  await step('recorded reading: pause stops the clip, play carries on from just before where it stopped', async () => {
    const MAIN = 3000;
    const { page, context, errors } = await openHarness(browser, `test=1&reading=tone&mainMs=${MAIN}&afterMs=900`);
    await page.waitForFunction(() => window.__log.clips.some((c) => c.end == null), null, { timeout: 8000 });
    await page.waitForTimeout(1500);
    const litBefore = await page.evaluate(() => window.__hl.map((h) => h.text));
    assert(litBefore.length >= 2, `words lit before the pause (${litBefore})`);
    await page.getByTestId('pause').click();
    await page.waitForFunction(() => window.__log.clips.every((c) => c.end != null), null, { timeout: 1000 });
    const stopped = await page.evaluate(() => window.__log.clips[window.__log.clips.length - 1]);
    const heard = stopped.end - stopped.start;
    assert(heard > 1200 && heard < 2000, `clip stopped at once (${heard} ms)`);
    await page.waitForTimeout(800);
    const n = (await realClips(page)).length;
    eq(await page.evaluate(() => window.__log.clips.filter((c) => c.end == null).length), 0, 'nothing plays while paused');
    const hlPaused = await page.evaluate(() => window.__hl.length);
    await page.getByTestId('pause').click();
    await page.waitForFunction((n) => window.__log.clips.filter((c) => c.end == null || c.end - c.start > 300).length > n, n, { timeout: 3000 });
    await waitState(page, 1, 'done', 8000);
    const last = (await realClips(page)).pop();
    const from = last.offset * 1000;
    // Back a little (~0.8 s, to the start of a word), not from the very beginning.
    assert(from > heard - 1500 && from < heard - 300, `carried on from ${Math.round(from)} ms, having stopped at ${heard} ms`);
    assert(Math.abs(last.end - last.start - (MAIN - from)) < 400, `played the rest of the clip (${last.end - last.start} ms from ${Math.round(from)} ms)`);
    // The words pick up where the voice does: the first word lit after play is one from before the pause, not the first word.
    const resumed = await page.evaluate((k) => window.__hl.slice(k).map((h) => h.text), hlPaused);
    assert(resumed.length && resumed[0] !== 'Test,', `highlighting carried on mid-page (${resumed})`);
    eq(await page.evaluate(() => [...document.querySelectorAll('[data-testid=page-text] .sb-word')].filter((w) => !w.classList.contains('is-read')).map((w) => w.textContent)), [], 'every word read by the end');
    noErrors(errors, 'reading pause');
    await context.close();
  });

  await step('recorded reading: a clip that ends before the estimate still marks every word read', async () => {
    // nolength=1: the clip's length can't be measured, so the plain estimate (longer than the clip) is used.
    const { page, context, errors } = await openHarness(browser, 'test=1&reading=tone&mainMs=1500&afterMs=600&nolength=1&page=2');
    await waitState(page, 2, 'waiting', 10000);
    await page.waitForFunction(() => window.__log.clips.length && window.__log.clips.every((c) => c.end != null), null, { timeout: 8000 });
    await page.waitForTimeout(100);
    const unread = () => page.evaluate(() => [...document.querySelectorAll('[data-testid=page-text] .sb-word')].filter((w) => !w.classList.contains('is-read')).map((w) => w.textContent));
    eq(await page.getByTestId('page-text').getAttribute('data-part'), 'prompt', 'the prompt shows once the clip has ended');
    eq(await unread(), [], 'every prompt word marked read');
    eq((await played(page)).filter((t) => /shirt|flap/.test(t)), [], 'still no computer voice');
    await control(page).focus();
    await page.keyboard.press('Enter');
    await waitState(page, 2, 'done', 10000);
    eq(await page.getByTestId('page-text').getAttribute('data-part'), 'after', 'after lines');
    eq(await unread(), [], 'every "after" word marked read');
    noErrors(errors, 'short clip');
    await context.close();
  });

  await step('recorded reading in another language: no word-by-word lighting, the line glows, the badge says so', async () => {
    const { page, context, errors } = await openHarness(browser, `test=1&reading=tone&mainMs=2600&afterMs=900&lang=Urdu&reader=Nana&label=${encodeURIComponent('Read by Nana in Urdu')}`);
    await page.waitForFunction(() => window.__log.clips.some((c) => c.end == null), null, { timeout: 8000 });
    await page.waitForTimeout(300);
    eq(await page.getByTestId('reading-badge-band').textContent(), 'Read by Nana in Urdu', 'badge text from reading.label');
    const during = await page.evaluate(() => ({
      whole: document.querySelector('[data-testid=page-text]').hasAttribute('data-whole-line'),
      active: [...document.querySelectorAll('[data-testid=page-text] .sb-r-line')].findIndex((l) => l.classList.contains('is-active-line')),
      glow: getComputedStyle(document.querySelector('[data-testid=page-text] .sb-r-line.is-active-line')).backgroundColor,
    }));
    assert(during.whole && during.active === 0, `the first line glows while Nana reads (${JSON.stringify(during)})`);
    assert(during.glow !== 'rgba(0, 0, 0, 0)', `a soft glow behind the line (${during.glow})`);
    await shot(page, 'reading-urdu-line');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=page-text] .sb-r-line')[1]?.classList.contains('is-active-line'), null, { timeout: 4000 });
    await waitState(page, 1, 'done', 8000);
    eq(await page.evaluate(() => window.__hl.length), 0, 'no word-by-word lighting for another language');
    eq(await page.evaluate(() => document.querySelectorAll('[data-testid=page-text] .sb-word.is-read').length), 0, 'no words marked as read either');
    eq(await page.getByTestId('page-text').getAttribute('data-whole-line'), null, 'the glow goes when the clip ends');
    noErrors(errors, 'reading in Urdu');
    await context.close();
  });

  await step('pause/play: the button, Space and K hold the story; play re-reads the sentence', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&scale=1&name=Ava');
    await page.waitForFunction(() => window.__hl.some((h) => h.text === 'Starring'), null, { timeout: 8000 });
    const pause = page.getByTestId('pause');
    eq(await pause.getAttribute('aria-label'), 'Pause the story', 'label before');
    await pause.click();
    eq(await pause.getAttribute('aria-label'), 'Carry on reading', 'label while paused');
    eq(await reader(page).getAttribute('data-paused'), '1', 'reader marked paused');
    assert(await page.getByTestId('paused').isVisible(), '"Paused" shows over the picture');
    const n = await page.evaluate(() => window.__hl.length);
    await page.waitForTimeout(1500);
    eq(await page.evaluate(() => window.__hl.length), n, 'no more words while paused');
    await shot(page, 'pause-portrait');
    // K carries on: the sentence starts again from "Starring".
    await page.keyboard.press('k');
    await page.waitForFunction((n) => window.__hl.length > n, n, { timeout: 3000 });
    eq(await page.evaluate((n) => window.__hl[n].text, n), 'Starring', 'the sentence is read again');
    eq(await page.getByTestId('paused').isVisible(), false, 'chip gone');
    // Space pauses (when focus isn't on a button).
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press(' ');
    eq(await reader(page).getAttribute('data-paused'), '1', 'Space pauses');
    await page.keyboard.press(' ');
    eq(await reader(page).getAttribute('data-paused'), null, 'Space plays');
    // Turning the page carries on reading.
    await page.keyboard.press('k');
    await page.getByTestId('next-page').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '2');
    eq(await reader(page).getAttribute('data-paused'), null, 'a new page is not paused');
    noErrors(errors, 'pause');
    await context.close();
  });

  await step('pause holds the re-prompt and the automatic page turn', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&page=2&idle=400');
    await waitState(page, 2, 'waiting');
    await page.getByTestId('pause').click();
    const prompts = () => page.evaluate(() => window.__log.play.filter((p) => p.text[0] === 'Lift the flap on the bag!').length);
    await page.waitForTimeout(1000);
    eq(await prompts(), 1, 'no re-prompt while paused');
    await page.getByTestId('pause').click();
    await page.waitForFunction(() => window.__log.play.filter((p) => p.text[0] === 'Lift the flap on the bag!').length === 2, null, { timeout: 3000 });
    await context.close();

    const b = await openHarness(browser, 'test=1&autoTurn=1');
    await waitState(b.page, 1, 'done');
    await b.page.getByTestId('pause').click();
    await b.page.waitForTimeout(2200);
    eq(await reader(b.page).getAttribute('data-page'), '1', 'no auto-turn while paused');
    await b.page.getByTestId('pause').click();
    await b.page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '2', null, { timeout: 4000 });
    noErrors([...errors, ...b.errors], 'pause timers');
    await b.context.close();
  });

  await step('name spotting: tap the name in the picture to hear "That says ..."', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&name=Niamh&say=Neeve');
    await waitState(page, 1, 'done');
    await page.waitForTimeout(300);
    const box = await page.locator('[data-testid=scene] #p1-name').boundingBox();
    // A little below the letters still counts (small fingers).
    await page.mouse.click(box.x + box.width / 2, box.y + box.height + 10);
    await page.waitForFunction(() => window.__log.speakText.length === 1, null, { timeout: 3000 });
    eq(await page.evaluate(() => window.__log.speakText), ['That says Neeve!'], 'said the way the parent chose');
    assert(await page.evaluate(() => {
      const t = document.querySelector('[data-testid=scene] #p1-name');
      return (t.classList.contains('sb-name-spot') || t.parentNode.classList.contains('sb-name-spot')) && document.querySelectorAll('.sb-spot-star').length > 3;
    }), 'the name bounces and sparkles');
    eq(await page.locator('.sb-spot-word').textContent(), 'Niamh', 'the name shown big, as written');
    assert((await page.evaluate(() => window.__log.sfx)).includes('sparkle'), 'sparkle sound');
    await shot(page, 'spot-p1');
    eq(await page.getByTestId('scene').evaluate((s) => getComputedStyle(s.querySelector('#p1-name')).cursor), 'pointer', 'pointer cursor on the name');
    // Far from the name: nothing.
    const frame = await page.locator('.sb-r-frame').boundingBox();
    await page.mouse.click(frame.x + 8, frame.y + frame.height - 8);
    await page.waitForTimeout(300);
    eq(await reader(page).getAttribute('data-spotted'), '1', 'a tap elsewhere is not a name');

    // Bunting: the letters jump in a wave; a tap on the moving part is still "show me".
    await page.evaluate(() => window.__reader.goTo(3));
    await waitState(page, 3, 'waiting');
    await page.waitForTimeout(400);
    const flags = await page.locator('[data-testid=scene] #p3-flags').boundingBox();
    await page.mouse.click(flags.x + flags.width / 2, flags.y + flags.height * 0.35);
    await page.waitForFunction(() => window.__log.speakText.length === 2, null, { timeout: 3000 });
    const wave = await page.evaluate(() => [...document.querySelectorAll('[data-testid=scene] .sb-letter')].filter((t) => t.textContent).map((t) => {
      const el = t.classList.contains('sb-name-spot') ? t : t.parentNode;
      return el.classList.contains('sb-name-spot') ? el.style.animationDelay : null;
    }));
    eq(wave, ['0ms', '70ms', '140ms', '210ms', '280ms'].map((x, i) => (i ? x : '')), 'each letter jumps in turn');
    const [wx, wy] = await toScreen(page, 800, 580 + 230);
    await page.mouse.click(wx, wy);
    await waitState(page, 3, 'done');
    eq(await reader(page).getAttribute('data-spotted'), '2', 'the wheel tap was not a name tap');
    noErrors(errors, 'name spotting');
    await context.close();

    // While the story is being read: sparkles, but the voice doesn't talk over it.
    const b = await openHarness(browser, 'test=1&scale=1&name=Ava');
    await b.page.waitForFunction(() => document.querySelector('#p1-name')?.textContent === 'Ava' && !document.querySelector('#p1-name').classList.contains('is-pending'), null, { timeout: 8000 });
    await b.page.waitForFunction(() => window.__hl.length > 0);
    const nb = await b.page.locator('[data-testid=scene] #p1-name').boundingBox();
    await b.page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await b.page.waitForTimeout(300);
    eq(await reader(b.page).getAttribute('data-spotted'), '1', 'spotted mid-story');
    eq(await b.page.evaluate(() => window.__log.speakText), [], 'no talking over the story');
    noErrors(b.errors, 'name spotting while reading');
    await b.context.close();
  });

  await step('bedtime: night styling, soft sounds, slower voice; the story carries on by itself', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&bedtime=1&name=Ava');
    assert(await reader(page).evaluate((r) => r.classList.contains('is-bedtime')), 'bedtime class');
    const bg = await reader(page).evaluate((r) => getComputedStyle(r).color);
    eq(bg, 'rgb(230, 221, 200)', 'soft cream text');
    await waitState(page, 1, 'done');
    await shot(page, 'bedtime-p1-done');
    // Page 2: nobody touches the flap; it lifts itself.
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '2', null, { timeout: 5000 });
    await waitState(page, 2, 'waiting');
    await shot(page, 'bedtime-p2-waiting');
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.autoplayed === '2', null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '3', null, { timeout: 8000 });
    const log = await page.evaluate(() => window.__log);
    const chimes = log.sfxOpts.filter((x) => x.name === 'ding' && x.volume === 0.28);
    assert(chimes.length >= 2, `a soft chime before each turn (${chimes.length})`);
    assert(log.sfxOpts.every((x) => x.volume != null && x.volume <= 0.3), `every sound is soft (${JSON.stringify(log.sfxOpts)})`);
    assert(log.play.length && log.play.every((p) => Math.abs(p.rateScale - 0.9) < 1e-9), 'the voice is a little slower');
    // Page 6 would throw confetti: not at bedtime.
    await page.evaluate(() => window.__reader.goTo(6));
    await waitState(page, 6, 'done', 10000);
    eq(await page.evaluate(() => document.querySelectorAll('.sb-confetti-piece').length), 0, 'no confetti');
    // The end page reads, lingers, then the lights go down (and stay down).
    await page.evaluate(() => window.__reader.goTo(8));
    await page.getByTestId('night').waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').classList.contains('is-lights-out'));
    await page.waitForTimeout(2600);
    await shot(page, 'bedtime-lights-out');
    eq(await page.evaluate(() => window.__log.exit), 0, 'stays on the dark screen');
    eq(await page.getByTestId('night').textContent(), 'Night night, Ava.Tap to see the last page again', 'goodnight words');
    await page.getByTestId('night').click();
    await page.getByTestId('read-again').waitFor({ state: 'visible' });
    assert(!(await reader(page).evaluate((r) => r.classList.contains('is-lights-out'))), 'lights back on');
    noErrors(errors, 'bedtime');
    await context.close();
  });

  await step('bedtime: touching the moving part holds the show-me; pause holds the turn; tap to turn sooner', async () => {
    // scale=0.4: show-me after 2 s, the turn 1.2 s after the chime.
    const { page, context, errors } = await openHarness(browser, 'test=1&scale=0.4&bedtime=1&page=4');
    await waitState(page, 4, 'waiting', 10000);
    const from = await toScreen(page, 420, 860);
    const to = await toScreen(page, 700, 870);
    const t0 = Date.now();
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 10, from[1] + ((to[1] - from[1]) * i) / 10);
      await page.waitForTimeout(150);
    }
    await page.mouse.up();
    // Still the child's turn a while after they let go.
    await page.waitForTimeout(1200);
    eq(await reader(page).getAttribute('data-autoplayed'), null, `no show-me while busy (${Date.now() - t0} ms)`);
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.autoplayed === '4', null, { timeout: 5000 });
    await waitState(page, 4, 'done', 10000);
    // Counting down to the turn: pause holds it...
    await page.waitForFunction(() => document.querySelector('.sb-r-next-wrap').classList.contains('is-counting'));
    await shot(page, 'bedtime-counting');
    await page.getByTestId('pause').click();
    eq(await page.evaluate(() => document.querySelector('.sb-r-next-wrap').classList.contains('is-counting')), false, 'countdown stopped');
    await page.waitForTimeout(1800);
    eq(await reader(page).getAttribute('data-page'), '4', 'no turn while paused');
    await page.getByTestId('pause').click();
    // ...and the arrow turns it sooner.
    await page.getByTestId('next-page').click();
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.page === '5');
    noErrors(errors, 'bedtime timers');
    await context.close();
  });

  await step('siblings: "AMARA & ZAK" in the pictures, plural text, no recordings', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&sibs=Amara,Zak&reading=tone&page=2');
    await waitState(page, 2, 'waiting');
    eq(await page.getByTestId('page-text').evaluate(() => window.__log.play[0].text[0]), "Where are Amara and Zak's shirts?", 'plural text');
    await control(page).focus();
    await page.keyboard.press('Enter');
    await waitState(page, 2, 'done');
    await page.waitForTimeout(500);
    eq(await page.locator('[data-testid=scene] #p2-name > tspan').allTextContents(), ['AMARA', '& ZAK'], 'shirt: upper-case art form on two lines');
    await shot(page, 'siblings-p2');
    await page.evaluate(() => window.__reader.goTo(3));
    await waitState(page, 3, 'waiting');
    eq((await page.locator('[data-testid=scene] .sb-letter').allTextContents()).join(''), '', 'no letters on the bunting');
    eq(await shown(page, '#p3-banner'), true, 'the banner instead');
    eq(await text(page, '#p3-banner'), 'AMARA & ZAK', 'banner text');
    // At phone size the banner sits in the wheel's generous, invisible margin:
    // the name you can see wins, and the wheel stays put.
    const bb = await page.locator('[data-testid=scene] #p3-banner').boundingBox();
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForFunction(() => document.querySelector('[data-testid=reader]').dataset.spotted === '1', null, { timeout: 3000 });
    eq(await page.locator('.sb-spot-word').textContent(), 'AMARA & ZAK', 'the name as the banner writes it');
    await page.waitForTimeout(300);
    eq(await control(page).getAttribute('data-progress'), '0', 'the wheel did not turn');
    eq(await reader(page).getAttribute('data-state'), 'waiting', 'still waiting for the wheel');
    await page.evaluate(() => window.__reader.goTo(6));
    await waitState(page, 6, 'waiting');
    eq(await text(page, '#p6-name'), "Amara & Zak's", 'possessive art form');
    eq(await page.evaluate(() => window.__log.parts), [], 'a recorded reading is not used for siblings');
    eq(await page.getByTestId('reading-badge-band').isVisible(), false, 'no badge');
    eq(await page.evaluate(() => window.__log.clips.length), 0, 'no clips');
    // "waiting" starts as the prompt is read; spotting speaks once that's said.
    await page.waitForFunction(() => window.__log.play.some((p) => p.text[0] === 'Press the button three times!'));
    await page.waitForTimeout(500);
    const said = await page.evaluate(() => window.__log.speakText.length);
    const b = await page.locator('[data-testid=scene] #p6-name').boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForFunction((n) => window.__log.speakText.length === n + 1, said);
    eq(await page.evaluate(() => window.__log.speakText.at(-1)), 'That says Amara and Zak!', 'name spotting says both');
    noErrors(errors, 'siblings');
    await context.close();
  });

  await step('new layouts: bedtime, paused and recorded pages at phone, landscape and tablet sizes', async () => {
    for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }], ['tablet', { width: 1024, height: 768 }]]) {
      const { page, context, errors } = await openHarness(browser, 'test=1&bedtime=1&reading=tone&mainMs=800&afterMs=800&page=4&name=Maximilian', { viewport });
      await waitState(page, 4, 'waiting', 10000);
      await page.getByTestId('pause').click();
      await page.waitForTimeout(450);
      await shot(page, `layout-bedtime-paused-${label}`);
      const m = await page.evaluate(() => ({
        scrollW: document.scrollingElement.scrollWidth,
        w: innerWidth,
        chip: document.querySelector('[data-testid=paused]').getBoundingClientRect().toJSON(),
        frame: document.querySelector('.sb-r-frame').getBoundingClientRect().toJSON(),
      }));
      assert(m.scrollW <= m.w, `${label}: no horizontal scroll`);
      assert(m.chip.left >= m.frame.left && m.chip.right <= m.frame.right, `${label}: "Paused" sits on the picture`);
      noErrors(errors, `new layouts ${label}`);
      await context.close();
    }
  });

  // ---- Round 3: the letter game, accessibility settings ---------------------------------

  await step('end page: "Find Ava\'s letter" hands over to the letter game when the app offers it', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&letters=1&page=8&name=Ava');
    await waitState(page, 8, 'done');
    const pill = page.getByTestId('letter-game');
    await pill.waitFor({ state: 'visible', timeout: 5000 });
    eq((await pill.textContent()).trim(), "Find Ava's letter", 'pill text');
    await page.waitForTimeout(900); // the pills pop in
    const boxes = await page.evaluate(() => ['read-again', 'goodnight', 'letter-game'].map((id) => {
      const r = document.querySelector(`[data-testid=${id}]`).getBoundingClientRect();
      return { id, h: Math.round(r.height), inView: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
    }));
    for (const b of boxes) assert(b.h >= 56 && b.inView, `${b.id}: big and on screen (${JSON.stringify(b)})`);
    await shot(page, 'end-letters-portrait');
    await pill.click();
    eq(await page.evaluate(() => window.__log.letters), 1, 'onLetters() called');
    await pill.focus();
    await page.keyboard.press('Enter');
    eq(await page.evaluate(() => window.__log.letters), 2, 'works from the keyboard');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    const inView = await page.evaluate(() => {
      const r = document.querySelector('[data-testid=letter-game]').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && document.scrollingElement.scrollWidth <= innerWidth;
    });
    assert(inView, 'landscape: the three pills fit on screen');
    await shot(page, 'end-letters-landscape');
    noErrors(errors, 'letter pill');
    await context.close();

    // No onLetters from the app: no pill.
    const b = await openHarness(browser, 'test=1&page=8');
    await waitState(b.page, 8, 'done');
    await b.page.waitForTimeout(400);
    eq(await b.page.getByTestId('letter-game').isVisible(), false, 'not offered without onLetters');
    noErrors(b.errors, 'no letter pill');
    await b.context.close();

    // Siblings: their letters; siblings who share a letter: one letter.
    for (const [sibs, label] of [['Amara,Zak', "Find Amara and Zak's letters"], ['Amara,Ava', "Find Amara and Ava's letter"]]) {
      const c = await openHarness(browser, `test=1&letters=1&page=8&sibs=${sibs}`);
      await waitState(c.page, 8, 'done');
      await c.page.getByTestId('letter-game').waitFor({ state: 'visible', timeout: 5000 });
      eq((await c.page.getByTestId('letter-game').textContent()).trim(), label, `siblings ${sibs}`);
      noErrors(c.errors, `letter pill ${sibs}`);
      await c.context.close();
    }

    // A first letter this device can't draw (e.g. no font for it): the game isn't offered.
    const d = await openHarness(browser, `test=1&letters=1&page=8&name=${encodeURIComponent('小明')}`);
    await waitState(d.page, 8, 'done');
    await d.page.waitForTimeout(500);
    const can = await d.page.evaluate(async () => (await import('/js/activities/letter-trace.js')).letterTraceAvailable({ display: '小明' }));
    eq(await d.page.getByTestId('letter-game').isVisible(), can, `offered only when the letter can be drawn (${can})`);
    noErrors(d.errors, 'letter pill CJK');
    await d.context.close();
  });

  await step('bedtime: the letter game is offered but never opens by itself; spoken extras are slower too', async () => {
    const { page, context, errors } = await openHarness(browser, 'test=1&bedtime=1&letters=1&page=8&name=Ava');
    await waitState(page, 8, 'done');
    await page.getByTestId('letter-game').waitFor({ state: 'visible', timeout: 5000 });
    await shot(page, 'bedtime-end-letters');
    // The lights go down as usual, and the game doesn't open.
    await page.getByTestId('night').waitFor({ state: 'visible', timeout: 8000 });
    await page.waitForTimeout(1500);
    eq(await page.evaluate(() => window.__log.letters), 0, 'never opened by itself');
    await page.getByTestId('night').click();
    await page.getByTestId('letter-game').waitFor({ state: 'visible' });
    await page.getByTestId('letter-game').click();
    eq(await page.evaluate(() => window.__log.letters), 1, 'a tap opens it');
    await page.waitForTimeout(800);
    eq(await reader(page).evaluate((r) => r.classList.contains('is-lights-out')), false, 'no lights-out behind the game');
    noErrors(errors, 'bedtime letter pill');
    await context.close();

    // "That says Ava!" and a tapped word use the bedtime pace as well.
    const b = await openHarness(browser, 'test=1&scale=0.4&bedtime=1&name=Ava');
    await waitState(b.page, 1, 'done', 10000);
    await b.page.getByTestId('pause').click(); // hold the automatic turn
    const nb = await b.page.locator('[data-testid=scene] #p1-name').boundingBox();
    await b.page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await b.page.waitForFunction(() => window.__log.speakOpts.length === 1, null, { timeout: 3000 });
    await b.page.waitForTimeout(1500); // a tapped word never talks over the name being said
    await b.page.locator('[data-testid=page-text] .sb-word', { hasText: 'Starring' }).click();
    await b.page.waitForFunction(() => window.__log.speakOpts.length === 2, null, { timeout: 3000 });
    eq(await b.page.evaluate(() => window.__log.speakOpts), [{ text: 'That says Ava!', rateScale: 0.9 }, { text: 'Starring', rateScale: 0.9 }], 'slower at bedtime');
    noErrors(b.errors, 'bedtime speech rate');
    await b.context.close();
  });

  await step('easy read and high contrast: bigger, spaced-out words; darker text, stronger outlines (phone both ways)', async () => {
    for (const [label, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
      const plain = await openHarness(browser, 'test=1&page=6&name=Maximilian', { viewport });
      await waitState(plain.page, 6, 'waiting');
      const base = await plain.page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('[data-testid=page-text]'));
        return { size: parseFloat(cs.fontSize), letter: cs.letterSpacing };
      });
      await plain.context.close();

      const { page, context, errors } = await openHarness(browser, 'test=1&page=6&name=Maximilian&easy=1', { viewport });
      await waitState(page, 6, 'waiting');
      await page.waitForTimeout(300);
      const easy = await page.evaluate(() => {
        const t = document.querySelector('[data-testid=page-text]');
        const cs = getComputedStyle(t);
        const px = (v) => parseFloat(v) || 0;
        return {
          size: px(cs.fontSize),
          letter: px(cs.letterSpacing) / px(cs.fontSize),
          word: px(cs.wordSpacing) / px(cs.fontSize),
          line: px(cs.lineHeight) / px(cs.fontSize),
          align: cs.textAlign,
          justified: [...document.querySelectorAll('.sb-reader *')].some((e) => getComputedStyle(e).textAlign === 'justify'),
          scrollW: document.scrollingElement.scrollWidth,
          w: innerWidth,
        };
      });
      assert(easy.size >= base.size * 1.05, `${label}: easy read is bigger (${easy.size} vs ${base.size})`);
      assert(easy.letter >= 0.05 && easy.word >= 0.1 && easy.line >= 1.45, `${label}: more letter/word/line space (${JSON.stringify(easy)})`);
      assert(!easy.justified && easy.align !== 'justify', `${label}: never justified (${easy.align})`);
      assert(easy.scrollW <= easy.w, `${label}: no sideways scroll`);
      await shot(page, `a11y-easy-read-${label}`);
      noErrors(errors, `easy read ${label}`);
      await context.close();

      const hc = await openHarness(browser, 'test=1&page=6&name=Maximilian&contrast=high', { viewport });
      await waitState(hc.page, 6, 'waiting');
      await hc.page.waitForTimeout(300);
      const high = await hc.page.evaluate(() => {
        const r = document.querySelector('[data-testid=reader]');
        const cs = getComputedStyle(r);
        const btn = getComputedStyle(document.querySelector('[data-testid=replay]'));
        const prompt = getComputedStyle(document.querySelector('.sb-r-prompt'));
        return { color: cs.color, bgImage: cs.backgroundImage, bg: cs.backgroundColor, btnBorder: parseFloat(btn.borderTopWidth), btnColour: btn.borderTopColor, promptBorder: parseFloat(prompt.borderTopWidth), scrollW: document.scrollingElement.scrollWidth, w: innerWidth };
      });
      eq([high.color, high.bgImage, high.bg], ['rgb(0, 0, 0)', 'none', 'rgb(255, 255, 255)'], `${label}: black text on plain white`);
      assert(high.btnBorder >= 4 && high.btnColour === 'rgb(0, 0, 0)' && high.promptBorder >= 4, `${label}: stronger outlines (${JSON.stringify(high)})`);
      assert(high.scrollW <= high.w, `${label}: no sideways scroll (high contrast)`);
      await shot(hc.page, `a11y-high-contrast-${label}`);
      // A word being read and the name in the text get a solid outline.
      await hc.page.evaluate(() => window.__reader.goTo(1));
      await hc.page.waitForFunction(() => document.querySelector('.sb-word.is-name'));
      const name = await hc.page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector('.sb-word.is-name'));
        return { colour: cs.color, deco: cs.textDecorationStyle, line: cs.textDecorationColor };
      });
      eq(name, { colour: 'rgb(158, 11, 48)', deco: 'solid', line: 'rgb(0, 0, 0)' }, `${label}: the name is dark red with a solid black underline`);
      noErrors(hc.errors, `high contrast ${label}`);
      await hc.context.close();

      // Both at once, at bedtime, with the end page's three pills.
      const both = await openHarness(browser, 'test=1&page=8&name=Maximilian&easy=1&contrast=high&bedtime=1&letters=1', { viewport });
      await waitState(both.page, 8, 'done');
      await both.page.getByTestId('letter-game').waitFor({ state: 'visible', timeout: 5000 });
      await both.page.waitForTimeout(300);
      const night = await both.page.evaluate(() => ({ colour: getComputedStyle(document.querySelector('[data-testid=reader]')).color, scrollW: document.scrollingElement.scrollWidth, w: innerWidth }));
      eq(night.colour, 'rgb(255, 248, 232)', `${label}: bright words at bedtime in high contrast`);
      assert(night.scrollW <= night.w, `${label}: no sideways scroll (both)`);
      await shot(both.page, `a11y-both-bedtime-end-${label}`);
      noErrors(both.errors, `easy read + high contrast ${label}`);
      await both.context.close();
    }
  });

  // Smoke test of the real books: every page whose scene the illustrators have
  // delivered opens, its mechanism completes, and the name appears in the art.
  const REAL_BOOKS = (process.env.REAL_BOOKS ?? 'tiffin-football,tiffin-digger').split(',').filter(Boolean);
  for (const bookId of process.env.REAL_BOOK === '0' ? [] : REAL_BOOKS) {
    const realDir = path.join(ROOT, 'books', bookId);
    const draft = existsSync(path.join(realDir, 'book.draft.json')) ? JSON.parse(readFileSync(path.join(realDir, 'book.draft.json'), 'utf8')) : null;
    const ready = (draft?.pages ?? []).filter((p) => existsSync(path.join(realDir, p.scene)));
    if (!ready.length) {
      console.log(`  skip real book ${bookId} (no scenes yet)`);
      continue;
    }
    // The built book.json must match the draft plus its page fragments (tools/build-book.mjs was run).
    await step(`real book ${bookId}: book.json is up to date with the draft and page fragments`, async () => {
      const built = JSON.parse(readFileSync(path.join(realDir, 'book.json'), 'utf8'));
      const merged = JSON.parse(JSON.stringify(draft));
      for (const page of merged.pages) {
        const f = path.join(realDir, 'pages', `p${page.n}.json`);
        if (!existsSync(f)) continue;
        const patch = JSON.parse(readFileSync(f, 'utf8'));
        for (const key of ['text', 'prompt', 'after', 'n', 'kind']) delete patch[key];
        Object.assign(page, patch);
      }
      eq(built, merged, `${bookId}/book.json (run: node tools/build-book.mjs ${bookId})`);
    });
    await step(`real book ${bookId}: ${ready.length}/${draft.pages.length} pages open, mechanisms complete, names in the art`, async () => {
      for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        // merge=1: the draft plus the illustrators' page fragments, exactly what
        // tools/build-book.mjs produces, so this works before the build step too.
        const { page, context, errors } = await openHarness(browser, `test=1&book=${bookId}&merge=1&name=Siobh%C3%A1n&page=${ready[0].n}`, { viewport });
        for (const p of ready) {
          if (p.n !== ready[0].n) {
            await page.evaluate((n) => window.__reader.goTo(n), p.n);
          }
          await page.waitForFunction((n) => document.querySelector('[data-testid=scene] svg')?.dataset.page === String(n), p.n);
          const hasControl = await page.waitForFunction(
            (n) => {
              const r = document.querySelector('[data-testid=reader]');
              return r.dataset.page === String(n) && ['waiting', 'done'].includes(r.dataset.state) && r.dataset.state;
            },
            p.n,
            { timeout: 15000 },
          ).then((h) => h.jsonValue()).then((s) => s === 'waiting');
          await page.waitForTimeout(250);
          await shot(page, `real-${bookId}-${viewport.width}-p${p.n}-before`);
          if (hasControl) {
            await control(page).focus();
            await page.keyboard.press('Enter');
          }
          await waitState(page, p.n, 'done', 15000);
          await page.waitForTimeout(700);
          await shot(page, `real-${bookId}-${viewport.width}-p${p.n}-after`);
          const names = await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid=scene] text.sb-name')]
              .filter((t) => t.closest('[display=none]') === null)
              .map((t) => t.textContent),
          );
          for (const t of names) assert(/Siobh[aá]n|SIOBH[AÁ]N/.test(t), `page ${p.n}: name slot shows "${t}"`);
          const letters = await page.evaluate(() => [...document.querySelectorAll('[data-testid=scene] .sb-letter')].map((t) => t.textContent).join(''));
          if (letters) eq(letters, 'SIOBHÁN', `page ${p.n}: bunting letters`);
          assert(names.length > 0 || letters, `page ${p.n}: the name is somewhere in the picture`);
          // The page's sounds are ones the app can make (no silent stand-ins).
          const sounds = [p.sfx?.open, ...(p.mechanic?.complete?.sfx ?? [])].filter(Boolean);
          const known = await page.evaluate(async () => (await import('/js/audio/sfx.js')).SFX_NAMES);
          for (const x of sounds) assert(known.includes(x), `page ${p.n}: unknown sound "${x}"`);
        }
        // Pages without a mechanism may have no fragment, and neighbours may not be drawn yet: those 404s are expected.
        const unexpected = page.__missing.filter((x) => !/\/pages\/p\d+\.json$|\/scenes\/p\d+\.svg$/.test(x));
        eq(unexpected, [], 'no other missing files');
        noErrors(errors.filter((e) => !/status of 404/.test(e)), `real book ${bookId} ${viewport.width}x${viewport.height}`);
        await context.close();
      }
    });
    await step(`real book ${bookId}: tricky names fit every name spot (shrink, wrap, overflow banner)`, async () => {
      // The last "name" is three children reading together ("AMARA & ZAK & LI" in the art).
      for (const name of ['Maximilian', 'Anna-Sophia', 'Xiao Ming', '小明', 'Bo', 'sibs:Amara,Zak,Li']) {
        const who = name.startsWith('sibs:') ? `sibs=${encodeURIComponent(name.slice(5))}` : `name=${encodeURIComponent(name)}`;
        const { page, context, errors } = await openHarness(browser, `test=1&book=${bookId}&merge=1&${who}&page=${ready[0].n}`, { viewport: { width: 1024, height: 768 } });
        for (const p of ready) {
          if (p.n !== ready[0].n) await page.evaluate((n) => window.__reader.goTo(n), p.n);
          const st = await page.waitForFunction(
            (n) => {
              const r = document.querySelector('[data-testid=reader]');
              return r.dataset.page === String(n) && ['waiting', 'done'].includes(r.dataset.state) && r.dataset.state;
            },
            p.n,
            { timeout: 15000 },
          ).then((h) => h.jsonValue());
          if (st === 'waiting') {
            await control(page).focus();
            await page.keyboard.press('Enter');
          }
          await waitState(page, p.n, 'done', 15000);
          await page.waitForTimeout(400);
          const over = await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid=scene] text.sb-name')]
              .filter((t) => !t.closest('[display=none]') && t.textContent)
              .map((t) => ({ id: t.id || t.parentNode.id, w: Math.round(t.getBBox().width), max: Number(t.dataset.maxWidth), text: t.textContent }))
              .filter((x) => x.max && x.w > x.max * 1.04),
          );
          eq(over, [], `${name}: name spots on page ${p.n} fit`);
          if (name.startsWith('sibs:')) {
            const art = await page.evaluate(() => [...document.querySelectorAll('[data-testid=scene] text.sb-name')].filter((t) => !t.closest('[display=none]') && t.textContent).map((t) => t.textContent.replace(/\s+/g, ' ')));
            for (const t of art) assert(/AMARA ?& ?ZAK ?& ?LI|Amara ?& ?Zak ?& ?Li/.test(t), `siblings: page ${p.n} art shows "${t}"`);
            eq(await page.evaluate(() => [...document.querySelectorAll('[data-testid=scene] .sb-letter')].map((t) => t.textContent).join('')), '', `siblings: page ${p.n} bunting uses the banner`);
          }
          if (name !== 'Bo') await shot(page, `real-${bookId}-names-${encodeURIComponent(name)}-p${p.n}`);
        }
        noErrors(errors.filter((e) => !/status of 404/.test(e)), `real book ${bookId} names (${name})`);
        await context.close();
      }
    });
  }
} finally {
  await browser.close().catch(() => {});
  stopServer(server);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} reader e2e checks passed`);
process.exit(failed.length ? 1 : 0);
