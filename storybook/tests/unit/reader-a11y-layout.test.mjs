// Reader details that don't need a browser: where the prompt goes on a phone
// held sideways, the double-tap guard, the scene sanitiser's CSS checks, and
// the real books' words and picture descriptions for siblings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { promptSide, controlExtent, TURN_GUARD_MS } from '../../js/reader/reader.js';
import { cssUnescape, hasExternalUrl } from '../../js/reader/scene.js';
import { fillTemplate, togetherPerson, person, unknownPlaceholders } from '../../js/core/personalise.js';
import { validateBook } from '../../js/core/book.js';

const book = (id) => JSON.parse(readFileSync(new URL(`../../books/${id}/book.json`, import.meta.url), 'utf8'));
const BOOKS = ['tiffin-football', 'tiffin-digger'];

test('phone landscape: the prompt moves to the top when the part to grab is at the bottom', () => {
  // Football p6: the ball starts at the bottom of the picture.
  assert.equal(promptSide(controlExtent({ type: 'slider', control: { from: [800, 796], to: [1120, 292] } })), 'top');
  // Football p5: the pull-tab is above the bottom fifth: the prompt stays at the bottom
  // (at the top it would cover the scoreboard with the name on it).
  assert.equal(promptSide(controlExtent({ type: 'pull-tab', control: { from: [368, 700], to: [96, 700] } })), 'bottom');
  // Football p3: the wheel's handle is at the bottom of the ring; digger p4: the tab.
  assert.equal(promptSide(controlExtent({ type: 'wheel', control: { center: [800, 600], radius: 290 } })), 'top');
  assert.equal(promptSide(controlExtent({ type: 'pull-tab', control: { from: [250, 860], to: [60, 860] } })), 'top');
  assert.equal(promptSide(controlExtent({ type: 'push-button', control: { center: [1000, 560], radius: 71 } })), 'bottom');
  assert.equal(promptSide(controlExtent({ type: 'wheel', control: { center: [1000, 520], radius: 220 } })), 'bottom');
  // A part at the very top keeps the prompt at the bottom.
  assert.equal(promptSide([60, 240]), 'bottom');
  assert.equal(promptSide([700, 990]), 'top');
  assert.equal(promptSide([600, 790]), 'bottom');
  // Unknown: bottom, as always.
  assert.equal(promptSide(null), 'bottom');
  assert.equal(promptSide(controlExtent({ type: 'none' })), 'bottom');
  assert.equal(promptSide(controlExtent({ type: 'flap', control: { flap: '#x' } })), 'bottom', 'a flap needs the drawn scene');
  assert.deepEqual(controlExtent({ type: 'wheel', control: { center: [800, 600], radius: 290 } }), [310, 890]);
});

test('a double tap turns one page: the guard is long enough for a toddler, short enough to feel instant', () => {
  assert.ok(TURN_GUARD_MS >= 350 && TURN_GUARD_MS <= 600, String(TURN_GUARD_MS));
});

test('the scene sanitiser sees through disguised CSS urls', () => {
  assert.equal(cssUnescape('u\\72 l(http://x)'), 'url(http://x)');
  assert.equal(cssUnescape('\\75\\72\\6c(x)'), 'url(x)');
  assert.equal(cssUnescape('u\\rl(x)'), 'url(x)');
  for (const bad of ['url(https://evil.test/x.png)', 'URL( "//evil.test/x")', 'u\\72 l(http://evil.test)', "image-set('https://evil.test/a.png' 1x)", '-webkit-image-set(url(x) 1x)', 'cross-fade(url(a), url(b), 50%)', 'element(#x)', 'url(#a) , url(http://evil.test)']) {
    assert.equal(hasExternalUrl(bad), true, bad);
  }
  for (const ok of ['url(#grad)', "url('#p3-shadow')", 'none', '#FFC83D', 'rgba(0,0,0,.5)', 'url(/*x*/#a)', '']) {
    assert.equal(hasExternalUrl(ok), false, ok);
  }
});

test('real books: every picture has a description, with the name filled in', () => {
  for (const id of BOOKS) {
    const b = book(id);
    assert.deepEqual(validateBook(b), [], id);
    for (const p of b.pages) {
      assert.ok(typeof p.alt === 'string' && p.alt.length > 30, `${id} p${p.n}: alt`);
      for (const t of [p.alt, p.altAfter ?? '']) assert.deepEqual(unknownPlaceholders(t), [], `${id} p${p.n}: ${t}`);
      const one = fillTemplate(p.alt, person('Ava'));
      assert.ok(!/[{}]/.test(one), one);
      // Descriptions say the name as a word (screen readers may spell out CAPITALS).
      assert.ok(!/\{NAME\}/.test(p.alt + (p.altAfter ?? '')), `${id} p${p.n}: no {NAME} in alt`);
    }
  }
});

test('real books: siblings get agreeing words ("Where are ... shirts?" is answered "Here they are!")', () => {
  const two = togetherPerson([{ display: 'Amara' }, { display: 'Zak' }]);
  const three = togetherPerson([{ display: 'Amara' }, { display: 'Zak' }, { display: 'Jess' }]);
  for (const id of BOOKS) {
    for (const p of book(id).pages) {
      const lines = [...p.text, p.prompt, ...(p.after ?? [])].filter(Boolean);
      for (const who of [two, three]) {
        const filled = lines.map((l) => fillTemplate(l, who));
        filled.forEach((line, i) => {
          // A plural question is never answered in the singular.
          if (/\b(are|shirts|hats)\b/.test(line) && /\?$/.test(line)) {
            const rest = filled.slice(i + 1).join(' ');
            assert.ok(!/\b(it is|it's)\b/i.test(rest), `${id} p${p.n}: "${line}" … "${rest}"`);
          }
          // Tiffin is never folded into the children's list ("Tiffin and Amara and Zak").
          assert.ok(!/Tiffin and Amara/.test(line), `${id} p${p.n}: "${line}"`);
          assert.ok(!/\band\b[^!?.]*\band\b[^!?.]*\band\b/.test(line), `${id} p${p.n}: "${line}"`);
        });
      }
      // One child: unchanged, singular.
      for (const l of lines) assert.ok(!/\b(they are|shirts|hats)\b/.test(fillTemplate(l, person('Ava'))), `${id} p${p.n}: ${l}`);
    }
  }
  const fb2 = book('tiffin-football').pages[1];
  assert.equal(fillTemplate(fb2.after[0], two), 'Here they are!');
  assert.equal(fillTemplate(fb2.after[0], person('Ava')), 'Here it is!');
  assert.equal(fillTemplate(book('tiffin-football').pages[6].after[0], two), 'A big gold cup! Well done, Tiffin! Well done, Amara and Zak!');
});

test('validateBook checks descriptions and tracking targets', () => {
  const base = { id: 'x', title: 'X', pages: [{ n: 1, kind: 'cover', scene: 'scenes/p1.svg', text: [] }] };
  assert.deepEqual(validateBook({ ...base, pages: [{ ...base.pages[0], alt: 'A picture of {name}.' }] }), []);
  assert.ok(validateBook({ ...base, pages: [{ ...base.pages[0], alt: ['no'] }] }).some((e) => /alt must be/.test(e)));
  assert.ok(validateBook({ ...base, pages: [{ ...base.pages[0], altAfter: 'Hello {nmae}' }] }).some((e) => /unknown placeholder/.test(e)));
  assert.deepEqual(validateBook({ ...base, targets: 'targets.mind' }), []);
  assert.deepEqual(validateBook({ ...base, targets: true }), []);
  assert.ok(validateBook({ ...base, targets: 'https://evil.test/x.js' }).some((e) => /targets must be/.test(e)));
});
