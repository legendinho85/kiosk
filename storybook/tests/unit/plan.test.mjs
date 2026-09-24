import test from 'node:test';
import assert from 'node:assert/strict';
import { planLines, unitForCharIndex, estimateUnitMs, estimateTimeline } from '../../js/narrator/plan.js';
import { person } from '../../js/core/personalise.js';

test('planLines splits into one utterance per sentence with pauses between lines', () => {
  const { segments, lines } = planLines(['Pass, pass, pass! Pass to {name}.', 'Hooray!'], person('Niamh', 'Neeve'));
  assert.deepEqual(segments.map((s) => s.kind), ['speech', 'speech', 'pause', 'speech']);
  assert.equal(segments[0].text, 'Pass, pass, pass!');
  assert.equal(segments[1].text, 'Pass to Neeve.');
  assert.equal(segments[3].text, 'Hooray!');
  assert.equal(lines[0].display, 'Pass, pass, pass! Pass to Niamh.');
  // Offsets inside each utterance point at the right text.
  for (const s of segments.filter((x) => x.kind === 'speech')) {
    for (const x of s.units) assert.equal(s.text.slice(x.start, x.end), lines[s.line].units[x.u].say);
  }
});

test('planLines swaps the name for the recording, but not possessives', () => {
  const { segments } = planLines(["Here comes {name}! It is {name's} turn."], person('Ava'), { useRecording: true, recordingId: 'rec1' });
  assert.deepEqual(segments.map((s) => s.kind), ['speech', 'clip', 'pause', 'speech']);
  assert.equal(segments[0].text, 'Here comes');
  assert.equal(segments[1].recordingId, 'rec1');
  assert.equal(segments[3].text, "It is Ava's turn.");
});

test('planLines ignores useRecording without a recording id', () => {
  const { segments } = planLines(['Hi {name}!'], person('Ava'), { useRecording: true, recordingId: null });
  assert.deepEqual(segments.map((s) => s.kind), ['speech']);
});

test('planLines copes with empty lines', () => {
  assert.deepEqual(planLines([], person('Ava')).segments, []);
  assert.deepEqual(planLines(['', 'Hi'], person('Ava')).segments.map((s) => s.kind), ['speech']);
});

test('unitForCharIndex maps word boundaries', () => {
  const { segments } = planLines(['Pass to {name} now.'], person('Siobhan', 'Shi vawn'));
  const s = segments[0];
  assert.equal(unitForCharIndex(s, 0), 0);
  assert.equal(unitForCharIndex(s, s.text.indexOf('vawn')), 2);
  assert.equal(unitForCharIndex(s, s.text.indexOf('now')), 3);
});

test('timing estimates grow with length, punctuation and slower rates', () => {
  assert.ok(estimateUnitMs('football') > estimateUnitMs('kick'));
  assert.ok(estimateUnitMs('kick!') > estimateUnitMs('kick'));
  assert.ok(estimateUnitMs('kick', 0.5) > estimateUnitMs('kick', 1));
  const { segments } = planLines(['One two three.'], person('Ava'));
  const tl = estimateTimeline(segments[0], 1);
  assert.equal(tl.length, 3);
  assert.equal(tl[0].at, 0);
  assert.ok(tl[1].at > 0 && tl[2].at > tl[1].at);
});
