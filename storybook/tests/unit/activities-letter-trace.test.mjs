import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphemes, firstGrapheme, scriptOf, baseLetter, spokenLetter, initialsFor, pickDistractors, seededRandom, shuffle, SHAPES,
  distToSegment2, createCoverage, coverage, traceComplete, TRACE_THRESHOLD, sampleGlyphPoints, inkBounds, strokeWidthEstimate, sameInk,
  strokeGuide, insetBox, layoutGuide, polylineLength, pointAlong, startDots, arrowMarks, snapGuide, glyphModel, fillLine, STRINGS,
  STYLESHEET_URL, mountLetterTrace,
} from '../../js/activities/letter-trace.js';
import { person, togetherPerson } from '../../js/core/personalise.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// A fake ImageData: `paint(x, y)` says which pixels are inked.
function image(w, h, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (paint(x, y)) data[(y * w + x) * 4 + 3] = 255;
  return { width: w, height: h, data };
}
// A chunky "L": a 20 px stem and a 20 px foot.
const L_IMG = image(160, 200, (x, y) => (x >= 30 && x < 50 && y >= 20 && y < 180) || (x >= 30 && x < 130 && y >= 160 && y < 180));

// ---- Letters ---------------------------------------------------------------------------

test('firstGrapheme: first letter, upper case, whole', () => {
  assert.equal(firstGrapheme('Ava'), 'A');
  assert.equal(firstGrapheme('ava'), 'A');
  assert.equal(firstGrapheme('  zoë '), 'Z');
  assert.equal(firstGrapheme("D'Arcy"), 'D');
  assert.equal(firstGrapheme("'Ria"), 'R', 'leading punctuation is skipped');
  assert.equal(firstGrapheme('élodie'), 'É');
  assert.equal(firstGrapheme('Élodie'), 'É', 'decomposed accents come back composed');
  assert.equal(firstGrapheme('Ørjan'), 'Ø');
  assert.equal(firstGrapheme('Юлия'), 'Ю');
  assert.equal(firstGrapheme('小明'), '小');
  assert.equal(firstGrapheme('مريم'), 'م');
  assert.equal(firstGrapheme('서연'), '서');
  assert.ok(firstGrapheme('प्रिया').startsWith('प'), 'Devanagari keeps its cluster');
  assert.equal(firstGrapheme(''), '');
  assert.equal(firstGrapheme("'-"), '');
  assert.equal(firstGrapheme(null), '');
});

test('firstGrapheme: language-aware letters', () => {
  assert.equal(firstGrapheme('Llinos'), 'L');
  assert.equal(firstGrapheme('Llinos', { lang: 'cy' }), 'Ll', 'Welsh Ll is one letter');
  assert.equal(firstGrapheme('LLINOS', { lang: 'cy-GB' }), 'Ll');
  assert.equal(firstGrapheme('Rhys', { lang: 'cy' }), 'Rh');
  assert.equal(firstGrapheme('Rhys'), 'R');
  assert.equal(firstGrapheme('Lowri', { lang: 'cy' }), 'L', 'a single L stays L');
  assert.equal(firstGrapheme('IJsbrand', { lang: 'nl' }), 'IJ');
  assert.equal(firstGrapheme('ilayda', { lang: 'tr' }), 'İ', 'Turkish dotted capital I');
  assert.equal(firstGrapheme('ilayda'), 'I');
  assert.equal(firstGrapheme('ava', { lang: 'not a language!' }), 'A', 'a bad language tag falls back');
});

test('graphemes keeps combining marks with their letter', () => {
  assert.deepEqual(graphemes('Zoë'), ['Z', 'o', 'ë']);
  assert.deepEqual(graphemes(''), []);
});

test('scriptOf, baseLetter and spokenLetter', () => {
  assert.equal(scriptOf('A'), 'latin');
  assert.equal(scriptOf('É'), 'latin');
  assert.equal(scriptOf('Ll'), 'latin');
  assert.equal(scriptOf('Ю'), 'cyrillic');
  assert.equal(scriptOf('Ω'), 'greek');
  assert.equal(scriptOf('م'), 'arabic');
  assert.equal(scriptOf('小'), 'han');
  assert.equal(scriptOf('서'), 'hangul');
  assert.equal(scriptOf('あ'), 'hiragana');
  assert.equal(scriptOf(''), '');
  assert.equal(baseLetter('É'), 'E');
  assert.equal(baseLetter('Ç'), 'C');
  assert.equal(baseLetter('Ø'), 'O');
  assert.equal(baseLetter('Ł'), 'L');
  assert.equal(baseLetter('İ'), 'I');
  assert.equal(baseLetter('M'), 'M');
  assert.equal(baseLetter('Ll'), '', 'digraphs have no single base');
  assert.equal(baseLetter('Æ'), '');
  assert.equal(baseLetter('Ю'), '', 'Cyrillic look-alikes are not Latin');
  assert.equal(baseLetter('小'), '');
  assert.equal(spokenLetter('A'), 'ay', 'a lone "A" would be read as the article');
  assert.equal(spokenLetter('Z'), 'zed', 'UK English');
  assert.equal(spokenLetter('M'), 'M');
});

test('initialsFor: one child, siblings, shared letters', () => {
  assert.deepEqual(initialsFor(person('Ava')), [{ letter: 'A', names: ['Ava'], says: ['Ava'], display: 'Ava', say: 'Ava' }]);
  assert.deepEqual(initialsFor(person('Niamh', 'Neeve')).map((r) => [r.letter, r.say]), [['N', 'Neeve']]);

  const two = togetherPerson([{ display: 'Amara' }, { display: 'Zak', say: 'Zack' }]);
  assert.equal(two.art, 'Amara & Zak');
  const r2 = initialsFor(two);
  assert.deepEqual(r2.map((r) => r.letter), ['A', 'Z']);
  assert.deepEqual(r2.map((r) => r.say), ['Amara', 'Zack'], 'each child keeps their own pronunciation');

  const three = togetherPerson([{ display: 'Li' }, { display: 'Mo' }, { display: 'Isla' }]);
  assert.deepEqual(initialsFor(three).map((r) => r.letter), ['L', 'M', 'I']);

  const same = initialsFor(togetherPerson([{ display: 'Amara' }, { display: 'Alfie' }, { display: 'Zak' }]));
  assert.deepEqual(same.map((r) => r.letter), ['A', 'Z'], 'children who share a letter share its turn');
  assert.equal(same[0].display, 'Amara and Alfie');
  assert.deepEqual(same[0].names, ['Amara', 'Alfie']);

  // No art: fall back to the joined display name.
  assert.deepEqual(initialsFor({ display: 'Amara and Zak', say: 'Amara and Zak', count: 2 }).map((r) => r.letter), ['A', 'Z']);
  // Spoken names that don't split the same way fall back to the written ones.
  assert.deepEqual(initialsFor({ display: 'Amara and Zak', say: 'the twins', count: 2, art: 'Amara & Zak' }).map((r) => r.say), ['Amara', 'Zak']);
  assert.deepEqual(initialsFor(person('Llinos'), { lang: 'cy' }).map((r) => r.letter), ['Ll']);
  assert.deepEqual(initialsFor(null), []);
  assert.deepEqual(initialsFor({ display: '' }), []);
});

// ---- Distractors -------------------------------------------------------------------------

test('pickDistractors: other letters that do not look alike, plus a shape', () => {
  const rnd = seededRandom(42);
  const d = pickDistractors('O', { random: rnd });
  assert.equal(d.length, 5);
  assert.equal(d.filter((x) => x.kind === 'shape').length, 1);
  const letters = d.filter((x) => x.kind === 'letter').map((x) => x.value);
  for (const bad of ['O', 'Q', 'C', 'D', 'G']) assert.ok(!letters.includes(bad), `${bad} looks too like O`);
  assert.equal(new Set(letters).size, letters.length, 'no repeats');

  const e = pickDistractors('É', { random: seededRandom(1), count: 6, shapes: 2 });
  assert.equal(e.length, 6);
  assert.ok(!e.some((x) => ['E', 'É', 'F'].includes(x.value)));

  const sib = pickDistractors('A', { exclude: ['Z'], random: seededRandom(3), count: 5, shapes: 0 });
  assert.ok(!sib.some((x) => x.value === 'Z'), "a sibling's letter isn't used as a distractor");

  const ar = pickDistractors('ب', { random: seededRandom(5) });
  const arLetters = ar.filter((x) => x.kind === 'letter').map((x) => x.value);
  assert.equal(arLetters.length, 4);
  assert.ok(arLetters.every((c) => scriptOf(c) === 'arabic'));
  for (const bad of ['ت', 'ث', 'ن', 'ي']) assert.ok(!arLetters.includes(bad), `${bad} differs from ب only by its dots`);

  const odd = pickDistractors('ᚠ', { random: seededRandom(2) }); // runic: no pool
  assert.equal(odd.length, 5);
  assert.ok(odd.every((x) => x.kind === 'shape' && SHAPES.includes(x.value)));

  const ll = pickDistractors('Ll', { random: seededRandom(9), count: 5, shapes: 0 });
  assert.ok(!ll.some((x) => x.value === 'L'), 'a Welsh Ll never hides among plain Ls');
});

test('pickDistractors and shuffle are repeatable with a seed', () => {
  assert.deepEqual(pickDistractors('M', { random: seededRandom(7) }), pickDistractors('M', { random: seededRandom(7) }));
  const s = shuffle([1, 2, 3, 4, 5, 6], seededRandom(11));
  assert.deepEqual([...s].sort(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shuffle([1, 2, 3], () => NaN).sort(), [1, 2, 3], 'a broken random still returns every item');
  const r = seededRandom(3);
  for (let i = 0; i < 100; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

// ---- Coverage ---------------------------------------------------------------------------

test('distToSegment2 measures to the nearest point of the segment', () => {
  assert.equal(distToSegment2(5, 3, 0, 0, 10, 0), 9);
  assert.equal(distToSegment2(-4, 3, 0, 0, 10, 0), 25, 'beyond an end: distance to that end');
  assert.equal(distToSegment2(3, 4, 0, 0, 0, 0), 25, 'a dot');
});

test('coverage counts sample points within the radius of any stroke', () => {
  const pts = [];
  for (let x = 0; x <= 100; x += 10) for (let y = 0; y <= 20; y += 10) pts.push({ x, y }); // 11 x 3
  assert.equal(coverage(pts, [], 5), 0);
  assert.equal(coverage([], [[[0, 0], [10, 10]]], 5), 0);
  close(coverage(pts, [[{ x: 0, y: 10 }, { x: 100, y: 10 }]], 10), 1);
  close(coverage(pts, [[[0, 10], [100, 10]]], 5), 11 / 33, 1e-9);
  close(coverage(pts, [[[0, 10], [50, 10]]], 10), 19 / 33, 1e-9); // x 0..50 (18 points) + (60, 10), exactly 10 away
  close(coverage(pts, [[[50, 10]]], 1), 1 / 33, 1e-9, 'a single tap covers what is under it');
  close(coverage(pts, [[[0, 0], [100, 0]], [[0, 20], [100, 20]]], 1), 22 / 33, 1e-9, 'strokes add up');
});

test('createCoverage is incremental and tells tracing from scribbling', () => {
  const pts = [];
  for (let y = 0; y <= 200; y += 8) pts.push({ x: 100, y }); // a vertical bar
  const t = createCoverage(pts, 12);
  assert.equal(t.fraction, 0);
  assert.equal(t.onRatio, 1, 'nothing drawn yet');
  t.add(100, 0, 100, 100);
  close(t.fraction, coverage(pts, [[[100, 0], [100, 100]]], 12));
  close(t.onRatio, 1);
  t.add(100, 100, 100, 200);
  assert.equal(t.fraction, 1);
  assert.equal(t.covered, t.total);
  // A long line far from the letter: the covered share stays, the on-letter share drops.
  t.add(300, 0, 300, 200);
  assert.equal(t.fraction, 1);
  close(t.onRatio, 0.5, 0.02);
  assert.equal(t.inkLength, 400);
  t.reset();
  assert.equal(t.fraction, 0);
  assert.equal(t.inkLength, 0);
  assert.equal(t.add(NaN, 0, 1, 1), 0, 'bad input is ignored');
});

test('traceComplete: ~70% coverage, and not a whole-card scribble', () => {
  assert.equal(TRACE_THRESHOLD, 0.7);
  assert.equal(traceComplete({ fraction: 0.69, onRatio: 1 }), false);
  assert.equal(traceComplete({ fraction: 0.7, onRatio: 1 }), true);
  assert.equal(traceComplete({ fraction: 0.95, onRatio: 0.1 }), false, 'scribbled everywhere');
  assert.equal(traceComplete({ fraction: 0.8, onRatio: 0.3 }), true, 'wobbly but mostly on the letter');
  assert.equal(traceComplete({ fraction: 0.5 }, { threshold: 0.5 }), true);
  assert.equal(traceComplete(), false);
});

// ---- Glyph sampling -----------------------------------------------------------------------

test('sampleGlyphPoints, inkBounds and strokeWidthEstimate read an offscreen rendering', () => {
  const pts = sampleGlyphPoints(L_IMG, 10);
  assert.ok(pts.length > 20);
  for (const p of pts) assert.equal(L_IMG.data[(p.y * 160 + p.x) * 4 + 3], 255, 'every sample is inside the ink');
  assert.ok(sampleGlyphPoints(L_IMG, 5).length > pts.length * 3, 'a finer step gives more points');
  assert.deepEqual(sampleGlyphPoints({ width: 0, height: 0, data: null }, 4), []);
  assert.deepEqual(inkBounds(L_IMG), { x: 30, y: 20, width: 100, height: 160 });
  assert.equal(inkBounds(image(10, 10, () => false)), null);
  assert.equal(strokeWidthEstimate(L_IMG), 20);
  assert.equal(strokeWidthEstimate(image(10, 10, () => false)), 0);
});

test('sameInk spots identical renderings (the "tofu" check)', () => {
  const a = image(40, 40, (x, y) => x > 5 && x < 30 && y > 5 && y < 30);
  const b = image(40, 40, (x, y) => x > 5 && x < 30 && y > 5 && y < 30);
  const c = image(40, 40, (x, y) => x > 10 && x < 20);
  assert.equal(sameInk(a, b), true);
  assert.equal(sameInk(a, c), false);
  assert.equal(sameInk(a, image(20, 20, () => true)), false);
  assert.equal(sameInk(null, a), false);
});

// ---- Guides ---------------------------------------------------------------------------------

test('every capital A-Z has a stroke guide inside its box; accents use the base letter', () => {
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const g = strokeGuide(L);
    assert.ok(g && g.length >= 1, `${L} has strokes`);
    for (const poly of g) {
      assert.ok(poly.length >= 2, `${L}: each stroke is a line`);
      for (const [x, y] of poly) assert.ok(x >= -1 && x <= 101 && y >= -1 && y <= 101, `${L}: ${x},${y} is in the box`);
    }
  }
  assert.equal(strokeGuide('A').length, 3);
  assert.equal(strokeGuide('E').length, 4);
  assert.equal(strokeGuide('O').length, 1);
  assert.deepEqual(strokeGuide('É'), strokeGuide('E'));
  assert.equal(strokeGuide('小'), null);
  assert.equal(strokeGuide('Ll'), null);
  assert.equal(strokeGuide('Ю'), null);
  // O starts at the top and goes anticlockwise (towards the left first).
  const o = strokeGuide('O')[0];
  assert.deepEqual(o[0], [50, 0]);
  assert.ok(o[1][0] < 50, 'anticlockwise');
});

test('layoutGuide, insetBox, polylineLength and pointAlong', () => {
  const box = insetBox({ x: 10, y: 20, width: 100, height: 200 }, 10);
  assert.deepEqual(box, { x: 20, y: 30, width: 80, height: 180 });
  assert.deepEqual(insetBox({ x: 0, y: 0, width: 10, height: 100 }, 20), { x: 5, y: 20, width: 0, height: 60 }, 'never negative');
  const [stem] = layoutGuide([[[0, 0], [0, 100]]], box);
  assert.deepEqual(stem, [{ x: 20, y: 30 }, { x: 20, y: 210 }]);
  const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  assert.equal(polylineLength(poly), 20);
  assert.deepEqual(pointAlong(poly, 5), { x: 5, y: 0, angle: 0 });
  assert.deepEqual(pointAlong(poly, 15), { x: 10, y: 5, angle: 90 });
  assert.deepEqual(pointAlong(poly, 99), { x: 10, y: 10, angle: 90 }, 'clamped to the end');
  assert.equal(pointAlong([], 3), null);
});

test('startDots number the strokes and never sit on top of each other', () => {
  const polys = layoutGuide(strokeGuide('E'), { x: 0, y: 0, width: 200, height: 300 });
  const dots = startDots(polys, 40);
  assert.deepEqual(dots.map((d) => d.n), [1, 2, 3, 4]);
  assert.deepEqual([dots[0].x, dots[0].y], [0, 0]);
  for (let i = 0; i < dots.length; i++) {
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) >= 40 - 1e-6, `dots ${i + 1} and ${j + 1} have room`);
  }
  assert.ok(dots[1].x > 0 && dots[1].y === 0, 'the top bar dot moved along the bar');
});

test('arrowMarks point along the strokes and keep clear of the dots', () => {
  const polys = layoutGuide(strokeGuide('L'), { x: 0, y: 0, width: 200, height: 300 });
  const marks = arrowMarks(polys, { spacing: 400 });
  assert.equal(marks.length, 1);
  const long = arrowMarks(polys, { spacing: 100 });
  assert.equal(long.length, 2, 'long strokes get two arrows');
  assert.equal(long[0].angle, 90, 'down the stem');
  assert.equal(long[1].angle, 0, 'along the foot');
  const v = arrowMarks(layoutGuide(strokeGuide('V'), { x: 0, y: 0, width: 200, height: 300 }), { spacing: 400 });
  assert.equal(v.length, 1);
  assert.ok(Math.abs(v[0].y - 300) > 20, 'not on the point of the V, where it would point nowhere');
  const blocked = arrowMarks([[{ x: 0, y: 0 }, { x: 0, y: 100 }]], { avoid: [{ x: 0, y: 56 }], minDist: 20 });
  assert.equal(blocked.length, 1);
  assert.ok(Math.abs(blocked[0].y - 56) >= 20, 'moved off the dot');
});

test('snapGuide pulls a guide onto the middle of the stroke', () => {
  const bar = image(100, 120, (x, y) => x >= 40 && x < 61 && y >= 10 && y < 110); // centre x = 50
  const [line] = snapGuide([[{ x: 44, y: 20 }, { x: 44, y: 100 }]], bar, { strokeWidth: 21 });
  assert.ok(line.length > 2, 'densified');
  for (const p of line) close(p.x, 50, 0.6);
  // Too far from any ink: left alone.
  const [far] = snapGuide([[{ x: 5, y: 20 }, { x: 5, y: 100 }]], bar, { strokeWidth: 21 });
  for (const p of far) close(p.x, 5, 1e-9);
  // No image: unchanged.
  const polys = [[{ x: 1, y: 2 }]];
  assert.equal(snapGuide(polys, null, { strokeWidth: 10 }), polys);
});

test('glyphModel: tracing along the guide covers the letter; the ends of the letter alone do not', () => {
  const model = glyphModel(L_IMG, { fontPx: 200, guide: strokeGuide('L') });
  assert.equal(model.strokeWidth, 20);
  assert.ok(model.samples.length >= 20);
  assert.ok(model.radius >= model.strokeWidth / 2, 'a path down the middle reaches both edges');
  assert.equal(model.dots.length, 1);
  assert.ok(model.arrows.length >= 1);
  const [path] = model.polys;
  // The guide runs down the middle of the stem (x = 39.5) and along the foot (y = 169.5).
  close(path[0].x, 39.5, 1.5);
  close(path[path.length - 1].y, 169.5, 1.5);
  const traced = coverage(model.samples, [path.map((p) => ({ x: p.x + 4, y: p.y - 3 }))], model.radius);
  assert.ok(traced >= 0.9, `a slightly wobbly trace covers the letter (${traced})`);
  const tapOnly = coverage(model.samples, [[{ x: 40, y: 30 }]], model.radius);
  assert.ok(tapOnly < TRACE_THRESHOLD, 'one tap is not tracing');
  assert.equal(glyphModel(image(10, 10, () => false)), null);
  const outline = glyphModel(L_IMG, { fontPx: 200 });
  assert.equal(outline.polys, null, 'no guide: colour-in mode');
  assert.deepEqual(outline.dots, []);
});

// ---- Words ------------------------------------------------------------------------------------

test('fillLine fills the screen text and the spoken text separately', () => {
  const vars = { letter: { display: 'A', spoken: 'ay' }, name: { display: 'Siobhán', spoken: 'Shiv-awn' } };
  const find = fillLine(STRINGS.find, vars);
  assert.equal(find.display, 'Can you find the letter A? A is for Siobhán!');
  assert.equal(find.spoken, 'Can you find the letter ay? ay is for Shiv-awn!');
  assert.deepEqual(find.parts.filter((p) => p.key).map((p) => p.key), ['letter', 'letter', 'name']);
  const well = fillLine(STRINGS.well, vars);
  assert.equal(well.display, "Brilliant! That's the letter A — the first letter of Siobhán!");
  assert.equal(well.spoken, "Brilliant! That's the letter ay, the first letter of Shiv-awn!", 'dashes become pauses');
  assert.equal(fillLine(STRINGS.kicker, vars).display, "Siobhán's letter");
  assert.equal(fillLine(STRINGS.findNext, { letter: 'Z', name: 'James' }).display, "Now it's James's turn! Can you find the letter Z? Z is for James!");
  assert.equal(fillLine('{other}', {}).display, '');
  assert.equal(fillLine('No blanks here', {}).spoken, 'No blanks here');
});

test('the module is safe to import without a DOM and finds its stylesheet', () => {
  assert.ok(STYLESHEET_URL.endsWith('/css/activities.css'));
  const api = mountLetterTrace(null, {});
  assert.doesNotThrow(() => api.destroy());
  assert.equal(api.step, 'none');
});
