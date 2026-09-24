// Browser test for the reader (js/reader/*), run against the fixture book in
// tests/fixtures/reader/ with Playwright's Chromium:
//   node tests/e2e/reader.e2e.mjs            (PORT=8104 by default)
//   SHOTS=/some/dir node tests/e2e/reader.e2e.mjs   also saves screenshots
//   REAL_BOOK=0 skips the smoke test of books/tiffin-football
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
async function startServer() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const proc = spawn(npx, ['--yes', 'http-server', ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/package.json`);
      if (r.ok) return proc;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  proc.kill();
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
  // No network in tests: web fonts resolve to nothing (the fallback fonts are fine).
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    // Remember every word that was highlighted, per page.
    window.__seen = {};
    new MutationObserver((muts) => {
      for (const m of muts) {
        const t = m.target;
        if (t.classList?.contains('is-current') && t.classList.contains('sb-word')) {
          const n = document.querySelector('[data-testid=reader]')?.dataset.page;
          (window.__seen[n] ??= []).push(t.textContent);
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
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
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
          buttons: ['next-page', 'prev-page', 'replay', 'exit-reader'].map((id) => Math.min(r(id).width, r(id).height)),
          frame: [frame.left, frame.right, frame.top, frame.bottom],
          hitH: Number(hitLine.getAttribute('stroke-width')) * scale,
          text: r('page-text').height,
        };
      });
      assert(m.scrollW <= m.w, `${label}: no horizontal scroll (${m.scrollW} > ${m.w})`);
      assert(m.buttons.every((s) => s >= 56), `${label}: buttons >= 56px (${m.buttons})`);
      assert(m.frame[0] >= -1 && m.frame[1] <= viewport.width + 1, `${label}: the book fits across`);
      assert(m.hitH >= 56, `${label}: slider hit area >= 56px (${m.hitH})`);
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

  // Smoke test of the real book: every page whose scene the illustrators have
  // delivered opens, its mechanism completes, and the name appears in the art.
  const realDir = path.join(ROOT, 'books/tiffin-football');
  const draft = existsSync(path.join(realDir, 'book.draft.json')) ? JSON.parse(readFileSync(path.join(realDir, 'book.draft.json'), 'utf8')) : null;
  const ready = (draft?.pages ?? []).filter((p) => existsSync(path.join(realDir, p.scene)));
  if (process.env.REAL_BOOK !== '0' && ready.length) {
    await step(`real book: ${ready.length}/${draft.pages.length} pages open, mechanisms complete, names in the art`, async () => {
      for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
        // merge=1: the draft plus the illustrators' page fragments, exactly what
        // tools/build-book.mjs produces, so this works before the build step too.
        const { page, context, errors } = await openHarness(browser, `test=1&book=tiffin-football&merge=1&name=Siobh%C3%A1n&page=${ready[0].n}`, { viewport });
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
          await shot(page, `real-${viewport.width}-p${p.n}-before`);
          if (hasControl) {
            await control(page).focus();
            await page.keyboard.press('Enter');
          }
          await waitState(page, p.n, 'done', 15000);
          await page.waitForTimeout(700);
          await shot(page, `real-${viewport.width}-p${p.n}-after`);
          const names = await page.evaluate(() =>
            [...document.querySelectorAll('[data-testid=scene] text.sb-name')]
              .filter((t) => t.closest('[display=none]') === null)
              .map((t) => t.textContent),
          );
          for (const t of names) assert(/Siobh[aá]n|SIOBH[AÁ]N/.test(t), `page ${p.n}: name slot shows "${t}"`);
          const letters = await page.evaluate(() => [...document.querySelectorAll('[data-testid=scene] .sb-letter')].map((t) => t.textContent).join(''));
          if (letters) eq(letters, 'SIOBHÁN', `page ${p.n}: bunting letters`);
        }
        // Pages without a mechanism may have no fragment, and neighbours may not be drawn yet: those 404s are expected.
        const unexpected = page.__missing.filter((x) => !/\/pages\/p\d+\.json$|\/scenes\/p\d+\.svg$/.test(x));
        eq(unexpected, [], 'no other missing files');
        noErrors(errors.filter((e) => !/status of 404/.test(e)), `real book ${viewport.width}x${viewport.height}`);
        await context.close();
      }
    });
    await step('real book: tricky names fit every name spot (shrink, wrap, overflow banner)', async () => {
      for (const name of ['Maximilian', 'Anna-Sophia', 'Xiao Ming', '小明', 'Bo']) {
        const { page, context, errors } = await openHarness(browser, `test=1&book=tiffin-football&merge=1&name=${encodeURIComponent(name)}&page=${ready[0].n}`, { viewport: { width: 1024, height: 768 } });
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
          if (name !== 'Bo') await shot(page, `real-names-${encodeURIComponent(name)}-p${p.n}`);
        }
        noErrors(errors.filter((e) => !/status of 404/.test(e)), `real book names (${name})`);
        await context.close();
      }
    });
  } else {
    console.log('  skip real book smoke test (no scenes yet or REAL_BOOK=0)');
  }
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} reader e2e checks passed`);
process.exit(failed.length ? 1 : 0);
