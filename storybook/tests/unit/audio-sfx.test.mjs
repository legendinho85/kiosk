import test from 'node:test';
import assert from 'node:assert/strict';

// A tiny stand-in for the Web Audio API: records the nodes a sound builds and
// the automation it schedules, and checks the calls are well-formed.
class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }
  #push(type, v, t) {
    assert.ok(Number.isFinite(v), `${type} value ${v}`);
    assert.ok(Number.isFinite(t) && t >= 0, `${type} time ${t}`);
    this.events.push([type, v, t]);
    return this;
  }
  setValueAtTime(v, t) {
    return this.#push('set', v, t);
  }
  linearRampToValueAtTime(v, t) {
    return this.#push('linear', v, t);
  }
  exponentialRampToValueAtTime(v, t) {
    assert.ok(v > 0, 'exponential ramps need a positive target');
    return this.#push('exp', v, t);
  }
  setTargetAtTime(v, t, c) {
    assert.ok(c > 0);
    return this.#push('target', v, t);
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    ctx.nodes.push(this);
  }
  connect(dest) {
    assert.ok(dest instanceof FakeNode || dest instanceof FakeParam, 'connect to a node or param');
    this.outputs.push(dest);
    return dest;
  }
  disconnect() {}
}

class FakeAudioContext {
  static instances = [];
  constructor() {
    FakeAudioContext.instances.push(this);
    this.nodes = [];
    this.state = 'suspended';
    this.currentTime = 1.5;
    this.sampleRate = 44100;
    this.destination = new FakeNode(this, 'destination');
    this.resumes = 0;
  }
  resume() {
    this.resumes += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    return Object.assign(new FakeNode(this, 'gain'), { gain: new FakeParam(1) });
  }
  createOscillator() {
    const n = Object.assign(new FakeNode(this, 'osc'), { type: 'sine', frequency: new FakeParam(440) });
    n.start = (t) => (n.startAt = t);
    n.stop = (t) => (n.stopAt = t);
    return n;
  }
  createBufferSource() {
    const n = Object.assign(new FakeNode(this, 'source'), { buffer: null, loop: false });
    n.start = (t) => (n.startAt = t ?? 0);
    n.stop = (t) => (n.stopAt = t);
    return n;
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(this, 'filter'), { type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1) });
  }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'compressor');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new FakeParam();
    return n;
  }
  createBuffer(channels, length, rate) {
    const data = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: () => data };
  }
}

const { createSfx, SFX_NAMES, renderSfx, getAudioContext, unlockAudio, analyseSfx } = await import('../../js/audio/sfx.js');

// Runs first: the shared context is module state and later tests create one.
test('without Web Audio everything is a quiet no-op', async () => {
  const sfx = createSfx();
  assert.doesNotThrow(() => sfx.unlock());
  assert.equal(sfx.play('cheer'), 0);
  assert.equal(sfx.ready, false);
  assert.equal(unlockAudio(), getAudioContext({ create: false }));
  assert.equal(await analyseSfx('cheer'), null);
});

test('every named sound builds a well-formed graph that ends at the master chain', () => {
  const ctx = new FakeAudioContext();
  for (const name of SFX_NAMES) {
    const before = ctx.nodes.length;
    const secs = renderSfx(ctx, name, { seed: 3 });
    assert.ok(secs > 0.05 && secs <= 2, `${name} lasts ${secs}s`);
    const made = ctx.nodes.slice(before);
    const sources = made.filter((n) => n.kind === 'osc' || n.kind === 'source');
    assert.ok(sources.length > 0, `${name} makes sound`);
    for (const s of sources) {
      assert.ok(s.startAt >= ctx.currentTime, `${name}: starts now or later`);
      assert.ok(s.stopAt > s.startAt && s.stopAt <= ctx.currentTime + secs + 0.15, `${name}: every source is stopped (no leaks)`);
    }
  }
  // One shared master chain per context: gain -> low-pass -> compressor -> speakers.
  const comps = ctx.nodes.filter((n) => n.kind === 'compressor');
  assert.equal(comps.length, 1);
  assert.deepEqual(comps[0].outputs, [ctx.destination]);
});

test('gain envelopes stay gentle (no audio stage above 1)', () => {
  const ctx = new FakeAudioContext();
  for (const name of SFX_NAMES) renderSfx(ctx, name, { seed: 9 });
  // Gains feeding a param are modulation depths in Hz (vibrato), not loudness.
  const gains = ctx.nodes.filter((n) => n.kind === 'gain' && n.outputs.every((o) => o instanceof FakeNode));
  assert.ok(gains.length > 30);
  for (const g of gains) for (const [, v] of g.gain.events) assert.ok(Math.abs(v) <= 1, `gain automation ${v}`);
});

test('unknown sounds are ignored', () => {
  const ctx = new FakeAudioContext();
  assert.equal(renderSfx(ctx, 'explosion'), 0);
  assert.equal(ctx.nodes.length, 1); // just the destination
});

test('createSfx: lazy context, unlock() resumes it, play() respects enabled() and never throws', () => {
  globalThis.AudioContext = FakeAudioContext;
  try {
    let enabled = true;
    const sfx = createSfx({ enabled: () => enabled });
    assert.deepEqual([...sfx.names], SFX_NAMES);
    // No gesture yet (navigator.userActivation absent in node counts as "can't tell" -> allowed).
    sfx.unlock();
    const ctx = getAudioContext({ create: false });
    assert.ok(ctx instanceof FakeAudioContext);
    assert.equal(ctx.state, 'running');
    assert.ok(sfx.play('ding') > 0);
    enabled = false;
    assert.equal(sfx.play('pop'), 0);
    enabled = true;
    assert.equal(sfx.play('nonsense'), 0);
    // A throwing enabled() is treated as "on" rather than breaking the page.
    const odd = createSfx({
      enabled: () => {
        throw new Error('settings not ready');
      },
    });
    assert.ok(odd.play('kick') > 0);
  } finally {
    delete globalThis.AudioContext;
  }
});

test('button-mashing is tamed: fast repeats are dropped and at most a few sounds overlap', () => {
  globalThis.AudioContext = FakeAudioContext;
  try {
    const sfx = createSfx();
    sfx.unlock();
    const played = [];
    for (let i = 0; i < 5; i++) played.push(sfx.play('boing'));
    assert.ok(played[0] > 0);
    assert.deepEqual(played.slice(1), [0, 0, 0, 0]);
    const many = SFX_NAMES.map((n) => sfx.play(n)).filter((ms) => ms > 0);
    assert.ok(many.length <= 6, `${many.length} overlapping sounds`);
  } finally {
    delete globalThis.AudioContext;
  }
});
