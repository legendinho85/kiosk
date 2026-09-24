// Name-sticker sheets (js/ar/stickers.js): sizes, labels, planning, packing and colours.
// The browser half (measuring scenes, sampling colours, printing) is covered by
// tests/e2e/stickers.e2e.mjs; tests/fixtures/stickers/*.spots.json are snapshots of
// measureBookSpots() taken in Chromium, so these tests plan real books.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  A4,
  SHEET,
  unitsToMm,
  mmPerUnit,
  spotLabel,
  pageLabel,
  childNames,
  parseColour,
  toHex,
  luminance,
  dominantColour,
  fallbackBackground,
  stickerSpecFromSlot,
  letterSpecFromSlot,
  planStickers,
  sizeEntry,
  packStickers,
  estimateLabelWidth,
} from '../../js/ar/stickers.js';
import { togetherPerson, person } from '../../js/core/personalise.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/stickers/${name}.spots.json`, import.meta.url), 'utf8'));
const FOOTBALL = fixture('tiffin-football');
const DIGGER = fixture('tiffin-digger');
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} is not within ${tol} of ${b}`);

test('unitsToMm: a 1600-unit scene is a spread of two trimmed pages', () => {
  assert.equal(unitsToMm(1600), 360);
  assert.equal(unitsToMm(800), 180);
  assert.equal(unitsToMm(1600, 200), 400);
  near(unitsToMm(100), 22.5, 1e-9);
  assert.equal(mmPerUnit(180), 0.225);
  // Nonsense trims fall back to the default rather than producing NaN sizes.
  assert.equal(mmPerUnit(0), 0.225);
  assert.equal(mmPerUnit('x'), 0.225);
  assert.equal(unitsToMm(0), 0);
});

test('spotLabel: names a spot from the ids and artwork nearest to it', () => {
  assert.equal(spotLabel(['p2-name', 'd-shirt-back', 'p2-shirt-up']), 'shirt');
  assert.equal(spotLabel(['p5-score-name', 'd-scoreboard']), 'scoreboard');
  assert.equal(spotLabel(['#d-star', 'd-cup', 'p7-cup']), 'trophy'); // the faint star isn't the spot
  assert.equal(spotLabel(['p1-name', 'p1-name-ribbon']), 'ribbon');
  assert.equal(spotLabel(['p4-name', 'p4-banner', 'p4-banner-team']), 'banner');
  assert.equal(spotLabel(['p3-letters', 'd-flag-red', 'p3-bunting']), 'bunting');
  assert.equal(spotLabel(['dg-p1-door-name']), 'door');
  assert.equal(spotLabel(['d2-star', 'd2-hardhat-child']), 'hard hat');
  assert.equal(spotLabel(['p9-thing']), 'name spot');
  assert.equal(spotLabel([]), 'name spot');
  assert.equal(spotLabel(undefined), 'name spot');
  // An explicit data-spot comes first in the hints and wins.
  assert.equal(spotLabel(['cake', 'p2-shirt']), 'cake');
  // "cupboard" is not a cup.
  assert.equal(spotLabel(['p4-cupboard', 'p4-banner']), 'banner');
});

test('pageLabel', () => {
  assert.equal(pageLabel({ n: 1, kind: 'cover' }), 'Cover');
  assert.equal(pageLabel({ n: 2, kind: 'spread' }), 'Page 2');
  assert.equal(pageLabel({ n: 8, kind: 'end' }), 'Page 8');
});

test('childNames: one set of stickers per child', () => {
  assert.deepEqual(childNames(person('Ava')), ['Ava']);
  assert.deepEqual(childNames('  Siobhán '), ['Siobhán']);
  assert.deepEqual(childNames(togetherPerson([{ display: 'Amara' }, { display: 'Zak' }])), ['Amara', 'Zak']);
  assert.deepEqual(childNames(togetherPerson([{ display: 'Amara' }, { display: 'Zak' }, { display: 'Li' }])), ['Amara', 'Zak', 'Li']);
  // Siblings without an art form: split the spoken list instead.
  assert.deepEqual(childNames({ display: 'Amara, Zak and Li', count: 3 }), ['Amara', 'Zak', 'Li']);
  // One child whose name contains "and" is still one child.
  assert.deepEqual(childNames(person('Andy')), ['Andy']);
  assert.deepEqual(childNames(person('Anna-Sophia')), ['Anna-Sophia']);
  assert.deepEqual(childNames(''), []);
  assert.deepEqual(childNames(null), []);
});

test('colours: parse, luminance, the dominant colour of an area, fallbacks', () => {
  assert.deepEqual(parseColour('#E4483A'), [228, 72, 58]);
  assert.deepEqual(parseColour('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColour('rgb(43, 42, 51)'), [43, 42, 51]);
  assert.deepEqual(parseColour('rgba(255,203,61,0.5)'), [255, 203, 61]);
  assert.equal(parseColour('url(#grad)'), null);
  assert.equal(toHex([255, 203, 61]), '#ffcb3d');
  near(luminance([255, 255, 255]), 1, 1e-9);
  near(luminance([0, 0, 0]), 0, 1e-9);
  // 70% yellow, 20% red outline, 10% anti-aliased mush: yellow wins.
  const px = [];
  for (let i = 0; i < 70; i++) px.push(255, 203, 61, 255);
  for (let i = 0; i < 20; i++) px.push(207, 150, 18, 255);
  for (let i = 0; i < 10; i++) px.push(230 - i, 180 - i * 3, 40 + i, 255);
  assert.equal(dominantColour(px), '#ffcb3d');
  // Transparent pixels are the paper.
  assert.equal(dominantColour([0, 0, 0, 0, 0, 0, 0, 0, 10, 10, 10, 255]), '#ffffff');
  assert.equal(dominantColour([]), null);
  assert.equal(fallbackBackground('#E4483A'), '#FFFFFF'); // red name: white sticker
  assert.equal(fallbackBackground('#FFCB3D'), '#2B2A33'); // yellow scoreboard name: dark sticker
  assert.equal(fallbackBackground('url(#x)'), '#FFFFFF');
});

test('stickerSpecFromSlot: the shirt spot on page 2 at its printed size', () => {
  const slot = FOOTBALL.pages.find((p) => p.n === 2).spots[0];
  const spec = stickerSpecFromSlot(slot);
  assert.equal(spec.kind, 'name');
  assert.equal(spec.form, 'plain');
  // data-max-width 176 plus a little room each side, in the shirt's own units...
  const padX = 0.16 * 42;
  near(spec.box.w, 176 + 2 * padX, 0.01, 'box width');
  near(spec.box.x, -88 - padX, 0.01, 'box left');
  // ...the font's line box (getBBox) plus a hair...
  near(spec.box.h, slot.bbox.height + 2 * 0.03 * 42, 0.01, 'box height');
  // ...and the shirt is drawn at 0.62 in the scene: mm = units × 0.62 × 360/1600.
  near(spec.mm.w, (176 + 2 * padX) * 0.62 * 0.225, 0.01, 'printed width');
  near(spec.mm.h, spec.box.h * 0.62 * 0.225, 0.01, 'printed height');
  assert.ok(spec.mm.w > 25 && spec.mm.w < 28, `about 26 mm wide, got ${spec.mm.w}`);
  // It sits inside the shirt's white name panel (192 × 58 shirt units).
  assert.ok(spec.box.w <= 192 && spec.box.h <= 58);
  // The name is centred where the reader centres it, at the drawn size.
  assert.equal(spec.text.x, 0);
  assert.equal(spec.text.fontSize, 42);
  assert.equal(spec.text.maxWidth, 176);
  assert.equal(spec.background, '#ffffff');
  assert.equal(spec.paint.fill, '#E4483A');
  // A bigger book makes bigger stickers.
  near(stickerSpecFromSlot(slot, { trimMm: 200 }).mm.w, (spec.box.w * 0.62 * 400) / 1600, 0.01);
});

test('stickerSpecFromSlot: anchors, outlines, two-line slots and missing measurements', () => {
  const base = { x: 100, y: 200, fontSize: 50, maxWidth: 300, bbox: { x: 0, y: 152, width: 10, height: 60 }, scale: 1 };
  near(stickerSpecFromSlot({ ...base, anchor: 'start' }).box.x, 100 - 8, 1e-9, 'start');
  near(stickerSpecFromSlot({ ...base, anchor: 'end' }).box.x, 100 - 300 - 8, 1e-9, 'end');
  near(stickerSpecFromSlot({ ...base, anchor: 'middle' }).text.x, 100, 1e-9, 'middle');
  // The cover's white outline (stroke-width 12, painted under the fill) needs room.
  const plain = stickerSpecFromSlot({ ...base, anchor: 'middle' });
  const outlined = stickerSpecFromSlot({ ...base, anchor: 'middle', paint: { stroke: '#FFFFFF', strokeWidth: '12' } });
  near(outlined.box.w - plain.box.w, 12, 1e-9, 'outline width');
  near(outlined.box.h - plain.box.h, 12, 1e-9, 'outline height');
  // data-wrap="2": room for the two-line layout.
  const wrapped = stickerSpecFromSlot({ ...base, anchor: 'middle', wrap: true });
  assert.ok(wrapped.box.h > plain.box.h * 1.1, `two lines need more height (${wrapped.box.h} vs ${plain.box.h})`);
  // No bbox (engine couldn't measure): estimated from the font size.
  const guessed = stickerSpecFromSlot({ x: 0, y: 0, fontSize: 40, maxWidth: 200, anchor: 'middle' });
  assert.ok(guessed.box.h > 40 && guessed.box.h < 60);
  // Nothing at all: still a sensible sticker.
  const bare = stickerSpecFromSlot({});
  assert.ok(bare.mm.w > 0 && bare.mm.h > 0);
  assert.equal(bare.form, 'plain');
  assert.equal(stickerSpecFromSlot({ ...base, form: 'upper' }).form, 'upper');
  assert.equal(stickerSpecFromSlot({ ...base, form: 'poss' }).form, 'poss');
  assert.equal(stickerSpecFromSlot({ ...base, form: 'weird' }).form, 'plain');
});

test('letterSpecFromSlot: a round sticker that sits inside a bunting flag', () => {
  const slot = FOOTBALL.pages.find((p) => p.n === 3).spots[0].letters[4];
  const spec = letterSpecFromSlot({ ...slot, index: 4 });
  assert.equal(spec.shape, 'circle');
  assert.equal(spec.flag, 5);
  near(spec.box.w, 1.08 * 62, 0.01);
  near(spec.mm.w, 1.08 * 62 * 0.225, 0.01);
  // The flag is 100.8 units across the top and about 118 deep: the circle fits inside.
  assert.ok(spec.box.w < 70);
  assert.equal(spec.background, slot.background);
});

test('planStickers: one child gets a sticker for every name spot, letters for the bunting and spare initials', () => {
  const entries = planStickers(FOOTBALL.pages, ['Ava']);
  const names = entries.filter((e) => e.type === 'name');
  assert.deepEqual(
    names.map((e) => e.label),
    ['Cover · ribbon', 'Page 2 · shirt', 'Page 4 · banner', 'Page 5 · scoreboard', 'Page 6 · scoreboard', 'Page 7 · banner', 'Page 7 · trophy', 'Page 8 · shirt'],
  );
  // Same case as the spot: scoreboards and the page 8 shirt are upper case.
  assert.deepEqual(
    names.map((e) => e.text),
    ['Ava', 'Ava', 'Ava', 'AVA', 'AVA', 'Ava', 'Ava', 'AVA'],
  );
  const bunting = entries.find((e) => e.type === 'letters' && !e.spare);
  assert.equal(bunting.label, 'Page 3 · bunting flags (count from the left)');
  // AVA centred on 12 flags: flags 5, 6, 7.
  assert.deepEqual(
    bunting.items.map((i) => [i.text, i.flag]),
    [
      ['A', 5],
      ['V', 6],
      ['A', 7],
    ],
  );
  // Each letter keeps its own flag's colours.
  assert.deepEqual(
    bunting.items.map((i) => i.spec.background),
    ['#ffcb3d', '#ffffff', '#e4483a'],
  );
  const spares = entries.find((e) => e.spare);
  assert.equal(spares.items.length, 3);
  assert.ok(spares.items.every((i) => i.text === 'A'));
  assert.equal(new Set(spares.items.map((i) => i.spec.background)).size, 3, 'one spare in each flag colour');
  // No overflow banner when the letters fit, and no headings for one child.
  assert.ok(!entries.some((e) => /across the/.test(e.label ?? '')));
  assert.ok(!entries.some((e) => e.type === 'heading'));
});

test('planStickers: names with accents, hyphens and many letters', () => {
  const siobhan = planStickers(FOOTBALL.pages, ['Siobhán']);
  assert.deepEqual(
    siobhan.find((e) => e.type === 'letters').items.map((i) => i.text),
    ['S', 'I', 'O', 'B', 'H', 'Á', 'N'],
  );
  assert.equal(siobhan.find((e) => e.label === 'Page 5 · scoreboard').text, 'SIOBHÁN');
  // The hyphen isn't a flag.
  const anna = planStickers(FOOTBALL.pages, ['Anna-Sophia']);
  assert.equal(anna.find((e) => e.type === 'letters').items.map((i) => i.text).join(''), 'ANNASOPHIA');
  assert.deepEqual(anna.find((e) => e.type === 'letters').items.map((i) => i.flag), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // 13 letters don't fit 12 flags: one sticker for the banner across the bunting instead.
  const long = planStickers(FOOTBALL.pages, ['Maximilianoss']);
  const banner = long.find((e) => /across the bunting/.test(e.label));
  assert.ok(banner, 'overflow banner sticker');
  assert.equal(banner.text, 'Maximilianoss');
  assert.equal(banner.spec.wrap, true);
  assert.ok(!long.some((e) => e.type === 'letters' && !e.spare));
  assert.ok(long.some((e) => e.spare), 'still spare initials');
  // A name that doesn't split into letters: the banner, and no spare initials.
  const chinese = planStickers(FOOTBALL.pages, ['李明']);
  assert.ok(chinese.some((e) => /across the bunting/.test(e.label)));
  assert.ok(!chinese.some((e) => e.type === 'letters'));
  assert.equal(planStickers(FOOTBALL.pages, ['Ava'], { spares: false }).filter((e) => e.spare).length, 0);
});

test('planStickers: siblings get a set each, headed by their name', () => {
  const kids = childNames(togetherPerson([{ display: 'Amara' }, { display: 'Zak' }]));
  const entries = planStickers(FOOTBALL.pages, kids);
  const headings = entries.filter((e) => e.type === 'heading');
  assert.deepEqual(
    headings.map((e) => e.text),
    ['Amara’s stickers', 'Zak’s stickers'],
  );
  const one = planStickers(FOOTBALL.pages, ['Amara']).length;
  assert.equal(entries.length, 2 * (one + 1));
  // Each heading keeps its whole set with it.
  assert.equal(headings[0].keepWith, one);
  assert.ok(entries.filter((e) => e.child === 1 && e.type === 'name').every((e) => /^Zak$|^ZAK$/.test(e.text)));
  // Amara's bunting: 5 letters on 12 flags -> flags 4-8.
  assert.deepEqual(
    entries.find((e) => e.child === 0 && e.type === 'letters').items.map((i) => i.flag),
    [4, 5, 6, 7, 8],
  );
});

test('planStickers: a second book (repeated door spots, possessive and two-line slots)', () => {
  const entries = planStickers(DIGGER.pages, ['Ava']);
  const labels = entries.filter((e) => e.type === 'name').map((e) => e.label);
  assert.ok(labels.filter((l) => / · door$/.test(l)).length >= 2, 'a door sticker on each page it appears');
  const plan = entries.find((e) => / · plan$/.test(e.label));
  assert.equal(plan.text, "Ava's");
  assert.equal(plan.spec.wrap, true);
  // Every spot gets a sticker of a real size (the smallest, on the little digger, is about 9 × 2.6 mm).
  assert.ok(entries.every((e) => e.type !== 'name' || (e.spec.mm.w > 5 && e.spec.mm.h > 2)));
});

test('sizeEntry: labels, letter rows and headings', () => {
  const entries = planStickers(FOOTBALL.pages, ['Ava']);
  const shirt = entries.find((e) => e.label === 'Page 2 · shirt');
  const s = sizeEntry(shirt);
  assert.ok(s.w >= shirt.spec.mm.w && s.w >= estimateLabelWidth(shirt.label));
  near(s.h, shirt.spec.mm.h + SHEET.labelGap + SHEET.labelH, 1e-6);
  assert.equal(s.parts.length, 1);
  near(s.parts[0].x, (s.w - shirt.spec.mm.w) / 2, 1e-3);
  near(s.label.y, shirt.spec.mm.h + SHEET.labelGap, 1e-3);
  // Twelve letters wrap onto two rows within the 190 mm printable width.
  const twelve = planStickers(FOOTBALL.pages, ['Christabella']).find((e) => e.type === 'letters' && !e.spare);
  assert.equal(twelve.items.length, 12);
  const t = sizeEntry(twelve, { areaW: 190 });
  assert.ok(t.w <= 190, `fits the width (${t.w})`);
  const rows = new Set(t.parts.map((p) => p.y));
  assert.equal(rows.size, 2);
  // In order: left to right, then the next row.
  for (let i = 1; i < t.parts.length; i++) {
    const [a, b] = [t.parts[i - 1], t.parts[i]];
    assert.ok(b.y > a.y || (b.y === a.y && b.x > a.x), `letter ${i + 1} follows letter ${i}`);
  }
  const heading = sizeEntry({ type: 'heading', text: 'Zak’s stickers', keepWith: 12 }, { areaW: 190 });
  assert.deepEqual([heading.w, heading.newRow, heading.fullWidth, heading.keepWith], [190, true, true, 12]);
});

test('packStickers: rows, gaps, margins and sheets', () => {
  const box = (w, h, extra = {}) => ({ w, h, ...extra });
  const one = packStickers([box(50, 20), box(50, 20), box(50, 20), box(50, 20)], { top: 30 });
  assert.equal(one.sheets.length, 1);
  const [a, b, c, d] = one.sheets[0].items;
  assert.deepEqual([a.x, a.y], [10, 40]); // 10 mm margin + 30 mm header
  assert.deepEqual([b.x, b.y], [63, 40]); // 3 mm gap
  assert.deepEqual([c.x, c.y], [116, 40]);
  assert.deepEqual([d.x, d.y], [10, 63]); // 169 + 50 > 200: next row, 3 mm below
  assert.deepEqual(one.area, { x: 10, y: 40, w: 190, h: 247 });
  // Exactly the printable width fits on one row.
  assert.equal(packStickers([box(95, 10), box(92, 10)]).sheets[0].items[1].y, 10);
  // Rows spill onto new sheets.
  const many = packStickers(Array.from({ length: 30 }, () => box(90, 40)), { top: 30, bottom: 6 });
  // 2 per row, 5 rows per sheet ((241 + 3) / 43 = 5.67) -> 10 per sheet.
  assert.deepEqual(many.sheets.map((s) => s.items.length), [10, 10, 10]);
  assert.equal(many.sheets[1].items[0].y, 40);
  // newRow and fullWidth.
  const rows = packStickers([box(20, 10), box(190, 8, { newRow: true, fullWidth: true }), box(20, 10)]);
  assert.deepEqual(rows.sheets[0].items.map((i) => [i.x, i.y]), [
    [10, 10],
    [10, 23],
    [10, 34],
  ]);
  // Nothing at all.
  assert.deepEqual(packStickers([]).sheets, []);
  assert.deepEqual(packStickers(null).sheets, []);
});

test('packStickers: headings stay with their set, never alone at the bottom', () => {
  const box = (w, h, extra = {}) => ({ w, h, ...extra });
  const head = (keepWith) => box(190, 8, { newRow: true, fullWidth: true, keepWith });
  // A set of 4 rows that would fit on a fresh sheet moves over whole.
  const set = [head(4), box(190, 50), box(190, 50), box(190, 50), box(190, 50)];
  const packed = packStickers([box(190, 100), ...set], { top: 30, bottom: 6 });
  assert.equal(packed.sheets.length, 2);
  assert.deepEqual(packed.sheets[1].items.map((i) => i.index), [1, 2, 3, 4, 5]);
  // A set too big for any sheet still starts where it is, but never with its heading alone.
  const huge = [head(9), ...Array.from({ length: 9 }, () => box(190, 50))];
  const p2 = packStickers([box(190, 100), ...huge], { top: 30, bottom: 6 });
  assert.ok(p2.sheets[0].items.at(-1).index >= 2, 'heading and at least its first item on sheet 1');
  assert.equal(p2.sheets[0].items.at(-1).index, 3, 'as much of the set as fits');
  // A heading with room below it but not for the next item moves on.
  const p3 = packStickers([box(190, 225), head(1), box(190, 20)], { top: 30, bottom: 6 });
  assert.deepEqual(p3.sheets.map((s) => s.items.map((i) => i.index)), [[0], [1, 2]]);
});

test('packStickers: oversize items are placed and reported', () => {
  const p = packStickers([{ w: 220, h: 10 }, { w: 20, h: 400 }, { w: 20, h: 10 }]);
  assert.deepEqual(p.oversize, [0, 1]);
  assert.equal(p.sheets.length, 2);
  // The too-tall one starts a fresh sheet at the top; the next sticker sits beside it.
  assert.deepEqual([p.sheets[1].items[0].x, p.sheets[1].items[0].y], [10, 10]);
  assert.deepEqual([p.sheets[1].items[1].x, p.sheets[1].items[1].y], [33, 10]);
});

test('packStickers: random stickers never overlap and stay inside the margins', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let run = 0; run < 40; run++) {
    const items = Array.from({ length: 5 + Math.floor(rand() * 40) }, () => ({ w: 5 + rand() * 120, h: 5 + rand() * 60 }));
    const { sheets, oversize } = packStickers(items, { top: 30, bottom: 6 });
    assert.equal(oversize.length, 0);
    const seen = [];
    for (const sheet of sheets) {
      for (const it of sheet.items) {
        assert.ok(it.x >= 10 - 1e-9 && it.x + it.w <= A4.w - 10 + 1e-6, `inside left/right margins (${it.x}, ${it.w})`);
        assert.ok(it.y >= 40 - 1e-9 && it.y + it.h <= A4.h - 10 - 6 + 1e-6, `inside top/bottom (${it.y}, ${it.h})`);
        for (const o of sheet.items) {
          if (o === it) continue;
          const apart = o.x >= it.x + it.w + 3 - 1e-6 || it.x >= o.x + o.w + 3 - 1e-6 || o.y >= it.y + it.h + 3 - 1e-6 || it.y >= o.y + o.h + 3 - 1e-6;
          assert.ok(apart, 'at least a 3 mm gap between stickers');
        }
        seen.push(it.index);
      }
    }
    assert.deepEqual(seen, items.map((_, i) => i), 'every sticker once, in order');
  }
});

test('the real book packs onto one A4 sheet per child at 180 mm, inside the margins', () => {
  const areaW = A4.w - 2 * SHEET.margin;
  for (const kids of [['Ava'], ['Oluwaseun'], ['Anna-Sophia'], ['Amara', 'Zak']]) {
    const entries = planStickers(FOOTBALL.pages, kids);
    const sized = entries.map((e) => sizeEntry(e, { areaW }));
    const packed = packStickers(sized, { top: SHEET.head, bottom: SHEET.foot });
    assert.equal(packed.sheets.length, kids.length, `${kids.join(' & ')}: ${packed.sheets.length} sheets`);
    assert.deepEqual(packed.oversize, []);
    if (kids.length > 1) assert.equal(entries[packed.sheets[1].items[0].index].type, 'heading', 'the second child starts a fresh sheet');
  }
});
