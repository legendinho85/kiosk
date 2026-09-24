import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphemes, nameForForm, slotLetters, distributeLetters, splitForWrap, estimateTextWidth, fitText, layoutName, twoLineBaselines, MIN_SCALE, artName,
  siblingNames, layoutSiblings, SIBLING_MIN_SCALE,
} from '../../js/reader/name-fit.js';
import { person, togetherPerson } from '../../js/core/personalise.js';

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

test('layoutName re-measures at the chosen size (screen text does not shrink exactly in proportion)', () => {
  // Like a phone drawing a scene small: widths get relatively wider as the size drops.
  const nonLinear = (t, s) => t.length * s * 0.6 * (1 + (46 - s) * 0.012);
  const l = layoutName({ text: "Oluwaseun's", fontSize: 46, maxWidth: 220, measure: nonLinear });
  assert.ok(nonLinear("Oluwaseun's", l.fontSize) <= 220 * 1.002, `fits: ${nonLinear("Oluwaseun's", l.fontSize)} at ${l.fontSize}`);
  assert.ok(l.fontSize > 46 * MIN_SCALE);
  // Two lines are checked the same way.
  const two = layoutName({ text: 'ANNA-SOPHIA', fontSize: 80, maxWidth: 220, wrap: true, measure: (t, s) => t.length * s * 0.62 * (1 + (80 - s) * 0.01) });
  assert.equal(two.lines.length, 2);
  for (const line of two.lines) assert.ok(line.length * two.fontSize * 0.62 * (1 + (80 - two.fontSize) * 0.01) <= 220 * 1.002, `${line} fits`);
  // A proportional measure is unchanged by the check.
  close(layoutName({ text: 'AB', fontSize: 10, maxWidth: 50, measure: (t, s) => t.length * s * 5 }).fontSize, 5);
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

test('siblings: pictures use person.art ("Amara & Zak"), in every form', () => {
  const twins = togetherPerson([{ display: 'Amara' }, { display: 'Zak', say: 'Zack' }]);
  assert.equal(twins.count, 2);
  assert.equal(artName(twins), 'Amara & Zak');
  assert.equal(nameForForm(twins, 'upper'), 'AMARA & ZAK');
  assert.equal(nameForForm(twins, 'poss'), "Amara & Zak's");
  assert.equal(nameForForm(twins, 'plain'), 'Amara & Zak');
  // One child: no art, the display name as before.
  assert.equal(artName(person('Ava')), 'Ava');
  assert.equal(artName('Bo'), 'Bo');
  assert.equal(artName({ display: 'Li', art: 'LI & MO' }), 'LI & MO');
  assert.equal(artName(null), '');
});

test('siblings: several names never spell out on bunting (the overflow banner shows them)', () => {
  assert.equal(slotLetters('Amara & Zak'), null);
  assert.equal(slotLetters('Bo & Al'), null, 'even when the letters would fit');
  assert.equal(slotLetters('Bo, Al & Li'), null);
  assert.equal(slotLetters('Bo+Al'), null);
  assert.equal(distributeLetters(slotLetters('Bo & Al'), 9), null);
  // A single name with a space still spells out.
  assert.deepEqual(slotLetters('Xiao Ming').join(''), 'XIAOMING');
  // A two-line name slot breaks between the names.
  assert.deepEqual(splitForWrap('AMARA & ZAK'), ['AMARA', '& ZAK']);
});

test('siblingNames reads the children back from the art form', () => {
  assert.deepEqual(siblingNames(togetherPerson([{ display: 'Amara' }, { display: 'Zak' }, { display: 'Oluwaseun' }])), ['Amara', 'Zak', 'Oluwaseun']);
  assert.deepEqual(siblingNames({ display: 'Amara and Zak', art: 'Amara & Zak' }), ['Amara', 'Zak'], 'count is optional');
  assert.equal(siblingNames(person('Ava')), null);
  assert.equal(siblingNames(person('Anna-Sophia Rose')), null);
  assert.equal(siblingNames(null), null);
});

test('siblings in one name spot: one line while readable, never squashed', () => {
  // Two short names fit a shirt at a readable size: one line, as before.
  const two = layoutSiblings({ names: ['Amara', 'Zak'], form: 'upper', fontSize: 42, maxWidth: 176 });
  assert.equal(two.style, 'full');
  assert.deepEqual(two.lines, ['AMARA & ZAK']);
  assert.ok(two.fontSize >= 42 * SIBLING_MIN_SCALE && !two.squeeze && !two.letterSpacing);
  // Three names on the same shirt would be squashed to a smear: first letters instead.
  const three = layoutSiblings({ names: ['Amara', 'Zak', 'Oluwaseun'], form: 'upper', fontSize: 42, maxWidth: 176 });
  assert.equal(three.style, 'initials');
  assert.deepEqual(three.lines, ['A & Z & O']);
  assert.ok(three.fontSize >= 42 * SIBLING_MIN_SCALE && !three.squeeze && !three.letterSpacing, JSON.stringify(three));
  // The old way (one squashed line) would have been far smaller.
  const old = layoutName({ text: 'AMARA & ZAK & OLUWASEUN', fontSize: 42, maxWidth: 176 });
  assert.ok(old.squeeze || old.letterSpacing || old.fontSize < 42 * SIBLING_MIN_SCALE);
});

test('siblings in a spot that may wrap: stacked at an "&" before falling back to first letters', () => {
  const crane = layoutSiblings({ names: ['Amara', 'Zak'], form: 'upper', fontSize: 52, maxWidth: 160, wrap: true });
  assert.equal(crane.style, 'stacked');
  assert.deepEqual(crane.lines, ['AMARA', '& ZAK']);
  // "{name's} Park": the possessive goes on the last line only.
  const sign = layoutSiblings({ names: ['Amara', 'Zak', 'Oluwaseun'], form: 'poss', fontSize: 40, maxWidth: 230, wrap: true });
  assert.equal(sign.style, 'stacked');
  assert.equal(sign.lines.length, 2);
  assert.match(sign.lines[1], /^& .*Oluwaseun's$/);
  assert.ok(!sign.lines[0].endsWith("'s"));
  // Too narrow even stacked: first letters.
  const tiny = layoutSiblings({ names: ['Amara', 'Zak', 'Oluwaseun'], form: 'upper', fontSize: 52, maxWidth: 160, wrap: true });
  assert.equal(tiny.style, 'initials');
  // Accented and lower-case first letters come out as capitals.
  assert.deepEqual(layoutSiblings({ names: ['élodie', 'Zoë', 'Ñico'], fontSize: 40, maxWidth: 60 }).lines, ['É & Z & Ñ']);
  // A slot with no width limit keeps every name.
  assert.equal(layoutSiblings({ names: ['Amara', 'Zak', 'Oluwaseun'], fontSize: 40, maxWidth: NaN }).style, 'full');
});
