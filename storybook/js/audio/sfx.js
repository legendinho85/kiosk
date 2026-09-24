// Sound effects for the reader, synthesised with the Web Audio API so the app
// ships no audio files and every sound can be tuned in code.
//
// These are for very small ears, so everything runs through one gentle master
// chain (low overall gain -> a soft low-pass to take the fizz off -> a
// compressor that catches peaks) and a toddler mashing a button can't stack
// ten cheers on top of each other.
//
// This module also owns the one shared AudioContext for the app: iOS limits
// how many a page may create, and a context "unlocked" inside a tap is what
// lets later sounds (and the parent's name recording, see recorder.js) play
// without another tap.

export const SFX_NAMES = Object.freeze(['whistle', 'kick', 'cheer', 'pop', 'boing', 'clap', 'ding', 'swoosh', 'drum', 'sparkle', 'click']);

const DEFAULT_VOLUME = 0.55;
const MAX_VOICES = 6; // concurrent sounds; extra taps are dropped rather than piled up
const RETRIGGER_MS = 70; // the same sound can't restart faster than this

let shared = null;

function AudioContextClass() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

/** True once the page has had a tap/click/key press (or when the browser can't tell us). */
export function hasUserActivation() {
  const ua = globalThis.navigator?.userActivation;
  return ua ? Boolean(ua.hasBeenActive) : true;
}

/**
 * The app's shared AudioContext. By default it is only created after the page
 * has seen a user gesture: creating one earlier just produces a suspended
 * context and a console warning in Chrome.
 * @param {{create?: boolean}} [opts]
 * @returns {AudioContext|null}
 */
export function getAudioContext({ create = hasUserActivation() } = {}) {
  if (shared && shared.state !== 'closed') return shared;
  if (!create) return null;
  const AC = AudioContextClass();
  if (!AC) return null;
  try {
    shared = new AC({ latencyHint: 'interactive' });
  } catch {
    try {
      shared = new AC();
    } catch {
      shared = null;
    }
  }
  return shared;
}

/**
 * Create/resume the shared context. Call synchronously inside a tap handler.
 * Returns the context (or null when Web Audio is unavailable). Never throws.
 */
export function unlockAudio() {
  try {
    // Safari 17+: a "playback" session makes Web Audio (sfx and the name
    // recording) play even with the ringer switch on silent, matching the
    // speech voice, which ignores the switch. Otherwise the parent's recorded
    // name would be silent while the rest of the sentence is spoken.
    const session = globalThis.navigator?.audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
  } catch {
    /* not supported */
  }
  const ctx = getAudioContext({ create: true });
  if (!ctx) return null;
  try {
    if (ctx.state !== 'running') ctx.resume?.()?.catch?.(() => {});
    // Older iOS only unlocks after something has actually been started inside
    // the gesture: a one-sample silent buffer is enough.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
  return ctx;
}

// ---- Building blocks --------------------------------------------------------

const chains = new WeakMap();

/** Master chain for a context: input -> gain -> low-pass -> compressor -> destination. */
function masterFor(ctx, volume) {
  let chain = chains.get(ctx);
  if (!chain) {
    const input = ctx.createGain();
    const gain = ctx.createGain();
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 8500;
    soften.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    input.connect(gain);
    gain.connect(soften);
    soften.connect(comp);
    comp.connect(ctx.destination);
    chain = { input, gain };
    chains.set(ctx, chain);
  }
  chain.gain.gain.value = volume;
  return chain.input;
}

const noiseBuffers = new WeakMap();

function noiseBuffer(ctx) {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    const len = Math.floor((ctx.sampleRate || 44100) * 1.5);
    buf = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
    const data = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/** Small seeded random source so each sound varies a little but never wildly. */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function gainNode(ctx, value = 0) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Attack then exponential-ish decay on a gain param, starting from silence. */
function pluck(param, t, peak, attack, decay) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0, t + attack, decay / 4);
}

function osc(ctx, type, freq, t, stop) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(stop);
  return o;
}

function noise(ctx, t, stop) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(t, 0);
  src.stop(stop);
  return src;
}

function filter(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

// ---- The sounds -------------------------------------------------------------
// Each takes (ctx, out, t0, rand) and returns its length in seconds.

/** Referee whistle: two short "peep"s with the pea's trill. */
function whistle(ctx, out, t0) {
  const peep = (start, len, f) => {
    const end = start + len;
    const o = osc(ctx, 'sine', f * 0.92, start, end + 0.05);
    o.frequency.exponentialRampToValueAtTime(f, start + 0.03);
    // The pea rattling inside the whistle: a fast wobble in pitch and loudness.
    const trill = osc(ctx, 'sine', 32, start, end + 0.05);
    const pitchWobble = gainNode(ctx, f * 0.025);
    trill.connect(pitchWobble);
    pitchWobble.connect(o.frequency);
    const am = gainNode(ctx, 0.75);
    const amDepth = gainNode(ctx, 0.25);
    trill.connect(amDepth);
    amDepth.connect(am.gain);
    const env = gainNode(ctx);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(0.2, start + 0.012);
    env.gain.setValueAtTime(0.2, end - 0.03);
    env.gain.linearRampToValueAtTime(0, end);
    o.connect(am);
    am.connect(env);
    env.connect(out);
    // A little breath under the tone.
    const n = noise(ctx, start, end + 0.05);
    const bp = filter(ctx, 'bandpass', f, 6);
    const breath = gainNode(ctx);
    breath.gain.setValueAtTime(0, start);
    breath.gain.linearRampToValueAtTime(0.05, start + 0.02);
    breath.gain.linearRampToValueAtTime(0, end);
    n.connect(bp);
    bp.connect(breath);
    breath.connect(out);
  };
  peep(t0, 0.13, 2050);
  peep(t0 + 0.22, 0.3, 2100);
  return 0.6;
}

/** A soft thud of a foot on a ball. */
function kick(ctx, out, t0) {
  const o = osc(ctx, 'sine', 150, t0, t0 + 0.4);
  o.frequency.exponentialRampToValueAtTime(48, t0 + 0.14);
  const g = gainNode(ctx);
  pluck(g.gain, t0, 0.9, 0.004, 0.28);
  o.connect(g);
  g.connect(out);
  const n = noise(ctx, t0, t0 + 0.08);
  const lp = filter(ctx, 'lowpass', 1400, 0.8);
  const ng = gainNode(ctx);
  pluck(ng.gain, t0, 0.3, 0.002, 0.05);
  n.connect(lp);
  lp.connect(ng);
  ng.connect(out);
  return 0.4;
}

/** A friendly crowd: a swell of filtered noise with a few "yay"s on top. */
function cheer(ctx, out, t0, rand) {
  const len = 1.25;
  const n = noise(ctx, t0, t0 + len + 0.1);
  const hp = filter(ctx, 'highpass', 280, 0.5);
  const bp = filter(ctx, 'bandpass', 1100, 0.6);
  const crowd = gainNode(ctx);
  crowd.gain.setValueAtTime(0, t0);
  crowd.gain.linearRampToValueAtTime(0.3, t0 + 0.3);
  crowd.gain.linearRampToValueAtTime(0.24, t0 + 0.8);
  crowd.gain.linearRampToValueAtTime(0, t0 + len);
  // Slow, uneven loudness so it sounds like many people rather than static.
  const flutter = osc(ctx, 'sine', 5.3, t0, t0 + len);
  const flutterDepth = gainNode(ctx, 0.05);
  flutter.connect(flutterDepth);
  flutterDepth.connect(crowd.gain);
  n.connect(hp);
  hp.connect(bp);
  bp.connect(crowd);
  crowd.connect(out);

  // "Yay!" blips: a buzzy voice through two vowel formants gliding "a" -> "ay".
  const voices = 6;
  for (let i = 0; i < voices; i++) {
    const s = t0 + 0.06 + rand() * 0.62;
    const d = 0.28 + rand() * 0.14;
    const f0 = 230 + rand() * 190;
    const v = osc(ctx, 'sawtooth', f0, s, s + d + 0.05);
    v.frequency.linearRampToValueAtTime(f0 * 1.18, s + d * 0.35);
    v.frequency.linearRampToValueAtTime(f0 * 0.92, s + d);
    const f1 = filter(ctx, 'bandpass', 780, 7);
    f1.frequency.setValueAtTime(780, s);
    f1.frequency.linearRampToValueAtTime(480, s + d);
    const f2 = filter(ctx, 'bandpass', 1750, 9);
    f2.frequency.setValueAtTime(1750, s);
    f2.frequency.linearRampToValueAtTime(2250, s + d);
    const env = gainNode(ctx);
    env.gain.setValueAtTime(0, s);
    env.gain.linearRampToValueAtTime(0.1, s + 0.04);
    env.gain.linearRampToValueAtTime(0.07, s + d * 0.7);
    env.gain.linearRampToValueAtTime(0, s + d);
    v.connect(f1);
    v.connect(f2);
    f1.connect(env);
    f2.connect(env);
    env.connect(out);
  }
  return len;
}

/** A bubbly pop. */
function pop(ctx, out, t0) {
  const o = osc(ctx, 'sine', 280, t0, t0 + 0.16);
  o.frequency.exponentialRampToValueAtTime(1150, t0 + 0.05);
  const g = gainNode(ctx);
  pluck(g.gain, t0, 0.8, 0.003, 0.11);
  o.connect(g);
  g.connect(out);
  return 0.16;
}

/** A springy boing. */
function boing(ctx, out, t0) {
  const len = 0.62;
  const o = osc(ctx, 'triangle', 120, t0, t0 + len);
  o.frequency.exponentialRampToValueAtTime(340, t0 + 0.38);
  const wob = osc(ctx, 'sine', 13, t0, t0 + len);
  const wobDepth = gainNode(ctx);
  wobDepth.gain.setValueAtTime(55, t0);
  wobDepth.gain.linearRampToValueAtTime(6, t0 + len);
  wob.connect(wobDepth);
  wobDepth.connect(o.frequency);
  const lp = filter(ctx, 'lowpass', 1600, 0.7);
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.32, t0 + 0.015);
  g.gain.setValueAtTime(0.32, t0 + 0.2);
  g.gain.setTargetAtTime(0, t0 + 0.2, 0.1);
  o.connect(lp);
  lp.connect(g);
  g.connect(out);
  return len;
}

/** A few friendly claps (two people, slightly out of step). */
function clap(ctx, out, t0, rand) {
  const claps = 4;
  const gap = 0.24;
  for (let i = 0; i < claps; i++) {
    for (const [offset, level, centre] of [
      [0, 0.42, 1250],
      [0.018 + rand() * 0.012, 0.26, 1650],
    ]) {
      const s = t0 + i * gap + offset + rand() * 0.012;
      const n = noise(ctx, s, s + 0.2);
      const bp = filter(ctx, 'bandpass', centre + rand() * 200, 1.1);
      const hp = filter(ctx, 'highpass', 450, 0.7);
      const g = gainNode(ctx);
      // Hands meet in a few quick slaps, then a short room tail.
      g.gain.setValueAtTime(0, s);
      for (let k = 0; k < 3; k++) {
        const ks = s + k * 0.009;
        g.gain.linearRampToValueAtTime(level, ks + 0.001);
        g.gain.linearRampToValueAtTime(level * 0.25, ks + 0.008);
      }
      g.gain.linearRampToValueAtTime(level * 0.8, s + 0.029);
      g.gain.setTargetAtTime(0, s + 0.03, 0.035);
      n.connect(bp);
      bp.connect(hp);
      hp.connect(g);
      g.connect(out);
    }
  }
  return claps * gap + 0.2;
}

/** A small bell: a few inharmonic partials, each fading at its own speed. */
function ding(ctx, out, t0) {
  const f = 1046.5; // C6
  const partials = [
    [1, 0.3, 1.3],
    [2.0, 0.12, 0.8],
    [2.76, 0.09, 0.55],
    [5.4, 0.035, 0.25],
  ];
  for (const [ratio, level, decay] of partials) {
    const o = osc(ctx, 'sine', f * ratio, t0, t0 + Math.min(2, decay * 1.6 + 0.1));
    const g = gainNode(ctx);
    pluck(g.gain, t0, level, 0.004, decay);
    o.connect(g);
    g.connect(out);
  }
  return 2;
}

/** A whoosh of air (page turn, a ball flying past). */
function swoosh(ctx, out, t0) {
  const len = 0.5;
  const n = noise(ctx, t0, t0 + len + 0.05);
  const bp = filter(ctx, 'bandpass', 350, 1.4);
  bp.frequency.setValueAtTime(350, t0);
  bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.24);
  bp.frequency.exponentialRampToValueAtTime(700, t0 + len);
  const g = gainNode(ctx);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.5, t0 + 0.2);
  g.gain.linearRampToValueAtTime(0, t0 + len);
  n.connect(bp);
  bp.connect(g);
  g.connect(out);
  return len;
}

/** A round tom-tom hit. */
function drum(ctx, out, t0) {
  const o = osc(ctx, 'sine', 175, t0, t0 + 0.5);
  o.frequency.exponentialRampToValueAtTime(88, t0 + 0.28);
  const g = gainNode(ctx);
  pluck(g.gain, t0, 0.75, 0.004, 0.42);
  o.connect(g);
  g.connect(out);
  const o2 = osc(ctx, 'triangle', 262, t0, t0 + 0.2);
  o2.frequency.exponentialRampToValueAtTime(140, t0 + 0.15);
  const g2 = gainNode(ctx);
  pluck(g2.gain, t0, 0.14, 0.003, 0.14);
  o2.connect(g2);
  g2.connect(out);
  const n = noise(ctx, t0, t0 + 0.05);
  const bp = filter(ctx, 'bandpass', 2600, 1);
  const ng = gainNode(ctx);
  pluck(ng.gain, t0, 0.12, 0.001, 0.03);
  n.connect(bp);
  bp.connect(ng);
  ng.connect(out);
  return 0.5;
}

/** Twinkly high blips climbing a pentatonic scale (magic, name appearing). */
function sparkle(ctx, out, t0, rand) {
  const notes = [1568, 1760, 2093, 2349, 2637, 3136, 3520];
  const blips = 7;
  for (let i = 0; i < blips; i++) {
    const s = t0 + i * 0.06 + rand() * 0.02;
    const note = notes[Math.min(notes.length - 1, i + (rand() < 0.3 ? 1 : 0))];
    for (const [mult, level] of [
      [1, 0.12],
      [2, 0.03],
    ]) {
      const o = osc(ctx, 'sine', note * mult, s, s + 0.35);
      const g = gainNode(ctx);
      pluck(g.gain, s, level, 0.003, 0.22);
      o.connect(g);
      g.connect(out);
    }
  }
  return blips * 0.06 + 0.35;
}

/** A soft wooden tick for buttons. */
function click(ctx, out, t0) {
  for (const [f, level] of [
    [1150, 0.22],
    [1720, 0.08],
  ]) {
    const o = osc(ctx, 'sine', f, t0, t0 + 0.07);
    const g = gainNode(ctx);
    pluck(g.gain, t0, level, 0.002, 0.04);
    o.connect(g);
    g.connect(out);
  }
  return 0.07;
}

const SOUNDS = { whistle, kick, cheer, pop, boing, clap, ding, swoosh, drum, sparkle, click };

/**
 * Schedule one sound on any context (live or offline).
 * @returns {number} length in seconds (0 if the name is unknown)
 */
export function renderSfx(ctx, name, { volume = DEFAULT_VOLUME, when = 0, seed } = {}) {
  const fn = SOUNDS[name];
  if (!fn) return 0;
  const out = masterFor(ctx, volume);
  const t0 = Math.max(ctx.currentTime || 0, 0) + Math.max(0, when);
  return fn(ctx, out, t0, rng(seed ?? Math.floor(Math.random() * 1e9)));
}

/**
 * Render a sound offline and measure it (for tests and the audio lab page).
 * @returns {Promise<{name: string, durationMs: number, peak: number, rms: number}|null>}
 */
export async function analyseSfx(name, { volume = DEFAULT_VOLUME, sampleRate = 44100 } = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!OAC || !SOUNDS[name]) return null;
  try {
    const ctx = new OAC(1, Math.ceil(sampleRate * 2.2), sampleRate);
    const secs = renderSfx(ctx, name, { volume, seed: 7 });
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let peak = 0;
    let sum = 0;
    const end = Math.min(data.length, Math.ceil(secs * sampleRate));
    for (let i = 0; i < end; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
      sum += data[i] * data[i];
    }
    return { name, durationMs: Math.round(secs * 1000), peak, rms: Math.sqrt(sum / Math.max(1, end)) };
  } catch {
    return null;
  }
}

/**
 * @param {{enabled?: () => boolean, volume?: number}} [opts]
 * @returns {{unlock(): void, play(name: string, opts?: {when?: number, volume?: number}): number, names: readonly string[], readonly ready: boolean}}
 *   play() returns the sound's length in ms (0 when muted, unknown or unavailable).
 */
export function createSfx({ enabled = () => true, volume = DEFAULT_VOLUME } = {}) {
  const lastPlayed = new Map();
  let active = []; // end times (ctx seconds) of sounds still ringing

  const isEnabled = () => {
    try {
      return enabled() !== false;
    } catch {
      return true;
    }
  };

  return {
    names: SFX_NAMES,
    /** Call synchronously in a tap handler (iOS/Chrome only let audio start from a gesture). */
    unlock() {
      unlockAudio();
    },
    play(name, { when = 0, volume: vol } = {}) {
      try {
        if (!isEnabled() || !SOUNDS[name]) return 0;
        const ctx = getAudioContext();
        if (!ctx) return 0;
        if (ctx.state !== 'running') ctx.resume?.()?.catch?.(() => {});
        const now = ctx.currentTime || 0;
        const wall = Date.now();
        if (wall - (lastPlayed.get(name) ?? -Infinity) < RETRIGGER_MS) return 0;
        active = active.filter((end) => end > now);
        if (active.length >= MAX_VOICES) return 0;
        lastPlayed.set(name, wall);
        const secs = renderSfx(ctx, name, { volume: vol ?? volume, when });
        active.push(now + when + secs);
        return Math.round(secs * 1000);
      } catch {
        return 0;
      }
    },
    get ready() {
      return getAudioContext({ create: false })?.state === 'running';
    },
  };
}
