import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp01, lerp, lerpPoint, ease, EASINGS, mapRange, phaseProgress, driveProgress, isVisibleAt, driveValues, composeTransform, num, applyMatrix,
} from '../../js/reader/drive.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('clamp01 and lerp', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(0.25), 0.25);
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.deepEqual(lerpPoint([0, 0], [100, -50], 0.2), [20, -10]);
});

test('every easing starts at 0, ends at 1 and stays sensible in between', () => {
  for (const [name, f] of Object.entries(EASINGS)) {
    close(f(0), 0);
    close(f(1), 1);
    for (let i = 1; i < 20; i++) {
      const v = f(i / 20);
      assert.ok(v >= 0 && v <= 1.0001, `${name}(${i / 20}) = ${v}`);
    }
  }
  // Monotonic ones really are monotonic.
  for (const name of ['linear', 'easeIn', 'easeOut', 'easeInOut']) {
    let prev = -1;
    for (let i = 0; i <= 50; i++) {
      const v = EASINGS[name](i / 50);
      assert.ok(v >= prev, `${name} is monotonic`);
      prev = v;
    }
  }
  assert.ok(EASINGS.easeIn(0.5) < 0.5 && EASINGS.easeOut(0.5) > 0.5);
  close(EASINGS.easeInOut(0.5), 0.5);
});

test('bounce lands, hops and settles', () => {
  const f = EASINGS.bounce;
  close(f(1 / 2.75), 1, 1e-9); // first landing
  assert.ok(f(1.5 / 2.75) < 1); // in the air again
  close(f(2 / 2.75), 1, 1e-9); // second landing
  close(f(1), 1);
});

test('ease clamps input and falls back to easeInOut for unknown names', () => {
  assert.equal(ease('linear', 2), 1);
  assert.equal(ease('linear', -1), 0);
  close(ease('wobble', 0.25), EASINGS.easeInOut(0.25));
  close(ease(undefined, 0.25), EASINGS.easeInOut(0.25));
});

test('mapRange maps a sub-range of travel and clamps outside it', () => {
  assert.equal(mapRange(0.1, [0, 0.25]), 0.4);
  assert.equal(mapRange(0.5, [0, 0.25]), 1);
  assert.equal(mapRange(0.5, [0.6, 1]), 0);
  close(mapRange(0.8, [0.6, 1]), 0.5);
  assert.equal(mapRange(0.3, undefined), 0.3);
  assert.equal(mapRange(0.3, [0.5, 0.5]), 0.3, 'a degenerate range is ignored');
});

test('phaseProgress: out drives hold at the end, back drives run as the knob comes home', () => {
  // no phase: follows the knob both ways
  assert.equal(phaseProgress(0.7, undefined, 'out'), 0.7);
  assert.equal(phaseProgress(0.7, undefined, 'back'), 0.7);
  // out
  assert.equal(phaseProgress(0.4, 'out', 'out'), 0.4);
  assert.equal(phaseProgress(0.4, 'out', 'back'), 1);
  // back
  assert.equal(phaseProgress(0.9, 'back', 'out'), 0);
  close(phaseProgress(0.9, 'back', 'back'), 0.1);
  assert.equal(phaseProgress(0, 'back', 'back'), 1);
});

test('driveProgress combines phase, range and easing', () => {
  const kick = { target: '#leg', rotate: [0, -35], range: [0.5, 1], phase: 'back', ease: 'linear' };
  assert.equal(driveProgress(kick, 1, 'back'), 0); // knob just turned round
  assert.equal(driveProgress(kick, 0.5, 'back'), 0); // halfway home: range starts
  close(driveProgress(kick, 0.25, 'back'), 0.5);
  assert.equal(driveProgress(kick, 0, 'back'), 1);
  assert.equal(driveProgress(kick, 0.2, 'out'), 0);
});

test('visible frames partition the travel and the last includes 1', () => {
  const frames = [[0, 0.34], [0.34, 0.67], [0.67, 1]].map((v) => ({ target: '#f', visible: v }));
  const showing = (p) => frames.map((f) => isVisibleAt(f, p));
  assert.deepEqual(showing(0), [true, false, false]);
  assert.deepEqual(showing(0.34), [false, true, false]);
  assert.deepEqual(showing(0.5), [false, true, false]);
  assert.deepEqual(showing(0.9), [false, false, true]);
  assert.deepEqual(showing(1), [false, false, true]);
  // With a phase: a "back" frame only shows on the way home.
  const home = { target: '#g', visible: [0.5, 1], phase: 'back' };
  assert.equal(isVisibleAt(home, 0.2, 'out'), false);
  assert.equal(isVisibleAt(home, 0.2, 'back'), true);
});

test('driveValues combines several drives on one target', () => {
  const drives = [
    { target: '#ball', along: '#path', ease: 'linear' },
    { target: '#ball', translate: [[0, 0], [0, -20]], ease: 'linear' },
    { target: '#ball', rotate: [0, 360], ease: 'linear' },
    { target: '#ball', scale: [[1, 1], [1.5, 1.5]], origin: [0, 0], ease: 'linear' },
    { target: '#ball', opacity: [1, 0.5], ease: 'linear' },
    { target: '#star', visible: [0.5, 1] },
  ];
  const pointAt = (sel, t) => (sel === '#path' ? [100 * t, 50] : null);
  const v = driveValues(drives, 0.5, 'out', pointAt);
  const ball = v.get('#ball');
  assert.equal(ball.tx, 50);
  assert.equal(ball.ty, 40);
  assert.equal(ball.rotate, 180);
  assert.equal(ball.rotateOrigin, null, 'no origin given: the DOM layer uses the bbox centre');
  assert.deepEqual([ball.sx, ball.sy], [1.25, 1.25]);
  assert.deepEqual(ball.scaleOrigin, [0, 0]);
  assert.equal(ball.opacity, 0.75);
  assert.equal(v.get('#star').visible, true);
  assert.equal(driveValues(drives, 0.2, 'out', pointAt).get('#star').visible, false);
});

test('driveValues accepts shorthand numbers and ignores junk', () => {
  const v = driveValues([{ target: '#a', scale: [1, 2], ease: 'linear' }, null, { nope: 1 }], 0.5);
  assert.deepEqual([v.get('#a').sx, v.get('#a').sy], [1.5, 1.5]);
  assert.equal(v.size, 1);
  // A missing path simply doesn't move the target.
  const w = driveValues([{ target: '#b', along: '#missing' }], 0.5, 'out', () => null).get('#b');
  assert.equal(w.moved, false);
});

test('composeTransform orders translate, base, rotate, scale', () => {
  assert.equal(composeTransform({}), '');
  assert.equal(composeTransform({ translate: [10, 20] }), 'translate(10 20)');
  assert.equal(composeTransform({ translate: [0, 0], base: 'translate(5 5)' }), 'translate(5 5)');
  assert.equal(
    composeTransform({ translate: [10, 0], base: 'scale(2)', rotate: 30, rotateOrigin: [100, 50], scale: [2, 3], scaleOrigin: [100, 50] }),
    'translate(10 0) scale(2) rotate(30 100 50) translate(100 50) scale(2 3) translate(-100 -50)',
  );
  assert.equal(composeTransform({ rotate: -12.34567 }), 'rotate(-12.346)');
  assert.equal(composeTransform({ scale: [1, 1] }), '', 'identity scale is dropped');
});

test('num rounds to 3 decimals without negative zero', () => {
  assert.equal(num(1.23456), '1.235');
  assert.equal(num(-0.0001), '0');
  assert.equal(num(5), '5');
});

test('applyMatrix transforms points like an SVG matrix', () => {
  assert.deepEqual(applyMatrix({ a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 }, 1, 1), [12, 23]);
  assert.deepEqual(applyMatrix({ a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }, 1, 0), [0, 1]);
});
