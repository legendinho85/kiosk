import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectOnSegment, segmentDelta, angleOf, angleDelta, wheelProgress, flapAxis, flapTransform, isTap, stepProgress, keyDirection, TAP_MOVE_PX, TAP_MS,
} from '../../js/reader/controls.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('projectOnSegment measures travel along the groove', () => {
  assert.equal(projectOnSegment([320, 900], [320, 900], [1280, 900]), 0);
  assert.equal(projectOnSegment([800, 900], [320, 900], [1280, 900]), 0.5);
  assert.equal(projectOnSegment([800, 50], [320, 900], [1280, 900]), 0.5, 'off-axis movement is ignored');
  assert.equal(projectOnSegment([1500, 900], [320, 900], [1280, 900]) > 1, true, 'not clamped');
  assert.equal(projectOnSegment([1, 1], [5, 5], [5, 5]), 0, 'zero-length groove');
  // Diagonal groove (a pull-tab going up and left)
  close(projectOnSegment([150, 450], [200, 500], [100, 400]), 0.5);
});

test('segmentDelta turns a finger movement into progress', () => {
  close(segmentDelta([96, 0], [320, 900], [1280, 900]), 0.1);
  close(segmentDelta([-96, 40], [320, 900], [1280, 900]), -0.1);
  close(segmentDelta([0, -100], [800, 880], [800, 380]), 0.2); // pushing up a vertical slot
});

test('angleOf is clockwise-positive in SVG coordinates', () => {
  assert.equal(angleOf([10, 0], [0, 0]), 0);
  assert.equal(angleOf([0, 10], [0, 0]), 90); // below the centre = quarter turn clockwise
  assert.equal(angleOf([-10, 0], [0, 0]), 180);
  assert.equal(angleOf([0, -10], [0, 0]), -90);
});

test('angleDelta never jumps when crossing ±180°', () => {
  assert.equal(angleDelta(170, -170), 20);
  assert.equal(angleDelta(-170, 170), -20);
  assert.equal(angleDelta(0, 90), 90);
  assert.equal(angleDelta(90, 0), -90);
  assert.equal(angleDelta(179, -179), 2);
  assert.equal(angleDelta(0, 180), 180);
  assert.equal(angleDelta(0, -180), 180);
  assert.equal(angleDelta(720, 10), 10);
  // Summing small steps all the way round gives exactly one turn.
  let acc = 0;
  let prev = 0;
  for (let a = 10; a <= 360; a += 10) {
    const cur = ((a + 180) % 360) - 180;
    acc += angleDelta(prev, cur);
    prev = cur;
  }
  assert.equal(acc, 360);
});

test('wheelProgress accumulates and cycles after completion', () => {
  assert.equal(wheelProgress(0, 360), 0);
  assert.equal(wheelProgress(-50, 360), 0);
  assert.equal(wheelProgress(180, 360), 0.5);
  assert.equal(wheelProgress(540, 360), 1, 'clamped before completion');
  assert.equal(wheelProgress(360, 360, true), 1);
  assert.equal(wheelProgress(450, 360, true), 0.25, 'keeps cycling through the frames');
  assert.equal(wheelProgress(720, 360, true), 1);
  assert.equal(wheelProgress(360, 720), 0.5, 'two turns');
  assert.equal(wheelProgress(10, 0), 0);
});

test('flapAxis points over the hinge', () => {
  assert.deepEqual(flapAxis('top'), [0, -1]);
  assert.deepEqual(flapAxis('bottom'), [0, 1]);
  assert.deepEqual(flapAxis('left'), [-1, 0]);
  assert.deepEqual(flapAxis('right'), [1, 0]);
  assert.deepEqual(flapAxis('sideways'), [0, -1]);
});

test('flapTransform pivots on the hinge, goes edge-on halfway and lands flipped', () => {
  const box = { x: 100, y: 200, width: 400, height: 300 };
  assert.deepEqual(flapTransform(0, 'top', box), { transform: '', back: false, lift: 0 });
  const quarter = flapTransform(0.25, 'top', box);
  assert.match(quarter.transform, /^translate\(300 200\) skewX\(-[\d.]+\) scale\(1\.\d+ 0\.707\) translate\(-300 -200\)$/);
  assert.equal(quarter.back, false);
  const half = flapTransform(0.5, 'top', box);
  assert.match(half.transform, /scale\(1\.06 0\.002\)/, 'never a singular matrix');
  const open = flapTransform(1, 'top', box);
  assert.equal(open.back, true);
  assert.match(open.transform, /scale\(1 -0\.62\)/, 'open flap is foreshortened');
  // Other hinges pivot on their own edge
  assert.match(flapTransform(0.3, 'bottom', box).transform, /^translate\(300 500\)/);
  assert.match(flapTransform(0.3, 'left', box).transform, /^translate\(100 350\) skewY/);
  assert.match(flapTransform(0.3, 'right', box).transform, /^translate\(500 350\) skewY/);
});

test('isTap needs a short, still press', () => {
  assert.equal(isTap(0, 100), true);
  assert.equal(isTap(TAP_MOVE_PX - 1, TAP_MS - 1), true);
  assert.equal(isTap(TAP_MOVE_PX, 100), false);
  assert.equal(isTap(0, TAP_MS), false);
});

test('stepProgress fires completion once for a one-way control', () => {
  let s = { phase: 'out', done: false, midway: false };
  let r = stepProgress(s, 0.5);
  assert.equal(r.fireComplete, false);
  r = stepProgress(r, 0.96);
  assert.equal(r.fireComplete, true);
  assert.equal(r.done, true);
  r = stepProgress(r, 0.99);
  assert.equal(r.fireComplete, false, 'only once');
  r = stepProgress(r, 0.1);
  assert.equal(r.done, true, 'stays done when slid back');
  // custom threshold
  assert.equal(stepProgress(s, 0.6, { at: 0.6 }).fireComplete, true);
});

test('stepProgress runs a return trip: there (midway) and back (complete)', () => {
  const opts = { returnTrip: true };
  let r = stepProgress({ phase: 'out', done: false, midway: false }, 0.5, opts);
  assert.deepEqual([r.phase, r.fireMidway, r.fireComplete], ['out', false, false]);
  r = stepProgress(r, 0.3, opts);
  assert.equal(r.phase, 'out', 'wobbling back early does not count');
  r = stepProgress(r, 0.02, opts);
  assert.equal(r.done, false, 'has not reached the end yet');
  r = stepProgress(r, 0.97, opts);
  assert.deepEqual([r.phase, r.fireMidway, r.done], ['back', true, false]);
  r = stepProgress(r, 1, opts);
  assert.equal(r.fireMidway, false, 'midway fires once');
  r = stepProgress(r, 0.4, opts);
  assert.equal(r.done, false);
  r = stepProgress(r, 0.05, opts);
  assert.deepEqual([r.done, r.fireComplete], [true, true]);
  r = stepProgress(r, 0.0, opts);
  assert.equal(r.fireComplete, false);
});

test('keyDirection follows the direction of travel', () => {
  // left-to-right slider
  assert.equal(keyDirection('ArrowRight', [960, 0]), 1);
  assert.equal(keyDirection('ArrowLeft', [960, 0]), -1);
  assert.equal(keyDirection('ArrowUp', [960, 0]), 1);
  // right-to-left pull-tab: left arrow pulls it out
  assert.equal(keyDirection('ArrowLeft', [-300, 0]), 1);
  assert.equal(keyDirection('ArrowRight', [-300, 0]), -1);
  // upward slot
  assert.equal(keyDirection('ArrowUp', [0, -500]), 1);
  assert.equal(keyDirection('ArrowDown', [0, -500]), -1);
  assert.equal(keyDirection('ArrowRight', [0, -500]), 1);
  assert.equal(keyDirection('a', [1, 0]), 0);
});
