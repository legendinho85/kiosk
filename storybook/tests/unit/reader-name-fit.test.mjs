import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphemes, nameForForm, slotLetters, distributeLetters, splitForWrap, estimateTextWidth, fitText, layoutName, twoLineBaselines, MIN_SCALE,
} from '../../js/reader/name-fit.js';
import { person } from '../../js/core/personalise.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('graphemes keep accented letters whole, even when decomposed', () => {
  assert.deepEqual(graphemes('Zoë'), ['Z', 'o', 'ë']);
  assert.deepEqual(graphemes('Zoë'), ['Z', 'o', 'ë']);
  assert.deepEqual(graphemes('小明'), ['小', '明']);
  assert.deepEqual(graphemes(''), []);
});

test('nameForForm uses personalise.js forms', () => {
  const p = person('Siobhán', 'Shiv-awn');
  assert.equal(nameForForm(p, 'upper'), 'SIOBHÁN');
  assert.equal(nameForForm(p, 'poss'), "Siobhán's");
  assert.equal(nameForForm(p, 'plain'), 'Siobhán');
  assert.equal(nameForForm(p, undefined), 'Siobhán');
  assert.equal(nameForForm('James', 'poss'), "James's");
  assert.equal(nameForForm(person('Zoë'), 'upper'), 'ZOË');
});

test('slotLetters spells names for bunting, skipping separators', () => {
  assert.deepEqual(slotLetters('Bo'), ['B', 'O']);
  assert.deepEqual(slotLetters('Zoë'), ['Z', 'O', 'Ë']);
  assert.deepEqual(slotLetters('Siobhán'), ['S', 'I', 'O', 'B', 'H', 'Á', 'N']);
  assert.deepEqual(slotLetters('Anna-Sophia'), ['A', 'N', 'N', 'A', 'S', 'O', 'P', 'H', 'I', 'A']);
  assert.deepEqual(slotLetters("D'Arcy"), ['D', 'A', 'R', 'C', 'Y']);
  assert.deepEqual(slotLetters('Xiao Ming').join(''), 'XIAOMING');
  assert.equal(slotLetters('小明'), null, 'non-alphabetic scripts use the overflow banner');
  assert.equal(slotLetters('محمد'), null);
  assert.deepEqual(slotLetters('Юлия'), ['Ю', 'Л', 'И', 'Я']);
  assert.equal(slotLetters(''), null);
});

test('distributeLetters centres the name and reports overflow', () => {
  assert.deepEqual(distributeLetters(['B', 'O'], 7), ['', '', 'B', 'O', '', '', '']);
  assert.deepEqual(distributeLetters(['A', 'V', 'A'], 3), ['A', 'V', 'A']);
  assert.deepEqual(distributeLetters(['Z', 'O', 'Ë'], 8), ['', '', 'Z', 'O', 'Ë', '', '', '']);
  const maxi = slotLetters('Maximilian');
  assert.equal(distributeLetters(maxi, 9), null, 'ten letters on nine flags overflow');
  assert.equal(distributeLetters(maxi, 12).filter(Boolean).join(''), 'MAXIMILIAN');
  assert.equal(distributeLetters(slotLetters('Oluwaseun'), 9).join(''), 'OLUWASEUN');
  assert.equal(distributeLetters(null, 9), null);
  assert.equal(distributeLetters([], 9), null);
});

test('splitForWrap breaks at a space or after a hyphen, balancing the lines', () => {
  assert.deepEqual(splitForWrap('Anna-Sophia'), ['Anna-', 'Sophia']);
  assert.deepEqual(splitForWrap('Xiao Ming'), ['Xiao', 'Ming']);
  assert.deepEqual(splitForWrap('Mary Kate Rose'), ['Mary', 'Kate Rose'], 'ties keep the first break');
  assert.deepEqual(splitForWrap('Jean-Luc Paul'), ['Jean-Luc', 'Paul']);
  assert.equal(splitForWrap('Maximilian'), null);
  assert.equal(splitForWrap('Bo'), null);
  assert.equal(splitForWrap('-Bo'), null);
});

test('estimateTextWidth grows with length and letter width', () => {
  assert.ok(estimateTextWidth('MAXIMILIAN', 64) > estimateTextWidth('BO', 64));
  assert.ok(estimateTextWidth('WWW', 64) > estimateTextWidth('iii', 64));
  assert.ok(estimateTextWidth('小明', 64) >= 128);
  assert.equal(estimateTextWidth('', 64), 0);
});

test('fitText shrinks, then tightens spacing, then squeezes', () => {
  // Fits already
  assert.deepEqual(fitText(200, 64, 320), { fontSize: 64, letterSpacing: 0, squeeze: false });
  // No limit
  assert.deepEqual(fitText(900, 64, NaN), { fontSize: 64, letterSpacing: 0, squeeze: false });
  // Shrinks proportionally
  const a = fitText(400, 64, 320);
  close(a.fontSize, 51.2);
  assert.equal(a.letterSpacing, 0);
  // Down to 45% then letter spacing
  const b = fitText(760, 64, 320, { chars: 10 });
  close(b.fontSize, 64 * MIN_SCALE);
  close(b.letterSpacing, -(760 * MIN_SCALE - 320) / 10);
  assert.equal(b.squeeze, false);
  assert.ok(-b.letterSpacing <= b.fontSize * 0.12);
  // Beyond that, squeeze the glyphs (never an ellipsis)
  const c = fitText(2000, 64, 320, { chars: 10 });
  close(c.fontSize, 64 * MIN_SCALE);
  assert.equal(c.squeeze, true);
});

test('layoutName keeps short names on one line at full size', () => {
  for (const n of ['Bo', 'Zoë', 'Kit']) {
    const l = layoutName({ text: n.toUpperCase(), fontSize: 64, maxWidth: 320, wrap: true });
    assert.deepEqual(l.lines, [n.toUpperCase()]);
    assert.equal(l.fontSize, 64);
  }
});

test('layoutName shrinks long single names and wraps very long double names', () => {
  const maxi = layoutName({ text: 'MAXIMILIAN', fontSize: 64, maxWidth: 320, wrap: true });
  assert.equal(maxi.lines.length, 1);
  assert.ok(maxi.fontSize < 64 && maxi.fontSize >= 64 * MIN_SCALE);
  // A narrow slot: one line would be tiny, two lines are bigger.
  const anna = layoutName({ text: 'ANNA-SOPHIA', fontSize: 80, maxWidth: 220, wrap: true });
  assert.deepEqual(anna.lines, ['ANNA-', 'SOPHIA']);
  const one = layoutName({ text: 'ANNA-SOPHIA', fontSize: 80, maxWidth: 220, wrap: false });
  assert.equal(one.lines.length, 1);
  assert.ok(anna.fontSize > one.fontSize);
  // Without a break point it stays on one line however long it is.
  assert.equal(layoutName({ text: 'OLUWASEUNOLUWASEUN', fontSize: 80, maxWidth: 220, wrap: true }).lines.length, 1);
  // A custom measure is honoured.
  const fixed = layoutName({ text: 'AB', fontSize: 10, maxWidth: 50, measure: (t, s) => t.length * s * 5 });
  close(fixed.fontSize, 5);
});

test('layoutName handles non-Latin names', () => {
  const l = layoutName({ text: '小明', fontSize: 64, maxWidth: 320 });
  assert.deepEqual(l.lines, ['小明']);
  assert.equal(l.fontSize, 64);
});

test('twoLineBaselines centre the pair on the original line', () => {
  const [a, b] = twoLineBaselines(500, 64, 40);
  assert.ok(a < 500 && b > a);
  // The pair's visual middle stays where the single line's middle was.
  const middle = ((a - 0.35 * 40) + (b - 0.35 * 40)) / 2;
  close(middle, 500 - 0.35 * 64);
  // Centred text: the lines sit either side of y.
  const [c, d] = twoLineBaselines(500, 64, 40, true);
  close((c + d) / 2, 500);
});
