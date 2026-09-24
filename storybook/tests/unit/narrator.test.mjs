import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createNarrator, textSegment } from '../../js/narrator/narrator.js';
import { planLines, estimateTimeline } from '../../js/narrator/plan.js';
import { person, togetherPerson } from '../../js/core/personalise.js';

// ---- A fake speechSynthesis driven by mock timers ------------------------------

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.voice = null;
    this.lang = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.onstart = this.onend = this.onerror = this.onboundary = null;
  }
}

const voice = (name, lang, local = true) => ({ name, lang, voiceURI: name, localService: local, default: false });
const DANIEL = voice('Daniel', 'en-GB');
const GOOGLE_UK = voice('Google UK English Female', 'en-GB', false);
const SAMANTHA = voice('Samantha', 'en-US');

/**
 * behaviour(u, synth) schedules events for an utterance with synth.at(ms, fn).
 * Helpers below build the common ones.
 */
class FakeSynth extends EventTarget {
  constructor(voices, behaviour) {
    super();
    this.voices = voices;
    this.behaviour = behaviour;
    this.spoken = [];
    this.cancels = 0;
    this.speaking = false;
    this.pending = false;
    this.paused = false;
    this.timers = [];
    this.current = null;
  }
  getVoices() {
    return this.voices;
  }
  at(ms, fn) {
    const u = this.current;
    this.timers.push(
      setTimeout(() => {
        if (this.current === u) fn();
      }, ms),
    );
  }
  speak(u) {
    this.spoken.push(u);
    this.current = u;
    this.speaking = true;
    this.behaviour(u, this);
  }
  finish() {
    this.speaking = false;
    this.current = null;
  }
  cancel() {
    this.cancels += 1;
    const u = this.current;
    this.timers.splice(0).forEach(clearTimeout);
    this.finish();
    // Real engines report the cancelled utterance as interrupted.
    if (u) setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0);
  }
  resume() {
    this.paused = false;
  }
}

const words = (text) => [...text.matchAll(/\S+/g)].map((m) => m.index);

/** Speaks normally: start, a word boundary every `wordMs`, end. */
const talk = ({ startDelay = 10, wordMs = 100, boundaries = true, end = true, extra } = {}) => (u, s) => {
  const idx = words(u.text);
  s.at(startDelay, () => u.onstart?.({}));
  if (boundaries) idx.forEach((charIndex, i) => s.at(startDelay + i * wordMs, () => u.onboundary?.({ name: 'word', charIndex })));
  if (end) {
    s.at(startDelay + idx.length * wordMs, () => {
      s.finish();
      u.onend?.({});
    });
  }
  extra?.(u, s);
};
const neverStarts = () => () => {};
const errors = (error, delay = 20) => (u, s) =>
  s.at(delay, () => {
    s.finish();
    u.onerror?.({ error });
  });

// ---- Harness ------------------------------------------------------------------

const flush = () => new Promise((r) => setImmediate(r));
async function advance(ms, step = 5) {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(step);
    await flush();
  }
}

function setup({ voices = [DANIEL], behaviour = talk(), settings = {}, getRecording, playClip, platform = 'mac' } = {}) {
  const synth = new FakeSynth(voices, behaviour);
  const narrator = createNarrator({
    getSettings: () => ({ voiceURI: null, rate: 0.9, pitch: 1.05, ...settings }),
    getRecording,
    playClip,
    synth,
    Utterance: FakeUtterance,
    platform,
  });
  return { synth, narrator };
}

/** Start a play() and collect highlight events with their (mock) times. */
function start(narrator, plan, opts = {}) {
  const t0 = Date.now();
  const seen = [];
  const state = { result: undefined, seen, t0, segments: [] };
  state.promise = narrator
    .play(plan, {
      onUnit: (line, u) => seen.push({ t: Date.now() - t0, line, u }),
      onSegment: (i) => state.segments.push(i),
      ...opts,
    })
    .then((r) => {
      state.result = r;
      state.endedAt = Date.now() - t0;
      return r;
    });
  return state;
}

test.beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  delete globalThis.SB_TEST;
});
test.afterEach(() => {
  mock.timers.reset();
  delete globalThis.SB_TEST;
  delete globalThis.document;
});

const siobhan = person('Siobhan', 'Shi vawn');

test('boundary events drive the highlight, word by word, onto the name', async () => {
  const { synth, narrator } = setup({ voices: [SAMANTHA, DANIEL] });
  await narrator.ready;
  const plan = planLines(['Pass, pass, pass to {name}!'], siobhan);
  const s = start(narrator, plan);
  await advance(1200);
  assert.equal(s.result, 'done');
  assert.deepEqual(s.seen.map((e) => e.u), [0, 1, 2, 3, 4]);
  // Timings follow the boundary events (every 100 ms), not the estimate (~500 ms a word).
  const times = s.seen.map((e) => e.t);
  times.forEach((t, i) => assert.ok(Math.abs(t - (10 + i * 100)) <= 10, `unit ${i} at ${t}`));
  // One utterance for the sentence, with the name's spoken form, the UK voice, lang and settings.
  assert.equal(synth.spoken.length, 1);
  const u = synth.spoken[0];
  assert.equal(u.text, 'Pass, pass, pass to Shi vawn!');
  assert.equal(u.voice, DANIEL);
  assert.equal(u.lang, 'en-GB');
  assert.equal(u.rate, 0.9);
  assert.equal(u.pitch, 1.05);
  assert.equal(narrator.speaking, false);
});

test('no boundary events: the estimated timeline drives the highlight, late boundaries are ignored', async () => {
  const late = (u, s) => s.at(600, () => u.onboundary?.({ name: 'word', charIndex: u.text.indexOf('vawn') }));
  const { narrator } = setup({ behaviour: talk({ boundaries: false, wordMs: 700, extra: late }) });
  await narrator.ready;
  const plan = planLines(['Pass, pass, pass to {name}!'], siobhan);
  const tl = estimateTimeline(plan.segments[0], 0.9);
  const s = start(narrator, plan);
  await advance(5000);
  assert.equal(s.result, 'done');
  assert.deepEqual(s.seen.map((e) => e.u), [0, 1, 2, 3, 4]);
  s.seen.forEach((e, i) => assert.ok(Math.abs(e.t - (10 + tl[i].at)) <= 10, `unit ${i} at ${e.t}, expected ${10 + tl[i].at}`));
});

test('an engine that stops sending word events mid-sentence hands over to the estimate', async () => {
  // Only the first word gets a boundary (some engines only send the first).
  const firstOnly = (u, s) => {
    s.at(10, () => u.onstart?.({}));
    s.at(10, () => u.onboundary?.({ name: 'word', charIndex: 0 }));
    s.at(6000, () => {
      s.finish();
      u.onend?.({});
    });
  };
  const { narrator } = setup({ behaviour: firstOnly });
  await narrator.ready;
  const plan = planLines(['One two three four five.'], person('Ava'));
  const s = start(narrator, plan);
  await advance(4000);
  assert.deepEqual(s.seen.map((e) => e.u), [0, 1, 2, 3, 4], 'all words highlighted before the voice finished');
  await advance(2500);
  assert.equal(s.result, 'done');
});

test('sentence boundary events are ignored (they carry no word position)', async () => {
  const sentence = (u, s) => s.at(15, () => u.onboundary?.({ name: 'sentence', charIndex: u.text.length - 2 }));
  const { narrator } = setup({ behaviour: talk({ extra: sentence }) });
  await narrator.ready;
  const s = start(narrator, planLines(['One two three.'], person('Ava')));
  await advance(1000);
  assert.deepEqual(s.seen.map((e) => e.u), [0, 1, 2]);
});

test('watchdog: an engine that never fires "end" does not hang the page', async () => {
  const { synth, narrator } = setup({ behaviour: talk({ end: false }) });
  await narrator.ready;
  const plan = planLines(['Hooray!'], person('Ava'));
  const est = estimateTimeline(plan.segments[0], 0.9).reduce((a, t) => a + t.dur, 0);
  const s = start(narrator, plan);
  await advance(est * 2 + 1400);
  assert.equal(s.result, undefined, 'still waiting just before the watchdog');
  await advance(200);
  assert.equal(s.result, 'done');
  assert.ok(synth.cancels >= 1, 'the stuck utterance was cancelled');
});

test('an engine that never starts (iOS before a tap): silent highlighting, then gives up on speech for the plan', async () => {
  const { synth, narrator } = setup({ behaviour: neverStarts() });
  await narrator.ready;
  const plan = planLines(['One two.', 'Three four.', 'Five six.'], person('Ava'));
  const s = start(narrator, plan);
  await advance(20000, 20);
  assert.equal(s.result, 'done');
  assert.deepEqual(s.seen.map((e) => `${e.line}:${e.u}`), ['0:0', '0:1', '1:0', '1:1', '2:0', '2:1']);
  assert.equal(synth.spoken.length, 2, 'stopped trying after two failures');
  assert.equal(narrator.needsGesture, true);
  // A tap: unlock() speaks a silent utterance and clears the flag.
  narrator.unlock();
  assert.equal(narrator.needsGesture, false);
  const u = synth.spoken.at(-1);
  assert.equal(u.volume, 0);
  assert.equal(u.text.trim(), '');
});

test('stop() mid-plan resolves "stopped", cancels speech and fires no more highlights', async () => {
  const { synth, narrator } = setup();
  await narrator.ready;
  const s = start(narrator, planLines(['One two three four.', 'Five six seven.'], person('Ava')));
  await advance(150);
  assert.equal(narrator.speaking, true);
  const count = s.seen.length;
  narrator.stop();
  await advance(5);
  assert.equal(s.result, 'stopped');
  assert.ok(synth.cancels >= 1);
  assert.equal(narrator.speaking, false);
  await advance(3000);
  assert.equal(s.seen.length, count);
  assert.equal(synth.spoken.length, 1);
});

test('an AbortSignal stops the plan during a pause, straight away', async () => {
  const { narrator } = setup();
  await narrator.ready;
  const ac = new AbortController();
  const plan = planLines(['One.', 'Two.'], person('Ava'), { linePauseMs: 2000 });
  assert.equal(plan.segments[1].kind, 'pause');
  const s = start(narrator, plan, { signal: ac.signal });
  await advance(300);
  assert.deepEqual(s.segments, [0, 1], 'in the pause');
  ac.abort();
  await advance(5);
  assert.equal(s.result, 'stopped');
});

test('an already-aborted signal resolves "stopped" without speaking', async () => {
  const { synth, narrator } = setup();
  await narrator.ready;
  const ac = new AbortController();
  ac.abort();
  const s = start(narrator, planLines(['Hello.'], person('Ava')), { signal: ac.signal });
  await advance(10);
  assert.equal(s.result, 'stopped');
  assert.equal(synth.spoken.length, 0);
});

test('a new play() stops the previous one', async () => {
  const { narrator } = setup();
  await narrator.ready;
  const a = start(narrator, planLines(['One two three four five six.'], person('Ava')));
  await advance(120);
  const b = start(narrator, planLines(['Seven.'], person('Ava')));
  await advance(1000);
  assert.equal(a.result, 'stopped');
  assert.equal(b.result, 'done');
});

test('clip segments play the parent recording instead of speaking the name', async () => {
  const blob = { size: 1234, type: 'audio/wav' };
  const clips = [];
  const { synth, narrator } = setup({
    getRecording: async (id) => (id === 'rec1' ? blob : null),
    playClip: (b) => {
      clips.push(b);
      return new Promise((r) => setTimeout(r, 400));
    },
  });
  await narrator.ready;
  const plan = planLines(['Here comes {name}!'], person('Niamh', 'Neeve'), { useRecording: true, recordingId: 'rec1' });
  const s = start(narrator, plan);
  await advance(2000);
  assert.equal(s.result, 'done');
  assert.deepEqual(clips, [blob]);
  assert.deepEqual(s.seen.map((e) => e.u), [0, 1, 2], 'the name is highlighted while the clip plays');
  assert.ok(synth.spoken.every((u) => !/Neeve|Niamh/.test(u.text)), 'the voice never says the name');
});

test('if the recording cannot play, the voice says the name instead', async () => {
  const { synth, narrator } = setup({
    getRecording: async () => ({ size: 10 }),
    playClip: () => Promise.reject(new Error('NotAllowedError')),
  });
  await narrator.ready;
  const plan = planLines(['Here comes {name}!'], person('Niamh', 'Neeve'), { useRecording: true, recordingId: 'rec1' });
  const s = start(narrator, plan);
  await advance(3000);
  assert.equal(s.result, 'done');
  assert.ok(synth.spoken.some((u) => u.text === 'Neeve!'), synth.spoken.map((u) => u.text).join(' | '));
});

test('a missing recording (getRecording -> null or throws) also falls back to the voice', async () => {
  for (const getRecording of [async () => null, async () => { throw new Error('IndexedDB blocked'); }]) {
    const { synth, narrator } = setup({ getRecording, playClip: async () => assert.fail('nothing to play') });
    await narrator.ready;
    const s = start(narrator, planLines(['Hi {name}.'], person('Ava'), { useRecording: true, recordingId: 'gone' }));
    await advance(3000);
    assert.equal(s.result, 'done');
    assert.ok(synth.spoken.some((u) => u.text === 'Ava.'));
  }
});

test('silent timed mode (SB_TEST.forceSilent) still highlights every word, scaled by timeScale', async () => {
  globalThis.SB_TEST = { forceSilent: true, timeScale: 0.1 };
  const played = [];
  const { synth, narrator } = setup({ getRecording: async () => ({ size: 1 }), playClip: async (b) => played.push(b) });
  await narrator.ready;
  assert.equal(narrator.hasVoice(), false);
  assert.equal(narrator.mode, 'silent');
  const plan = planLines(['Pass to {name}.', 'Goal!'], siobhan, { useRecording: true, recordingId: 'r' });
  const expected = plan.segments.reduce((sum, seg) => {
    if (seg.kind === 'pause') return sum + seg.ms;
    if (seg.kind === 'speech') return sum + estimateTimeline(seg, 0.9).reduce((a, t) => a + t.dur, 0);
    return sum;
  }, 0);
  const s = start(narrator, plan);
  await advance(expected * 0.1 + 400);
  assert.equal(s.result, 'done');
  assert.deepEqual(s.seen.map((e) => `${e.line}:${e.u}`), ['0:0', '0:1', '0:2', '1:0']);
  assert.equal(synth.spoken.length, 0, 'never touches the speech engine');
  assert.deepEqual(played, [], 'and never plays a lone recording');
  assert.ok(s.endedAt < expected * 0.1 + 400, `took ${s.endedAt} ms`);
});

test('no speech engine at all: supported=false, silent mode, everything still resolves', async () => {
  const narrator = createNarrator({ synth: undefined, Utterance: undefined });
  assert.equal(narrator.supported, false);
  assert.deepEqual(await narrator.ready, []);
  assert.equal(narrator.hasVoice(), false);
  assert.deepEqual(narrator.listVoices(), []);
  assert.equal(narrator.currentVoice(), null);
  narrator.unlock(); // no throw
  const s = start(narrator, planLines(['Hi {name}!'], person('Ava')));
  await advance(3000);
  assert.equal(s.result, 'done');
  assert.equal(s.seen.length, 2);
  const t = narrator.speakText('Ava');
  await advance(1500);
  assert.equal(await t, 'done');
});

test('no voices: ready resolves within ~1.5 s and the narrator runs silently', async () => {
  const { narrator } = setup({ voices: [] });
  let ready = false;
  narrator.ready.then(() => (ready = true));
  await advance(1400);
  assert.equal(ready, false);
  await advance(200);
  assert.equal(ready, true);
  assert.equal(narrator.hasVoice(), false);
});

test('a network voice that errors is swapped for the next best voice, and stays swapped', async () => {
  const behaviour = (u, s) => (u.voice === GOOGLE_UK ? errors('network')(u, s) : talk()(u, s));
  const { synth, narrator } = setup({ voices: [DANIEL, GOOGLE_UK], behaviour, platform: 'windows', settings: { allowOnlineVoices: true } });
  await narrator.ready;
  assert.equal(narrator.currentVoice().name, 'Google UK English Female');
  const s = start(narrator, planLines(['One two.'], person('Ava')));
  await advance(1000);
  assert.equal(s.result, 'done');
  assert.deepEqual(synth.spoken.map((u) => u.voice.name), ['Google UK English Female', 'Daniel']);
  assert.deepEqual(s.seen.map((e) => e.u), [0, 1]);
  assert.equal(narrator.currentVoice().name, 'Daniel');
});

test('a network voice that never starts (offline) is swapped for a local one', async () => {
  const behaviour = (u, s) => (u.voice === GOOGLE_UK ? undefined : talk()(u, s));
  const { synth, narrator } = setup({ voices: [DANIEL, GOOGLE_UK], behaviour, platform: 'windows', settings: { allowOnlineVoices: true } });
  await narrator.ready;
  const s = start(narrator, planLines(['One two.'], person('Ava')));
  await advance(5000);
  assert.equal(s.result, 'done');
  assert.deepEqual(synth.spoken.map((u) => u.voice.name), ['Google UK English Female', 'Daniel']);
  assert.equal(narrator.needsGesture, false);
});

test('"interrupted" from the engine is a normal stop of that sentence; the plan carries on', async () => {
  let n = 0;
  const behaviour = (u, s) => (n++ === 0 ? errors('interrupted', 50)(u, s) : talk()(u, s));
  const { narrator } = setup({ behaviour });
  await narrator.ready;
  const s = start(narrator, planLines(['One.', 'Two.'], person('Ava')));
  await advance(3000);
  assert.equal(s.result, 'done');
  assert.ok(s.seen.some((e) => e.line === 1));
});

test('"not-allowed" (no gesture yet): silent for the rest of the plan and asks for a tap', async () => {
  const { synth, narrator } = setup({ behaviour: errors('not-allowed', 5) });
  await narrator.ready;
  const s = start(narrator, planLines(['One two.', 'Three.'], person('Ava')));
  await advance(5000);
  assert.equal(s.result, 'done');
  assert.equal(synth.spoken.length, 1);
  assert.equal(s.seen.length, 3);
  assert.equal(narrator.needsGesture, true);
});

test('rate and pitch combine settings with the page multipliers, clamped to safe values', async () => {
  const { synth, narrator } = setup({ settings: { rate: 1.5, pitch: 0.2 } });
  await narrator.ready;
  const s = start(narrator, planLines(['Hi.'], person('Ava')), { rateScale: 1.5, pitchScale: 1 });
  await advance(1000);
  assert.equal(s.result, 'done');
  assert.equal(synth.spoken[0].rate, 1.6);
  assert.equal(synth.spoken[0].pitch, 0.5);
  const { synth: synth2, narrator: n2 } = setup({ settings: { rate: 0.9, pitch: 1.05 } });
  await n2.ready;
  const s2 = start(n2, planLines(['Night night.'], person('Ava')), { rateScale: 0.85, pitchScale: 0.95 });
  await advance(2000);
  assert.equal(s2.result, 'done');
  assert.ok(Math.abs(synth2.spoken[0].rate - 0.765) < 1e-9);
  assert.ok(Math.abs(synth2.spoken[0].pitch - 0.9975) < 1e-9);
});

test('the saved voiceURI is used when it exists', async () => {
  const { synth, narrator } = setup({ voices: [DANIEL, SAMANTHA], settings: { voiceURI: 'Samantha' } });
  await narrator.ready;
  const s = start(narrator, planLines(['Hi.'], person('Ava')));
  await advance(1000);
  assert.equal(s.result, 'done');
  assert.equal(synth.spoken[0].voice, SAMANTHA);
  assert.equal(synth.spoken[0].lang, 'en-US');
});

test('speakText speaks once, interrupts narration, and accepts a voice to preview', async () => {
  const { synth, narrator } = setup({ voices: [DANIEL, SAMANTHA] });
  await narrator.ready;
  const s = start(narrator, planLines(['One two three four five.'], person('Ava')));
  await advance(120);
  const units = [];
  const t = narrator.speakText('  Shi vawn ', { voiceURI: 'Samantha', onUnit: (k) => units.push(k) });
  await advance(1500);
  assert.equal(s.result, 'stopped');
  assert.equal(await t, 'done');
  const u = synth.spoken.at(-1);
  assert.equal(u.text, 'Shi vawn');
  assert.equal(u.voice, SAMANTHA);
  assert.deepEqual(units, [0, 1]);
  assert.equal(await narrator.speakText(''), 'done');
});

test('before speaking, a busy or paused engine is cancelled/resumed; a pending unlock utterance is not cancelled', async () => {
  const { synth, narrator } = setup();
  await narrator.ready;
  synth.speaking = true; // stuck from somewhere else (Chrome)
  synth.paused = true;
  const s = start(narrator, planLines(['Hi.'], person('Ava')));
  await advance(1000);
  assert.equal(s.result, 'done');
  assert.equal(synth.cancels, 1);
  assert.equal(synth.paused, false);

  // unlock() then play() in the same tap: the silent utterance is allowed to finish.
  const quick = (u, sy) => (u.volume === 0 ? sy.at(30, () => (sy.finish(), u.onend?.({}))) : talk()(u, sy));
  const { synth: s2, narrator: n2 } = setup({ behaviour: quick });
  await n2.ready;
  n2.unlock();
  const p = start(n2, planLines(['Hi.'], person('Ava')));
  await advance(1000);
  assert.equal(p.result, 'done');
  assert.equal(s2.cancels, 0);
  assert.deepEqual(s2.spoken.map((u) => u.volume), [0, 1]);
});

test('locking the phone mid-sentence restarts that sentence when the page is visible again', async () => {
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  globalThis.document = doc;
  const { synth, narrator } = setup();
  await narrator.ready;
  const s = start(narrator, planLines(['One two three.'], person('Ava')));
  await advance(150);
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  await advance(3000);
  assert.equal(s.result, undefined, 'waits while hidden');
  assert.equal(synth.spoken.length, 1);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await advance(1000);
  assert.equal(s.result, 'done');
  assert.deepEqual(synth.spoken.map((u) => u.text), ['One two three.', 'One two three.']);
  assert.deepEqual(s.seen.map((e) => e.u), [0, 1, 0, 1, 2], 'the highlight restarts with the sentence');
});

test('a throwing onUnit callback does not break narration', async () => {
  const { narrator } = setup();
  await narrator.ready;
  const r = narrator.play(planLines(['One two.'], person('Ava')), {
    onUnit: () => {
      throw new Error('reader bug');
    },
  });
  await advance(1000);
  assert.equal(await r, 'done');
});

test('listVoices is English-only, ranked, and serialisable; currentVoice follows settings', async () => {
  const { narrator } = setup({ voices: [voice('Anna', 'de-DE'), SAMANTHA, DANIEL, voice('Bubbles', 'en-US')] });
  const list = await narrator.ready;
  assert.deepEqual(list.map((v) => v.name), ['Daniel', 'Samantha', 'Bubbles']);
  assert.deepEqual(Object.keys(list[0]).slice(0, 5), ['uri', 'name', 'lang', 'local', 'isDefault']);
  assert.doesNotThrow(() => JSON.stringify(list));
  assert.equal(narrator.currentVoice().name, 'Daniel');
});

test('textSegment splits text into word units with offsets', () => {
  const seg = textSegment('Hello  there, Ava!');
  assert.deepEqual(seg.units.map((x) => seg.text.slice(x.start, x.end)), ['Hello', 'there,', 'Ava!']);
  assert.deepEqual(textSegment('').units, []);
});

test('Safari: voices that appear after discovery gave up (no voiceschanged event) are still picked up', async () => {
  const { synth, narrator } = setup({ voices: [] });
  const ready = narrator.ready;
  await advance(1600);
  assert.deepEqual(await ready, []);
  assert.equal(narrator.mode, 'silent');
  synth.voices = [DANIEL]; // arrives quietly, no event
  await advance(1100);
  assert.equal(narrator.hasVoice(), true);
  const s = start(narrator, planLines(['Hello there.'], person('Ava')));
  await advance(1000);
  assert.equal(s.result, 'done');
  assert.equal(synth.spoken[0].voice, DANIEL);
});

test('a long-lived signal (the reader passes one to every tap-a-word) does not collect listeners', async () => {
  const { narrator } = setup();
  await narrator.ready;
  let adds = 0;
  let removes = 0;
  const ac = new AbortController();
  const add = ac.signal.addEventListener.bind(ac.signal);
  const remove = ac.signal.removeEventListener.bind(ac.signal);
  ac.signal.addEventListener = (...a) => (adds++, add(...a));
  ac.signal.removeEventListener = (...a) => (removes++, remove(...a));
  for (let i = 0; i < 5; i++) {
    const t = narrator.speakText('Ava', { signal: ac.signal });
    await advance(600);
    assert.equal(await t, 'done');
  }
  assert.ok(adds > 0);
  assert.equal(adds, removes, 'every listener added was removed');
});

test('a new recording under the same id is used next time (no stale cache)', async () => {
  let current = { size: 1, v: 1 };
  const played = [];
  const { narrator } = setup({ getRecording: async () => current, playClip: async (b) => played.push(b.v) });
  await narrator.ready;
  const plan = planLines(['{name}!'], person('Ava'), { useRecording: true, recordingId: 'r' });
  const a = start(narrator, plan);
  await advance(500);
  assert.equal(a.result, 'done');
  current = { size: 1, v: 2 };
  const b = start(narrator, plan);
  await advance(500);
  assert.equal(b.result, 'done');
  assert.deepEqual(played, [1, 2]);
});

test('siblings reading together: the voice says the joined names, never one child\'s recording', async () => {
  const played = [];
  const { synth, narrator } = setup({ getRecording: async () => ({ size: 1 }), playClip: async (b) => played.push(b) });
  await narrator.ready;
  const both = togetherPerson([{ display: 'Amara', say: 'Ah-mah-ra' }, { display: 'Zak' }]);
  const plan = planLines(['Where {is|are} {name}?'], both, { useRecording: true, recordingId: 'r' });
  assert.ok(plan.segments.every((sg) => sg.kind !== 'clip'), 'no clip segments for siblings');
  const s = start(narrator, plan);
  await advance(3000);
  assert.equal(s.result, 'done');
  assert.equal(played.length, 0);
  assert.match(synth.spoken.map((u) => u.text).join(' '), /Where are Ah-mah-ra and Zak\?/);
  // One child: the recording is still used.
  assert.ok(planLines(['Hi {name}!'], person('Amara'), { useRecording: true, recordingId: 'r' }).segments.some((sg) => sg.kind === 'clip'));
});
