// The app's long-lived services: the narrator (speech) and sound effects.
// Both come from modules other people own, loaded lazily; if either fails to
// load or throws, a quiet stand-in takes its place so every screen still
// works (narration then runs in "silent timed mode": words still light up in
// time, there's just no voice).

import { estimateTimeline, estimateUnitMs } from '../narrator/plan.js';

const scale = () => {
  const s = Number(globalThis.SB_TEST?.timeScale);
  return Number.isFinite(s) && s > 0 ? s : 1;
};

function wait(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms * scale());
    const onAbort = () => {
      clearTimeout(t);
      resolve(false);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A narrator with the contract's shape that never makes a sound: it walks the
 * words on the estimated timeline and resolves, so highlighting still works.
 * @param {{getSettings?: () => {rate?: number}}} [deps]
 */
export function createQuietNarrator({ getSettings = () => ({}) } = {}) {
  let job = null;
  const rate = () => Number(getSettings()?.rate) || 1;
  const begin = (signal) => {
    job?.abort();
    const ac = new AbortController();
    if (signal) signal.aborted ? ac.abort() : signal.addEventListener('abort', () => ac.abort(), { once: true });
    job = ac;
    return ac;
  };
  async function walk(segment, ac, show, rateScale) {
    for (const t of estimateTimeline(segment, rate() * rateScale)) {
      show(t);
      if (!(await wait(t.dur, ac.signal))) return false;
    }
    return true;
  }
  return {
    supported: false,
    ready: Promise.resolve([]),
    hasVoice: () => false,
    listVoices: () => [],
    currentVoice: () => null,
    unlock() {},
    mode: 'silent',
    needsGesture: false,
    async speakText(text, { signal, onUnit, rateScale = 1 } = {}) {
      const ac = begin(signal);
      const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        try {
          onUnit?.(i);
        } catch {
          /* ignore */
        }
        const ms = estimateUnitMs(words[i], rate() * rateScale);
        if (!(await wait(ms, ac.signal))) return 'stopped';
      }
      if (job === ac) job = null;
      return 'done';
    },
    async play(plan, { signal, onUnit, onSegment, rateScale = 1 } = {}) {
      const ac = begin(signal);
      const segs = plan?.segments ?? [];
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        try {
          onSegment?.(i);
        } catch {
          /* ignore */
        }
        if (seg.kind === 'pause') {
          if (!(await wait(seg.ms, ac.signal))) return 'stopped';
          continue;
        }
        const speech = seg.kind === 'speech' ? seg : { text: plan.lines?.[seg.line]?.units?.[seg.units[0].u]?.say ?? '', units: seg.units.map((x) => ({ ...x, start: 0, end: 1 })) };
        const ok = await walk(speech, ac, (t) => {
          try {
            onUnit?.(seg.line, t.u);
          } catch {
            /* ignore */
          }
        }, rateScale);
        if (!ok) return 'stopped';
      }
      if (job === ac) job = null;
      return 'done';
    },
    stop() {
      job?.abort();
      job = null;
    },
    get speaking() {
      return Boolean(job);
    },
  };
}

/** Sound effects that do nothing (when Web Audio or the module is missing). */
export function createQuietSfx() {
  return { names: [], unlock() {}, play: () => 0, ready: false };
}

/**
 * Create the narrator and sfx, falling back to quiet stand-ins.
 * @param {{getSettings: () => object, getRecording: (id: string) => Promise<Blob|null>}} deps
 * @returns {Promise<{narrator: object, sfx: object}>}
 */
export async function createServices({ getSettings, getRecording }) {
  const [narratorMod, sfxMod] = await Promise.all([
    import('../narrator/narrator.js').catch((err) => (console.warn('[app] narrator unavailable; reading silently', err?.message), null)),
    import('../audio/sfx.js').catch((err) => (console.warn('[app] sound effects unavailable', err?.message), null)),
  ]);
  let narrator = null;
  let sfx = null;
  try {
    narrator = narratorMod?.createNarrator?.({ getSettings, getRecording }) ?? null;
  } catch (err) {
    console.warn('[app] narrator failed to start; reading silently', err);
  }
  try {
    sfx = sfxMod?.createSfx?.({ enabled: () => getSettings()?.sfx !== false }) ?? null;
  } catch (err) {
    console.warn('[app] sound effects failed to start', err);
  }
  return { narrator: narrator ?? createQuietNarrator({ getSettings }), sfx: sfx ?? createQuietSfx() };
}

/**
 * Unlock speech and Web Audio on the first real user gesture. iOS and Chrome
 * only let a page make sound after a tap, and on touch screens the
 * activation arrives with the finger lifting, so we listen for several
 * events and stop once the browser reports the page as activated (and the
 * real services, which may still be loading, have had their turn).
 * @param {{narrator: object, sfx: object, real?: boolean}} services read at event time
 * @returns {() => void} stop listening
 */
export function armAudioUnlock(services) {
  const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  const opts = { capture: true, passive: true };
  const stop = () => events.forEach((t) => window.removeEventListener(t, handler, opts));
  function handler(e) {
    try {
      services.narrator?.unlock?.();
    } catch {
      /* ignore */
    }
    try {
      services.sfx?.unlock?.();
    } catch {
      /* ignore */
    }
    const ua = navigator.userActivation;
    const activated = ua ? ua.hasBeenActive : e.type !== 'pointerdown';
    if (activated && services.real !== false) stop();
  }
  events.forEach((t) => window.addEventListener(t, handler, opts));
  return stop;
}
