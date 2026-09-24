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

import { bookUrl } from '../core/book.js';
import { fillTemplate, person as makePerson } from '../core/personalise.js';
import { planLines, estimateTimeline, estimateUnitMs } from '../narrator/plan.js';
import { loadScene, prefetchScene, parseSvg, animationWrapper, needsAnimationWrapper, hoistAnimations, ANIMATION_CLASSES } from './scene.js';
import { createDriver, pick, applyMatrix } from './drive.js';
import { createControl } from './controls.js';
import { fillNameSlots } from './name-fit.js';

const IDLE_REPROMPT_MS = 8000; // tests may shorten it with SB_TEST.idleMs
const SLIDE_MS = 420;
const SFX_GAP_MS = 250;
const AUTO_TURN_MS = 1600;

const ICONS = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v8.5h11V10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12a6.5 6.5 0 1 0 2-4.7M5 4.5v4h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  magic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="12.5" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="13.2" r="3.3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8.5 7 10 4.5h4L15.5 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M19.5 1.8l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L12 11.7l-3.7 2.4 1.1-4.3L6 7l4.4-.3z" fill="currentColor"/><path d="M5 17.5c2.2 2.6 11.8 2.6 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M42 8a24 24 0 1 0 14 38A20 20 0 0 1 42 8z" fill="#FFE9A8"/><circle cx="14" cy="12" r="2" fill="#FFE9A8"/><circle cx="54" cy="16" r="1.6" fill="#FFE9A8"/><circle cx="8" cy="40" r="1.4" fill="#FFE9A8"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
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
 *   person: {display: string, say: string},
 *   pronunciation?: {useRecording?: boolean, recordingId?: string|null},
 *   settings?: {highlight?: boolean, autoTurn?: boolean, readPrompts?: boolean},
 *   narrator?: object, sfx?: {play(name: string): void, unlock?(): void},
 *   startPage?: number, onPageChange?: (n: number) => void, onExit?: () => void, onMagic?: (n: number) => void,
 *   requireTap?: boolean,
 * }} opts  requireTap: show "Tap to start" first (default: only when the page has had no user gesture yet,
 *   since browsers block speech and sound until then).
 * @returns {Promise<{destroy(): void, goTo(n: number): void, replay(): void, readonly page: number}>}
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
  } = opts ?? {};
  const baseUrl = opts?.baseUrl ?? bookUrl(bookId);
  const pages = Array.isArray(book?.pages) ? book.pages : [];
  const person = who?.display ? makePerson(who.display, who.say) : makePerson('Friend');
  let narrator = opts?.narrator ?? createSilentNarrator();
  const recording = { useRecording: Boolean(pronunciation?.useRecording), recordingId: pronunciation?.recordingId ?? null };
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
  const bookEl = h('div', { class: 'sb-r-book' });
  const confettiLayer = h('div', { class: 'sb-r-confetti', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'sb-r-stage' }, h('div', { class: 'sb-r-frame' }, bookEl, confettiLayer));
  const textEl = h('div', { class: 'sb-r-text', 'data-testid': 'page-text' });
  const againBtn = h('button', { type: 'button', class: 'sb-r-pill sb-r-again', 'data-testid': 'read-again' }, h('span', { class: 'sb-r-pill-icon', html: ICONS.replay }), 'Read again');
  const nightBtn = h('button', { type: 'button', class: 'sb-r-pill sb-r-goodnight', 'data-testid': 'goodnight' }, h('span', { class: 'sb-r-pill-icon', html: ICONS.moon }), 'Goodnight');
  const endBar = h('div', { class: 'sb-r-endbar', hidden: true }, againBtn, nightBtn);
  const band = h('div', { class: 'sb-r-band' }, textEl, endBar);
  const hearBtn = h('button', { type: 'button', class: 'sb-r-pill sb-r-hear', 'data-testid': 'tap-to-hear', hidden: true }, h('span', { class: 'sb-r-pill-icon', html: ICONS.play }), 'Tap to hear the story');
  const night = h('div', { class: 'sb-r-night', hidden: true, 'aria-live': 'polite' });
  const startLayer = h('div', { class: 'sb-r-start', hidden: true },
    h('button', { type: 'button', class: 'sb-r-startbtn', 'data-testid': 'start-story' }, h('span', { class: 'sb-r-start-icon', html: ICONS.play }), h('span', {}, 'Tap to start the story')));

  const el = h(
    'section',
    { class: 'sb-reader', 'data-testid': 'reader', 'data-state': 'reading', 'data-page': String(startPage), 'aria-label': title, lang: book?.lang ?? 'en-GB' },
    h('div', { class: 'sb-r-top' }, exitBtn, dots, h('div', { class: 'sb-r-tools' }, magicBtn, replayBtn)),
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
  const play = (name) => {
    try {
      if (name) sfx?.play?.(name);
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

  let narrating = 0;
  /** Read lines aloud with highlighting. Resolves 'done' | 'stopped'. */
  async function speak(lines, kind, signal, { show = true } = {}) {
    const list = (Array.isArray(lines) ? lines : [lines]).filter((l) => typeof l === 'string' && l.trim());
    if (!list.length) return 'done';
    const plan = planLines(list, person, recording);
    if (show) showPart(kind, plan.lines);
    if (signal?.aborted) return 'stopped';
    const voice = cur?.page?.voice ?? {};
    narrating++;
    try {
      const r = await narrator.play(plan, {
        signal,
        onUnit: (line, unit) => !signal?.aborted && highlight(line, unit),
        rateScale: Number(voice.rate) || 1,
        pitchScale: Number(voice.pitch) || 1,
      });
      if (narrator.needsGesture && !unlocked) hearBtn.hidden = false;
      return r;
    } catch (err) {
      // A broken speech engine must never stop the story: carry on silently.
      console.warn('[reader] narration failed; continuing silently', err);
      narrator = createSilentNarrator();
      return narrator.play(plan, { signal, onUnit: (line, unit) => !signal?.aborted && highlight(line, unit) });
    } finally {
      narrating--;
      clearHighlight();
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
        if (ANIMATION_CLASSES.includes(cls)) animateClass(node, cls, drivenTargets);
        else node.classList.add(cls);
      }
    }
    const soundMs = playSeq(f.sfx ?? [], signal);
    if (f.confetti) burstConfetti();
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

  // ---- Idle re-prompt ------------------------------------------------------------
  let idleTimer = 0;
  function disarmIdle() {
    clearTimeout(idleTimer);
    idleTimer = 0;
  }
  function rearmIdle() {
    disarmIdle();
    const state = cur;
    if (!state || state.completed || state.reprompted || !state.waiting) return;
    idleTimer = setTimeout(async () => {
      if (cur !== state || state.completed || state.reprompted || destroyed) return;
      state.reprompted = true;
      state.control?.hint(true);
      if (setting('readPrompts', true) !== false && state.page.prompt) {
        state.promptCtl = childSignal(state.signal);
        await speak(state.page.prompt, 'prompt', state.promptCtl.signal, { show: false });
      }
    }, globalThis.SB_TEST?.idleMs ?? IDLE_REPROMPT_MS);
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

  async function openPage(n, { dir = 0 } = {}) {
    if (destroyed || !pages.length) return;
    const num = Math.min(pages.length, Math.max(1, Math.round(Number(n)) || 1));
    pageCtl?.abort();
    disarmIdle();
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
    cur = { n: num, page, signal, completed: false, resolveCompletion, waiting: false, reprompted: false, celebration: null };
    const state = cur;
    setState('reading');
    updateChrome(num);
    showPart('text', planLines(page.text ?? [], person, recording).lines);
    try {
      onPageChange?.(num);
    } catch (err) {
      console.warn('[reader] onPageChange failed', err);
    }

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

    await sleep(reduced() || !dir ? 120 : SLIDE_MS, signal);
    if (signal.aborted) return;
    // Opened without a tap: the picture shows behind "Tap to start", and the
    // story begins (with sound) once someone taps.
    if (startGate) await untilAbort(startGate, signal);
    if (signal.aborted) return;
    playSeq(page.sfx?.open, signal);
    await writeNames(signal);
    if (signal.aborted) return;
    await speak(page.text ?? [], 'text', signal, { show: false });
    if (signal.aborted) return;

    const mechanic = page.mechanic?.type && page.mechanic.type !== 'none' && state.control;
    if (mechanic) {
      if (!state.completed) {
        setState('waiting');
        state.waiting = true;
        const prompt = page.prompt || '';
        if (prompt) showPart('prompt', planLines([prompt], person, recording).lines);
        state.control.hint(true);
        if (prompt && setting('readPrompts', true) !== false) {
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
      await untilAbort(state.celebration, signal);
      if (signal.aborted) return;
      await speak(page.after ?? [], 'after', signal);
      if (signal.aborted) return;
    } else if (page.after?.length) {
      // No working mechanism (e.g. the picture failed to load): carry on with the story.
      await speak(page.after, 'after', signal);
      if (signal.aborted) return;
    }
    finishPage(state);
  }

  function finishPage(state) {
    if (cur !== state) return;
    setState('done');
    const last = state.n >= pages.length;
    if (last || state.page.kind === 'end') {
      endBar.hidden = false;
      return;
    }
    nextWrap.classList.add('is-ready');
    if (setting('autoTurn', false)) {
      sleep(AUTO_TURN_MS, state.signal).then(() => {
        if (!state.signal.aborted && cur === state) go(state.n + 1);
      });
    }
  }

  function go(n) {
    if (destroyed || !cur) return;
    const target = Math.min(pages.length, Math.max(1, n));
    if (target === cur.n) return;
    play('swoosh');
    openPage(target, { dir: Math.sign(target - cur.n) });
  }

  // ---- Goodnight -----------------------------------------------------------------
  async function goodnight() {
    pageCtl?.abort();
    disarmIdle();
    try {
      narrator.stop?.();
    } catch {
      /* ignore */
    }
    night.replaceChildren(
      h('div', { class: 'sb-r-night-inner' }, h('span', { class: 'sb-r-night-moon', html: ICONS.moon }), h('p', { class: 'sb-r-night-text' }, `Night night, ${person.display}.`)),
    );
    night.hidden = false;
    void night.offsetWidth;
    night.classList.add('is-on');
    el.classList.add('is-goodnight');
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
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') {
      ev.preventDefault();
      go(cur.n + 1);
    } else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
      ev.preventDefault();
      go(cur.n - 1);
    }
  });
  if (mq?.addEventListener) on(mq, 'change', () => el.classList.toggle('is-reduced-motion', reduced()));
  if (document.fonts?.addEventListener) on(document.fonts, 'loadingdone', () => cur?.names?.refit());

  // ---- Keep the screen awake while reading ---------------------------------------
  async function lockScreen() {
    try {
      if (destroyed || document.visibilityState !== 'visible' || !navigator.wakeLock?.request) return;
      wakeLock = await navigator.wakeLock.request('screen');
      if (destroyed) wakeLock?.release?.().catch?.(() => {});
    } catch {
      wakeLock = null; // not allowed (battery saver, iframe, no gesture): fine
    }
  }
  on(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') lockScreen();
    else {
      try {
        narrator.stop?.();
      } catch {
        /* ignore */
      }
    }
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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      pageCtl?.abort();
      life.abort();
      disarmIdle();
      try {
        narrator.stop?.();
      } catch {
        /* ignore */
      }
      for (const p of [...leaving, ...bookEl.querySelectorAll('.sb-r-page')]) p.__sbCleanup?.();
      leaving.clear();
      try {
        wakeLock?.release?.()?.catch?.(() => {});
      } catch {
        /* ignore */
      }
      wakeLock = null;
      el.remove();
    },
  };
}
