import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findTrimBounds,
  encodeWav,
  normalise,
  fadeEdges,
  pickMimeType,
  levelFromRms,
  createEndpointer,
  isRecordingSupported,
  recordName,
  playBlob,
  processRecording,
  RecorderError,
  RECORDER_MESSAGES,
} from '../../js/audio/recorder.js';

const SR = 16000;

/** silence, then a tone burst, then silence (with a little noise throughout). */
function burst({ leadMs = 500, toneMs = 400, tailMs = 600, amp = 0.5, noise = 0.001, freq = 220 } = {}) {
  const n = Math.round(((leadMs + toneMs + tailMs) * SR) / 1000);
  const s = new Float32Array(n);
  const a = Math.round((leadMs * SR) / 1000);
  const b = a + Math.round((toneMs * SR) / 1000);
  let seed = 1;
  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    s[i] = (seed / 2147483647 - 0.5) * 2 * noise;
    if (i >= a && i < b) s[i] += amp * Math.sin((2 * Math.PI * freq * i) / SR);
  }
  return { s, a, b };
}

const ms = (samples) => (samples * 1000) / SR;

test('findTrimBounds keeps the speech plus ~80 ms either side', () => {
  const { s, a, b } = burst();
  const { start, end, peak } = findTrimBounds(s, SR);
  assert.ok(Math.abs(ms(a - start) - 80) <= 12, `lead-in ${ms(a - start)} ms`);
  assert.ok(Math.abs(ms(end - b) - 80) <= 12, `tail ${ms(end - b)} ms`);
  assert.ok(peak > 0.49 && peak < 0.52);
});

test('findTrimBounds: threshold is relative to the loudest part, so quiet recordings still trim', () => {
  const { s, a, b } = burst({ amp: 0.02, noise: 0.0005 });
  const { start, end } = findTrimBounds(s, SR);
  assert.ok(start > 0 && start <= a && a - start <= (100 * SR) / 1000);
  assert.ok(end >= b && end < s.length);
});

test('findTrimBounds ignores a short click (tapping the screen, the mic switching on)', () => {
  const { s, a } = burst({ leadMs: 600 });
  for (let i = 100; i < 140; i++) s[i] = i % 2 ? 0.9 : -0.9; // 2.5 ms click, louder than the speech
  const { start } = findTrimBounds(s, SR);
  assert.ok(start > 400, `start at sample ${start}, speech at ${a}`);
});

test('findTrimBounds keeps quiet consonants between louder syllables', () => {
  // "Sh-" (quiet) then "-vawn" (loud): the soft onset must not be cut.
  const { s } = burst({ leadMs: 300, toneMs: 300, tailMs: 300, amp: 0.6 });
  const onset = Math.round((150 * SR) / 1000);
  for (let i = onset; i < Math.round((300 * SR) / 1000); i++) s[i] += 0.06 * Math.sin(i * 1.7);
  const { start } = findTrimBounds(s, SR);
  assert.ok(start <= onset, `start ${ms(start)} ms should be at or before the "sh" at ${ms(onset)} ms`);
});

test('findTrimBounds on silence, empty input and clamping at the edges', () => {
  assert.deepEqual(findTrimBounds(new Float32Array(SR), SR), { start: 0, end: 0, peak: 0 });
  assert.deepEqual(findTrimBounds(new Float32Array(0), SR), { start: 0, end: 0, peak: 0 });
  const { s } = burst({ leadMs: 0, tailMs: 0, toneMs: 300 });
  const { start, end } = findTrimBounds(s, SR);
  assert.equal(start, 0);
  assert.equal(end, s.length);
});

test('normalise brings the peak to about -1 dBFS, but never boosts noise wildly', () => {
  const { samples, gain } = normalise(Float32Array.from([0, 0.25, -0.5, 0.1]));
  const peak = Math.max(...samples.map(Math.abs));
  assert.ok(Math.abs(peak - 10 ** (-1 / 20)) < 1e-6);
  assert.ok(Math.abs(gain - 10 ** (-1 / 20) / 0.5) < 1e-6);
  const quiet = normalise(Float32Array.from([0.0001, -0.0001]));
  assert.ok(quiet.gain <= 10 ** (30 / 20) + 1e-9);
  assert.equal(normalise(new Float32Array(3)).gain, 1);
});

test('fadeEdges ramps the first and last few ms to zero', () => {
  const s = new Float32Array(1000).fill(1);
  fadeEdges(s, SR, 8);
  assert.equal(s[0], 0);
  assert.equal(s[999], 0);
  // 8 ms at 16 kHz = 128 samples of fade at each end.
  assert.ok(s[128] === 1 && s[500] === 1 && s[871] === 1);
  assert.ok(s[64] > 0.45 && s[64] < 0.55);
  assert.ok(s[935] > 0.45 && s[935] < 0.55);
});

test('encodeWav writes a valid 16-bit mono PCM WAV', () => {
  const samples = Float32Array.from([0, 0.5, -0.5, 1, -1, 2, -2]);
  const buf = encodeWav(samples, 44100);
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(buf.byteLength, 44 + samples.length * 2);
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(v.getUint32(4, true), buf.byteLength - 8);
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(str(12, 4), 'fmt ');
  assert.equal(v.getUint32(16, true), 16);
  assert.equal(v.getUint16(20, true), 1); // PCM
  assert.equal(v.getUint16(22, true), 1); // mono
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(28, true), 88200);
  assert.equal(v.getUint16(32, true), 2);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(str(36, 4), 'data');
  assert.equal(v.getUint32(40, true), samples.length * 2);
  const pcm = [...Array(samples.length)].map((_, i) => v.getInt16(44 + i * 2, true));
  assert.deepEqual(pcm, [0, 16384, -16384, 32767, -32768, 32767, -32768]);
});

test('encodeWav handles an empty recording and odd sample rates', () => {
  const buf = encodeWav(new Float32Array(0), 22050.4);
  assert.equal(buf.byteLength, 44);
  assert.equal(new DataView(buf).getUint32(24, true), 22050);
});

test('pickMimeType prefers webm/opus, mp4 on Apple, and falls back gracefully', () => {
  const chrome = (t) => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].includes(t);
  const safari = (t) => ['audio/mp4', 'audio/webm;codecs=opus'].includes(t);
  const firefox = (t) => ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'].includes(t);
  assert.equal(pickMimeType(chrome, { preferMp4: false }), 'audio/webm;codecs=opus');
  assert.equal(pickMimeType(safari, { preferMp4: true }), 'audio/mp4');
  assert.equal(pickMimeType(firefox, { preferMp4: false }), 'audio/webm;codecs=opus');
  assert.equal(pickMimeType(() => false), '');
  assert.equal(
    pickMimeType(() => {
      throw new Error('old browser');
    }),
    '',
  );
});

test('levelFromRms maps loudness to a lively 0..1 meter', () => {
  assert.equal(levelFromRms(0), 0);
  assert.equal(levelFromRms(NaN), 0);
  assert.equal(levelFromRms(1), 1);
  assert.ok(levelFromRms(0.01) > 0.2 && levelFromRms(0.01) < 0.5);
  assert.ok(levelFromRms(0.1) > levelFromRms(0.01));
});

test('the endpointer stops ~0.8 s after the name is said, not on the silence before it', () => {
  const ep = createEndpointer({ tickMs: 40 });
  const feed = (level, n) => {
    for (let i = 0; i < n; i++) if (ep.push(level)) return i;
    return -1;
  };
  assert.equal(feed(0.05, 40), -1, 'silence before speaking never stops it');
  assert.equal(ep.heard, false);
  assert.equal(feed(0.8, 10), -1);
  assert.equal(ep.heard, true);
  const at = feed(0.05, 40);
  assert.ok(at >= 19 && at <= 21, `stopped after ${at * 40} ms of quiet`);
  // A pause inside a double name ("Mary ... Kate") shorter than 0.8 s keeps going.
  const ep2 = createEndpointer({ tickMs: 40 });
  for (let i = 0; i < 5; i++) ep2.push(0.8);
  let stopped = false;
  for (let i = 0; i < 12; i++) stopped ||= ep2.push(0.1);
  for (let i = 0; i < 5; i++) stopped ||= ep2.push(0.8);
  assert.equal(stopped, false);
});

test('recordName fails soft with a friendly, coded error when recording is impossible', async () => {
  assert.equal(isRecordingSupported(), false); // node: no microphone
  await assert.rejects(recordName(), (err) => err instanceof RecorderError && err.code === 'unsupported' && err.message === RECORDER_MESSAGES.unsupported);
});

test('recordName maps getUserMedia failures to parent-friendly codes and always stops the mic', async () => {
  const saved = { nav: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), MR: globalThis.MediaRecorder };
  const cases = [
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-mic'],
    ['NotReadableError', 'busy'],
    ['WeirdError', 'failed'],
  ];
  try {
    globalThis.MediaRecorder = function MediaRecorder() {};
    for (const [name, code] of cases) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { mediaDevices: { getUserMedia: async () => Promise.reject(Object.assign(new Error(name), { name })) } },
      });
      await assert.rejects(recordName(), (err) => err.code === code && err.message === RECORDER_MESSAGES[code]);
    }
    // Aborted while the permission prompt was up: the mic we then get is released.
    let stopped = 0;
    const ac = new AbortController();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: async () => {
            ac.abort();
            return { getTracks: () => [{ stop: () => stopped++ }] };
          },
        },
      },
    });
    await assert.rejects(recordName({ signal: ac.signal }), (err) => err.code === 'aborted');
    assert.equal(stopped, 1);
  } finally {
    if (saved.nav) Object.defineProperty(globalThis, 'navigator', saved.nav);
    if (saved.MR) globalThis.MediaRecorder = saved.MR;
    else delete globalThis.MediaRecorder;
  }
});

test('processRecording returns the original blob when it cannot be decoded', async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' });
  const r = await processRecording(blob, { fallbackDurationMs: 1234.4 });
  assert.equal(r.blob, blob);
  assert.equal(r.durationMs, 1234);
  assert.equal(r.processed, false);
});

test('playBlob rejects (so the narrator can fall back) when nothing can play it, and ignores aborted calls', async () => {
  await assert.rejects(playBlob(null));
  await assert.rejects(playBlob(new Blob([new Uint8Array(4)])));
  const ac = new AbortController();
  ac.abort();
  await playBlob(new Blob([new Uint8Array(4)]), { signal: ac.signal });
});
