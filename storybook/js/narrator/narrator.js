// The narrator: reads a page's narration plan aloud with the browser's
// speech voice and tells the reader which word is being spoken.
//
// Real devices are unreliable in many small ways, so this module is mostly
// defensive plumbing around speechSynthesis:
//   - one short utterance per sentence (long ones get cut off in Chrome);
//   - highlighting follows 'boundary' events when the voice sends them, and an
//     estimated timeline when it doesn't (Chrome's Google voices, Android);
//   - a start-timeout and an end-watchdog, because some engines silently never
//     start (iOS before a tap) or never finish (Chrome after ~15 s, iOS after
//     an interruption);
//   - a voice that fails with a network error is swapped for the next best one;
//   - online voices (which send the words, and so the child's name, to Google
//     or Microsoft) are only used once the grown-up has agreed
//     (settings.allowOnlineVoices); until then an on-device voice reads, or,
//     if the device has none in English, the story reads silently;
//   - locking the phone mid-sentence restarts that sentence when it comes back;
//   - if nothing can speak at all, a silent timed mode still moves the
//     highlight along and resolves, so the page flow always works.
// The parent's recording of the name plays in place of the name where the
// plan says so; if it can't play, the voice says the name instead.

import { unitForCharIndex, estimateTimeline, estimateUnitMs } from './plan.js';
import { discoverVoices, rankVoices, pickVoice, watchVoices, detectPlatform, normaliseLang, voiceInfo, voiceStatusOf } from './voices.js';
import { playBlob } from '../audio/recorder.js';
import { unlockAudio } from '../audio/sfx.js';

const BOUNDARY_GRACE_MS = 250; // no word event by now -> estimated highlighting
const START_GRACE_MS = 2000; // no 'start' by now -> the engine isn't going to speak
const FIRST_START_GRACE_MS = 3500; // engines (Android, network voices) warm up on first use
const WATCHDOG_EXTRA_MS = 1500; // end watchdog = estimate x 2 + this
const CANCEL_SETTLE_MS = 80; // Safari drops a speak() that follows cancel() too closely
const RATE_RANGE = [0.5, 1.6];
const PITCH_RANGE = [0.5, 1.6];
const DEFAULT_LANG = 'en-GB';
// Errors that mean "this voice can't do it" -> try the next voice.
const VOICE_ERRORS = new Set(['network', 'synthesis-failed', 'synthesis-unavailable', 'voice-unavailable', 'language-unavailable']);

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 1));
const safe = (fn, ...args) => {
  try {
    return fn?.(...args);
  } catch {
    return undefined;
  }
};

function testHooks() {
  const t = globalThis.SB_TEST ?? {};
  const scale = Number(t.timeScale);
  return { forceSilent: Boolean(t.forceSilent), timeScale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const done = (ok) => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      resolve(ok);
    };
    const onAbort = () => done(false);
    const t = setTimeout(() => done(true), Math.max(0, ms));
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function pageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Resolves when the page is visible again (or the signal aborts). */
function whenVisible(signal) {
  return new Promise((resolve) => {
    if (!pageHidden() || signal?.aborted) return resolve();
    const done = () => {
      document.removeEventListener('visibilitychange', check);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const check = () => {
      if (!pageHidden()) done();
    };
    document.addEventListener('visibilitychange', check);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** A one-off speech segment for arbitrary text (previews, tap-a-word). */
export function textSegment(text, line = 0) {
  const units = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) units.push({ u: units.length, start: m.index, end: m.index + m[0].length });
  return { kind: 'speech', line, text, units };
}

function segmentMs(seg, rate) {
  const tl = estimateTimeline(seg, rate);
  const last = tl[tl.length - 1];
  return last ? last.at + last.dur : estimateUnitMs(seg.text || '', rate);
}

/**
 * @param {{
 *   getSettings?: () => {voiceURI?: string|null, rate?: number, pitch?: number, allowOnlineVoices?: boolean},
 *   getRecording?: (id: string) => Promise<Blob|null>,
 *   synth?: SpeechSynthesis, Utterance?: typeof SpeechSynthesisUtterance,
 *   playClip?: (blob: Blob, opts: {signal: AbortSignal}) => Promise<void>, platform?: string
 * }} deps  synth/Utterance/playClip/platform are for tests; they default to the browser's.
 */
export function createNarrator({
  getSettings = () => ({}),
  getRecording = async () => null,
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  playClip = playBlob,
  platform = detectPlatform(),
} = {}) {
  const supported = Boolean(synth && typeof synth.speak === 'function' && typeof Utterance === 'function');
  let ranked = [];
  const badVoices = new Set(); // voices that failed this session
  const keep = new Set(); // Chrome garbage-collects in-flight utterances and loses their events
  let job = null; // the current play()/speakText()
  let everStarted = false; // has any utterance actually started?
  let everTried = false; // only the very first utterance gets the long warm-up grace
  let needsGesture = false; // speech looks blocked until the next tap
  let lastCancelAt = -Infinity;
  let unlockUtterance = null;

  const setVoices = (list) => {
    ranked = rankVoices(list, { platform });
  };

  const ready = supported
    ? discoverVoices(synth).then((list) => {
        setVoices(list);
        watchVoices(synth, (next) => {
          if (next.length) setVoices(next);
        });
        return listVoices();
      })
    : Promise.resolve([]);

  const settings = () => safe(getSettings) ?? {};
  /** Has the grown-up agreed to online voices? Read live, so the settings toggle applies at once. */
  const allowOnline = () => settings().allowOnlineVoices === true;

  /**
   * Ranked English voices, best first (all voices if the device has no English
   * ones). Online voices stay in the list, flagged `online: true`, so settings
   * can offer them; they're only used with consent.
   */
  function listVoices() {
    const english = ranked.filter((r) => r.english);
    return (english.length ? english : ranked).map(voiceInfo);
  }
  // Silent when there's no engine, in test mode, with no voices at all, or when
  // the only voices that could read the story are online ones we may not use.
  const silentNow = () =>
    !supported || testHooks().forceSilent || (ranked.length === 0 && !refreshVoices()) || (!allowOnline() && !chooseVoice());

  // Safari can report no voices at first and never fire 'voiceschanged', so
  // if discovery came back empty, look again (cheaply) whenever we need one.
  let lastRefresh = 0;
  function refreshVoices() {
    if (!supported || Date.now() - lastRefresh < 1000) return false;
    lastRefresh = Date.now();
    try {
      const list = Array.from(synth.getVoices() ?? []);
      if (list.length) setVoices(list);
    } catch {
      /* ignore */
    }
    return ranked.length > 0;
  }

  function chooseVoice(voiceURI = settings().voiceURI) {
    return pickVoice(ranked, voiceURI ?? null, badVoices, { allowOnline: allowOnline() });
  }

  function cancelEngine() {
    if (!supported) return;
    try {
      synth.cancel();
    } catch {
      /* ignore */
    }
    lastCancelAt = Date.now();
  }

  /** Get the engine into a clean state before speaking (stale queue, stuck pause). */
  async function prepareEngine(signal) {
    if (!supported) return;
    try {
      const busy = synth.speaking || synth.pending;
      if (busy && unlockUtterance && keep.has(unlockUtterance)) {
        // Only our silent unlock utterance is queued: let it finish rather
        // than cancelling the very speech that unlocked iOS.
        for (let i = 0; i < 8 && keep.has(unlockUtterance); i++) if (!(await sleep(50, signal))) return;
      }
      if (synth.speaking || synth.pending) cancelEngine();
      if (synth.paused) synth.resume();
    } catch {
      /* ignore */
    }
    const since = Date.now() - lastCancelAt;
    if (since < CANCEL_SETTLE_MS) await sleep(CANCEL_SETTLE_MS - since, signal);
  }

  /**
   * Speak one utterance. Resolves with what happened; never rejects.
   * @returns {Promise<{type: 'end'|'error'|'nostart'|'watchdog'|'stopped'|'hidden', error?: string, started?: boolean}>}
   */
  function utter(text, { voice, lang, rate, pitch, volume = 1, estimateMs, signal, onStart, onBoundary }) {
    return new Promise((resolve) => {
      let u;
      try {
        u = new Utterance(text);
        if (voice) u.voice = voice;
        u.lang = lang;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = volume;
      } catch {
        return resolve({ type: 'error', error: 'utterance' });
      }
      let settled = false;
      let started = false;
      let startTimer = null;
      let watchdog = null;
      const t0 = Date.now();
      const finish = (result, cancel = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(startTimer);
        clearTimeout(watchdog);
        signal?.removeEventListener('abort', onAbort);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide);
        u.onstart = u.onend = u.onerror = u.onboundary = null;
        keep.delete(u);
        if (cancel) cancelEngine();
        resolve({ started, ...result });
      };
      const onAbort = () => finish({ type: 'stopped' }, true);
      // iOS stops (and sometimes wedges) speech when the phone locks; cancel
      // cleanly and let the caller restart the sentence when we're back.
      const onHide = () => {
        if (pageHidden()) finish({ type: 'hidden' }, true);
      };
      u.onstart = () => {
        if (settled || started) return;
        started = true;
        everStarted = true;
        needsGesture = false;
        clearTimeout(startTimer);
        safe(onStart);
      };
      u.onboundary = (e) => {
        if (!settled) safe(onBoundary, e);
      };
      u.onend = () => {
        // An 'end' with no 'start', far too soon, means nothing was spoken.
        if (!started && Date.now() - t0 < estimateMs * 0.3) finish({ type: 'nostart' });
        else finish({ type: 'end' });
      };
      u.onerror = (e) => finish({ type: 'error', error: e?.error || 'unknown' });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
      startTimer = setTimeout(() => {
        if (!started) finish({ type: 'nostart' }, true);
      }, everStarted || everTried ? START_GRACE_MS : FIRST_START_GRACE_MS);
      everTried = true;
      // A short sentence's watchdog can beat the start grace; if it never
      // started, that's a "no start", not a stuck ending.
      watchdog = setTimeout(() => finish({ type: started ? 'watchdog' : 'nostart' }, true), estimateMs * 2 + WATCHDOG_EXTRA_MS);
      keep.add(u);
      try {
        if (synth.paused) synth.resume();
        synth.speak(u);
      } catch {
        finish({ type: 'error', error: 'speak-failed' });
      }
    });
  }

  /**
   * Highlight a segment on its estimated timeline with no audio, starting
   * after word `fromIndex` (already shown). Timings honour SB_TEST.timeScale.
   */
  async function runSilent(seg, o, signal, fromIndex = -1) {
    const scale = testHooks().timeScale;
    const rest = estimateTimeline(seg, o.rate).filter((t) => t.index > fromIndex);
    if (!rest.length) return signal?.aborted ? 'stopped' : 'done';
    const anchor = rest[0].at;
    let clock = 0;
    for (const t of rest) {
      const due = (t.at - anchor) * scale;
      if (!(await sleep(due - clock, signal))) return 'stopped';
      clock = due;
      o.show(t.index);
    }
    const last = rest[rest.length - 1];
    return (await sleep((last.at + last.dur - anchor) * scale - clock, signal)) ? 'done' : 'stopped';
  }

  /**
   * Speak one speech segment with highlighting.
   * @returns {Promise<{outcome: 'done'|'stopped'|'hidden'|'retry'|'silent', lastIndex: number}>}
   */
  async function speakSegment(seg, o, signal) {
    const timeline = estimateTimeline(seg, o.rate);
    const estMs = segmentMs(seg, o.rate);
    let mode = 'waiting'; // -> 'boundary' | 'estimate'
    let lastIndex = -1;
    let graceTimer = null;
    let stallTimer = null;
    const timers = [];
    const show = (i) => {
      if (i <= lastIndex || i >= seg.units.length) return;
      lastIndex = i;
      o.show(i);
    };
    const clearAll = () => {
      clearTimeout(graceTimer);
      clearTimeout(stallTimer);
      timers.splice(0).forEach(clearTimeout);
    };
    // Run the remaining words on the estimated timeline, anchored so the next
    // word is due `firstDelay` ms from now.
    const runEstimate = (firstDelay) => {
      mode = 'estimate';
      clearTimeout(stallTimer);
      const rest = timeline.filter((t) => t.index > lastIndex);
      if (!rest.length) return;
      const anchor = rest[0].at;
      for (const t of rest) timers.push(setTimeout(() => show(t.index), Math.max(0, firstDelay + t.at - anchor)));
    };
    // In boundary mode, an engine that stops sending word events mid-sentence
    // hands over to the estimate rather than freezing the highlight.
    const armStall = () => {
      clearTimeout(stallTimer);
      const cur = timeline.find((t) => t.index === lastIndex);
      stallTimer = setTimeout(() => runEstimate(0), (cur?.dur ?? 400) * 2.5 + 600);
    };

    const result = await utter(seg.text, {
      voice: o.voice?.voice,
      lang: o.voice ? normaliseLang(o.voice.lang) || DEFAULT_LANG : DEFAULT_LANG,
      rate: o.rate,
      pitch: o.pitch,
      estimateMs: estMs,
      signal,
      onStart: () => {
        show(0);
        if (mode === 'waiting') {
          graceTimer = setTimeout(() => {
            if (mode === 'waiting') {
              const next = timeline.find((t) => t.index > lastIndex);
              runEstimate(next ? Math.max(0, next.at - BOUNDARY_GRACE_MS) : 0);
            }
          }, BOUNDARY_GRACE_MS);
        }
      },
      onBoundary: (e) => {
        if (mode === 'estimate') return; // too late: the estimate owns this utterance now
        if (e?.name && e.name !== 'word') return; // sentence boundaries carry no word position
        mode = 'boundary';
        clearTimeout(graceTimer);
        show(unitForCharIndex(seg, Number(e?.charIndex) || 0));
        armStall();
      },
    });
    clearAll();

    const { type, error, started } = result;
    if (type === 'end') return { outcome: 'done', lastIndex };
    if (type === 'stopped') return { outcome: 'stopped', lastIndex };
    if (type === 'hidden') return { outcome: 'hidden', lastIndex };
    if (type === 'watchdog') return { outcome: 'done', lastIndex }; // it did speak; the engine just never said so
    if (type === 'error' && (error === 'interrupted' || error === 'canceled')) {
      return { outcome: signal?.aborted ? 'stopped' : 'done', lastIndex };
    }
    if (type === 'error' && error === 'not-allowed') {
      needsGesture = true; // speech needs a tap first (iOS, Chrome autoplay rules)
      return { outcome: 'silent', lastIndex, blocked: true };
    }
    if (type === 'error' && VOICE_ERRORS.has(error) && o.voice) {
      badVoices.add(o.voice.uri);
      return { outcome: started ? 'done' : 'retry', lastIndex };
    }
    if (type === 'nostart') {
      // A network voice that never starts is probably offline: try a local one.
      if (o.voice && !o.voice.local) {
        badVoices.add(o.voice.uri);
        return { outcome: 'retry', lastIndex };
      }
      if (!everStarted) needsGesture = true;
      return { outcome: 'silent', lastIndex, strike: true };
    }
    return started ? { outcome: 'done', lastIndex } : { outcome: 'silent', lastIndex };
  }

  /** Speak a segment, retrying with other voices and falling back to silent highlighting. */
  async function sayRobust(seg, j, o) {
    let retries = 0;
    for (;;) {
      if (j.signal.aborted) return 'stopped';
      if (j.silent || silentNow()) return runSilent(seg, o, j.signal);
      await whenVisible(j.signal);
      if (j.signal.aborted) return 'stopped';
      const voice = chooseVoice(o.voiceURI);
      const r = await speakSegment(seg, { ...o, voice }, j.signal);
      if (r.outcome === 'done' || r.outcome === 'stopped') return r.outcome;
      if (r.outcome === 'hidden') continue; // start the sentence again once we're visible
      if (r.outcome === 'retry' && retries++ < 3) continue;
      // Speech isn't happening: keep the words moving silently.
      if (r.strike) j.strikes += 1;
      if (r.blocked || j.strikes >= 2) j.silent = true; // stop trying for the rest of this plan
      return runSilent(seg, o, j.signal, r.lastIndex);
    }
  }

  // No cache here: storage keeps recordings in memory already, and a cache
  // would keep serving an old clip after the grown-up records it again.
  async function getClip(id) {
    try {
      return (await getRecording(id)) ?? null;
    } catch {
      return null;
    }
  }

  function beginJob(signal) {
    stop();
    const ac = new AbortController();
    const j = { ac, signal: ac.signal, silent: false, strikes: 0, off: () => {} };
    if (signal) {
      const forward = () => ac.abort();
      if (signal.aborted) ac.abort();
      else {
        signal.addEventListener('abort', forward, { once: true });
        // The reader passes one long-lived signal to every tap-a-word; don't pile up listeners on it.
        j.off = () => signal.removeEventListener('abort', forward);
      }
    }
    job = j;
    return j;
  }

  function endJob(j) {
    j.off();
    if (job === j) job = null;
  }

  function voiceOptions(rateScale, pitchScale, voiceURI) {
    const s = settings();
    return {
      rate: clamp((s.rate ?? 0.9) * (rateScale ?? 1), RATE_RANGE),
      pitch: clamp((s.pitch ?? 1.05) * (pitchScale ?? 1), PITCH_RANGE),
      voiceURI: voiceURI ?? s.voiceURI ?? null,
    };
  }

  /**
   * Read a narration plan (from planLines) aloud.
   * @param {{lines?: any[], segments: any[]}} plan
   * @param {{signal?: AbortSignal, onUnit?: (line: number, unit: number) => void, onSegment?: (i: number) => void,
   *   rateScale?: number, pitchScale?: number}} [opts]
   * @returns {Promise<'done'|'stopped'>}
   */
  async function play(plan, { signal, onUnit, onSegment, rateScale = 1, pitchScale = 1 } = {}) {
    const j = beginJob(signal);
    try {
      const segments = plan?.segments ?? [];
      if (!silentNow() && segments.some((s) => s.kind !== 'pause')) await prepareEngine(j.signal);
      for (let i = 0; i < segments.length; i++) {
        if (j.signal.aborted) return 'stopped';
        const seg = segments[i];
        safe(onSegment, i);
        const o = voiceOptions(rateScale, pitchScale);
        let r = 'done';
        if (seg.kind === 'pause') {
          r = (await sleep((seg.ms ?? 0) * testHooks().timeScale, j.signal)) ? 'done' : 'stopped';
        } else if (seg.kind === 'clip') {
          r = await playClipSegment(seg, plan, j, o, onUnit);
        } else if (seg.kind === 'speech' && seg.units?.length) {
          r = await sayRobust(seg, j, { ...o, show: (k) => safe(onUnit, seg.line, seg.units[k].u) });
        }
        if (r === 'stopped') return 'stopped';
      }
      return j.signal.aborted ? 'stopped' : 'done';
    } catch {
      // A bug here must never strand the page: carry on as if it was read.
      return j.signal.aborted ? 'stopped' : 'done';
    } finally {
      endJob(j);
    }
  }

  async function playClipSegment(seg, plan, j, o, onUnit) {
    const unit = seg.units?.[0];
    if (!unit) return 'done';
    safe(onUnit, seg.line, unit.u);
    // Silent mode stays silent: no voice around it, so no lone recording either.
    if (!silentNow() && !j.silent) {
      const blob = await getClip(seg.recordingId);
      if (j.signal.aborted) return 'stopped';
      if (blob) {
        try {
          await playClip(blob, { signal: j.signal });
          return j.signal.aborted ? 'stopped' : 'done';
        } catch {
          /* fall back to the voice saying the name */
        }
      }
    }
    const say = plan?.lines?.[seg.line]?.units?.[unit.u]?.say ?? '';
    if (!say) return 'done';
    const fallback = { kind: 'speech', line: seg.line, text: say, units: [{ u: unit.u, start: 0, end: say.length }] };
    return sayRobust(fallback, j, { ...o, show: () => {} });
  }

  /**
   * Speak a bit of text once (hear the name, tap a word, preview a voice).
   * Stops any narration in progress.
   * @param {string} text
   * @param {{signal?: AbortSignal, rateScale?: number, pitchScale?: number, voiceURI?: string, onUnit?: (unit: number) => void}} [opts]
   * @returns {Promise<'done'|'stopped'>}
   */
  async function speakText(text, { signal, rateScale = 1, pitchScale = 1, voiceURI, onUnit } = {}) {
    const j = beginJob(signal);
    try {
      const seg = textSegment(String(text ?? '').trim());
      if (!seg.units.length) return 'done';
      if (!silentNow()) await prepareEngine(j.signal);
      return await sayRobust(seg, j, { ...voiceOptions(rateScale, pitchScale, voiceURI), show: (k) => safe(onUnit, k) });
    } catch {
      return j.signal.aborted ? 'stopped' : 'done';
    } finally {
      endJob(j);
    }
  }

  /** Stop whatever is being read, immediately. */
  function stop() {
    const j = job;
    job = null;
    if (j) j.ac.abort();
    // Leave a pending unlock utterance alone: cancelling the speech that
    // unlocked iOS a moment ago can leave it locked.
    if (j || [...keep].some((u) => u !== unlockUtterance)) cancelEngine();
  }

  /**
   * Call synchronously inside a tap/click handler. iOS only lets a page speak
   * after it has spoken inside a user gesture, and Chrome can be left paused,
   * so this speaks a silent utterance and resumes the engine. It also unlocks
   * Web Audio for the name recording.
   */
  function unlock() {
    safe(unlockAudio);
    if (!supported) return;
    try {
      if (synth.paused) synth.resume();
      // Something real is being spoken right now: the engine is already awake.
      if (job && !job.silent && synth.speaking && everStarted) return;
      const u = new Utterance(' ');
      u.volume = 0;
      u.rate = 1;
      u.lang = DEFAULT_LANG;
      let v = chooseVoice();
      if (!v && !allowOnline() && ranked.length) {
        // Never wake an online voice without consent, not even for silence:
        // borrow any on-device voice, or skip the speech part of the unlock.
        v = ranked.find((r) => r.local && !badVoices.has(r.uri)) ?? null;
        if (!v) return;
      }
      if (v) u.voice = v.voice;
      u.onend = u.onerror = () => keep.delete(u);
      keep.add(u);
      unlockUtterance = u;
      synth.speak(u);
      needsGesture = false;
      // Forget it after a moment even if the engine never reports back.
      setTimeout(() => keep.delete(u), 1500);
    } catch {
      /* ignore */
    }
  }

  return {
    supported,
    ready,
    /** False means silent timed mode (no speech engine, no voices, or test mode). */
    hasVoice: () => !silentNow(),
    listVoices,
    /** The voice that will be used with the current settings (or null in silent mode). */
    currentVoice() {
      if (silentNow()) return null;
      const v = chooseVoice();
      return v ? voiceInfo(v) : null;
    },
    /**
     * Online-voice consent at a glance: how many on-device and online voices
     * listVoices() shows, whether an online voice is in use right now, and
     * whether the story is silent until the grown-up agrees to online voices
     * (no on-device English voice, but online ones exist).
     * @returns {{local: number, online: number, usingOnline: boolean, needsConsent: boolean}}
     */
    voiceStatus() {
      if (supported && ranked.length === 0) refreshVoices();
      const current = silentNow() ? null : chooseVoice();
      return voiceStatusOf(ranked, { allowOnline: allowOnline(), current });
    },
    unlock,
    speakText,
    play,
    stop,
    get speaking() {
      return Boolean(job);
    },
    /** True when speech seems blocked until the next tap: show a "Tap to hear the story" button, then call unlock(). */
    get needsGesture() {
      return needsGesture;
    },
    /** 'speech' or 'silent' — how the next play() will run. */
    get mode() {
      return silentNow() ? 'silent' : 'speech';
    },
  };
}
