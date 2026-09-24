// How long is a recorded clip? The reader needs the real length of a
// grown-up's recording to stretch the read-along highlight across it.
//
// An <audio> element's metadata is cheap and usually enough (our recordings
// are WAV). Recordings straight from MediaRecorder (WebM/Opus in Chrome) often
// report an Infinity duration, so fall back to decoding the audio. Never
// throws: resolves null when the length can't be found.

/**
 * @param {Blob} blob
 * @param {{timeoutMs?: number, Audio?: any, OfflineAudioContext?: any, URL?: any}} [deps] injectable for tests
 * @returns {Promise<number|null>} milliseconds
 */
export async function clipDurationMs(blob, deps = {}) {
  if (!blob || !(blob.size > 0)) return null;
  const timeoutMs = deps.timeoutMs ?? 3000;
  const fromElement = await withTimeout(elementDuration(blob, deps), timeoutMs).catch(() => null);
  if (fromElement > 0) return fromElement;
  const decoded = await withTimeout(decodedDuration(blob, deps), timeoutMs).catch(() => null);
  return decoded > 0 ? decoded : null;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      },
    );
  });
}

function elementDuration(blob, deps) {
  return new Promise((resolve) => {
    const AudioCtor = 'Audio' in deps ? deps.Audio : globalThis.Audio;
    const Url = deps.URL ?? globalThis.URL;
    if (typeof AudioCtor !== 'function' || !Url?.createObjectURL) return resolve(null);
    let url = null;
    let audio = null;
    const finish = (ms) => {
      if (audio) audio.onloadedmetadata = audio.onerror = audio.ondurationchange = null;
      try {
        audio?.removeAttribute?.('src');
        audio?.load?.();
      } catch {
        /* ignore */
      }
      try {
        if (url) Url.revokeObjectURL?.(url);
      } catch {
        /* ignore */
      }
      resolve(ms);
    };
    try {
      url = Url.createObjectURL(blob);
      audio = new AudioCtor();
      audio.preload = 'metadata';
      audio.muted = true;
      audio.onloadedmetadata = () => {
        const d = Number(audio.duration);
        finish(Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null);
      };
      audio.onerror = () => finish(null);
      audio.src = url;
      audio.load?.();
    } catch {
      finish(null);
    }
  });
}

async function decodedDuration(blob, deps) {
  const OAC = 'OfflineAudioContext' in deps ? deps.OfflineAudioContext : globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof OAC !== 'function') return null;
  const bytes = await blob.arrayBuffer();
  const ctx = new OAC(1, 1, 44100);
  const buffer = await new Promise((resolve, reject) => {
    try {
      // Old Safari only has the callback form; new browsers also return a promise.
      const p = ctx.decodeAudioData(bytes.slice(0), resolve, reject);
      p?.then?.(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });
  const d = Number(buffer?.duration);
  return Number.isFinite(d) && d > 0 ? Math.round(d * 1000) : null;
}
