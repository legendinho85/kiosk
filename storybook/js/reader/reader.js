// The child-facing reader: one page at a time, read aloud with the child's
// name woven in, each word lighting up as it is spoken, and the page's moving
// part working on screen just like the one in the printed book.
//
// Page flow (docs/architecture.md, "Reader"):
//   slide in -> open sound -> names write themselves in -> read the text ->
//   prompt ("Slide the ball to Ava!") and wait for the mechanism ->
//   celebrate (effects, sounds, confetti) -> read the "after" lines ->
//   "Turn the page!" (or turn by itself when settings.autoTurn).
// Every page runs under its own AbortController: turning the page or
// destroy() stops narration, timers, animations and listeners in one go.
//
// Family features (docs/architecture.md section 11):
//   - a grown-up's recorded reading ("Read by Grandma Rose") plays instead of
//     the computer voice wherever a page part was recorded;
//   - pause/play (button, Space or K): speech can't be resumed mid-sentence
//     reliably, so carrying on re-reads the current sentence;
//   - name spotting: tap the name in the picture and hear "That says Ava!";
//   - bedtime: a darker, quieter page that carries on by itself (the moving
//     part shows itself, pages turn after a soft chime, the end fades to dark);
//   - siblings: the pictures say "AMARA & ZAK" and name clips aren't used.

import { bookUrl } from '../core/book.js';
import { fillTemplate, fillSpoken, person as makePerson } from '../core/personalise.js';
import { readingLabel } from '../core/storage.js';
import { planLines, estimateTimeline, estimateUnitMs } from '../narrator/plan.js';
import { loadScene, prefetchScene, parseSvg, animationWrapper, needsAnimationWrapper, hoistAnimations, ANIMATION_CLASSES } from './scene.js';
import { createDriver, pick, applyMatrix } from './drive.js';
import { createControl } from './controls.js';
import { fillNameSlots, isShown } from './name-fit.js';
import { clipTimeline, stretchTimeline, resumePlan, testScale } from './timeline.js';
import { clipDurationMs } from './clip.js';

const IDLE_REPROMPT_MS = 8000; // tests may shorten it with SB_TEST.idleMs
const SLIDE_MS = 420;
const SFX_GAP_MS = 250;
const AUTO_TURN_MS = 1600;
const PART_TIMEOUT_MS = 5000; // a recorded part that takes longer to fetch is skipped (computer voice instead)
const CLIP_LATENCY_MS = 60; // playback starts a moment after we ask for it
const SPOT_LINE = 'That says {name}!';
// Bedtime: slower, quieter, and the story carries on by itself.
const BEDTIME = Object.freeze({
  rate: 0.9, // voice rateScale
  sfxVolume: 0.2, // createSfx's default is 0.55
  chimeVolume: 0.28,
  showMeMs: 5000, // untouched mechanism plays itself (SB_TEST.timeScale shortens these)
  turnMs: 3000, // after the chime, the page turns
  fadeMs: 2600, // end page: pause, then the lights go down
});

const ICONS = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v8.5h11V10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12a6.5 6.5 0 1 0 2-4.7M5 4.5v4h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  magic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12.5" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="13.2" r="3.3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8.5 7 10 4.5h4L15.5 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M19.5 1.8l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L12 11.7l-3.7 2.4 1.1-4.3L6 7l4.4-.3z" fill="currentColor"/><path d="M5 17.5c2.2 2.6 11.8 2.6 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M42 8a24 24 0 1 0 14 38A20 20 0 0 1 42 8z" fill="#FFE9A8"/><circle cx="14" cy="12" r="2" fill="#FFE9A8"/><circle cx="54" cy="16" r="1.6" fill="#FFE9A8"/><circle cx="8" cy="40" r="1.4" fill="#FFE9A8"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2s-7.6-4.6-7.6-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.6 2.7c0 5.5-7.6 10.1-7.6 10.1z" fill="currentColor"/></svg>',
};

const CONFETTI = ['#E8505B', '#FFC83D', '#7EC8F0', '#6CC24A', '#FFFFFF', '#3E7BDB', '#F59A2B'];

// ---- Small helpers -------------------------------------------------------------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}

/** Abortable sleep: resolves early (never rejects) when the page is left. */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const id = setTimeout(done, ms);
    function done() {
      clearTimeout(id);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** Resolve on whichever comes first: the promise or the signal. */
function untilAbort(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
    Promise.resolve(promise).then(resolve, resolve);
  });
}

function childSignal(parent) {
  const ctl = new AbortController();
  if (parent.aborted) ctl.abort();
  else parent.addEventListener('abort', () => ctl.abort(), { once: true });
  return ctl;
}

/** Resolve with `fallback` if the promise takes longer than `ms` (never rejects). */
function within(promise, ms, fallback = null) {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      () => {
        clearTimeout(id);
        resolve(fallback);
      },
    );
  });
}

// The recorder module plays recorded readings; loaded only when one is used.
let recorderModule = null;
function loadPlayer() {
  recorderModule ??= import('../audio/recorder.js').then(
    (m) => (typeof m.playBlob === 'function' ? m.playBlob : null),
    () => null,
  );
  return recorderModule;
}

const isBlob = (b) => Boolean(b && typeof b === 'object' && b.size > 0 && typeof b.arrayBuffer === 'function');

const reducedMotionQuery = () => {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  } catch {
    return null;
  }
};

function sceneBox(svgRoot, el) {
  try {
    const b = el.getBBox();
    const m = svgRoot.getScreenCTM()?.inverse().multiply(el.getScreenCTM());
    if (!m) return null;
    const pts = [[b.x, b.y], [b.x + b.width, b.y + b.height]].map(([x, y]) => applyMatrix(m, x, y));
    return { x: Math.min(pts[0][0], pts[1][0]), y: Math.min(pts[0][1], pts[1][1]), width: Math.abs(pts[1][0] - pts[0][0]), height: Math.abs(pts[1][1] - pts[0][1]) };
  } catch {
    return null;
  }
}

/**
 * A stand-in narrator for when none is supplied (or the real one fails):
 * silent, but it still walks the words on the estimated timeline so the
 * read-along highlighting and page flow behave exactly as with a voice.
 */
export function createSilentNarrator() {
  let current = null;
  const scale = () => globalThis.SB_TEST?.timeScale ?? 1;
  const run = async (plan, { signal, onUnit, rateScale = 1 } = {}) => {
    const ctl = new AbortController();
    current?.abort();
    current = ctl;
    const stopSig = ctl.signal;
    const halt = () => stopSig.aborted || signal?.aborted;
    const rate = 0.9 * rateScale;
    for (const seg of plan.segments) {
      if (halt()) break;
      if (seg.kind === 'pause') await sleep(seg.ms * scale(), stopSig);
      else if (seg.kind === 'clip') {
        onUnit?.(seg.line, seg.units[0].u);
        await sleep(700 * scale(), stopSig);
      } else {
        const tl = estimateTimeline(seg, rate);
        for (const step of tl) {
          if (halt()) break;
          onUnit?.(seg.line, step.u);
          await sleep(step.dur * scale(), stopSig);
        }
      }
      if (signal?.aborted) break;
    }
    if (current === ctl) current = null;
    return halt() ? 'stopped' : 'done';
  };
  return {
    supported: false,
    ready: Promise.resolve(),
    hasVoice: () => false,
    listVoices: () => [],
    unlock() {},
    play: run,
    async speakText(text, { signal } = {}) {
      const ctl = new AbortController();
      current?.abort();
      current = ctl;
      await sleep(estimateUnitMs(String(text)) * scale(), signal ?? ctl.signal);
      if (current === ctl) current = null;
    },
    stop() {
      current?.abort();
      current = null;
    },
    get speaking() {
      return Boolean(current);
    },
    get needsGesture() {
      return false;
    },
  };
}

function fallbackScene(page, message) {
  const svg = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
    <rect width="1600" height="1000" fill="#FFF4E0"/>
    <g fill="none" stroke="#2B2A33" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.35">
      <path d="M560 640 l120 -160 90 110 70 -80 200 230 z" fill="#FFE9A8"/>
      <circle cx="1000" cy="380" r="54" fill="#FFC83D"/>
      <rect x="480" y="280" width="640" height="440" rx="36"/>
    </g>
    <text x="800" y="820" text-anchor="middle" font-family="Fredoka, Andika, sans-serif" font-weight="600" font-size="46" fill="#2B2A33" opacity="0.6">This picture is still being painted</text>
  </svg>`);
  const el = document.importNode(svg, true);
  el.classList.add('sb-scene', 'sb-scene-missing');
  el.dataset.page = String(page.n);
  el.dataset.error = String(message ?? '');
  return el;
}

// ---- Reader ------------------------------------------------------------------------

/**
 * Mount the reader into `root`.
 * @param {HTMLElement} root
 * @param {{
 *   book: object, bookId?: string, baseUrl?: string,
 *   person: {display: string, say: string, count?: number, art?: string},
 *   pronunciation?: {useRecording?: boolean, recordingId?: string|null},
 *   settings?: {highlight?: boolean, autoTurn?: boolean, readPrompts?: boolean},
 *   narrator?: object, sfx?: {play(name: string, opts?: {volume?: number}): void, unlock?(): void},
 *   startPage?: number, onPageChange?: (n: number) => void, onExit?: () => void, onMagic?: (n: number) => void,
 *   requireTap?: boolean,
 *   reading?: {readerName: string, language?: string, label?: string, getPart(n: number, part: 'main'|'after'): Promise<Blob|null>} | null,
 *   bedtime?: boolean,
 * }} opts  requireTap: show "Tap to start" first (default: only when the page has had no user gesture yet,
 *   since browsers block speech and sound until then).
 *   person: `togetherPerson()` for siblings (count > 1): pictures use `art`, and recorded name clips and
 *   recorded readings are not used (they say one child's name).
 *   reading: a grown-up's recorded reading; a page part that exists ("main" = text + prompt, "after" = the
 *   after lines) plays instead of the computer voice, highlighted on a timeline stretched to the clip.
 *   A reading in another `language` plays without word-by-word highlighting.
 *   bedtime: night styling, softer sounds, slower voice; the mechanism shows itself after a few seconds and
 *   pages turn by themselves after a soft chime; the end page fades to dark.
 * @returns {Promise<{destroy(): void, goTo(n: number): void, replay(): void, pause(): void, resume(): void,
 *   readonly paused: boolean, readonly page: number}>}
 */
export async function mountReader(root, opts) {
  const {
    book,
    bookId = book?.id,
    person: who,
    pronunciation = null,
    settings = {},
    sfx = null,
    startPage = 1,
    onPageChange,
    onExit,
    onMagic,
    reading = null,
    bedtime = false,
  } = opts ?? {};
  const baseUrl = opts?.baseUrl ?? bookUrl(bookId);
  const pages = Array.isArray(book?.pages) ? book.pages : [];
  const person = who?.display ? makePerson(who.display, who.say, { count: who.count, art: who.art }) : makePerson('Friend');
  // Siblings: a recording says one child's name, so neither the parent's name
  // clip nor a grown-up's recorded reading fits "Amara and Zak".
  const several = (person.count ?? 1) > 1;
  let narrator = opts?.narrator ?? createSilentNarrator();
  const recording = { useRecording: Boolean(pronunciation?.useRecording) && !several, recordingId: pronunciation?.recordingId ?? null };
  const readingOn = Boolean(reading && typeof reading.getPart === 'function' && !several);
  // A reading in another language can't follow the English words one by one.
  const readingLang = String(reading?.language ?? '').trim();
  const clipHighlight = !readingLang || /^(english|en(-\w+)?)$/i.test(readingLang);
  const isBedtime = Boolean(bedtime);
  const mq = reducedMotionQuery();
  const reduced = () => Boolean(mq?.matches);
  const setting = (k, dflt) => (settings && k in settings ? settings[k] : dflt);

  const life = new AbortController(); // the whole reader
  let pageCtl = null; // the current page
  let cur = null; // state of the current page
  let destroyed = false;
  let wakeLock = null;
  let swipe = null;
  let lastSwipeAt = 0;
  let startGate = null; // resolves on the "Tap to start" button when opened without a tap
  const leaving = new Set();

  // ---- DOM ----------------------------------------------------------------------
  const title = fillTemplate(book?.title ?? 'Story', person);
  const btn = (cls, testid, label, icon, extra = {}) =>
    h('button', { type: 'button', class: `sb-r-btn ${cls}`, 'data-testid': testid, 'aria-label': label, title: label, html: ICONS[icon], ...extra });

  const exitBtn = btn('sb-r-exit', 'exit-reader', 'Leave the story', 'home');
  const replayBtn = btn('sb-r-replay', 'replay', 'Read this page again', 'replay');
  const canMagic = typeof onMagic === 'function' && Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  const magicBtn = canMagic ? btn('sb-r-magic', 'magic-window', 'Magic window: see the name on the real book', 'magic') : null;
  const dots = h('div', { class: 'sb-r-dots', 'data-testid': 'page-indicator', role: 'img' }, pages.map(() => h('span', { class: 'sb-r-dot' })));
  const prevBtn = btn('sb-r-nav sb-r-prev', 'prev-page', 'Previous page', 'prev');
  const bubble = h('span', { class: 'sb-r-bubble', 'aria-hidden': 'true' }, 'Turn the page!');
  const nextBtn = btn('sb-r-nav sb-r-next', 'next-page', 'Next page', 'next');
  const nextWrap = h('div', { class: 'sb-r-next-wrap' }, bubble, nextBtn);
  const pauseBtn = btn('sb-r-pause', 'pause', 'Pause the story', 'pause');
  const bookEl = h('div', { class: 'sb-r-book' });
  const confettiLayer = h('div', { class: 'sb-r-confetti', 'aria-hidden': 'true' });
  // "Read by Grandma Rose": shown on pages where her recording is playing. A
  // sticker on the corner of the book, or above the words on portrait phones
  // (where the picture is small); CSS shows one or the other.
  const makeBadge = (where, testid) => h('div', { class: `sb-r-badge sb-r-badge-${where}`, 'data-testid': testid, hidden: true }, h('span', { class: 'sb-r-badge-icon', html: ICONS.heart }), h('span', { class: 'sb-r-badge-text' }));
  const badge = makeBadge('frame', 'reading-badge');
  const badgeBand = makeBadge('band', 'reading-badge-band');
  // A calm "Paused" chip over the picture (the pause button shows "play").
  const pausedChip = h('div', { class: 'sb-r-paused', 'data-testid': 'paused', role: 'status', hidden: true }, h('span', { class: 'sb-r-paused-icon', html: ICONS.pause }), h('span', {}, 'Paused'));
  const stage = h('div', { class: 'sb-r-stage' }, h('div', { class: 'sb-r-frame' }, bookEl, confettiLayer, badge, pausedChip));
  const textEl = h('div', { class: 'sb-r-text', 'data-testid': 'page-text' });
  const againBtn = h('button', { type: 'button', class: 'sb-r-pill sb-r-again', 'data-testid': 'read-again' }, h('span', { class: 'sb-r-pill-icon', html: ICONS.replay }), 'Read again');
  const nightBtn = h('button', { type: 'button', class: 'sb-r-pill sb-r-goodnight', 'data-testid': 'goodnight' }, h('span', { class: 'sb-r-pill-icon', html: ICONS.moon }), 'Goodnight');
  const endBar = h('div', { class: 'sb-r-endbar', hidden: true }, againBtn, nightBtn);
  const band = h('div', { class: 'sb-r-band' }, h('div', { class: 'sb-r-band-inner' }, badgeBand, textEl, endBar));
  const hearBtn = h('button', { type: 'button', class: 'sb-r-pill sb-r-hear', 'data-testid': 'tap-to-hear', hidden: true }, h('span', { class: 'sb-r-pill-icon', html: ICONS.play }), 'Tap to hear the story');
  const night = h('div', { class: 'sb-r-night', hidden: true, 'aria-live': 'polite' });
  const startLayer = h('div', { class: 'sb-r-start', hidden: true },
    h('button', { type: 'button', class: 'sb-r-startbtn', 'data-testid': 'start-story' }, h('span', { class: 'sb-r-start-icon', html: ICONS.play }), h('span', {}, 'Tap to start the story')));

  const el = h(
    'section',
    { class: `sb-reader${isBedtime ? ' is-bedtime' : ''}`, 'data-testid': 'reader', 'data-state': 'reading', 'data-page': String(startPage), 'aria-label': title, lang: book?.lang ?? 'en-GB' },
    h('div', { class: 'sb-r-top' }, exitBtn, dots, h('div', { class: 'sb-r-tools' }, magicBtn, replayBtn, pauseBtn)),
    stage,
    band,
    prevBtn,
    nextWrap,
    hearBtn,
    night,
    startLayer,
  );
  if (reduced()) el.classList.add('is-reduced-motion');
  root.append(el);

  // ---- Sound -------------------------------------------------------------------
  const play = (name, { volume } = {}) => {
    try {
      // Bedtime: everything softer (sfx.play(name, {volume}) where supported).
      const vol = volume ?? (isBedtime ? BEDTIME.sfxVolume : undefined);
      if (name) sfx?.play?.(name, vol == null ? undefined : { volume: vol });
    } catch {
      /* sound is decoration */
    }
  };
  const playSeq = (names, signal) => {
    const list = (Array.isArray(names) ? names : [names]).filter(Boolean);
    list.forEach((n, i) => {
      if (i === 0) play(n);
      else sleep(i * SFX_GAP_MS, signal).then(() => !signal?.aborted && play(n));
    });
    return list.length ? (list.length - 1) * SFX_GAP_MS : 0;
  };
  let unlocked = false;
  const unlockAudio = () => {
    // Must run synchronously inside a gesture handler (iOS / Chrome autoplay rules).
    try {
      narrator.unlock?.();
    } catch {
      /* ignore */
    }
    try {
      sfx?.unlock?.();
    } catch {
      /* ignore */
    }
    unlocked = true;
    hearBtn.hidden = true;
  };

  // ---- Text band ---------------------------------------------------------------
  let units = new Map(); // "line:unit" -> unit
  let currentWord = null;

  /** Show one part of the page (text, prompt or after) as highlightable words. */
  function showPart(kind, tokenizedLines) {
    units = new Map();
    currentWord = null;
    textEl.replaceChildren();
    textEl.dataset.part = kind;
    tokenizedLines.forEach((line, li) => {
      if (!line.units.length) return;
      const p = h('p', { class: `sb-r-line${kind === 'prompt' ? ' sb-r-prompt' : ''}` });
      if (kind === 'prompt') p.append(h('span', { class: 'sb-r-prompt-icon', 'aria-hidden': 'true', html: ICONS.hand }));
      line.units.forEach((u, ui) => {
        if (ui) p.append(' ');
        const key = `${li}:${ui}`;
        units.set(key, u);
        p.append(h('span', { class: `sb-word${u.isName ? ' is-name' : ''}${u.isWord ? '' : ' is-punct'}`, 'data-unit': key }, u.text));
      });
      textEl.append(p);
    });
    const chars = tokenizedLines.reduce((n, l) => n + l.display.length, 0);
    textEl.toggleAttribute('data-long', chars > 90 || tokenizedLines.length > 3);
    textEl.querySelector('.sb-r-line')?.classList.add('is-active-line');
    textEl.classList.remove('is-entering');
    void textEl.offsetWidth;
    textEl.classList.add('is-entering');
  }

  /** The line being read (phone landscape shows only this one). */
  function activateLine(line) {
    const p = line?.closest?.('.sb-r-line');
    if (!p || p.classList.contains('is-active-line')) return;
    for (const other of textEl.querySelectorAll('.sb-r-line.is-active-line')) other.classList.remove('is-active-line');
    p.classList.add('is-active-line');
  }

  function highlight(line, u) {
    const unit = typeof u === 'object' && u ? u.u : u;
    const next = textEl.querySelector(`[data-unit="${line}:${unit}"]`);
    if (next === currentWord) return;
    activateLine(next);
    currentWord?.classList.remove('is-current');
    currentWord = next;
    if (next && setting('highlight', true) !== false) {
      next.classList.add('is-current', 'is-read');
    }
  }
  function clearHighlight() {
    currentWord?.classList.remove('is-current');
    currentWord = null;
  }

  // ---- Pause / play ----------------------------------------------------------------
  // Pausing cuts short whatever is being said (`talk`) and holds every timer;
  // the page flow waits at its next step until play is pressed again.
  let paused = false;
  let talk = null; // AbortController for the words being said right now
  const resumeWaiters = new Set();

  /** Resolves at once when playing, otherwise when play is pressed (or the page is left). */
  function whilePaused(signal) {
    if (!paused || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        resumeWaiters.delete(done);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      resumeWaiters.add(done);
      signal?.addEventListener('abort', done, { once: true });
    });
  }

  let narrating = 0;
  /** One go at saying a plan with the narrator (a broken engine carries on silently). */
  async function say(plan, signal, onUnit) {
    const voice = cur?.page?.voice ?? {};
    narrating++;
    try {
      const r = await narrator.play(plan, {
        signal,
        onUnit: (line, unit) => !signal?.aborted && onUnit(line, unit),
        rateScale: (Number(voice.rate) || 1) * (isBedtime ? BEDTIME.rate : 1),
        pitchScale: Number(voice.pitch) || 1,
      });
      if (narrator.needsGesture && !unlocked) hearBtn.hidden = false;
      return r;
    } catch (err) {
      // A broken speech engine must never stop the story: carry on silently.
      console.warn('[reader] narration failed; continuing silently', err);
      narrator = createSilentNarrator();
      return narrator.play(plan, { signal, onUnit: (line, unit) => !signal?.aborted && onUnit(line, unit) });
    } finally {
      narrating--;
    }
  }

  /**
   * Read lines aloud with highlighting. Resolves 'done' | 'stopped'.
   * A pause stops the voice; play starts the current sentence again.
   */
  async function speak(lines, kind, signal, { show = true } = {}) {
    const list = (Array.isArray(lines) ? lines : [lines]).filter((l) => typeof l === 'string' && l.trim());
    if (!list.length) return 'done';
    const plan = planLines(list, person, recording);
    if (show) showPart(kind, plan.lines);
    let from = null; // where to pick up after a pause
    for (;;) {
      await whilePaused(signal);
      if (signal?.aborted) return 'stopped';
      const ctl = childSignal(signal ?? life.signal);
      talk = ctl;
      let last = from;
      const r = await say(from ? resumePlan(plan, from) : plan, ctl.signal, (line, unit) => {
        last = { line, u: typeof unit === 'object' && unit ? unit.u : unit };
        highlight(line, unit);
      });
      if (talk === ctl) talk = null;
      clearHighlight();
      if (signal?.aborted) return 'stopped';
      if (ctl.signal.aborted && paused) {
        from = last;
        continue;
      }
      return r;
    }
  }

  // ---- Recorded readings ("Read by Grandma Rose") ---------------------------------
  const partsCache = new Map(); // page n -> Promise<{main, after}>

  /** Fetch a page's recorded parts (and their lengths). Missing or broken parts are null. */
  function loadParts(n) {
    if (!readingOn) return Promise.resolve({ main: null, after: null });
    if (partsCache.has(n)) return partsCache.get(n);
    const one = async (kind) => {
      const blob = await within(Promise.resolve().then(() => reading.getPart(n, kind)), PART_TIMEOUT_MS, null);
      if (!isBlob(blob)) return null;
      const durationMs = await within(clipDurationMs(blob), PART_TIMEOUT_MS, null);
      return { blob, durationMs };
    };
    const p = Promise.all([one('main'), one('after')]).then(([main, after]) => ({ main, after }), () => ({ main: null, after: null }));
    partsCache.set(n, p);
    return p;
  }

  function showBadge(on) {
    const label = String(reading?.label ?? '').trim() || readingLabel(reading ?? {});
    for (const b of [badge, badgeBand]) {
      b.lastChild.textContent = label; // untrusted (it may come from a family pack): text only
      b.title = label;
      b.hidden = !on || !label;
    }
  }

  /**
   * Play one recorded part, lighting up the words on the estimated timeline
   * stretched to the clip's length. `blocks` are the parts of the page the
   * clip covers, in order ([text, prompt] or [after]); onPart(part, cut) runs
   * as the reading reaches each block (cut() ends the clip there).
   * Resolves 'done' | 'stopped' | 'failed' (couldn't play: use the voice).
   * A pause stops the clip; play starts the part again from its beginning.
   */
  async function playClip(clip, blocks, signal, { onPart } = {}) {
    const playBlob = await loadPlayer();
    if (!playBlob) return 'failed';
    const tl = stretchTimeline(clipTimeline(blocks, { rate: 1 }), clip.durationMs);
    for (;;) {
      await whilePaused(signal);
      if (signal.aborted) return 'stopped';
      const ctl = childSignal(signal);
      talk = ctl;
      let part = null;
      const cut = () => ctl.abort();
      const timers = [];
      const t0 = performance.now() + CLIP_LATENCY_MS;
      for (const step of tl.steps) {
        const fire = () => {
          if (ctl.signal.aborted) return;
          if (step.part !== part) {
            part = step.part;
            onPart?.(part, cut);
            if (ctl.signal.aborted) return;
          }
          if (clipHighlight) highlight(step.line, step.u);
          else clearHighlight();
        };
        timers.push(setTimeout(fire, Math.max(0, t0 + step.at - performance.now())));
      }
      let result = 'done';
      narrating++;
      try {
        await playBlob(clip.blob, { signal: ctl.signal });
      } catch (err) {
        if (!ctl.signal.aborted) {
          console.warn('[reader] could not play the recorded reading; using the voice', err?.message ?? err);
          result = 'failed';
        }
      } finally {
        narrating--;
        timers.forEach(clearTimeout);
        clearHighlight();
        if (talk === ctl) talk = null;
      }
      if (signal.aborted) return 'stopped';
      if (ctl.signal.aborted && paused) continue;
      if (result === 'done') {
        // A clip shorter than its estimate still moves the page on to every block.
        for (const b of blocks) {
          if (b.part === part || !tl.steps.some((x) => x.part === b.part)) continue;
          if (tl.steps.findIndex((x) => x.part === b.part) > tl.steps.findIndex((x) => x.part === part)) {
            part = b.part;
            onPart?.(part, () => {});
          }
        }
      }
      return result;
    }
  }

  async function tapWord(span) {
    if (Date.now() - lastSwipeAt < 400) return;
    const unit = units.get(span.dataset.unit);
    if (!unit) return;
    span.classList.remove('is-tapped');
    void span.offsetWidth;
    span.classList.add('is-tapped');
    if (narrating || narrator.speaking) return; // don't talk over the story
    try {
      if (unit.isName && recording.useRecording && recording.recordingId) {
        await narrator.play(planLines(['{name}'], person, recording), { signal: life.signal });
      } else {
        await narrator.speakText(unit.say.replace(/[^\p{L}\p{N}' -]/gu, ' ').trim() || unit.say, { signal: life.signal });
      }
    } catch {
      /* a word that can't be spoken is not an error worth showing */
    }
  }

  // ---- Chrome ------------------------------------------------------------------
  function setState(s) {
    el.dataset.state = s;
  }

  function updateChrome(n) {
    el.dataset.page = String(n);
    const page = pages[n - 1];
    el.dataset.kind = page?.kind ?? 'spread';
    [...dots.children].forEach((d, i) => {
      d.classList.toggle('is-current', i === n - 1);
      d.classList.toggle('is-past', i < n - 1);
    });
    dots.setAttribute('aria-label', `Page ${n} of ${pages.length}`);
    prevBtn.classList.toggle('is-hidden', n <= 1);
    prevBtn.disabled = n <= 1;
    const last = n >= pages.length;
    nextWrap.classList.toggle('is-hidden', last);
    nextBtn.disabled = last;
    nextWrap.classList.remove('is-ready');
    endBar.hidden = true;
  }

  // ---- Scene -------------------------------------------------------------------
  function mountScene(svg, dir) {
    for (const old of bookEl.querySelectorAll('.sb-r-page.is-current')) {
      old.classList.remove('is-current', 'is-entering-left', 'is-entering-right', 'is-entering-fade');
      old.removeAttribute('data-testid');
      old.setAttribute('aria-hidden', 'true');
      old.inert = true;
      const outClass = dir > 0 ? 'is-leaving-left' : dir < 0 ? 'is-leaving-right' : 'is-leaving-fade';
      old.classList.add(outClass);
      leaving.add(old);
      const drop = () => {
        old.__sbCleanup?.();
        old.remove();
        leaving.delete(old);
      };
      setTimeout(drop, reduced() ? 200 : SLIDE_MS + 60);
    }
    const pageEl = h('div', { class: 'sb-r-page is-current', 'data-testid': 'scene' });
    pageEl.classList.add(reduced() || !dir ? 'is-entering-fade' : dir > 0 ? 'is-entering-right' : 'is-entering-left');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Picture');
    pageEl.append(svg);
    bookEl.append(pageEl);
    return pageEl;
  }

  function hideEl(node) {
    node.setAttribute('display', 'none');
  }
  /** (Re)start a CSS animation class, on a wrapper when the element is placed by a transform or a drive. */
  function animateClass(node, cls, drivenIds) {
    const target = needsAnimationWrapper(node, drivenIds) ? animationWrapper(node) : node;
    target.classList.remove(cls);
    void target.getBBox?.();
    target.classList.add(cls);
  }
  function popIn(node, drivenIds) {
    node.removeAttribute('display');
    if (node.style?.display === 'none') node.style.display = '';
    animateClass(node, 'sb-pop-in', drivenIds);
  }

  /** Prepare a freshly mounted scene: drives at 0, hidden reveals, names, the control. */
  function setupScene(svg, page, signal) {
    const m = page.mechanic ?? { type: 'none' };
    const state = cur;
    const drivenTargets = new Set((m.drives ?? []).map((d) => d?.target));
    state.drivenTargets = drivenTargets;
    // Idle animations on moving parts go on a wrapper so both can run.
    hoistAnimations(svg, drivenTargets);
    // Things that appear later start hidden, whatever the artist left showing.
    for (const sel of [...(m.complete?.show ?? []), ...(m.midway?.show ?? [])]) {
      const node = pick(svg, sel);
      if (node) hideEl(node);
    }
    state.reveals = [...svg.querySelectorAll('[data-reveal]')];
    state.reveals.forEach(hideEl);

    // Taps on decorated scene parts: data-sfx="whistle" plays a sound and wiggles.
    for (const node of svg.querySelectorAll('[data-sfx]')) {
      node.classList.add('sb-tappable');
      const onTap = (ev) => {
        ev.stopPropagation();
        play(node.dataset.sfx);
        animateClass(node, 'sb-tapped', drivenTargets);
      };
      node.addEventListener('click', onTap);
    }

    try {
      state.driver = createDriver(svg, m.drives ?? []);
      state.driver.apply(0, { phase: 'out' });
    } catch (err) {
      console.warn('[reader] could not set up the moving parts', err);
      state.driver = null;
    }

    state.names = fillNameSlots(svg, person, { animate: true });

    // Names hidden under a flap write themselves in as the flap opens, not
    // unseen at page open.
    state.underFlap = new Set();
    if (m.type === 'flap') {
      const flap = pick(svg, m.control?.flap);
      const box = flap && sceneBox(svg, flap);
      if (box) {
        for (const slot of state.names.pending()) {
          if (flap.contains(slot)) continue;
          const b = sceneBox(svg, slot);
          const before = flap.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_PRECEDING;
          if (b && before && b.x + b.width / 2 > box.x && b.x + b.width / 2 < box.x + box.width && b.y + b.height / 2 > box.y && b.y + b.height / 2 < box.y + box.height) {
            state.underFlap.add(slot);
          }
        }
      }
    }

    if (m.type && m.type !== 'none' && !svg.classList.contains('sb-scene-missing')) {
      const label = fillTemplate(page.prompt || '', person).trim();
      state.control = createControl(svg, m, {
        label,
        reducedMotion: reduced(),
        hint: false,
        onStart: () => {
          if (signal.aborted) return;
          if (!unlocked) unlockAudio();
          state.touched = true;
          el.dataset.interacting = '1'; // phone landscape tucks the prompt away
          rearmIdle();
        },
        onProgress: (p, info) => {
          if (signal.aborted) return;
          state.driver?.apply(p, { phase: info.phase });
          if (info.source === 'drag') rearmIdle();
          if (state.underFlap.size && p >= 0.45) {
            const slots = new Set(state.underFlap);
            state.underFlap.clear();
            writeNames(signal, { filter: (e) => slots.has(e) });
          }
          // A name inside a flip-book frame that has just come into view
          // (e.g. the shirt rising out of the bag) writes itself in now.
          if (state.names.pending().length) writeNames(signal);
        },
        onMidway: () => {
          if (signal.aborted) return;
          runEffects(m.midway, svg, signal, { drivenTargets });
        },
        onComplete: () => {
          if (signal.aborted || state.completed) return;
          state.completed = true;
          disarmIdle();
          state.promptCtl?.abort();
          state.cutClip?.(); // a recorded prompt stops once the child has done it
          state.control?.hint(false);
          state.celebration = runEffects(m.complete, svg, signal, { drivenTargets, reveal: true });
          state.resolveCompletion?.();
        },
      });
      // The finished control is kept on the leaving page until it slides away.
      if (state.control) svg.parentNode.__sbCleanup = () => state.control?.destroy();
    }
  }

  /** Write in pending names (with a soft ding as each one finishes). */
  function writeNames(signal, { filter = null, within = null } = {}) {
    const names = cur?.names;
    if (!names) return Promise.resolve(0);
    const skip = cur.underFlap;
    return names.writeIn({
      within,
      signal,
      instant: reduced(),
      filter: (e) => (filter ? filter(e) : !skip?.has(e)),
      onWritten: () => !signal.aborted && play('ding'),
    });
  }

  /** complete / midway effects: show, hide, classes, sounds, confetti, reveals. */
  function runEffects(fx, svg, signal, { drivenTargets = new Set(), reveal = false } = {}) {
    const f = fx ?? {};
    const shownNow = [];
    for (const sel of f.show ?? []) {
      const node = pick(svg, sel);
      if (node) {
        popIn(node, drivenTargets);
        shownNow.push(node);
      }
    }
    for (const sel of f.hide ?? []) {
      const node = pick(svg, sel);
      if (node) {
        node.classList.add('sb-fade-out');
        sleep(reduced() ? 0 : 260, signal).then(() => hideEl(node));
      }
    }
    for (const pair of f.addClass ?? []) {
      const node = Array.isArray(pair) ? pick(svg, pair[0]) : null;
      if (!node || typeof pair[1] !== 'string') continue;
      for (const cls of pair[1].split(/\s+/).filter(Boolean)) {
        if (isBedtime && cls === 'sb-blink') continue; // no flashing at bedtime
        if (ANIMATION_CLASSES.includes(cls)) animateClass(node, cls, drivenTargets);
        else node.classList.add(cls);
      }
    }
    const soundMs = playSeq(f.sfx ?? [], signal);
    if (f.confetti && !isBedtime) burstConfetti(); // bedtime: no bright effects
    const waits = [sleep(Math.max(600, soundMs + 450), signal)];
    // Names inside something that just appeared write themselves in now.
    for (const node of shownNow) waits.push(writeNames(signal, { within: node, filter: () => true }));
    if (reveal) {
      for (const node of cur?.reveals ?? []) popIn(node, drivenTargets);
      waits.push(writeNames(signal, { filter: () => true }));
    }
    return Promise.all(waits);
  }

  function burstConfetti() {
    const n = reduced() ? 18 : 64;
    const w = confettiLayer.clientWidth || 600;
    const hgt = confettiLayer.clientHeight || 400;
    const frag = document.createDocumentFragment();
    const batch = [];
    for (let i = 0; i < n; i++) {
      const piece = h('span', { class: `sb-confetti-piece${i % 3 === 0 ? ' is-round' : ''}` });
      // Fan out upwards from the middle of the page, then flutter down.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
      const power = 0.55 + Math.random() * 0.6;
      piece.style.setProperty('--x', `${Math.round(Math.cos(angle) * power * w * 0.55)}px`);
      piece.style.setProperty('--up', `${Math.round(Math.sin(angle) * power * hgt * 0.55 - hgt * 0.08)}px`);
      piece.style.setProperty('--fall', `${Math.round(hgt * (0.4 + Math.random() * 0.7))}px`);
      piece.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 1080)}deg`);
      piece.style.setProperty('--d', `${Math.round(Math.random() * 180)}ms`);
      piece.style.setProperty('--c', CONFETTI[i % CONFETTI.length]);
      piece.style.left = `${45 + Math.random() * 10}%`;
      frag.append(piece);
      batch.push(piece);
    }
    confettiLayer.append(frag);
    setTimeout(() => batch.forEach((p) => p.remove()), 2800);
  }

  // ---- Idle: re-prompt, or at bedtime let the mechanism show itself ----------------
  let idleTimer = 0;
  function disarmIdle() {
    clearTimeout(idleTimer);
    idleTimer = 0;
  }
  function rearmIdle() {
    disarmIdle();
    const state = cur;
    if (!state || paused || state.completed || !state.waiting) return;
    if (isBedtime) {
      // The child may be working the real book: after a few quiet seconds the
      // picture does it too ("show me"), and the story carries on.
      if (!state.control) return;
      idleTimer = setTimeout(() => {
        if (cur !== state || state.completed || paused || destroyed) return;
        if (narrating) return rearmIdle(); // never over the words
        el.dataset.autoplayed = String(state.n);
        state.control.complete();
      }, testScale(BEDTIME.showMeMs));
      return;
    }
    if (state.reprompted) return;
    idleTimer = setTimeout(async () => {
      if (cur !== state || state.completed || state.reprompted || destroyed || paused) return;
      if (narrating) return rearmIdle();
      state.reprompted = true;
      delete el.dataset.interacting;
      state.control?.hint(true);
      if (state.clipPrompt) {
        // Grandma already asked in her own voice: a nudge, not the computer voice.
        nudgePrompt();
        return;
      }
      if (setting('readPrompts', true) !== false && state.page.prompt) {
        state.promptCtl = childSignal(state.signal);
        await speak(state.page.prompt, 'prompt', state.promptCtl.signal, { show: false });
      }
    }, globalThis.SB_TEST?.idleMs ?? IDLE_REPROMPT_MS);
  }
  function nudgePrompt() {
    const p = textEl.querySelector('.sb-r-prompt');
    if (!p) return;
    p.classList.remove('is-nudged');
    void p.offsetWidth;
    p.classList.add('is-nudged');
  }

  // ---- Page flow -----------------------------------------------------------------
  function waitForFonts() {
    const fonts = document.fonts;
    if (!fonts?.load) return Promise.resolve();
    return Promise.race([
      Promise.all([fonts.load('700 64px Fredoka'), fonts.load('400 32px Andika')]).catch(() => {}),
      new Promise((r) => setTimeout(r, 1200)),
    ]);
  }

  /** Show the prompt and pulse the control: the child's turn. */
  function enterWaiting(state) {
    if (cur !== state || state.waiting || state.completed) return;
    setState('waiting');
    state.waiting = true;
    const prompt = state.page.prompt || '';
    if (prompt) showPart('prompt', planLines([prompt], person, recording).lines);
    state.control?.hint(true);
  }

  async function openPage(n, { dir = 0 } = {}) {
    if (destroyed || !pages.length) return;
    const num = Math.min(pages.length, Math.max(1, Math.round(Number(n)) || 1));
    pageCtl?.abort();
    // Turning the page (or reading it again) carries on reading.
    if (paused) setPaused(false);
    disarmIdle();
    disarmTurn();
    try {
      narrator.stop?.();
    } catch {
      /* ignore */
    }
    const ctl = childSignal(life.signal);
    pageCtl = ctl;
    const { signal } = ctl;
    const page = pages[num - 1];
    confettiLayer.replaceChildren(); // a party never follows us onto the next page
    let resolveCompletion;
    const completion = new Promise((r) => {
      resolveCompletion = r;
    });
    cur = { n: num, page, signal, completed: false, resolveCompletion, waiting: false, reprompted: false, celebration: null, finished: false };
    delete el.dataset.interacting;
    const state = cur;
    setState('reading');
    updateChrome(num);
    showPart('text', planLines(page.text ?? [], person, recording).lines);
    try {
      onPageChange?.(num);
    } catch (err) {
      console.warn('[reader] onPageChange failed', err);
    }
    // A grown-up's recording of this page, if there is one (fetched alongside the picture).
    const partsP = loadParts(num);
    showBadge(false);
    partsP.then((parts) => {
      if (cur === state && !signal.aborted) showBadge(Boolean(parts.main || parts.after));
    });

    let svg;
    try {
      [svg] = await Promise.all([loadScene(book, page, baseUrl), waitForFonts()]);
    } catch (err) {
      if (signal.aborted) return;
      console.warn(`[reader] page ${num}: ${err.message}`);
      svg = fallbackScene(page, err.message);
    }
    if (signal.aborted) return;
    mountScene(svg, dir);
    try {
      setupScene(svg, page, signal);
    } catch (err) {
      console.warn(`[reader] page ${num} could not be set up`, err);
    }
    for (const k of [num + 1, num - 1]) if (pages[k - 1]) prefetchScene(book, pages[k - 1], baseUrl);
    if (pages[num]) partsP.then(() => !signal.aborted && loadParts(num + 1));

    await sleep(reduced() || !dir ? 120 : SLIDE_MS, signal);
    if (signal.aborted) return;
    // Opened without a tap: the picture shows behind "Tap to start", and the
    // story begins (with sound) once someone taps.
    if (startGate) await untilAbort(startGate, signal);
    if (signal.aborted) return;
    playSeq(page.sfx?.open, signal);
    await writeNames(signal);
    if (signal.aborted) return;
    const parts = (await untilAbort(partsP, signal)) ?? {};
    if (signal.aborted) return;

    const mechanic = Boolean(page.mechanic?.type && page.mechanic.type !== 'none' && state.control);
    const prompt = page.prompt || '';
    if (parts.main) {
      // Grandma reads the page, then asks for the moving part, in one clip.
      const blocks = [{ part: 'text', lines: planLines(page.text ?? [], person, recording).lines }];
      if (mechanic && prompt) blocks.push({ part: 'prompt', lines: planLines([prompt], person, recording).lines });
      const r = await playClip(parts.main, blocks, signal, {
        onPart: (part, cut) => {
          if (part !== 'prompt') return;
          if (state.completed) return cut(); // already done it: no need to ask
          state.clipPrompt = true;
          state.cutClip = cut;
          enterWaiting(state);
        },
      });
      state.cutClip = null;
      if (signal.aborted) return;
      if (r === 'failed') {
        state.clipPrompt = false;
        await speak(page.text ?? [], 'text', signal, { show: textEl.dataset.part !== 'text' });
      }
    } else {
      await speak(page.text ?? [], 'text', signal, { show: false });
    }
    if (signal.aborted) return;

    if (mechanic) {
      if (!state.completed) {
        enterWaiting(state);
        if (!state.clipPrompt && prompt && setting('readPrompts', true) !== false) {
          state.promptCtl = childSignal(signal);
          await speak(prompt, 'prompt', state.promptCtl.signal, { show: false });
        }
        rearmIdle();
        await untilAbort(completion, signal);
        state.waiting = false;
        disarmIdle();
        if (signal.aborted) return;
      }
      setState('reading');
      delete el.dataset.interacting;
      await untilAbort(state.celebration, signal);
      if (signal.aborted) return;
      await readAfter(state, parts.after, signal);
      if (signal.aborted) return;
    } else if (page.after?.length) {
      // No working mechanism (e.g. the picture failed to load): carry on with the story.
      await readAfter(state, parts.after, signal);
      if (signal.aborted) return;
    }
    finishPage(state);
  }

  /** The payoff lines: Grandma's recording if there is one, otherwise the voice. */
  async function readAfter(state, clip, signal) {
    const lines = (state.page.after ?? []).filter((l) => typeof l === 'string' && l.trim());
    if (!clip || !lines.length) return speak(lines, 'after', signal);
    const tokenized = planLines(lines, person, recording).lines;
    showPart('after', tokenized);
    const r = await playClip(clip, [{ part: 'after', lines: tokenized }], signal);
    if (r === 'failed' && !signal.aborted) return speak(lines, 'after', signal, { show: false });
    return r;
  }

  function finishPage(state) {
    if (cur !== state) return;
    setState('done');
    state.finished = true;
    const last = state.n >= pages.length;
    if (last || state.page.kind === 'end') {
      state.isEnd = true;
      endBar.hidden = false;
    } else {
      nextWrap.classList.add('is-ready');
    }
    armTurn(state);
  }

  // ---- Turning by itself (settings.autoTurn, bedtime) ----------------------------
  let turnTimer = 0;
  function disarmTurn() {
    clearTimeout(turnTimer);
    turnTimer = 0;
    nextWrap.classList.remove('is-counting');
  }
  function armTurn(state) {
    disarmTurn();
    if (!state || cur !== state || !state.finished || paused || destroyed) return;
    if (state.isEnd) {
      // Bedtime: the last page lingers a moment, then the lights go down.
      if (isBedtime && !state.slept) {
        turnTimer = setTimeout(() => {
          if (cur !== state || paused || destroyed) return;
          state.slept = true;
          lightsOut();
        }, testScale(BEDTIME.fadeMs));
      }
      return;
    }
    if (isBedtime) {
      // A soft chime, then the page turns (tap the arrow to turn sooner).
      if (!state.chimed) {
        state.chimed = true;
        play('ding', { volume: BEDTIME.chimeVolume });
      }
      const ms = testScale(BEDTIME.turnMs);
      nextWrap.style.setProperty('--turn-ms', `${Math.round(ms)}ms`);
      void nextWrap.offsetWidth;
      nextWrap.classList.add('is-counting');
      turnTimer = setTimeout(() => cur === state && !paused && go(state.n + 1), ms);
    } else if (setting('autoTurn', false)) {
      turnTimer = setTimeout(() => cur === state && !paused && go(state.n + 1), AUTO_TURN_MS);
    }
  }

  function go(n) {
    if (destroyed || !cur) return;
    const target = Math.min(pages.length, Math.max(1, n));
    if (target === cur.n) return;
    play('swoosh');
    openPage(target, { dir: Math.sign(target - cur.n) });
  }

  // ---- Pause / play: the button, Space and K ----------------------------------------
  function setPaused(on) {
    const next = Boolean(on);
    if (next === paused || destroyed) return;
    paused = next;
    el.classList.toggle('is-paused', next);
    if (next) el.dataset.paused = '1';
    else delete el.dataset.paused;
    pauseBtn.innerHTML = ICONS[next ? 'play' : 'pause'];
    const label = next ? 'Carry on reading' : 'Pause the story';
    pauseBtn.setAttribute('aria-label', label);
    pauseBtn.title = label;
    pausedChip.hidden = !next;
    if (next) {
      disarmIdle();
      disarmTurn();
      talk?.abort();
      talk = null;
      try {
        narrator.stop?.();
      } catch {
        /* ignore */
      }
    } else {
      for (const wake of [...resumeWaiters]) wake();
      const state = cur;
      if (state?.waiting) rearmIdle();
      if (state?.finished) armTurn(state);
    }
  }
  const togglePause = () => {
    if (!night.classList.contains('is-on')) setPaused(!paused);
  };

  // ---- Name spotting: "That says Ava!" ----------------------------------------------
  const NAME_SLOTS = 'text.sb-name, .sb-letters';
  let spotCtl = null;

  /** A name the child can see right now (written in, not hidden, not the empty bunting). */
  function spottable(slot, svg) {
    if (!slot || !svg.contains(slot) || !isShown(slot, svg)) return false;
    if (slot.matches('text.sb-name')) {
      return Boolean(slot.textContent.trim()) && !slot.classList.contains('is-pending') && !slot.classList.contains('is-veiled');
    }
    return !slot.classList.contains('is-overflow') && [...slot.querySelectorAll('.sb-letter')].some((t) => t.textContent.trim() && !t.classList.contains('is-hidden'));
  }

  /** The name under (or right next to) a tap: small fingers get a generous margin. */
  function nameAt(ev, svg) {
    const t = ev.target;
    if (t?.closest?.('.sb-control, .sb-grabbable')) return null; // the moving part wins
    const direct = t?.closest?.(NAME_SLOTS);
    if (direct && spottable(direct, svg)) return direct;
    if (t?.closest?.('.sb-tappable')) return null; // a tap on something that makes a sound stays that
    let best = null;
    let bestD = Infinity;
    for (const slot of svg.querySelectorAll(NAME_SLOTS)) {
      if (!spottable(slot, svg)) continue;
      const r = slot.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const pad = Math.max(18, Math.min(44, r.height * 0.6));
      const dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right);
      const dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom);
      if (dx > pad || dy > pad) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        best = slot;
        bestD = d;
      }
    }
    return best;
  }

  function restartClass(node, cls, driven, delayMs = 0) {
    const target = needsAnimationWrapper(node, driven) ? animationWrapper(node) : node;
    target.classList.remove(cls);
    void target.getBBox?.();
    target.style.animationDelay = delayMs ? `${delayMs}ms` : '';
    target.classList.add(cls);
  }

  const SPOT_COLOURS = isBedtime ? ['#FFE7A3', '#FFD27A', '#FFF4D6', '#E9C46A'] : ['#FFC83D', '#E8505B', '#7EC8F0', '#6CC24A', '#F59A2B', '#3E7BDB'];
  const STAR_SVG = `<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-11 2.8-2.8 11 0 2.8 2.8 0 11-2.8 2.8-11 0-2.8-2.8Z" fill="currentColor" stroke="${isBedtime ? '#0B0F26' : '#2B2A33'}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  /** Stars burst out of the name (drawn in the HTML layer over the picture, sized in screen pixels). */
  function sparkleAround(slot) {
    const frame = confettiLayer.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    if (!r.width || !frame.width) return;
    const cx = r.left + r.width / 2 - frame.left;
    const cy = r.top + r.height / 2 - frame.top;
    const burst = h('div', { class: 'sb-spot', style: `left:${Math.round(cx)}px;top:${Math.round(cy)}px` });
    burst.append(h('span', { class: 'sb-spot-glow', style: `--w:${Math.round(r.width + 36)}px;--h:${Math.round(r.height + 28)}px` }));
    const n = reduced() ? 5 : 8;
    const rx = r.width / 2 + 22;
    const ry = r.height / 2 + 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.3;
      const size = 14 + ((i * 7) % 3) * 5;
      burst.append(
        h('span', {
          class: 'sb-spot-star',
          html: STAR_SVG,
          style: `--x:${Math.round(Math.cos(a) * rx)}px;--y:${Math.round(Math.sin(a) * ry)}px;--s:${size}px;--c:${SPOT_COLOURS[i % SPOT_COLOURS.length]};--d:${i * 35}ms`,
        }),
      );
    }
    confettiLayer.append(burst);
    setTimeout(() => burst.remove(), 1300);
  }

  function spotName(slot) {
    const state = cur;
    if (!state) return;
    const driven = state.drivenTargets ?? new Set();
    if (slot.matches('.sb-letters')) {
      // The letters jump one after another, like a wave along the bunting.
      [...slot.querySelectorAll('.sb-letter')].filter((t) => t.textContent.trim()).forEach((t, i) => restartClass(t, 'sb-name-spot', driven, i * 70));
    } else {
      restartClass(slot, 'sb-name-spot', driven);
    }
    sparkleAround(slot);
    play('sparkle');
    el.dataset.spotted = String((Number(el.dataset.spotted) || 0) + 1);
    if (state.waiting) rearmIdle(); // they're busy with the picture: no re-prompt just yet
    if (narrating || narrator.speaking) return; // don't talk over the story; the sparkle says it
    sayName();
  }

  async function sayName() {
    spotCtl?.abort();
    const ctl = childSignal(life.signal);
    spotCtl = ctl;
    try {
      if (recording.useRecording && recording.recordingId) {
        // The grown-up's own recording of the name, inside the line.
        await narrator.play(planLines([SPOT_LINE], person, recording), { signal: ctl.signal, rateScale: isBedtime ? BEDTIME.rate : 1 });
      } else {
        await narrator.speakText(fillSpoken(SPOT_LINE, person), { signal: ctl.signal });
      }
    } catch {
      /* a name that can't be said still sparkled */
    } finally {
      if (spotCtl === ctl) spotCtl = null;
    }
  }

  // ---- Goodnight -----------------------------------------------------------------
  function showNight() {
    night.replaceChildren(
      h('div', { class: 'sb-r-night-inner' }, h('span', { class: 'sb-r-night-moon', html: ICONS.moon }), h('p', { class: 'sb-r-night-text' }, `Night night, ${person.display}.`)),
    );
    night.hidden = false;
    void night.offsetWidth;
    night.classList.add('is-on');
    el.classList.add('is-goodnight');
  }

  async function goodnight() {
    pageCtl?.abort();
    disarmIdle();
    disarmTurn();
    try {
      narrator.stop?.();
    } catch {
      /* ignore */
    }
    showNight();
    await sleep(reduced() ? 1400 : 3200, life.signal);
    if (destroyed) return;
    if (typeof onExit === 'function') onExit();
    else {
      night.classList.remove('is-on');
      night.hidden = true;
      el.classList.remove('is-goodnight');
      openPage(1);
    }
  }

  /** Bedtime: the end page fades to dark and stays there, and the phone may sleep. */
  function lightsOut() {
    showNight();
    night.firstChild?.append(h('p', { class: 'sb-r-night-hint' }, 'Tap to see the last page again'));
    night.classList.add('is-sleepy');
    night.setAttribute('data-testid', 'night');
    night.title = 'Tap to turn the lights back on';
    el.classList.add('is-lights-out');
    releaseWakeLock();
  }
  /** A tap on the dark screen brings the last page back (Read again / Goodnight). */
  function lightsOn() {
    if (!night.classList.contains('is-sleepy')) return;
    night.classList.remove('is-on', 'is-sleepy');
    el.classList.remove('is-goodnight', 'is-lights-out');
    setTimeout(() => {
      if (!night.classList.contains('is-on')) night.hidden = true;
    }, reduced() ? 300 : 1000);
    lockScreen();
  }

  // ---- Input ---------------------------------------------------------------------
  const on = (target, type, fn, o) => target.addEventListener(type, fn, { ...o, signal: life.signal });

  on(prevBtn, 'click', () => cur && go(cur.n - 1));
  on(nextBtn, 'click', () => cur && go(cur.n + 1));
  on(replayBtn, 'click', () => cur && openPage(cur.n, { dir: 0 }));
  on(exitBtn, 'click', () => {
    pageCtl?.abort();
    try {
      narrator.stop?.();
    } catch {
      /* ignore */
    }
    onExit?.();
  });
  if (magicBtn) on(magicBtn, 'click', () => onMagic?.(cur?.n ?? startPage));
  on(againBtn, 'click', () => openPage(1, { dir: -1 }));
  on(nightBtn, 'click', goodnight);
  on(hearBtn, 'click', () => {
    unlockAudio();
    if (cur) openPage(cur.n, { dir: 0 });
  });
  on(textEl, 'click', (ev) => {
    const span = ev.target.closest?.('.sb-word');
    if (span) tapWord(span);
  });
  on(pauseBtn, 'click', togglePause);
  on(pausedChip, 'click', () => setPaused(false));
  on(night, 'click', lightsOn);
  // Name spotting. Capture phase, so a name inside something that makes a
  // sound when tapped (data-sfx) is spotted first; controls always win.
  on(
    bookEl,
    'click',
    (ev) => {
      if (!cur || Date.now() - lastSwipeAt < 400) return;
      const svg = bookEl.querySelector('.sb-r-page.is-current > svg');
      if (!svg || svg.classList.contains('sb-scene-missing') || !svg.contains(ev.target)) return;
      const slot = nameAt(ev, svg);
      if (!slot) return;
      ev.stopPropagation();
      spotName(slot);
    },
    { capture: true },
  );
  // Any first touch in the reader unlocks audio (it must be inside a gesture).
  on(el, 'pointerdown', () => !unlocked && unlockAudio(), { capture: true });

  // Swipe to turn pages; drags that start on a control never reach here
  // (controls stop propagation), and are double-checked by target.
  on(el, 'pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ev.target.closest?.('.sb-control, .sb-grabbable, button')) return;
    swipe = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now() };
  });
  on(el, 'pointerup', (ev) => {
    const s = swipe;
    swipe = null;
    if (!s || s.id !== ev.pointerId || !cur) return;
    const dx = ev.clientX - s.x;
    const dy = ev.clientY - s.y;
    const minDx = Math.max(50, el.clientWidth * 0.08);
    if (Math.abs(dx) > minDx && Math.abs(dx) > Math.abs(dy) * 1.4 && performance.now() - s.t < 900) {
      lastSwipeAt = Date.now();
      go(cur.n + (dx < 0 ? 1 : -1));
    }
  });
  on(el, 'pointercancel', () => {
    swipe = null;
  });
  on(document, 'keydown', (ev) => {
    if (!cur || ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target;
    if (t?.closest?.('[data-testid="control"], input, textarea, select, [contenteditable="true"]')) return;
    // A grown-up dialog on top (e.g. the parent gate, held with Space) keeps its keys.
    if (document.querySelector('[aria-modal="true"]:not([hidden])') && !el.contains(t)) return;
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') {
      ev.preventDefault();
      go(cur.n + 1);
    } else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
      ev.preventDefault();
      go(cur.n - 1);
    } else if (ev.key === 'k' || ev.key === 'K' || ev.key === ' ' || ev.key === 'Spacebar') {
      // Space on a focused button presses that button instead.
      if (ev.key !== 'k' && ev.key !== 'K' && t?.closest?.('button, [role="button"], a[href]')) return;
      ev.preventDefault();
      if (!ev.repeat) togglePause();
    }
  });
  if (mq?.addEventListener) on(mq, 'change', () => el.classList.toggle('is-reduced-motion', reduced()));
  if (document.fonts?.addEventListener) on(document.fonts, 'loadingdone', () => cur?.names?.refit());

  // ---- Keep the screen awake while reading ---------------------------------------
  async function lockScreen() {
    try {
      if (destroyed || el.classList.contains('is-lights-out') || document.visibilityState !== 'visible' || !navigator.wakeLock?.request) return;
      if (wakeLock && !wakeLock.released) return;
      wakeLock = await navigator.wakeLock.request('screen');
      if (destroyed || el.classList.contains('is-lights-out')) releaseWakeLock();
    } catch {
      wakeLock = null; // not allowed (battery saver, iframe, no gesture): fine
    }
  }
  function releaseWakeLock() {
    try {
      wakeLock?.release?.()?.catch?.(() => {});
    } catch {
      /* ignore */
    }
    wakeLock = null;
  }
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') lockScreen();
    else setPaused(true); // back to the phone later: the story waits, then re-reads the sentence
  });
  lockScreen();

  // ---- Go ----------------------------------------------------------------------
  const needsTap =
    typeof opts?.requireTap === 'boolean'
      ? opts.requireTap
      : !globalThis.SB_TEST && Boolean(globalThis.navigator?.userActivation) && !navigator.userActivation.hasBeenActive;
  if (needsTap) {
    // Opened without a tap (e.g. a reload): browsers won't let us talk yet.
    startLayer.hidden = false;
    let open;
    startGate = new Promise((r) => {
      open = r;
    });
    on(startLayer.querySelector('button'), 'click', () => {
      unlockAudio();
      startLayer.hidden = true;
      startGate = null;
      open();
    });
  }
  openPage(startPage);

  return {
    get page() {
      return cur?.n ?? startPage;
    },
    goTo(n) {
      if (!cur) {
        openPage(n);
        return;
      }
      if (Number(n) === cur.n) return;
      openPage(n, { dir: Math.sign(Number(n) - cur.n) || 1 });
    },
    replay() {
      if (cur) openPage(cur.n, { dir: 0 });
    },
    pause() {
      setPaused(true);
    },
    resume() {
      setPaused(false);
    },
    get paused() {
      return paused;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pageCtl?.abort();
      life.abort();
      disarmIdle();
      disarmTurn();
      for (const wake of [...resumeWaiters]) wake();
      try {
        narrator.stop?.();
      } catch {
        /* ignore */
      }
      for (const p of [...leaving, ...bookEl.querySelectorAll('.sb-r-page')]) p.__sbCleanup?.();
      leaving.clear();
      releaseWakeLock();
      el.remove();
    },
  };
}
