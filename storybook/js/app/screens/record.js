// #/b/:book/record — "Record the story in your voice" (grandparent mode).
//
// A grandparent (or anyone) reads the book aloud, page by page, from a big
// teleprompter with the child's name filled in. Each page has up to two
// parts: "main" (the words and the "your turn" prompt, read before the child
// works the moving part) and "after" (read once it has moved). Every part is
// saved as it's recorded, so nothing is lost if the phone rings. When they're
// done the reading plays instead of the computer voice, and they can send it
// to the family as one file.
//
// #/b/:book/record?reading=<id>  carry on / redo parts of an existing reading
// #/b/:book/record?for=gift      part of setting up a gift (js/app/screens/gift.js)

import { h, icon, button, linkButton, setBusy, clearToasts } from '../ui.js';
import { screen, privacyLine } from '../chrome.js';
import { normaliseName, nameKey, NAME_ERRORS, NAME_MAX_LENGTH, tokenizeLine, person as makePerson } from '../../core/personalise.js';
import { activeProfile, newId, upsertProfile, upsertReading } from '../../core/storage.js';
import { recordingSteps, readingCoverage, clock, formatDuration, storyTitle } from '../../family/family.js';
import { partBlobId, PACK_LIMITS } from '../../family/pack.js';
import { giftDraft } from '../../family/drafts.js';
import { defaultPronunciation } from './name.js';
import { sendReading, readingPack, landingUrl, displayUrl } from '../family-ui.js';

/** " (about 3 MB)" for the pack a reading makes (base64 adds about a third). */
export function sizeLabel(audioBytes) {
  const mb = (Number(audioBytes) || 0) * 1.37 / (1024 * 1024);
  if (!mb) return '';
  return mb < 1 ? ' (under 1 MB)' : ` (about ${Math.round(mb)} MB)`;
}

/** Longest single part (a page's words), in ms. */
export const READING_MAX_MS = 60000;

/** Parent-friendly words for a recorder error code, for reading a whole page. */
export function recorderMessage(code) {
  switch (code) {
    case 'denied':
      return 'To record, please allow the microphone when your browser asks (or in its settings), then try again.';
    case 'no-mic':
      return 'We couldn’t find a microphone on this device.';
    case 'busy':
      return 'The microphone is busy in another app. Close that app and try again.';
    case 'silent':
      return 'We couldn’t hear anything. Try again, a little closer to the phone.';
    case 'unsupported':
      return 'This browser can’t record sound. On an iPhone use Safari; on Android use Chrome.';
    case 'aborted':
      return 'Recording stopped.';
    default:
      return 'Something went wrong while recording. Please try again.';
  }
}

const wait = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms * (Number(globalThis.SB_TEST?.timeScale) || 1));
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

/** Make a recording smaller (22.05 kHz mono WAV) so a whole book fits in one file. Keeps the original if that fails. */
async function compact(blob) {
  try {
    const mix = await import('../../audio/mix.js');
    const out = await mix.concatToWav([blob], { sampleRate: 22050 });
    return out?.size ? out : blob;
  } catch {
    return blob;
  }
}

/** The lines of a step as nodes, the name picked out, the prompt marked as "their turn". */
function teleprompterLines(step, who) {
  return step.lines.map((template, i) => {
    const { units } = tokenizeLine(template, who);
    const isPrompt = i === step.promptIndex;
    return h(
      'p',
      { class: `tp-line${isPrompt ? ' tp-prompt' : ''}` },
      isPrompt ? h('span', { class: 'tp-turn' }, icon('hand', { size: 18 }), 'Their turn') : null,
      units.flatMap((u, j) => [j ? ' ' : null, u.isName ? h('span', { class: 'tp-name' }, u.text) : u.text]),
    );
  });
}

export function render(root, ctx) {
  const { book, bookId } = ctx;
  const steps = recordingSteps(book);
  const giftMode = ctx.query?.for === 'gift';
  const draft = giftMode ? giftDraft(bookId) : null;
  if (giftMode && !draft.childName) {
    ctx.navigate(`#/b/${bookId}/gift`, { replace: true });
    return null;
  }
  const life = new AbortController();
  const existing = ctx.query?.reading ? (ctx.state.readings ?? []).find((r) => r.id === ctx.query.reading && r.bookId === bookId) ?? null : null;
  const profile = activeProfile(ctx.state);

  /** @type {{id: string, bookId: string, readerName: string, language?: string, parts: object}} */
  let reading = existing ? JSON.parse(JSON.stringify(existing)) : null;
  let childName = giftMode ? draft.childName : profile?.display ?? '';
  let rec = null; // js/audio/recorder.js
  let wakeLock = null;
  const takes = new Map(); // "n:part" -> {blob, durationMs}

  const bodyHost = h('div', { class: 'record-stage-host' });
  const back = giftMode ? { href: `#/b/${bookId}/gift`, label: 'Back to the gift', text: 'Gift' } : { href: `#/b/${bookId}`, label: 'Back to the book', text: 'Back' };
  const { el } = screen(ctx, { name: 'record', back, body: bodyHost });
  root.append(el);

  const recReady = import('../../audio/recorder.js')
    .then((m) => (rec = m))
    .catch(() => null);

  // ---- 1. Who's reading? ----------------------------------------------------------------------
  function showSetup() {
    const readerInput = h('input', { id: 'reader-name', class: 'text-input', type: 'text', 'data-testid': 'reader-name', maxlength: String(PACK_LIMITS.readerName), autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next', placeholder: 'e.g. Grandma Rose', value: reading?.readerName ?? draft?.from ?? '', 'aria-describedby': 'reader-name-hint' });
    const childInput = h('input', { id: 'record-child', class: 'text-input', type: 'text', 'data-testid': 'record-child', maxlength: String(NAME_MAX_LENGTH), autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'done', placeholder: 'e.g. Ava', value: childName, readonly: giftMode });
    const langInput = h('input', { id: 'reader-language', class: 'text-input', type: 'text', 'data-testid': 'reader-language', maxlength: String(PACK_LIMITS.language), autocomplete: 'off', autocapitalize: 'words', placeholder: 'e.g. Urdu, Polish, Cymraeg', value: reading?.language ?? '' });
    const error = h('p', { class: 'field-error', role: 'alert', 'data-testid': 'record-error', hidden: true });
    const micNote = h('p', { class: 'voice-note', hidden: true, 'data-testid': 'no-mic' }, icon('info', { size: 18 }), h('span'));
    const begin = button({ text: reading ? 'Carry on recording' : 'Let’s start', iconAfter: 'arrow', variant: 'primary', size: 'lg', testid: 'record-begin', type: 'submit', class: 'record-begin' });
    const lang = h('details', { class: 'lang-details', open: Boolean(reading?.language) },
      h('summary', {}, 'Reading in another language?'),
      h('label', { class: 'field-label', for: 'reader-language' }, 'Which language?'),
      langInput,
      h('p', { class: 'field-hint' }, 'Read the English words, or tell the story in your own words — the pictures still move along. We won’t light up the English words while you speak.'));

    const form = h(
      'form',
      { class: 'card record-setup', novalidate: true, autocomplete: 'off' },
      h('label', { class: 'field-label', for: 'reader-name' }, 'Who’s reading?'),
      readerInput,
      h('p', { class: 'field-hint', id: 'reader-name-hint' }, 'The story will show “Read by …” with this name. Use what the little one calls you.'),
      h('label', { class: 'field-label', for: 'record-child' }, giftMode ? 'Reading to' : 'Who are you reading to?'),
      childInput,
      lang,
      error,
      micNote,
      h('div', { class: 'record-setup-actions' }, begin),
    );

    const intro = h(
      'section',
      { class: 'record-intro' },
      h('p', { class: 'eyebrow' }, giftMode ? 'Part of your gift' : 'Grandparents, aunties, everyone'),
      h('h1', {}, 'Record the story in your voice'),
      h('p', { class: 'lead' }, `Read “${storyTitle(book, childName || '')}” aloud, page by page. When the pages turn, it’s your voice they’ll hear.`),
    );
    const how = h(
      'section',
      { class: 'card record-how', 'aria-labelledby': 'record-how-title' },
      h('h2', { id: 'record-how-title' }, 'How it works'),
      h('ol', { class: 'how-steps record-how-steps' },
        howStep('book', 'We show the words', 'Each page appears in big letters, with the name already filled in.'),
        howStep('mic', 'Tap record and read', 'Tap stop when you’ve finished the page. Listen back, or try again.'),
        howStep('heart', 'About three minutes', 'Stop whenever you like: the computer voice reads anything you skip.')),
    );
    bodyHost.replaceChildren(h('div', { class: 'record-setup-grid' }, h('div', {}, intro, form), h('div', { class: 'record-side' }, how, privacyLine('Your recording stays on this phone unless you choose to send it.'))));

    recReady.then(() => {
      if (life.signal.aborted) return;
      if (!rec?.isRecordingSupported?.()) {
        micNote.lastChild.textContent = rec ? recorderMessage('unsupported') : 'Recording isn’t available here yet.';
        micNote.hidden = false;
        begin.disabled = true;
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const who = readerInput.value.replace(/\s+/g, ' ').trim();
      if (!who) {
        error.textContent = 'Please type your name, like “Grandma Rose”.';
        error.hidden = false;
        readerInput.focus();
        return;
      }
      const n = normaliseName(childInput.value);
      if (!n.ok) {
        error.textContent = NAME_ERRORS[n.error] ?? NAME_ERRORS['invalid-chars'];
        error.hidden = false;
        childInput.focus();
        return;
      }
      error.hidden = true;
      childName = n.display;
      if (!giftMode) {
        // So "Play it now" works on this phone: the child becomes the one we're reading for.
        const known = ctx.state.profiles.find((p) => p.key === n.key || (p.fullName && nameKey(p.fullName) === n.key));
        if (known) ctx.setState((s) => ({ ...s, activeProfileId: known.id }));
        else ctx.setState((s) => upsertProfile(s, { id: newId('child'), display: n.display, key: n.key, pronunciation: defaultPronunciation(ctx.lexicon, n.display) }));
      } else {
        draft.from ||= who;
      }
      reading = { ...(reading ?? { id: newId('reading'), bookId, parts: {} }), readerName: who, language: langInput.value.replace(/\s+/g, ' ').trim() };
      if (existing) saveReading();
      const first = steps.findIndex((s) => !reading.parts?.[s.n]?.[s.part]);
      showSteps(existing && first >= 0 ? first : 0);
    });
    if (!readerInput.value) readerInput.focus({ preventScroll: true });
  }

  function howStep(ic, title, text) {
    return h('li', { class: 'how-step' }, h('span', { class: 'how-icon', 'aria-hidden': 'true' }, icon(ic, { size: 24 })), h('div', {}, h('strong', {}, title), h('p', {}, text)));
  }

  function saveReading({ activate = false } = {}) {
    if (!reading) return;
    const snapshot = JSON.parse(JSON.stringify(reading));
    ctx.setState((s) => upsertReading(s, snapshot, { activate }));
  }

  // ---- 2. Page by page ------------------------------------------------------------------------
  let index = 0;
  let mode = 'idle'; // idle | countdown | recording | processing | done
  let recCtl = null;
  let playCtl = null;
  let tick = null;

  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock?.request) wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {
      wakeLock = null;
    }
  }

  function stopPlayback() {
    playCtl?.abort();
    playCtl = null;
  }

  // The page's picture, small, so the reader can see where they are in the book.
  const scenes = new Map(); // page n -> Promise<SVGSVGElement|null>
  function sceneFor(n, who) {
    if (!scenes.has(n)) {
      const page = book.pages.find((p) => p.n === n);
      scenes.set(n, Promise.all([import('../../reader/scene.js'), import('../../reader/name-fit.js')])
        .then(async ([scene, fit]) => {
          const svg = await scene.loadScene(book, page, ctx.baseUrl);
          fit.fillNameSlots(svg, who, { animate: false });
          svg.setAttribute('aria-hidden', 'true');
          svg.setAttribute('focusable', 'false');
          return svg;
        })
        .catch(() => null));
    }
    return scenes.get(n);
  }

  function showSteps(start = 0) {
    index = Math.max(0, Math.min(steps.length - 1, start));
    keepAwake(true);
    clearToasts(); // nothing covering the record button
    const who = makePerson(childName || 'your little one');

    const progressText = h('p', { class: 'rec-progress-text', 'data-testid': 'rec-progress' });
    const bar = h('div', { class: 'rec-steps', role: 'group', 'aria-label': 'Parts of the book' });
    const finishTop = button({ text: 'Finish', icon: 'check', variant: 'quiet', size: 'sm', testid: 'rec-finish', class: 'rec-finish', onClick: () => finish() });
    const top = h('div', { class: 'rec-top' }, h('div', { class: 'rec-top-row' }, progressText, finishTop), bar);

    const tpTitle = h('p', { class: 'tp-title', 'data-testid': 'tp-title' });
    const tpLines = h('div', { class: 'tp-lines', 'data-testid': 'teleprompter', lang: book?.lang ?? 'en-GB' });
    const tpCue = h('p', { class: 'tp-cue' });
    const tpScene = h('div', { class: 'tp-scene', 'aria-hidden': 'true' });
    const tp = h('section', { class: 'card teleprompter', 'aria-live': 'polite' }, h('div', { class: 'tp-head' }, tpTitle, tpScene), tpLines, tpCue);

    const status = h('p', { class: 'rec-status', 'aria-live': 'polite', 'data-testid': 'rec-status' });
    const meterBars = Array.from({ length: 9 }, () => h('span', { class: 'rec-bar' }));
    const meter = h('div', { class: 'rec-meter', 'aria-hidden': 'true' }, meterBars);
    const clockEl = h('span', { class: 'rec-clock', 'data-testid': 'rec-clock' }, '0:00');
    const count = h('span', { class: 'rec-count', 'aria-hidden': 'true' });

    const recordBtn = button({ text: 'Record', icon: 'record', variant: 'rec', size: 'lg', testid: 'rec-start', class: 'rec-main', onClick: () => startRecording() });
    const stopBtn = button({ text: 'Stop', icon: 'stop', variant: 'rec-stop', size: 'lg', testid: 'rec-stop', class: 'rec-main', onClick: () => recCtl?.abort() });
    const listenBtn = button({ text: 'Listen', icon: 'play', variant: 'secondary', size: 'md', testid: 'rec-listen', attrs: { 'aria-pressed': 'false' }, onClick: () => listen() });
    const redoBtn = button({ text: 'Redo', icon: 'refresh', variant: 'secondary', size: 'md', testid: 'rec-redo', onClick: () => startRecording() });
    const nextBtn = button({ text: 'Next', iconAfter: 'arrow', variant: 'primary', size: 'md', testid: 'rec-next', onClick: () => go(index + 1) });
    const skipBtn = button({ text: 'Skip', iconAfter: 'skip', variant: 'quiet', size: 'sm', testid: 'rec-skip', onClick: () => go(index + 1) });
    const prevBtn = button({ label: 'Previous part', icon: 'back', variant: 'quiet', size: 'md', testid: 'rec-prev', class: 'rec-prev', onClick: () => go(index - 1) });

    const controls = h('div', { class: 'rec-controls', 'data-testid': 'rec-controls' });
    const dock = h('div', { class: 'rec-dock' }, h('div', { class: 'rec-dock-inner' }, status, controls));

    // A glance at what comes next, like a teleprompter's next line.
    const upNext = h('p', { class: 'tp-next', 'aria-hidden': 'true' });
    const layout = h('div', { class: 'record-steps-layout' }, top, tp, upNext, dock);
    bodyHost.replaceChildren(layout);

    function renderBar() {
      bar.replaceChildren(
        ...steps.map((s, i) => {
          const done = Boolean(reading.parts?.[s.n]?.[s.part]);
          return h('button', {
            type: 'button',
            class: `rec-step${done ? ' is-done' : ''}${i === index ? ' is-current' : ''}`,
            'aria-label': `${s.title}: ${done ? 'recorded' : 'not recorded yet'}`,
            'aria-current': i === index ? 'step' : null,
            'data-testid': 'rec-step',
            onClick: () => go(i),
          });
        }),
      );
      const cov = readingCoverage(reading, steps);
      const step = steps[index];
      const pages = book.pages.length;
      progressText.replaceChildren(h('strong', {}, step.pageKind === 'cover' ? 'Cover' : `Page ${step.n} of ${pages}`), h('span', {}, ` · ${cov.done} of ${cov.total} parts recorded`));
      finishTop.querySelector('.btn-text').textContent = cov.done ? 'Finish' : 'Finish later';
    }

    function renderStep() {
      const step = steps[index];
      tpTitle.textContent = step.title;
      tpLines.replaceChildren(...teleprompterLines(step, who));
      tpCue.textContent = step.cue;
      tpCue.hidden = !step.cue;
      const next = steps[index + 1];
      upNext.replaceChildren(...(next ? [h('strong', {}, 'Up next: '), `${next.title} — `, h('span', {}, `“${tokenizeLine(next.lines[0], who).display}”`)] : [h('strong', {}, 'Last one! '), 'Then tap Finish.']));
      tp.dataset.part = step.part;
      if (tpScene.dataset.page !== String(step.n)) {
        tpScene.dataset.page = String(step.n);
        tpScene.replaceChildren();
        sceneFor(step.n, who).then((svg) => {
          if (svg && tpScene.dataset.page === String(step.n) && !life.signal.aborted) tpScene.replaceChildren(svg.cloneNode(true));
        });
      }
      renderBar();
      const key = `${step.n}:${step.part}`;
      const saved = reading.parts?.[step.n]?.[step.part];
      if (saved && !takes.has(key)) {
        // A part recorded earlier (carrying on): fetch it so it can be heard.
        ctx.blobs.get(saved).then((blob) => {
          if (blob && !life.signal.aborted) {
            takes.set(key, { blob, durationMs: 0 });
            if (steps[index] === step && mode === 'idle') setMode('done');
          }
        }).catch(() => {});
      }
      setMode(takes.has(key) || saved ? 'done' : 'idle');
      status.textContent = saved || takes.has(key) ? 'Recorded. Listen back, redo it, or go on.' : index === 0 ? 'Tap the red button, then read the words above. Tap stop when you’ve finished.' : 'Tap record when you’re ready.';
    }

    function setMode(m) {
      mode = m;
      dock.dataset.mode = m;
      layout.dataset.mode = m;
      finishTop.disabled = m === 'countdown' || m === 'recording' || m === 'processing';
      const last = index === steps.length - 1;
      nextBtn.querySelector('.btn-text').textContent = last ? 'Finish' : 'Next';
      prevBtn.disabled = index === 0;
      const nav = (main) => [h('div', { class: 'rec-nav' }, prevBtn), h('div', { class: 'rec-centre' }, ...main), h('div', { class: 'rec-nav rec-nav-end' }, m === 'done' ? nextBtn : skipBtn)];
      if (m === 'idle') controls.replaceChildren(...nav([recordBtn]));
      else if (m === 'countdown') controls.replaceChildren(...nav([count]));
      else if (m === 'recording') controls.replaceChildren(h('div', { class: 'rec-live' }, h('span', { class: 'rec-dot', 'aria-hidden': 'true' }), clockEl, meter), stopBtn);
      else if (m === 'processing') controls.replaceChildren(h('p', { class: 'rec-processing' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Saving…'));
      else controls.replaceChildren(...nav([listenBtn, redoBtn]));
      skipBtn.hidden = last;
      if (m === 'idle' && last) controls.lastChild.replaceChildren(button({ text: 'Finish', icon: 'check', variant: 'secondary', size: 'sm', testid: 'rec-finish-last', onClick: () => finish() }));
    }

    function go(i) {
      if (mode === 'recording' || mode === 'countdown' || mode === 'processing') return;
      stopPlayback();
      if (i >= steps.length) return finish();
      index = Math.max(0, Math.min(steps.length - 1, i));
      renderStep();
      tp.scrollIntoView?.({ block: 'nearest' });
    }

    async function startRecording() {
      if (!rec?.recordName) {
        status.textContent = recorderMessage('unsupported');
        return;
      }
      stopPlayback();
      const step = steps[index];
      const key = `${step.n}:${step.part}`;
      recCtl = new AbortController();
      const my = recCtl;
      setMode('countdown');
      for (const n of [3, 2, 1]) {
        count.textContent = String(n);
        count.classList.remove('is-tick');
        void count.offsetWidth;
        count.classList.add('is-tick');
        status.textContent = n === 3 ? 'Get ready… 3' : String(n);
        await wait(600, life.signal);
        if (life.signal.aborted) return;
      }
      setMode('recording');
      status.textContent = 'Recording… read the words, then tap stop.';
      const t0 = Date.now();
      tick = setInterval(() => {
        clockEl.textContent = `${clock(Date.now() - t0)} / ${clock(READING_MAX_MS)}`;
      }, 250);
      clockEl.textContent = `0:00 / ${clock(READING_MAX_MS)}`;
      try {
        const result = await rec.recordName({
          maxMs: READING_MAX_MS,
          autoStop: false,
          signal: my.signal,
          onLevel: (level) => meterBars.forEach((b, i) => b.style.setProperty('--lvl', String(Math.max(0.12, Math.min(1, level * (1.3 - Math.abs(i - 4) * 0.14)))))),
        });
        clearInterval(tick);
        if (life.signal.aborted) return;
        setMode('processing');
        const blob = await compact(result.blob);
        const id = partBlobId(reading.id, step.n, step.part);
        await ctx.blobs.put(id, blob);
        if (life.signal.aborted) return;
        takes.set(key, { blob, durationMs: result.durationMs });
        reading.parts = { ...(reading.parts ?? {}) };
        reading.parts[step.n] = { main: null, after: null, ...(reading.parts[step.n] ?? {}), [step.part]: id };
        saveReading();
        if (steps[index] !== step) return;
        setMode('done');
        renderBar();
        status.textContent = `Got it${result.durationMs ? ` (${formatDuration(result.durationMs)})` : ''}. Listen back, redo it, or go on.`;
        nextBtn.focus({ preventScroll: true });
      } catch (err) {
        clearInterval(tick);
        if (life.signal.aborted) return;
        setMode(takes.has(key) || reading.parts?.[step.n]?.[step.part] ? 'done' : 'idle');
        status.textContent = recorderMessage(err?.code);
      } finally {
        if (recCtl === my) recCtl = null;
      }
    }

    async function listen() {
      const step = steps[index];
      const take = takes.get(`${step.n}:${step.part}`);
      if (playCtl) {
        stopPlayback();
        return;
      }
      if (!take?.blob || !rec?.playBlob) return;
      playCtl = new AbortController();
      const my = playCtl;
      listenBtn.classList.add('is-playing');
      listenBtn.setAttribute('aria-pressed', 'true');
      try {
        await rec.playBlob(take.blob, { signal: my.signal });
      } catch {
        status.textContent = 'That recording won’t play on this device. Try recording it again.';
      } finally {
        if (playCtl === my) playCtl = null;
        listenBtn.classList.remove('is-playing');
        listenBtn.setAttribute('aria-pressed', 'false');
      }
    }

    renderStep();
  }

  // ---- 3. All done ------------------------------------------------------------------------------
  function finish() {
    stopPlayback();
    recCtl?.abort();
    keepAwake(false);
    const cov = readingCoverage(reading, steps);
    if (cov.done) saveReading({ activate: !giftMode });
    if (giftMode) {
      if (cov.done) {
        draft.readingId = reading.id;
        draft.includeReading = true;
      }
      ctx.navigate(`#/b/${bookId}/gift`);
      return;
    }
    const title = storyTitle(book, childName);
    const who = reading?.readerName || 'you';
    if (!cov.done) {
      bodyHost.replaceChildren(h('section', { class: 'record-done card' },
        h('h1', {}, 'Nothing recorded yet'),
        h('p', { class: 'lead' }, 'Come back whenever you’re ready — it only takes a few minutes.'),
        h('div', { class: 'record-done-actions' },
          button({ text: 'Start recording', icon: 'mic', variant: 'primary', size: 'lg', testid: 'rec-resume', onClick: () => showSteps(0) }),
          linkButton({ text: 'Back to the book', href: `#/b/${bookId}`, icon: 'book', variant: 'secondary', size: 'lg' }))));
      return;
    }
    const linkHost = h('div', { class: 'download-host', hidden: true });
    const sizeBytes = [...takes.values()].reduce((n, t) => n + (t.blob?.size ?? 0), 0);
    const prebuilt = readingPack(ctx, reading, { childName });
    prebuilt.catch(() => {});
    const send = button({ text: 'Send to family', icon: 'share', variant: 'secondary', size: 'lg', testid: 'rec-send' });
    send.addEventListener('click', async () => {
      setBusy(send, true);
      await sendReading(ctx, reading, { book, childName, host: linkHost, prebuilt });
      setBusy(send, false);
    });
    const playNow = button({
      text: 'Play it now',
      icon: 'play',
      variant: 'primary',
      size: 'lg',
      testid: 'rec-play-now',
      onClick: () => {
        ctx.setState((s) => ({ ...s, activeReading: { ...(s.activeReading ?? {}), [bookId]: reading.id } }));
        ctx.navigate(`#/b/${bookId}/read/1`);
      },
    });
    const urlLine = h('strong', { class: 'nowrap-url' }, '…');
    landingUrl(bookId).then((u) => (urlLine.textContent = displayUrl(u)));
    bodyHost.replaceChildren(
      h('section', { class: 'record-done', 'data-testid': 'record-done' },
        h('div', { class: 'done-art', 'aria-hidden': 'true' }, icon('heart', { size: 44 })),
        h('p', { class: 'eyebrow' }, 'All saved'),
        h('h1', {}, `Thank you, ${who}!`),
        h('p', { class: 'lead' }, `Your reading of “${title}” is ready. `, cov.complete ? 'Every page is in your voice.' : `${cov.done} of ${cov.total} parts are in your voice — the computer voice reads the rest.`),
        h('div', { class: 'record-done-actions' }, playNow, send),
        linkHost,
        h('div', { class: 'card send-explain' },
          h('h2', {}, 'Sending it to the family'),
          h('ol', { class: 'send-steps' },
            h('li', {}, `“Send to family” makes one file${sizeLabel(sizeBytes)}. Send it by WhatsApp, email or AirDrop.`),
            h('li', {}, 'They open the book’s page — ', urlLine, ' — and tap “Open a family recording”.'),
            h('li', {}, `Then every time they read “${title}”, it’s you they’ll hear.`)),
          privacyLine('Your recording stays on this phone unless you send it. No account, no uploads.')),
        h('div', { class: 'record-more' },
          button({ text: 'Redo a page', icon: 'refresh', variant: 'link', size: 'sm', testid: 'rec-more', onClick: () => showSteps(0) }),
          linkButton({ text: 'Back to the book', href: `#/b/${bookId}`, icon: 'book', variant: 'link', size: 'sm', testid: 'rec-back-book' }))),
    );
  }

  showSetup();

  return () => {
    life.abort();
    recCtl?.abort();
    stopPlayback();
    clearInterval(tick);
    keepAwake(false);
  };
}
