// Recording the grown-up saying the child's name, as a last-resort
// pronunciation: the story plays this clip wherever the plain name appears.
//
// Phones record in different formats (webm/opus on Chrome and Android,
// mp4/AAC on iOS), and some can't play back what others record, so after
// recording we decode, trim the silence around the name, bring it up to a
// consistent loudness and re-encode it as a plain 16-bit mono WAV that every
// browser can play. If decoding fails we keep the original recording.
//
// The recording never leaves the device (it is stored with storage.blobs).

import { getAudioContext, unlockAudio } from './sfx.js';

export const RECORDER_MESSAGES = Object.freeze({
  unsupported: "This browser can't record sound. You can type how the name sounds instead.",
  denied: 'To record the name, please allow the microphone when your browser asks (or in its settings). You can also type how the name sounds instead.',
  'no-mic': "We couldn't find a microphone on this device. You can type how the name sounds instead.",
  busy: 'The microphone is busy in another app. Close that app and try again.',
  silent: "We couldn't hear anything. Try again, a little closer to the phone.",
  aborted: 'Recording cancelled.',
  failed: 'Something went wrong while recording. Please try again.',
});

/** Error with a `code` (a key of RECORDER_MESSAGES) and a parent-friendly message. */
export class RecorderError extends Error {
  constructor(code, cause) {
    super(RECORDER_MESSAGES[code] ?? RECORDER_MESSAGES.failed);
    this.name = 'RecorderError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/** Can this browser record from the microphone? (needs https or localhost) */
export function isRecordingSupported() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && typeof globalThis.MediaRecorder === 'function');
}

const WEBM_FIRST = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/wav'];
const MP4_FIRST = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/wav'];

/** Safari (and every iOS browser, which are all Safari underneath) records and decodes mp4 most reliably. */
function isAppleWebKit(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent ?? '');
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && Number(nav?.maxTouchPoints ?? 0) > 1) return true;
  return /AppleWebKit/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|Firefox|FxiOS/i.test(ua);
}

/**
 * Best MediaRecorder format this browser supports ('' = let the browser choose).
 * @param {(type: string) => boolean} [isTypeSupported]
 * @param {{preferMp4?: boolean}} [opts]
 */
export function pickMimeType(isTypeSupported = (t) => globalThis.MediaRecorder?.isTypeSupported?.(t), { preferMp4 = isAppleWebKit() } = {}) {
  for (const type of preferMp4 ? MP4_FIRST : WEBM_FIRST) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      /* try the next */
    }
  }
  return '';
}

// ---- Pure sample helpers (unit-tested in node) -------------------------------

/**
 * Where the speech starts and ends, ignoring silence (and short clicks) at
 * either end. Loudness is measured in short windows; a window counts as sound
 * when it is within `thresholdRatio` of the loudest window, and speech must
 * last `minRunMs` so a tap on the screen or the mic switching on isn't kept.
 * `padMs` of lead-in/out is kept so soft sounds like "Sh" or "H" survive.
 *
 * @param {Float32Array|number[]} samples mono, -1..1
 * @param {number} sampleRate
 * @param {{thresholdRatio?: number, floor?: number, padMs?: number, windowMs?: number, minRunMs?: number}} [opts]
 * @returns {{start: number, end: number, peak: number}} sample indices (end exclusive); start === end when silent
 */
export function findTrimBounds(samples, sampleRate, { thresholdRatio = 0.06, floor = 0.003, padMs = 80, windowMs = 10, minRunMs = 30 } = {}) {
  const n = samples?.length ?? 0;
  const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const count = Math.ceil(n / win);
  const rms = new Float64Array(count);
  let peak = 0;
  let loudest = 0;
  for (let w = 0; w < count; w++) {
    let sum = 0;
    const from = w * win;
    const to = Math.min(n, from + win);
    for (let i = from; i < to; i++) {
      const s = samples[i];
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
      sum += s * s;
    }
    rms[w] = Math.sqrt(sum / Math.max(1, to - from));
  }
  const run = Math.max(1, Math.round(minRunMs / windowMs));
  // A run of `run` loud windows is "sustained"; the loudest sustained level sets the threshold.
  const sustained = (w, thr) => {
    if (w + run > count) return false;
    for (let k = 0; k < run; k++) if (rms[w + k] < thr) return false;
    return true;
  };
  for (let w = 0; w + run <= count; w++) {
    let m = Infinity;
    for (let k = 0; k < run; k++) m = Math.min(m, rms[w + k]);
    if (m > loudest) loudest = m;
  }
  const thr = Math.max(loudest * thresholdRatio, floor);
  if (loudest < floor) return { start: 0, end: 0, peak };
  let first = -1;
  let last = -1;
  for (let w = 0; w < count; w++) {
    if (sustained(w, thr)) {
      if (first < 0) first = w;
      last = w + run - 1;
    }
  }
  if (first < 0) return { start: 0, end: 0, peak };
  const pad = Math.round((sampleRate * padMs) / 1000);
  return { start: Math.max(0, first * win - pad), end: Math.min(n, (last + 1) * win + pad), peak };
}

/**
 * Scale so the loudest sample sits at `targetDb` dBFS (default about -1 dB),
 * without boosting a near-silent recording into a wall of hiss.
 * @returns {{samples: Float32Array, gain: number}}
 */
export function normalise(samples, { targetDb = -1, maxGainDb = 30 } = {}) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const target = 10 ** (targetDb / 20);
  const gain = peak > 0 ? Math.min(target / peak, 10 ** (maxGainDb / 20)) : 1;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return { samples: out, gain };
}

/** Short fade in/out (in place) so trimmed edges don't click. */
export function fadeEdges(samples, sampleRate, ms = 8) {
  const n = Math.min(Math.floor(samples.length / 2), Math.round((sampleRate * ms) / 1000));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    samples[i] *= g;
    samples[samples.length - 1 - i] *= g;
  }
  return samples;
}

/**
 * Encode mono float samples as a 16-bit PCM WAV file.
 * @returns {ArrayBuffer}
 */
export function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  const rate = Math.round(sampleRate);
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, Number(samples[i]) || 0));
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return buf;
}

// ---- Decoding ---------------------------------------------------------------

/** decodeAudioData as a promise, for both the callback-only (old Safari) and promise forms. */
export function decodeWith(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      // Old Safari only has the callback form; new browsers return a promise too.
      const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      p?.then?.(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
}

/** Decode a recording without needing a running (gesture-unlocked) AudioContext. */
async function decodeBlob(blob) {
  const bytes = await blob.arrayBuffer();
  const live = getAudioContext({ create: false });
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const rate = live?.sampleRate || 48000;
  const ctx = OAC ? new OAC(1, 1, rate) : live;
  if (!ctx) throw new Error('No Web Audio');
  // decodeAudioData detaches its input in some browsers; always hand it a copy.
  return decodeWith(ctx, bytes.slice(0));
}

function mixDown(audioBuffer) {
  const channels = audioBuffer.numberOfChannels || 1;
  const len = audioBuffer.length;
  if (channels === 1) return Float32Array.from(audioBuffer.getChannelData(0));
  const out = new Float32Array(len);
  for (let c = 0; c < channels; c++) {
    const d = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += d[i] / channels;
  }
  return out;
}

const SILENT_PEAK = 0.01; // about -40 dBFS

/**
 * Trim, normalise and convert a recording to WAV.
 * @returns {Promise<{blob: Blob, durationMs: number, processed: boolean}>}
 * @throws {RecorderError} 'silent' when nothing audible was recorded
 */
export async function processRecording(blob, { fallbackDurationMs = 0 } = {}) {
  let decoded;
  try {
    decoded = await decodeBlob(blob);
  } catch {
    return { blob, durationMs: Math.round(fallbackDurationMs), processed: false };
  }
  const sr = decoded.sampleRate;
  const mono = mixDown(decoded);
  const { start, end, peak } = findTrimBounds(mono, sr);
  if (peak < SILENT_PEAK || end - start < sr * 0.08) throw new RecorderError('silent');
  const { samples } = normalise(fadeEdges(mono.slice(start, end), sr));
  const wav = encodeWav(samples, sr);
  return { blob: new Blob([wav], { type: 'audio/wav' }), durationMs: Math.round((samples.length / sr) * 1000), processed: true };
}

// ---- Recording --------------------------------------------------------------

function mediaErrorCode(err) {
  const name = err?.name ?? '';
  if (/NotAllowed|Security|PermissionDenied/i.test(name)) return 'denied';
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(name)) return 'no-mic';
  if (/NotReadable|TrackStart|Abort/i.test(name)) return 'busy';
  return 'failed';
}

async function openMic() {
  const md = globalThis.navigator.mediaDevices;
  const ideal = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
  try {
    return await md.getUserMedia({ audio: ideal });
  } catch (err) {
    // A few older browsers reject constraint objects they don't understand.
    if (/Overconstrained|TypeError/i.test(err?.name ?? '')) {
      try {
        return await md.getUserMedia({ audio: true });
      } catch (err2) {
        throw new RecorderError(mediaErrorCode(err2), err2);
      }
    }
    throw new RecorderError(mediaErrorCode(err), err);
  }
}

/** Map an RMS level to a lively 0..1 meter value (roughly -55 dB .. -10 dB). */
export function levelFromRms(rms) {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 55) / 45));
}

/**
 * Live input level via an AnalyserNode. Calls onTick(level) about 25 times a
 * second. Returns a stop function. Does nothing without Web Audio.
 */
function startMeter(stream, onTick) {
  const ctx = getAudioContext({ create: true });
  if (!ctx) return () => {};
  let src;
  let analyser;
  let timer = null;
  try {
    if (ctx.state !== 'running') ctx.resume?.()?.catch?.(() => {});
    src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser); // not to the speakers: no feedback
    const buf = new Float32Array(analyser.fftSize);
    const bytes = new Uint8Array(analyser.fftSize);
    let level = 0;
    timer = setInterval(() => {
      try {
        let sum = 0;
        if (analyser.getFloatTimeDomainData) {
          analyser.getFloatTimeDomainData(buf);
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        } else {
          analyser.getByteTimeDomainData(bytes);
          for (let i = 0; i < bytes.length; i++) sum += ((bytes[i] - 128) / 128) ** 2;
        }
        const target = levelFromRms(Math.sqrt(sum / analyser.fftSize));
        // Rise quickly, fall gently, like a real VU meter.
        level = target > level ? target : level * 0.8 + target * 0.2;
        onTick(level);
      } catch {
        /* ignore a bad frame */
      }
    }, 40);
  } catch {
    return () => {};
  }
  return () => {
    clearInterval(timer);
    try {
      src?.disconnect();
    } catch {
      /* ignore */
    }
  };
}

/**
 * Decide when the grown-up has finished saying the name: after we've heard
 * speech, ~0.8 s of quiet ends the recording (so they don't have to wait out
 * the full 4 seconds). Pure state machine fed with meter levels.
 */
export function createEndpointer({ tickMs = 40, speechLevel = 0.5, quietLevel = 0.3, minSpeechMs = 120, quietMs = 800, minTotalMs = 700 } = {}) {
  let loudFor = 0;
  let quietFor = 0;
  let heard = false;
  let elapsed = 0;
  return {
    /** @returns {boolean} true when recording should stop */
    push(level) {
      elapsed += tickMs;
      if (level >= speechLevel) {
        loudFor += tickMs;
        quietFor = 0;
        if (loudFor >= minSpeechMs) heard = true;
      } else {
        loudFor = 0;
        if (level < quietLevel) quietFor += tickMs;
      }
      return heard && quietFor >= quietMs && elapsed >= minTotalMs;
    },
    get heard() {
      return heard;
    },
  };
}

let activeRecording = null;

/**
 * Record the grown-up saying the name.
 * Stops after `maxMs`, when `signal` aborts (keeping what was recorded), or
 * shortly after they stop speaking (`autoStop`). Always releases the mic.
 *
 * @param {{maxMs?: number, onLevel?: (level: number) => void, signal?: AbortSignal, autoStop?: boolean}} [opts]
 * @returns {Promise<{blob: Blob, durationMs: number, processed: boolean}>} a WAV blob when processing worked
 * @throws {RecorderError} code: unsupported | denied | no-mic | busy | silent | aborted | failed
 */
export async function recordName({ maxMs = 4000, onLevel, signal, autoStop = true } = {}) {
  if (!isRecordingSupported()) throw new RecorderError('unsupported');
  if (signal?.aborted) throw new RecorderError('aborted');
  activeRecording?.abort();
  const mine = new AbortController();
  activeRecording = mine;
  unlockAudio(); // no-op outside a gesture; helps the level meter start on iOS

  const stream = await openMic();
  if (signal?.aborted || mine.signal.aborted) {
    stream.getTracks().forEach((t) => t.stop());
    throw new RecorderError('aborted');
  }
  const report = (level) => {
    try {
      onLevel?.(level);
    } catch {
      /* the UI's problem, not ours */
    }
  };
  let stopMeter = () => {};
  const started = Date.now();
  try {
    const mimeType = pickMimeType();
    let rec;
    try {
      rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      rec = new MediaRecorder(stream);
    }
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise((resolve) => {
      rec.onstop = resolve;
      rec.onerror = resolve;
    });

    let startError = null;
    await new Promise((resolve) => {
      const endpointer = createEndpointer();
      const timer = setTimeout(done, maxMs);
      function done() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        mine.signal.removeEventListener('abort', done);
        resolve();
      }
      signal?.addEventListener('abort', done, { once: true });
      mine.signal.addEventListener('abort', done, { once: true });
      stopMeter = startMeter(stream, (level) => {
        report(level);
        if (autoStop && endpointer.push(level)) done();
      });
      try {
        rec.start(250); // timeslice: some browsers only deliver data when asked
      } catch (err) {
        startError = err;
        done();
      }
    });
    if (startError) throw new RecorderError('failed', startError);

    try {
      if (rec.state !== 'inactive') rec.stop();
    } catch {
      /* already stopped */
    }
    await Promise.race([stopped, new Promise((r) => setTimeout(r, 1500))]);
    stopMeter();
    report(0);
    const type = rec.mimeType || mimeType || chunks[0]?.type || 'audio/webm';
    const raw = new Blob(chunks, { type });
    if (!raw.size) throw new RecorderError(mine.signal.aborted ? 'aborted' : 'failed');
    return await processRecording(raw, { fallbackDurationMs: Date.now() - started });
  } finally {
    stopMeter();
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    });
    if (activeRecording === mine) activeRecording = null;
  }
}

// ---- Playback ---------------------------------------------------------------

const decodedCache = new WeakMap();

function abortable(signal, onAbort) {
  if (!signal) return () => {};
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

const clampOffset = (ms, durationMs) => {
  const v = Number(ms);
  if (!(v > 0)) return 0;
  // Never seek to (or past) the very end: there would be nothing left to hear.
  return Number.isFinite(durationMs) && durationMs > 0 ? Math.min(v, Math.max(0, durationMs - 50)) : v;
};

/** Call a caller's hook without letting it break playback. */
function safeCall(fn, arg) {
  try {
    fn?.(arg);
  } catch {
    /* a highlight callback must never stop the sound */
  }
}

async function playWithWebAudio(blob, signal, volume, offsetMs, onStart) {
  const ctx = getAudioContext();
  if (!ctx) throw new Error('No Web Audio');
  if (ctx.state !== 'running') {
    await Promise.race([ctx.resume?.().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
    if (ctx.state !== 'running') throw new Error('Audio is locked');
  }
  let buffer = decodedCache.get(blob);
  if (!buffer) {
    buffer = await decodeWith(ctx, (await blob.arrayBuffer()).slice(0));
    decodedCache.set(blob, buffer);
  }
  if (signal?.aborted) return;
  const durationMs = buffer.duration * 1000;
  const offset = clampOffset(offsetMs, durationMs);
  await new Promise((resolve) => {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(ctx.destination);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      off();
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      resolve();
    };
    const off = abortable(signal, finish);
    src.onended = finish;
    // Belt and braces: a suspended context would never fire 'ended'.
    const watchdog = setTimeout(finish, durationMs - offset + 1000);
    src.start(0, offset / 1000);
    // What we hear lags the start call by the output latency (Bluetooth can be 100+ ms).
    const latencyMs = Math.max(0, Math.min(500, ((Number(ctx.outputLatency) || 0) + (Number(ctx.baseLatency) || 0)) * 1000));
    safeCall(onStart, { offsetMs: offset, durationMs, latencyMs, how: 'webaudio' });
  });
}

function playWithElement(blob, signal, volume, offsetMs, onStart) {
  return new Promise((resolve, reject) => {
    const Audio = globalThis.Audio;
    if (typeof Audio !== 'function') return reject(new Error('No audio element'));
    let url;
    try {
      url = URL.createObjectURL(blob);
    } catch (err) {
      return reject(err);
    }
    const audio = new Audio();
    let settled = false;
    let started = false;
    let watchdog = setTimeout(() => done(), 12000);
    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      off();
      audio.onended = audio.onerror = audio.onloadedmetadata = audio.onplaying = null;
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load?.();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
      if (err) reject(err);
      else resolve();
    };
    const off = abortable(signal, () => done());
    const known = () => Number.isFinite(audio.duration) && audio.duration > 0;
    audio.onended = () => done();
    audio.onerror = () => done(new Error('Could not play the recording'));
    audio.onloadedmetadata = () => {
      const durationMs = known() ? audio.duration * 1000 : NaN;
      const offset = clampOffset(offsetMs, durationMs);
      if (offset > 0) {
        try {
          audio.currentTime = offset / 1000;
        } catch {
          /* can't seek: it plays from the start and onStart says so */
        }
      }
      if (known()) {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => done(), audio.duration * 1000 - offset + 1500);
      }
    };
    // 'playing' fires when sound actually starts (after any seek).
    audio.onplaying = () => {
      if (started) return;
      started = true;
      safeCall(onStart, { offsetMs: Math.max(0, (Number(audio.currentTime) || 0) * 1000), durationMs: known() ? audio.duration * 1000 : null, latencyMs: 0, how: 'element' });
    };
    audio.setAttribute('playsinline', '');
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.src = url;
    try {
      const p = audio.play();
      p?.catch?.((err) => done(err));
    } catch (err) {
      done(err);
    }
  });
}

/**
 * Play a recording. Resolves when it ends or `signal` aborts; rejects if it
 * can't be played at all (so the narrator can fall back to the voice).
 * Uses the shared, gesture-unlocked AudioContext first (so it plays on iOS
 * mid-story without another tap), then an <audio> element.
 * @param {Blob} blob
 * @param {{signal?: AbortSignal, volume?: number, offsetMs?: number,
 *   onStart?: (info: {offsetMs: number, durationMs: number|null, latencyMs: number, how: 'webaudio'|'element'}) => void}} [opts]
 *   offsetMs: start this far into the clip (a paused reading carrying on); it is clamped to the clip.
 *   onStart: called once, the moment the sound really starts (after decoding and seeking), with where in
 *   the clip it started — so read-along highlighting can follow the real start rather than a guess.
 * @returns {Promise<void>}
 */
export async function playBlob(blob, { signal, volume = 1, offsetMs = 0, onStart } = {}) {
  if (!blob || !blob.size) throw new Error('Nothing to play');
  if (signal?.aborted) return;
  try {
    await playWithWebAudio(blob, signal, volume, offsetMs, onStart);
    return;
  } catch {
    if (signal?.aborted) return;
  }
  await playWithElement(blob, signal, volume, offsetMs, onStart);
}
