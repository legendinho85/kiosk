// Audio tools for family features: join recorded clips into one WAV file (a
// grown-up's reading of the whole book, a gift message) and hand files to the
// parent — through the share sheet where the phone has one, as a download
// otherwise.
//
// Everything here runs on the device. Decoding uses Web Audio (an
// OfflineAudioContext, so it works without a tap); the joining, resampling,
// chime and WAV encoding are plain maths on Float32Arrays, unit-tested in node.

import { encodeWav, decodeWith } from './recorder.js';
import { getAudioContext } from './sfx.js';

export const MIX_MESSAGES = Object.freeze({
  'no-audio': "This browser can't read the recordings, so they can't be joined into one file here.",
  'nothing-decoded': "We couldn't read any of the recordings. Try recording them again.",
  empty: 'There was nothing to save.',
});

/** Error with a `code` (a key of MIX_MESSAGES) and a parent-friendly message. */
export class MixError extends Error {
  constructor(code, cause) {
    super(MIX_MESSAGES[code] ?? MIX_MESSAGES['nothing-decoded']);
    this.name = 'MixError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

// ---- Pure sample helpers (unit-tested in node) -------------------------------

/**
 * Average several channels into one.
 * @param {ArrayLike<number>[]} channels
 * @returns {Float32Array}
 */
export function mixToMono(channels) {
  const list = (channels ?? []).filter(Boolean);
  if (!list.length) return new Float32Array(0);
  const len = Math.max(...list.map((c) => c.length));
  const out = new Float32Array(len);
  for (const c of list) for (let i = 0; i < c.length; i++) out[i] += c[i] / list.length;
  return out;
}

/**
 * Resample by linear interpolation. When going down in rate (48 kHz -> 22.05
 * kHz), each output sample first averages the input samples it covers, a
 * cheap low-pass that keeps "s" sounds from turning into whistles (aliasing).
 * @param {ArrayLike<number>} samples
 * @param {number} fromRate
 * @param {number} toRate
 * @returns {Float32Array}
 */
export function resampleLinear(samples, fromRate, toRate) {
  const n = samples?.length ?? 0;
  if (!n) return new Float32Array(0);
  if (!(fromRate > 0) || !(toRate > 0) || fromRate === toRate) return Float32Array.from(samples);
  const ratio = fromRate / toRate; // input samples per output sample
  const outLen = Math.max(1, Math.round(n / ratio));
  const out = new Float32Array(outLen);
  const at = (i) => samples[i < 0 ? 0 : i >= n ? n - 1 : i];
  const lerp = (pos) => {
    const i = Math.floor(pos);
    const f = pos - i;
    return at(i) + (at(i + 1) - at(i)) * f;
  };
  if (ratio <= 1) {
    for (let k = 0; k < outLen; k++) out[k] = lerp(k * ratio);
    return out;
  }
  // Downsampling: average `taps` interpolated points spread across the window.
  const taps = Math.max(2, Math.ceil(ratio));
  for (let k = 0; k < outLen; k++) {
    const centre = k * ratio;
    let sum = 0;
    for (let t = 0; t < taps; t++) sum += lerp(centre + ((t + 0.5) / taps - 0.5) * ratio);
    out[k] = sum / taps;
  }
  return out;
}

/** @returns {Float32Array} `ms` of silence at `rate` */
export function silence(ms, rate) {
  return new Float32Array(Math.max(0, Math.round(((Number(ms) || 0) * rate) / 1000)));
}

/**
 * Join sample arrays end to end.
 * @param {ArrayLike<number>[]} chunks
 * @returns {Float32Array}
 */
export function concatSamples(chunks) {
  const list = (chunks ?? []).filter((c) => c && c.length);
  const out = new Float32Array(list.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of list) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * A soft two-note chime (a rising "ding-dong", G5 then C6), like a page-turn
 * signal on a story CD. Bell-ish: a sine with quiet harmonics, each fading on
 * its own; gentle attack, no click at the end.
 * @param {number} rate sample rate
 * @param {{notes?: Array<[number, number]>, gain?: number, durationMs?: number}} [opts]
 *   notes: [frequency Hz, start seconds]; gain: peak level (0.3 ≈ -10 dBFS, well under speech)
 * @returns {Float32Array}
 */
export function synthChime(rate, { notes = [[783.99, 0], [1046.5, 0.24]], gain = 0.3, durationMs = 1400 } = {}) {
  const len = Math.max(1, Math.round((durationMs * rate) / 1000));
  const out = new Float32Array(len);
  const partials = [
    [1, 1, 0.42], // [ratio, level, decay seconds]
    [2, 0.22, 0.2],
    [3, 0.06, 0.12],
  ];
  const attack = 0.006;
  for (const [freq, start] of notes) {
    const s0 = Math.round(start * rate);
    for (let i = s0; i < len; i++) {
      const t = (i - s0) / rate;
      const env = t < attack ? t / attack : 1;
      let v = 0;
      for (const [ratio, level, decay] of partials) {
        if (freq * ratio >= rate / 2) continue; // above Nyquist at low sample rates
        v += level * Math.exp(-(t - Math.min(t, attack)) / decay) * Math.sin(2 * Math.PI * freq * ratio * t);
      }
      out[i] += env * v;
    }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const scale = peak > 0 ? gain / peak : 0;
  const fade = Math.min(len, Math.round(rate * 0.05));
  for (let i = 0; i < len; i++) {
    out[i] *= scale;
    const left = len - 1 - i;
    if (left < fade) out[i] *= left / fade;
  }
  return out;
}

/** Scale down (never up) so nothing clips. In place; returns the gain used. */
export function preventClipping(samples, ceiling = 0.98) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak <= ceiling) return 1;
  const g = ceiling / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= g;
  return g;
}

// ---- Decoding ---------------------------------------------------------------

const isBlob = (x) => Boolean(x && typeof x === 'object' && typeof x.arrayBuffer === 'function' && typeof x.size === 'number');

function channelsOf(buffer) {
  const out = [];
  for (let c = 0; c < (buffer.numberOfChannels || 1); c++) out.push(buffer.getChannelData(c));
  return out;
}

/**
 * Decoders to try, best first: an offline context at the target rate (the
 * browser resamples for us, properly), one at 44.1 kHz (old Safari only takes
 * common rates), and finally the app's live context.
 */
function* decoders(rate) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  for (const r of [rate, 44100]) {
    if (!OAC) break;
    try {
      yield new OAC(1, 1, r);
    } catch {
      /* this rate isn't allowed here */
    }
  }
  const live = getAudioContext({ create: false });
  if (live) yield live;
}

/**
 * Decode a recording (any format the browser can play) to mono samples at `rate`.
 * @returns {Promise<Float32Array>}
 */
export async function decodeToMono(blob, rate) {
  const bytes = await blob.arrayBuffer();
  let lastErr = new MixError('no-audio');
  for (const ctx of decoders(rate)) {
    try {
      // decodeAudioData detaches its input in some browsers; always hand it a copy.
      const buf = await decodeWith(ctx, bytes.slice(0));
      const mono = mixToMono(channelsOf(buf));
      return buf.sampleRate === rate ? mono : resampleLinear(mono, buf.sampleRate, rate);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Join recordings, silences and soft chimes into one 16-bit mono WAV.
 * Recordings that can't be decoded are skipped (reported through `onSkip`);
 * if none can be decoded the promise rejects with a MixError.
 *
 * @param {Array<Blob | {silenceMs: number} | {chime: true}>} parts
 * @param {{sampleRate?: number, onProgress?: (fraction: number) => void, onSkip?: (index: number, err: unknown) => void}} [opts]
 * @returns {Promise<Blob>} audio/wav
 * @throws {MixError} code: no-audio | nothing-decoded | empty
 */
export async function concatToWav(parts, { sampleRate = 22050, onProgress, onSkip } = {}) {
  const rate = Math.min(48000, Math.max(8000, Math.round(Number(sampleRate) || 22050)));
  const list = Array.isArray(parts) ? parts : [];
  const chunks = [];
  let clips = 0;
  let decoded = 0;
  let lastErr = null;
  const tell = (fn, ...args) => {
    try {
      fn?.(...args);
    } catch {
      /* the UI's problem, not ours */
    }
  };
  // One at a time: a whole book of recordings decoded at once can use a lot of memory on a phone.
  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    if (isBlob(part)) {
      clips += 1;
      try {
        chunks.push(await decodeToMono(part, rate));
        decoded += 1;
      } catch (err) {
        lastErr = err;
        tell(onSkip, i, err);
      }
    } else if (part && part.chime) {
      chunks.push(synthChime(rate));
    } else if (part && Number(part.silenceMs) > 0) {
      chunks.push(silence(part.silenceMs, rate));
    }
    tell(onProgress, (i + 1) / list.length);
  }
  if (clips && !decoded) throw lastErr instanceof MixError ? lastErr : new MixError('nothing-decoded', lastErr);
  const samples = concatSamples(chunks);
  if (!samples.length) throw new MixError('empty');
  preventClipping(samples);
  return new Blob([encodeWav(samples, rate)], { type: 'audio/wav' });
}

// ---- Handing files to the parent ----------------------------------------------

/** A filename that every phone and computer will accept. */
export function safeFilename(name, fallback = 'download') {
  const s = String(name ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.-]+|[\s.]+$/g, '')
    .slice(0, 120);
  return s || fallback;
}

/**
 * Save a file with the browser's download (iOS shows it in Files > Downloads).
 * @returns {boolean} false if the browser couldn't even start it
 */
export function downloadBlob(blob, filename) {
  try {
    const doc = globalThis.document;
    if (!doc?.createElement || !globalThis.URL?.createObjectURL) return false;
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = safeFilename(filename);
    a.rel = 'noopener';
    a.style.display = 'none';
    (doc.body ?? doc.documentElement).append(a);
    a.click();
    a.remove();
    // iOS reads the file after the click returns; give it a minute before letting go.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}

function asFile(blob, filename) {
  const name = safeFilename(filename);
  try {
    return new File([blob], name, { type: blob.type || 'application/octet-stream', lastModified: Date.now() });
  } catch {
    return null; // very old Safari: no File constructor
  }
}

/**
 * Offer a file through the phone's share sheet (WhatsApp, AirDrop, Files,
 * email, the Yoto app…), falling back to a download where files can't be
 * shared (most desktop browsers, older phones, embedded frames).
 * Call it straight from a tap: browsers only open the share sheet in response
 * to one.
 * @param {Blob} blob
 * @param {string} filename
 * @param {{title?: string, text?: string}} [opts]
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>} 'cancelled' when the parent closed the share sheet
 */
export async function shareOrDownload(blob, filename, { title, text } = {}) {
  const nav = globalThis.navigator;
  const file = blob ? asFile(blob, filename) : null;
  let canShare = false;
  try {
    canShare = Boolean(file && typeof nav?.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }));
  } catch {
    canShare = false;
  }
  if (canShare) {
    try {
      const data = { files: [file] };
      if (title) data.title = String(title);
      if (text) data.text = String(text);
      await nav.share(data);
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // NotAllowedError (no tap, or blocked in this frame), DataError, TypeError: save it instead.
    }
  }
  if (!blob) return 'cancelled';
  return downloadBlob(blob, filename) ? 'downloaded' : 'cancelled';
}
