import test from 'node:test';
import assert from 'node:assert/strict';
import { createSilentNarrator } from '../../js/reader/reader.js';
import { planLines } from '../../js/narrator/plan.js';
import { person } from '../../js/core/personalise.js';

globalThis.SB_TEST = { forceSilent: true, timeScale: 0.01 };

test('silent narrator walks every word in order and resolves done', async () => {
  const n = createSilentNarrator();
  const plan = planLines(['Pass, pass, pass!', 'Tiffin to {name}... thud!'], person('Ava'));
  const seen = [];
  const r = await n.play(plan, { onUnit: (line, u) => seen.push(`${line}:${u}`) });
  assert.equal(r, 'done');
  assert.deepEqual(seen, ['0:0', '0:1', '0:2', '1:0', '1:1', '1:2', '1:3']);
  assert.equal(n.speaking, false);
  assert.equal(n.hasVoice(), false);
});

test('silent narrator stops on stop() and on an aborted signal', async () => {
  const n = createSilentNarrator();
  const plan = planLines(['One two three four five six seven eight nine ten.'], person('Ava'));
  const seen = [];
  const p = n.play(plan, { onUnit: (l, u) => seen.push(u) });
  assert.equal(n.speaking, true);
  setTimeout(() => n.stop(), 15);
  assert.equal(await p, 'stopped');
  assert.ok(seen.length < 10);

  const ctl = new AbortController();
  const q = n.play(plan, { signal: ctl.signal });
  ctl.abort();
  assert.equal(await q, 'stopped');
});

test('silent narrator: a clip segment highlights the name', async () => {
  const n = createSilentNarrator();
  const plan = planLines(['Hi {name}!'], person('Ava'), { useRecording: true, recordingId: 'r1' });
  const seen = [];
  await n.play(plan, { onUnit: (l, u) => seen.push(u) });
  assert.deepEqual(seen, [0, 1]);
  await n.speakText('Ava');
});
