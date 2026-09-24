// js/audio/mix.js: the pure parts (resampling, joining, chime, WAV) in node,
// plus the decode path with a stand-in OfflineAudioContext and the
// share/download fallbacks with stand-in browser objects.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mixToMono,
  resampleLinear,
  silence,
  concatSamples,
  synthChime,
  preventClipping,
  concatToWav,
  decodeToMono,
  safeFilename,
  downloadBlob,
  shareOrDownload,
  MixError,
} from '../../js/audio/mix.js';
import { encodeWav } from '../../js/audio/recorder.js';

const sine = (freq, rate, seconds, amp = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate));
const peakOf = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / Math.max(1, a.length));
/** Strength of one frequency in a signal (Goertzel), normalised to amplitude. */
function tone(samples, rate, freq) {
  const w = (2 * Math.PI * freq) / rate;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (const x of samples) {
    const s0 = x + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2)) / samples.length;
}
/** Upward zero crossings -> frequency estimate. */
function freqOf(samples, rate) {
  let n = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1] < 0 && samples[i] >= 0) n++;
  return (n * rate) / samples.length;
}

/** Parse a 16-bit PCM WAV (what encodeWav writes) back into its fields. */
function parseWav(buf) {
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  const channels = v.getUint16(22, true);
  const rate = v.getUint32(24, true);
  const bytes = v.getUint32(40, true);
  const frames = bytes / 2 / channels;
  const data = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) data[c][i] = v.getInt16(44 + (i * channels + c) * 2, true) / 0x8000;
  return { riff: str(0, 4), wave: str(8, 4), fmt: str(12, 4), dataTag: str(36, 4), riffSize: v.getUint32(4, true), pcm: v.getUint16(20, true), channels, rate, byteRate: v.getUint32(28, true), align: v.getUint16(32, true), bits: v.getUint16(34, true), bytes, data };
}

/** A stereo 16-bit WAV (encodeWav only writes mono). */
function stereoWav(left, right, rate) {
  const n = left.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.round(left[i] * 0x7fff), true);
    v.setInt16(46 + i * 4, Math.round(right[i] * 0x7fff), true);
  }
  return buf;
}

/**
 * Stand-in OfflineAudioContext: "decodes" WAVs by parsing them, and (like the
 * real thing) can be told to refuse certain sample rates.
 */
function installFakeDecoder({ refuseRates = [] } = {}) {
  const made = [];
  globalThis.OfflineAudioContext = class {
    constructor(channels, length, sampleRate) {
      if (refuseRates.includes(sampleRate)) throw new DOMException('rate not supported', 'NotSupportedError');
      this.sampleRate = sampleRate;
      made.push(sampleRate);
    }
    decodeAudioData(ab) {
      const text = new TextDecoder().decode(new Uint8Array(ab, 0, 4));
      if (text !== 'RIFF') return Promise.reject(new DOMException('Unable to decode audio data', 'EncodingError'));
      const w = parseWav(ab);
      return Promise.resolve({ sampleRate: w.rate, numberOfChannels: w.channels, length: w.data[0].length, getChannelData: (c) => w.data[c] });
    }
  };
  return made;
}
test.afterEach(() => {
  delete globalThis.OfflineAudioContext;
});

// ---- pure helpers -----------------------------------------------------------------

test('mixToMono averages channels (and copes with none or uneven lengths)', () => {
  assert.deepEqual([...mixToMono([Float32Array.of(1, 0.5), Float32Array.of(0, 0.5)])], [0.5, 0.5]);
  assert.deepEqual([...mixToMono([Float32Array.of(0.25, -0.25)])], [0.25, -0.25]);
  assert.equal(mixToMono([]).length, 0);
  assert.equal(mixToMono(null).length, 0);
  assert.deepEqual([...mixToMono([Float32Array.of(1, 1, 1), Float32Array.of(1)])], [1, 0.5, 0.5]);
});

test('resampleLinear: right length, DC stays DC, a ramp stays a ramp', () => {
  const dc = new Float32Array(48000).fill(0.4);
  const down = resampleLinear(dc, 48000, 22050);
  assert.equal(down.length, 22050);
  assert.ok(down.every((x) => Math.abs(x - 0.4) < 1e-6));
  const up = resampleLinear(Float32Array.of(0, 1, 2, 3), 1000, 2000);
  assert.equal(up.length, 8);
  assert.deepEqual([...up.slice(0, 7)], [0, 0.5, 1, 1.5, 2, 2.5, 3]);
  assert.equal(resampleLinear(new Float32Array(0), 44100, 22050).length, 0);
  const same = Float32Array.of(0.1, 0.2);
  const copy = resampleLinear(same, 22050, 22050);
  assert.deepEqual([...copy], [...same]);
  assert.notEqual(copy, same, 'returns a copy');
});

test('resampleLinear keeps pitch and level: a 440 Hz tone at 48 kHz is still 440 Hz at 22.05 kHz', () => {
  const src = sine(440, 48000, 1);
  const out = resampleLinear(src, 48000, 22050);
  assert.ok(Math.abs(freqOf(out, 22050) - 440) <= 2, `frequency ${freqOf(out, 22050)}`);
  assert.ok(Math.abs(rms(out) - rms(src)) < 0.01, `level ${rms(out)} vs ${rms(src)}`);
  const up = resampleLinear(sine(440, 16000, 1), 16000, 44100);
  assert.ok(Math.abs(freqOf(up, 44100) - 440) <= 2);
});

test('resampleLinear low-passes on the way down (a 10.5 kHz whistle is damped, not folded to a loud alias)', () => {
  const hiss = sine(10500, 48000, 0.5);
  const out = resampleLinear(hiss, 48000, 22050);
  assert.ok(rms(out) < rms(hiss) * 0.6, `rms ${rms(out)} vs ${rms(hiss)}`);
});

test('silence and concatSamples', () => {
  assert.equal(silence(500, 22050).length, 11025);
  assert.ok(silence(500, 22050).every((x) => x === 0));
  assert.equal(silence(-5, 22050).length, 0);
  assert.equal(silence('x', 22050).length, 0);
  const joined = concatSamples([Float32Array.of(1, 2), null, new Float32Array(0), Float32Array.of(3)]);
  assert.deepEqual([...joined], [1, 2, 3]);
  assert.equal(concatSamples([]).length, 0);
});

test('synthChime: a soft two-note chime, G5 then C6, with a gentle start and a clean end', () => {
  const rate = 22050;
  const c = synthChime(rate);
  assert.ok(c instanceof Float32Array);
  assert.equal(c.length, Math.round(1.4 * rate));
  assert.ok(Math.abs(peakOf(c) - 0.3) < 1e-6, `peak ${peakOf(c)}`);
  const db = 20 * Math.log10(peakOf(c));
  assert.ok(db < -9 && db > -12, `about -10 dBFS, got ${db.toFixed(1)}`);
  assert.equal(c[0], 0, 'starts from silence (no click)');
  assert.ok(Math.abs(c[c.length - 1]) < 1e-6 && Math.abs(c[c.length - 2]) < 0.001, 'fades out to silence');
  const first = c.slice(0, Math.round(0.22 * rate));
  const second = c.slice(Math.round(0.26 * rate), Math.round(0.6 * rate));
  assert.ok(tone(first, rate, 784) > 5 * tone(first, rate, 1046.5), 'first note is G5');
  assert.ok(tone(second, rate, 1046.5) > tone(second, rate, 784), 'second note is C6');
  // Rings on, then decays: louder early than late.
  assert.ok(rms(c.slice(0, rate * 0.4)) > 4 * rms(c.slice(rate)));
  // Still sensible at a telephone-quality rate (harmonics above Nyquist dropped).
  const low = synthChime(8000);
  assert.ok(low.every(Number.isFinite));
  assert.ok(Math.abs(peakOf(low) - 0.3) < 1e-6);
});

test('preventClipping only ever turns things down', () => {
  const quiet = Float32Array.of(0.5, -0.5);
  assert.equal(preventClipping(quiet), 1);
  assert.deepEqual([...quiet], [0.5, -0.5]);
  const loud = Float32Array.of(1.96, -0.98);
  const g = preventClipping(loud);
  assert.ok(Math.abs(g - 0.5) < 1e-6);
  assert.ok(Math.abs(loud[0] - 0.98) < 1e-6);
});

// ---- concatToWav --------------------------------------------------------------------

test('concatToWav with only silences and chimes writes a valid 16-bit mono WAV at 22.05 kHz', async () => {
  const blob = await concatToWav([{ chime: true }, { silenceMs: 300 }, { chime: true }]);
  assert.equal(blob.type, 'audio/wav');
  const w = parseWav(await blob.arrayBuffer());
  assert.equal(w.riff, 'RIFF');
  assert.equal(w.wave, 'WAVE');
  assert.equal(w.fmt, 'fmt ');
  assert.equal(w.dataTag, 'data');
  assert.equal(w.pcm, 1);
  assert.equal(w.channels, 1);
  assert.equal(w.bits, 16);
  assert.equal(w.rate, 22050);
  assert.equal(w.byteRate, 44100);
  assert.equal(w.align, 2);
  const frames = Math.round(1.4 * 22050) * 2 + Math.round(0.3 * 22050);
  assert.equal(w.bytes, frames * 2);
  assert.equal(w.riffSize, 36 + frames * 2);
  assert.equal(blob.size, 44 + frames * 2);
  const mid = w.data[0].slice(Math.round(1.4 * 22050) + 100, Math.round(1.7 * 22050) - 100);
  assert.ok(mid.every((x) => x === 0), 'the silence is silent');
});

test('concatToWav decodes recordings (any rate, stereo) to mono at the target rate, in order, with gaps and a chime', async () => {
  const made = installFakeDecoder();
  const a = new Blob([encodeWav(sine(440, 48000, 0.5, 0.6), 48000)], { type: 'audio/wav' });
  const b = new Blob([stereoWav(sine(660, 44100, 0.25, 0.4), sine(660, 44100, 0.25, 0.4), 44100)], { type: 'audio/wav' });
  const progress = [];
  const out = await concatToWav([a, { silenceMs: 500 }, { chime: true }, { silenceMs: 250 }, b], { onProgress: (f) => progress.push(f) });
  assert.deepEqual(made, [22050, 22050], 'decoded with an offline context at the target rate');
  assert.deepEqual(progress, [0.2, 0.4, 0.6, 0.8, 1]);
  const w = parseWav(await out.arrayBuffer());
  const r = 22050;
  const expected = Math.round(0.5 * r) + Math.round(0.5 * r) + Math.round(1.4 * r) + Math.round(0.25 * r) + Math.round(0.25 * r);
  assert.ok(Math.abs(w.data[0].length - expected) <= 2, `${w.data[0].length} vs ${expected}`);
  const d = w.data[0];
  const clipA = d.slice(0, Math.round(0.5 * r));
  const gap = d.slice(Math.round(0.5 * r) + 50, Math.round(1.0 * r) - 50);
  const clipB = d.slice(d.length - Math.round(0.25 * r));
  assert.ok(Math.abs(freqOf(clipA, r) - 440) <= 4, `clip A at ${freqOf(clipA, r)} Hz`);
  assert.ok(Math.abs(freqOf(clipB, r) - 660) <= 8, `clip B at ${freqOf(clipB, r)} Hz`);
  assert.ok(Math.abs(peakOf(clipA) - 0.6) < 0.03);
  assert.ok(Math.abs(peakOf(clipB) - 0.4) < 0.03, 'stereo averaged, not summed');
  assert.ok(gap.every((x) => x === 0));
});

test('concatToWav: a recording that can\'t be decoded is skipped; if none can be, it fails with a friendly error', async () => {
  installFakeDecoder();
  const good = new Blob([encodeWav(sine(440, 22050, 0.2), 22050)], { type: 'audio/wav' });
  const junk = new Blob(['not audio at all'], { type: 'audio/mp4' });
  const skipped = [];
  const out = await concatToWav([junk, { silenceMs: 100 }, good], { onSkip: (i) => skipped.push(i) });
  assert.deepEqual(skipped, [0]);
  assert.equal(parseWav(await out.arrayBuffer()).data[0].length, Math.round(0.1 * 22050) + Math.round(0.2 * 22050));
  await assert.rejects(concatToWav([junk, junk]), (err) => err instanceof MixError && err.code === 'nothing-decoded' && /record/.test(err.message));
  await assert.rejects(concatToWav([]), (err) => err instanceof MixError && err.code === 'empty');
  await assert.rejects(concatToWav(null), (err) => err.code === 'empty');
});

test('concatToWav without Web Audio (node, very old browsers): a clear "no-audio" error', async () => {
  const blob = new Blob([encodeWav(sine(440, 22050, 0.2), 22050)], { type: 'audio/wav' });
  await assert.rejects(concatToWav([blob]), (err) => err instanceof MixError && err.code === 'no-audio');
});

test('decodeToMono falls back to 44.1 kHz where the target rate is refused (old Safari), then resamples', async () => {
  const made = installFakeDecoder({ refuseRates: [22050] });
  const blob = new Blob([encodeWav(sine(440, 44100, 0.5), 44100)], { type: 'audio/wav' });
  const mono = await decodeToMono(blob, 22050);
  assert.deepEqual(made, [44100]);
  assert.equal(mono.length, Math.round(0.5 * 22050));
  assert.ok(Math.abs(freqOf(mono, 22050) - 440) <= 4);
});

test('concatToWav clamps silly sample rates and never clips', async () => {
  installFakeDecoder();
  const loud = new Blob([encodeWav(sine(300, 16000, 0.2, 1), 16000)], { type: 'audio/wav' });
  const out = await concatToWav([loud, loud], { sampleRate: 1000 });
  const w = parseWav(await out.arrayBuffer());
  assert.equal(w.rate, 8000);
  assert.ok(peakOf(w.data[0]) <= 0.99);
  assert.equal(parseWav(await (await concatToWav([{ chime: true }], { sampleRate: 192000 })).arrayBuffer()).rate, 48000);
});

// ---- sharing and downloading ------------------------------------------------------------

test('safeFilename keeps names readable and safe', () => {
  assert.equal(safeFilename('tiffin-football-Grandma Rose.wav'), 'tiffin-football-Grandma Rose.wav');
  assert.equal(safeFilename('Siobhán’s story.wav'), 'Siobhán’s story.wav');
  assert.equal(safeFilename('a/b\\c:d*?.wav'), 'a-b-c-d-.wav');
  assert.equal(safeFilename('  ..hidden  '), 'hidden');
  assert.equal(safeFilename(''), 'download');
  assert.equal(safeFilename(null, 'x.wav'), 'x.wav');
  assert.ok(safeFilename('x'.repeat(500)).length <= 120);
});

/** Stand-in browser globals for download/share tests; returns a log and a restore(). */
function fakeBrowser({ share, canShare = () => true } = {}) {
  const log = { clicks: [], revoked: [], shared: [] };
  const saved = { document: Object.getOwnPropertyDescriptor(globalThis, 'document'), navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:fake/1';
  URL.revokeObjectURL = (u) => log.revoked.push(u);
  const body = { append: () => {} };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body,
      createElement: () => {
        const a = { style: {}, remove() {}, click: () => log.clicks.push({ href: a.href, download: a.download }) };
        return a;
      },
    },
  });
  const nav = {};
  if (share) {
    nav.share = async (data) => {
      log.shared.push(data);
      return share(data);
    };
    nav.canShare = canShare;
  }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
  const restore = () => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  };
  return { log, restore };
}

test('downloadBlob clicks a download link with a safe name, and reports failure instead of throwing', () => {
  const { log, restore } = fakeBrowser();
  try {
    assert.equal(downloadBlob(new Blob(['x']), 'Ava/story.wav'), true);
    assert.deepEqual(log.clicks, [{ href: 'blob:fake/1', download: 'Ava-story.wav' }]);
  } finally {
    restore();
  }
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  delete globalThis.document;
  assert.equal(downloadBlob(new Blob(['x']), 'a.wav'), false, 'no document (node)');
  if (saved) Object.defineProperty(globalThis, 'document', saved);
});

test('shareOrDownload uses the share sheet with a named file when the phone can share files', async () => {
  const { log, restore } = fakeBrowser({ share: async () => {} });
  try {
    const r = await shareOrDownload(new Blob(['RIFF'], { type: 'audio/wav' }), 'goal-ava.wav', { title: 'Goal, Ava!', text: 'Read by Grandma' });
    assert.equal(r, 'shared');
    assert.equal(log.shared.length, 1);
    const [file] = log.shared[0].files;
    assert.equal(file.name, 'goal-ava.wav');
    assert.equal(file.type, 'audio/wav');
    assert.equal(log.shared[0].title, 'Goal, Ava!');
    assert.equal(log.shared[0].text, 'Read by Grandma');
    assert.equal(log.clicks.length, 0);
  } finally {
    restore();
  }
});

test('shareOrDownload: closing the share sheet is "cancelled" (no surprise download)', async () => {
  const { log, restore } = fakeBrowser({ share: async () => Promise.reject(new DOMException('Share canceled', 'AbortError')) });
  try {
    assert.equal(await shareOrDownload(new Blob(['x'], { type: 'audio/wav' }), 'a.wav'), 'cancelled');
    assert.equal(log.clicks.length, 0);
  } finally {
    restore();
  }
});

test('shareOrDownload falls back to a download: no share API, files not shareable, or sharing blocked', async () => {
  for (const setup of [
    {},
    { share: async () => {}, canShare: () => false },
    { share: async () => Promise.reject(new DOMException('Must be handling a user gesture', 'NotAllowedError')) },
    { share: async () => {}, canShare: () => { throw new TypeError('bad'); } },
  ]) {
    const { log, restore } = fakeBrowser(setup);
    try {
      assert.equal(await shareOrDownload(new Blob(['x'], { type: 'audio/wav' }), 'a.wav'), 'downloaded');
      assert.equal(log.clicks.length, 1);
    } finally {
      restore();
    }
  }
});
