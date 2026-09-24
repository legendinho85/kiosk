import test from 'node:test';
import assert from 'node:assert/strict';
import { clipTimeline, stretchTimeline, stepAt, partStart, resumePlan, testScale } from '../../js/reader/timeline.js';
import { clipDurationMs } from '../../js/reader/clip.js';
import { planLines, estimateUnitMs } from '../../js/narrator/plan.js';
import { person } from '../../js/core/personalise.js';

const ava = person('Ava');
const lines = (list, who = ava) => planLines(list, who).lines;

test('clipTimeline walks every word of every block in reading order', () => {
  const tl = clipTimeline([
    { part: 'text', lines: lines(['Tiffin has the ball.', 'Pass to {name}!']) },
    { part: 'prompt', lines: lines(['Slide the ball!']) },
  ]);
  assert.deepEqual(
    tl.steps.map((s) => `${s.part}:${s.line}:${s.u}`),
    ['text:0:0', 'text:0:1', 'text:0:2', 'text:0:3', 'text:1:0', 'text:1:1', 'text:1:2', 'prompt:0:0', 'prompt:0:1', 'prompt:0:2'],
  );
  // Strictly increasing start times, each word as long as the narrator's estimate.
  for (let i = 1; i < tl.steps.length; i++) assert.ok(tl.steps[i].at > tl.steps[i - 1].at);
  assert.equal(tl.steps[0].at, 0);
  assert.equal(tl.steps[0].dur, estimateUnitMs('Tiffin', 1));
  const last = tl.steps.at(-1);
  assert.equal(tl.total, last.at + last.dur);
});

test('clipTimeline pauses between lines, longer between blocks', () => {
  const a = clipTimeline([{ part: 'text', lines: lines(['One.', 'Two.']) }], { linePauseMs: 350, blockPauseMs: 700 });
  assert.equal(a.steps[1].at - (a.steps[0].at + a.steps[0].dur), 350);
  const b = clipTimeline([{ part: 'text', lines: lines(['One.']) }, { part: 'prompt', lines: lines(['Two.']) }], { linePauseMs: 350, blockPauseMs: 700 });
  assert.equal(b.steps[1].at - (b.steps[0].at + b.steps[0].dur), 700);
});

test('clipTimeline: punctuation-only units are quick; empty blocks and lines are skipped', () => {
  const tl = clipTimeline([
    { part: 'text', lines: lines(['Ready — go!']) },
    { part: 'prompt', lines: [] },
    { part: 'after', lines: lines(['']) },
  ]);
  const dash = tl.steps.find((s) => s.u === 1);
  assert.equal(dash.dur, 120);
  assert.deepEqual([...new Set(tl.steps.map((s) => s.part))], ['text']);
  assert.deepEqual(clipTimeline([]), { steps: [], total: 0 });
  assert.deepEqual(clipTimeline(null), { steps: [], total: 0 });
});

test('stretchTimeline spreads the words over the real clip, keeping proportions', () => {
  const tl = clipTimeline([{ part: 'text', lines: lines(['Pass, pass, pass to {name}!']) }]);
  const slow = stretchTimeline(tl, 6000);
  assert.equal(slow.total, 6000);
  const lead = Math.min(250, 6000 * 0.04);
  const tail = Math.min(400, 6000 * 0.06);
  assert.equal(slow.steps[0].at, lead);
  const last = slow.steps.at(-1);
  assert.ok(Math.abs(last.at + last.dur - (6000 - tail)) < 1, `ends before the tail (${last.at + last.dur})`);
  assert.ok(Math.abs(slow.factor - (6000 - lead - tail) / tl.total) < 1e-9);
  // Relative timing is unchanged: each gap scales by the same factor.
  for (let i = 1; i < tl.steps.length; i++) {
    const want = (tl.steps[i].at - tl.steps[i - 1].at) * slow.factor;
    assert.ok(Math.abs(slow.steps[i].at - slow.steps[i - 1].at - want) < 0.2);
  }
  // A brisk reader squeezes the timeline.
  const quick = stretchTimeline(tl, 900);
  assert.ok(quick.factor < 1);
  assert.ok(quick.steps.at(-1).at < 900);
  // The input isn't changed.
  assert.equal(tl.steps[0].at, 0);
});

test('stretchTimeline: unknown durations leave the estimate; custom lead and tail', () => {
  const tl = clipTimeline([{ part: 'after', lines: lines(['Hooray!']) }]);
  for (const d of [null, undefined, 0, -5, NaN]) {
    const r = stretchTimeline(tl, d);
    assert.equal(r.factor, 1);
    assert.deepEqual(r.steps, tl.steps);
    assert.notEqual(r.steps[0], tl.steps[0], 'copies, not the same objects');
  }
  const r = stretchTimeline(tl, 2000, { leadMs: 0, tailMs: 0 });
  assert.equal(r.steps[0].at, 0);
  assert.equal(r.steps[0].dur, 2000);
  assert.deepEqual(stretchTimeline({ steps: [], total: 0 }, 3000).steps, []);
  // A huge lead can't squash the words into nothing: they get at least half the clip.
  const squashed = stretchTimeline(tl, 1000, { leadMs: 900, tailMs: 900 });
  assert.equal(squashed.steps[0].dur, 500);
});

test('stepAt and partStart find the word being said', () => {
  const tl = stretchTimeline(clipTimeline([
    { part: 'text', lines: lines(['Warm up, {name}!']) },
    { part: 'prompt', lines: lines(['Turn the wheel!']) },
  ]), 5000);
  assert.equal(stepAt(tl.steps, 0), -1);
  assert.equal(stepAt(tl.steps, tl.steps[0].at), 0);
  assert.equal(stepAt(tl.steps, tl.steps[2].at + 1), 2);
  assert.equal(stepAt(tl.steps, 99999), tl.steps.length - 1);
  assert.equal(stepAt([], 10), -1);
  const p = partStart(tl.steps, 'prompt');
  assert.equal(p, tl.steps.find((s) => s.part === 'prompt').at);
  assert.ok(p > tl.steps[2].at);
  assert.equal(partStart(tl.steps, 'after'), null);
});

test('resumePlan restarts the sentence that was being read', () => {
  const plan = planLines(['Pass, pass, pass! Tiffin to {name}.', 'Thud!'], ava);
  // segments: "Pass, pass, pass!", "Tiffin to Ava.", pause, "Thud!"
  assert.deepEqual(plan.segments.map((s) => s.kind), ['speech', 'speech', 'pause', 'speech']);
  assert.equal(resumePlan(plan, null), plan);
  const mid = resumePlan(plan, { line: 0, u: 4 }); // "to"
  assert.deepEqual(mid.segments.map((s) => s.text ?? s.kind), ['Tiffin to Ava.', 'pause', 'Thud!']);
  assert.equal(mid.lines, plan.lines, 'same lines, so highlighting still matches the words');
  const first = resumePlan(plan, { line: 0, u: 1 });
  assert.equal(first.segments.length, plan.segments.length);
  const last = resumePlan(plan, { line: 1, u: 0 });
  assert.deepEqual(last.segments.map((s) => s.text), ['Thud!']);
  // A unit no segment covers: carry on from its line.
  assert.deepEqual(resumePlan(plan, { line: 1, u: 7 }).segments.map((s) => s.text), ['Thud!']);
  assert.deepEqual(resumePlan(plan, { line: 5, u: 0 }).segments, []);
});

test('resumePlan keeps a recorded name clip with the words that lead up to it', () => {
  const plan = planLines(['Pass to {name}, then run!'], ava, { useRecording: true, recordingId: 'r1' });
  // "Pass to" | clip(Ava,) | "then run!"
  assert.deepEqual(plan.segments.map((s) => s.kind), ['speech', 'clip', 'speech']);
  const r = resumePlan(plan, { line: 0, u: 2 });
  assert.deepEqual(r.segments.map((s) => s.kind), ['speech', 'clip', 'speech'], 'restarts at "Pass to", not at the bare name');
  const after = resumePlan(plan, { line: 0, u: 3 });
  assert.deepEqual(after.segments.map((s) => s.kind), ['speech', 'clip', 'speech'], 'the same sentence');
});

test('siblings: the timeline follows the plural text', () => {
  const twins = { display: 'Amara and Zak', say: 'Amara and Zak', count: 2, art: 'Amara & Zak' };
  const tl = clipTimeline([{ part: 'text', lines: planLines(["Where {is|are} {name's} {shirt|shirts}?"], twins).lines }]);
  // Where | are | Amara and Zak's | shirts? — the joined names light up as one.
  assert.equal(tl.steps.length, 4);
  const one = clipTimeline([{ part: 'text', lines: planLines(["Where {is|are} {name's} {shirt|shirts}?"], ava).lines }]);
  assert.ok(tl.steps[2].dur > one.steps[2].dur, 'two names take longer to say than one');
});

test('testScale shortens timers only in tests', () => {
  const saved = globalThis.SB_TEST;
  try {
    globalThis.SB_TEST = undefined;
    assert.equal(testScale(5000), 5000);
    globalThis.SB_TEST = { timeScale: 0.05 };
    assert.equal(testScale(5000), 250);
    globalThis.SB_TEST = { timeScale: 0 };
    assert.equal(testScale(3000), 3000);
  } finally {
    globalThis.SB_TEST = saved;
  }
});

// ---- clip.js ---------------------------------------------------------------------

function fakeAudio(duration, { error = false } = {}) {
  return class {
    set src(v) {
      this._src = v;
      setTimeout(() => (error ? this.onerror?.() : ((this.duration = duration), this.onloadedmetadata?.())), 1);
    }
    get src() {
      return this._src;
    }
    load() {}
    removeAttribute() {}
  };
}
const fakeUrl = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
function fakeOAC(duration, { fail = false } = {}) {
  return class {
    decodeAudioData(buf, ok, err) {
      if (fail) {
        const e = new Error('bad');
        err?.(e);
        return Promise.reject(e);
      }
      const b = { duration };
      ok?.(b);
      return Promise.resolve(b);
    }
  };
}
const blob = new Blob([new Uint8Array(64)], { type: 'audio/wav' });

test('clipDurationMs reads the <audio> element first', async () => {
  assert.equal(await clipDurationMs(blob, { Audio: fakeAudio(2.345), URL: fakeUrl, OfflineAudioContext: fakeOAC(9) }), 2345);
});

test('clipDurationMs decodes when the element reports Infinity (MediaRecorder WebM) or fails', async () => {
  assert.equal(await clipDurationMs(blob, { Audio: fakeAudio(Infinity), URL: fakeUrl, OfflineAudioContext: fakeOAC(1.5) }), 1500);
  assert.equal(await clipDurationMs(blob, { Audio: fakeAudio(0, { error: true }), URL: fakeUrl, OfflineAudioContext: fakeOAC(0.8) }), 800);
  assert.equal(await clipDurationMs(blob, { Audio: null, URL: fakeUrl, OfflineAudioContext: fakeOAC(3) }), 3000);
});

test('clipDurationMs never throws: null when nothing can tell', async () => {
  assert.equal(await clipDurationMs(null), null);
  assert.equal(await clipDurationMs(new Blob([])), null);
  assert.equal(await clipDurationMs(blob, { Audio: null, OfflineAudioContext: null }), null);
  assert.equal(await clipDurationMs(blob, { Audio: fakeAudio(NaN), URL: fakeUrl, OfflineAudioContext: fakeOAC(0, { fail: true }) }), null);
  // An element that never answers times out.
  const Silent = class { set src(v) {} load() {} removeAttribute() {} };
  const t0 = Date.now();
  assert.equal(await clipDurationMs(blob, { Audio: Silent, URL: fakeUrl, OfflineAudioContext: null, timeoutMs: 30 }), null);
  assert.ok(Date.now() - t0 < 1000);
});
