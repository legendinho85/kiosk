// #/b/:book/say — "How do we say Siobhan?"
//
// The parent listens to a few pronunciations (dictionary first), picks the
// right one, and can hear it inside a real line of the story. If none is
// right they can type it how it sounds, say it (speech recognition spells
// what it heard), or record their own voice for the story to play.

import { h, icon, button, respellNode, debounce, toast } from '../ui.js';
import { screen, voiceConsentCard, voicePrivacyLine, PRIVACY_WORDS } from '../chrome.js';
import { grownUpCheck } from '../parent-gate.js';
import { activeProfile } from '../../core/storage.js';
import { person as makePerson } from '../../core/personalise.js';
import { getCandidates, customCandidate } from '../../pronounce/index.js';
import { planLines } from '../../narrator/plan.js';
import { updateProfile } from '../../family/family.js';
import { storedPronunciation, editReturn } from './name.js';

export { storedPronunciation };

// ---- Pure helpers (unit-tested) ---------------------------------------------------------

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');

/**
 * Lines from the current book to try the name in: the title line and the
 * goodnight line when they exist (short, and the name is the star), else the
 * first lines that use the plain name ("Goal, Ava!" in Book 1, "Beep beep,
 * Ava!" in Book 2).
 * @param {object|null} book
 * @param {number} [max]
 * @returns {string[]}
 */
export function storyLines(book, max = 2) {
  const lines = (book?.pages ?? []).flatMap((p) => [...(p.text ?? []), ...(p.after ?? [])]).filter((l) => /\{name\}/.test(l));
  if (!lines.length) return [/\{name\}/.test(book?.title ?? '') ? book.title : 'Hello, {name}!'];
  const picked = [lines[0]];
  const last = lines[lines.length - 1];
  if (max > 1 && last !== lines[0]) picked.push(last);
  for (const l of lines) if (picked.length < max && !picked.includes(l)) picked.push(l);
  return picked.slice(0, max);
}

/**
 * Add candidates to a list, skipping ones that would sound the same.
 * @returns {{list: object[], added: object[]}}
 */
export function mergeCandidates(list, extra) {
  const out = [...list];
  const added = [];
  for (const c of extra) {
    if (!c?.say) continue;
    const same = out.find((o) => norm(o.say) === norm(c.say));
    if (same) continue;
    out.push(c);
    added.push(c);
  }
  return { list: out, added };
}

/** Which candidate matches the saved pronunciation (by what the voice says). -1 if none. */
export function findSaved(list, pronunciation) {
  if (!pronunciation?.say) return -1;
  return list.findIndex((c) => norm(c.say) === norm(pronunciation.say));
}

/** Short heading for a candidate card. */
export function candidateTitle(c) {
  if (c.source === 'as-written') return 'As it’s spelled';
  if (c.source === 'custom') return 'Your spelling';
  if (c.source === 'heard') return 'What we heard';
  return c.label || c.origin || 'Suggestion';
}

/** One line of context under a candidate. */
export function candidateNote(c) {
  return {
    dictionary: 'From our names dictionary',
    'as-written': 'How the voice reads the spelling',
    suggestion: 'A guess from the spelling',
    custom: 'Typed by you',
    heard: 'From what you said',
  }[c.source] ?? '';
}

// ---- Screen -----------------------------------------------------------------------------

export function render(root, ctx) {
  const bookId = ctx.bookId;
  // ?child=<id>: a child whose name is being changed (from settings or the
  // ready screen). Who the story is for doesn't change.
  const profile = (ctx.query?.child && ctx.state.profiles.find((p) => p.id === ctx.query.child)) || activeProfile(ctx.state);
  if (!profile) {
    ctx.navigate(`#/b/${bookId}`, { replace: true });
    return null;
  }
  const narrator = ctx.narrator;
  const life = new AbortController();
  const display = profile.display;
  const saved = profile.pronunciation ?? {};
  // A kept recording lives on the device under recordingId. A new take stays
  // in memory (ctx.scratch) under takeId until "Done", so going Back leaves
  // nothing behind and never replaces the kept one.
  const recordingId = saved.recordingId || `rec_${profile.id}`;
  const takeId = `rec_${profile.id}_take`;

  // Candidates: dictionary / as written / suggestions, plus the saved one if
  // the parent typed or said it last time. A provisional pronunciation (saved
  // before the dictionary loaded) was nobody's choice: the best guess wins.
  let lexicon = ctx.lexicon ?? null;
  const baseCandidates = () => {
    let list = getCandidates(lexicon, display, { max: 4 });
    if (findSaved(list, saved) < 0 && saved.say && (saved.source === 'custom' || saved.source === 'heard')) {
      list = mergeCandidates(list, [{ id: saved.source, say: saved.say, ipa: saved.ipa ?? '', respell: saved.respell ?? '', label: saved.label ?? '', source: saved.source }]).list;
    }
    return list;
  };
  const savedIndex = (list) => (saved.provisional ? -1 : findSaved(list, saved));
  let candidates = baseCandidates();
  let selected = candidates[Math.max(0, savedIndex(candidates))] ?? null;
  let chosenHere = false; // the parent tapped "That's it!" (or added a spelling) on this visit

  let recording = null; // {blob, durationMs, fresh?: true}
  let useRecording = Boolean(saved.useRecording && saved.recordingId);
  let playing = null; // {ctl, btn}

  // ---- Playback ---------------------------------------------------------------------------
  function stopPlaying() {
    if (!playing) return;
    playing.ctl.abort();
    playing.btn?.classList.remove('is-playing');
    playing.btn?.setAttribute('aria-pressed', 'false');
    playing.onStop?.();
    playing = null;
    try {
      narrator.stop?.();
    } catch {
      /* ignore */
    }
  }
  /** Run one playback at a time; tapping the same button again stops it. */
  async function playWith(btn, fn, onStop) {
    const wasMine = playing?.btn === btn;
    stopPlaying();
    if (wasMine) return;
    const ctl = new AbortController();
    life.signal.addEventListener('abort', () => ctl.abort(), { once: true });
    playing = { ctl, btn, onStop };
    btn.classList.add('is-playing');
    btn.setAttribute('aria-pressed', 'true');
    try {
      await fn(ctl.signal);
    } catch {
      /* a voice that can't speak is not an error to show */
    } finally {
      if (playing?.ctl === ctl) {
        playing = null;
        btn.classList.remove('is-playing');
        btn.setAttribute('aria-pressed', 'false');
        onStop?.();
      }
    }
  }
  const speak = (text, signal) => narrator.speakText(text, { signal });

  // ---- Candidate cards -------------------------------------------------------------------
  const list = h('ul', { class: 'cand-list', 'data-testid': 'candidates', role: 'list' });

  function card(c, i) {
    const isSel = selected && c.id === selected.id;
    const sound = c.respell ? respellNode(c.respell) : h('span', { class: 'cand-say' }, `“${c.say}”`);
    const title = candidateTitle(c);
    const play = button({ label: `Listen: ${title}`, icon: 'play', variant: 'play', size: 'lg', testid: 'candidate-play', class: 'cand-play', attrs: { 'aria-pressed': 'false' } });
    play.addEventListener('click', () => playWith(play, (signal) => speak(c.say, signal)));
    const choose = button({
      text: isSel ? 'Chosen' : 'That’s it!',
      icon: isSel ? 'check' : '',
      variant: isSel ? 'chosen' : 'secondary',
      size: 'md',
      testid: 'candidate-choose',
      class: 'cand-choose',
      // The accessible name starts with the words on the button (voice control: "tap That's it").
      attrs: { 'aria-pressed': String(Boolean(isSel)), 'aria-label': isSel ? `Chosen: ${title}` : `That’s it! ${title}` },
      onClick: () => chooseCandidate(c),
    });
    return h(
      'li',
      { class: `cand${isSel ? ' is-selected' : ''}${i === 0 && c.source === 'dictionary' ? ' is-best' : ''}`, 'data-testid': 'candidate', 'data-say': c.say, 'data-source': c.source, 'data-id': c.id },
      play,
      h('div', { class: 'cand-main' },
        i === 0 && c.source === 'dictionary' ? h('span', { class: 'cand-best' }, 'Best match') : null,
        h('p', { class: 'cand-sound' }, sound),
        h('p', { class: 'cand-label' }, h('strong', {}, title), candidateNote(c) ? h('span', {}, ` · ${candidateNote(c)}`) : null)),
      choose,
      isSel ? h('span', { class: 'cand-tick', 'aria-hidden': 'true' }, icon('check', { size: 18 })) : null,
    );
  }

  function renderList({ flash = null } = {}) {
    const focusedId = document.activeElement?.closest?.('.cand')?.dataset.id;
    const focusedTestid = document.activeElement?.dataset?.testid;
    list.replaceChildren(...candidates.map(card));
    if (flash) {
      const li = list.querySelector(`[data-id="${CSS.escape(flash)}"]`);
      li?.classList.add('is-new');
      li?.scrollIntoView?.({ block: 'center', behavior: matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    // Keep keyboard focus where it was after re-rendering.
    if (focusedId && focusedTestid) list.querySelector(`[data-id="${CSS.escape(focusedId)}"] [data-testid="${focusedTestid}"]`)?.focus();
    renderPreview();
  }

  function chooseCandidate(c) {
    selected = c;
    chosenHere = true;
    renderList();
    live.textContent = `Chosen: ${candidateTitle(c)}.`;
  }

  function addCandidates(extra, { select = true } = {}) {
    const { list: next, added } = mergeCandidates(candidates.filter((c) => !extra.some((e) => e.id === c.id)), extra);
    candidates = next;
    const pick = added[0] ?? candidates.find((c) => extra.some((e) => norm(e.say) === norm(c.say)));
    if (select && pick) {
      selected = pick;
      chosenHere = true;
    }
    renderList({ flash: pick?.id });
    return pick;
  }

  // ---- Hear it in the story ----------------------------------------------------------------
  const lines = storyLines(ctx.book);
  const preview = h('div', { class: 'story-preview', 'data-testid': 'story-preview', lang: ctx.book?.lang ?? 'en-GB' });
  const hearBtn = button({ text: 'Hear it in the story', icon: 'play', variant: 'secondary', size: 'md', testid: 'hear-in-story', class: 'hear-story-btn', attrs: { 'aria-pressed': 'false' } });

  const currentPerson = () => makePerson(display, selected?.say || display);
  const currentPlan = () => planLines(lines, currentPerson(), { useRecording: Boolean(useRecording && recording), recordingId: recording?.fresh ? takeId : recordingId, linePauseMs: 300 });

  function renderPreview() {
    const plan = currentPlan();
    preview.replaceChildren(
      ...plan.lines.map((line, li) =>
        h('p', { class: 'story-line' }, line.units.flatMap((u, ui) => [ui ? ' ' : null, h('span', { class: `sb-word${u.isName ? ' is-name' : ''}`, 'data-unit': `${li}:${ui}` }, u.text)]))),
    );
    return plan;
  }
  hearBtn.addEventListener('click', () => {
    const plan = renderPreview();
    let cur = null;
    playWith(
      hearBtn,
      (signal) =>
        narrator.play(plan, {
          signal,
          onUnit: (line, unit) => {
            const u = typeof unit === 'object' && unit ? unit.u : unit;
            cur?.classList.remove('is-current');
            cur = preview.querySelector(`[data-unit="${line}:${u}"]`);
            cur?.classList.add('is-current', 'is-read');
          },
        }),
      () => {
        cur?.classList.remove('is-current');
        for (const w of preview.querySelectorAll('.is-read')) w.classList.remove('is-read');
      },
    );
  });

  // ---- None of these? (a) type it how it sounds --------------------------------------------
  const customInput = h('input', {
    id: 'custom-say',
    class: 'text-input',
    type: 'text',
    'data-testid': 'custom-say',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'done',
    maxlength: '60',
    placeholder: 'e.g. shih-VAWN',
    'aria-describedby': 'custom-hint custom-preview',
  });
  const customPreview = h('p', { class: 'custom-preview', id: 'custom-preview', 'data-testid': 'custom-preview', 'aria-live': 'polite' });
  const customPlay = button({ text: 'Listen', icon: 'play', variant: 'secondary', size: 'md', testid: 'custom-play', attrs: { 'aria-pressed': 'false' } });
  const customUse = button({ text: 'Use this', icon: 'check', variant: 'primary', size: 'md', testid: 'custom-use' });
  const typedCandidate = () => customCandidate(customInput.value, 'custom');
  const updateCustom = () => {
    const c = typedCandidate();
    customPlay.disabled = customUse.disabled = !c;
    customPreview.replaceChildren();
    if (!c) return;
    customPreview.append(
      icon('speaker', { size: 18 }),
      h('span', {}, c.respell ? 'Stressing ' : 'The voice will say ', c.respell ? respellNode(c.respell) : h('strong', {}, `“${c.say}”`), c.respell ? h('span', {}, ` — the voice will say “${c.say}”`) : null),
    );
  };
  const updateCustomSoon = debounce(updateCustom, 120);
  customInput.addEventListener('input', updateCustomSoon);
  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      customUse.click();
    }
  });
  customPlay.addEventListener('click', () => {
    updateCustomSoon.flush();
    const c = typedCandidate();
    if (c) playWith(customPlay, (signal) => speak(c.say, signal));
  });
  customUse.addEventListener('click', () => {
    updateCustomSoon.flush();
    const c = typedCandidate();
    if (!c) return;
    addCandidates([{ ...c, id: 'custom' }]);
    live.textContent = `Added your spelling and chose it.`;
  });
  updateCustom();

  const typeBlock = h(
    'div',
    { class: 'alt alt-type' },
    h('div', { class: 'alt-head' }, h('span', { class: 'alt-icon', 'aria-hidden': 'true' }, icon('edit', { size: 22 })), h('h3', {}, h('label', { for: 'custom-say' }, 'Type it how it sounds'))),
    h('p', { class: 'alt-hint', id: 'custom-hint' }, 'Use hyphens and CAPITALS for the loud part, e.g. ', h('strong', {}, 'shih-VAWN'), '. Or just spell it the way it sounds, like ', h('strong', {}, 'Shivawn'), '.'),
    customInput,
    customPreview,
    h('div', { class: 'alt-actions' }, customPlay, customUse),
  );

  // ---- (b) Say it for us, (c) Record your voice: added when supported ----------------------
  const sayBlockHost = h('div', { class: 'alt-host' });
  const recordBlockHost = h('div', { class: 'alt-host' });

  import('../../audio/recognise.js')
    .then((m) => {
      if (life.signal.aborted || !m.isRecognitionSupported?.()) return;
      sayBlockHost.replaceChildren(sayItBlock(m));
    })
    .catch(() => {});
  import('../../audio/recorder.js')
    .then(async (m) => {
      if (life.signal.aborted || !m.isRecordingSupported?.()) return;
      // Bring back a recording saved last time.
      if (saved.recordingId) {
        try {
          const blob = await ctx.blobs.get(saved.recordingId);
          if (blob && !life.signal.aborted) recording = { blob, durationMs: 0 };
        } catch {
          /* gone: fine */
        }
      }
      if (life.signal.aborted) return;
      if (!recording) useRecording = false;
      recordBlockHost.replaceChildren(recordBlock(m));
      renderPreview();
    })
    .catch(() => {});

  function sayItBlock(rec) {
    const status = h('p', { class: 'alt-status', 'aria-live': 'polite', 'data-testid': 'say-it-status' });
    const btn = button({ text: 'Say it', icon: 'mic', variant: 'secondary', size: 'md', testid: 'say-it' });
    let ctl = null;
    btn.addEventListener('click', async () => {
      if (ctl) {
        ctl.abort();
        return;
      }
      // The browser may send this clip to Google or Apple: a grown-up's decision once a child has had the phone.
      if (!(await grownUpCheck({ title: 'Grown-ups: say the name for us?', lead: 'Press and hold for 3 seconds. Your browser may send what you say to its speech service to turn it into text.' }))) return;
      if (life.signal.aborted || ctl) return;
      stopPlaying();
      ctl = new AbortController();
      life.signal.addEventListener('abort', () => ctl?.abort(), { once: true });
      btn.classList.add('is-listening');
      btn.querySelector('.btn-text').textContent = 'Stop listening';
      status.textContent = 'Getting ready…';
      let errorCode = '';
      const heard = await rec.hearName({
        lang: ctx.book?.lang ?? 'en-GB',
        signal: ctl.signal,
        onStart: () => (status.textContent = `Listening… say “${display}” once, clearly.`),
        onError: (code) => (errorCode = code),
      });
      ctl = null;
      if (life.signal.aborted) return;
      btn.classList.remove('is-listening');
      btn.querySelector('.btn-text').textContent = 'Say it again';
      if (heard.length) {
        const pick = addCandidates(heard.map((s, i) => ({ ...customCandidate(s, 'heard'), id: `heard-${norm(s)}-${i}` })));
        status.textContent = `We heard ${heard.map((s) => `“${s}”`).join(', ')}. ${pick ? 'Tap ▶ to check it.' : ''}`;
      } else {
        status.textContent = recognitionMessage(errorCode);
      }
    });
    return h(
      'div',
      { class: 'alt alt-say' },
      h('div', { class: 'alt-head' }, h('span', { class: 'alt-icon', 'aria-hidden': 'true' }, icon('mic', { size: 22 })), h('h3', {}, 'Say it for us')),
      h('p', { class: 'alt-hint' }, `Say “${display}” once and we’ll spell it the way it sounds, for the voice to copy.`),
      h('div', { class: 'alt-actions' }, btn),
      status,
      h('p', { class: 'privacy-note', 'data-testid': 'privacy-note' }, icon('info', { size: 16 }), h('span', {}, rec.PRIVACY_NOTE ?? 'Your browser may send this recording to its speech service to turn it into text.')),
    );
  }

  function recordBlock(rec) {
    const stage = h('div', { class: 'rec-stage', 'data-state': recording ? 'done' : 'idle', 'data-testid': 'record-stage' });
    const status = h('p', { class: 'alt-status', 'aria-live': 'polite' });
    const meterBars = Array.from({ length: 7 }, () => h('span', { class: 'rec-bar' }));
    const meter = h('div', { class: 'rec-meter', 'aria-hidden': 'true' }, meterBars);
    const count = h('span', { class: 'rec-count', 'aria-hidden': 'true' });
    const recordBtn = button({ text: recording ? 'Record again' : 'Record', icon: 'record', variant: 'record', size: 'md', testid: 'record-name' });
    const stopBtn = button({ text: 'Stop', icon: 'stop', variant: 'secondary', size: 'md', testid: 'record-stop' });
    const playBtn = button({ text: 'Play it back', icon: 'play', variant: 'secondary', size: 'md', testid: 'record-play', attrs: { 'aria-pressed': 'false' } });
    const toggle = h('input', { type: 'checkbox', role: 'switch', id: 'use-recording', class: 'switch-input', 'data-testid': 'use-recording', checked: useRecording });
    const toggleRow = h('label', { class: 'switch-row', for: 'use-recording' }, toggle, h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', { class: 'switch-text' }, 'Use my recording whenever the story says the name'));
    const doneActions = h('div', { class: 'alt-actions' });
    const doneRow = h('div', { class: 'rec-done' }, doneActions, toggleRow);
    let ctl = null;

    const setStage = (s) => {
      // Keyboard and screen-reader users keep their place as the buttons change.
      const hadFocus = stage.contains(document.activeElement);
      stage.dataset.state = s;
      // The record button moves between the idle and done layouts.
      if (s === 'done') doneActions.replaceChildren(playBtn, recordBtn);
      stage.replaceChildren(
        ...(s === 'idle' ? [h('div', { class: 'alt-actions' }, recordBtn)] : []),
        ...(s === 'countdown' ? [count] : []),
        ...(s === 'recording' ? [h('div', { class: 'rec-live' }, h('span', { class: 'rec-dot', 'aria-hidden': 'true' }), meter, stopBtn)] : []),
        ...(s === 'processing' ? [h('p', { class: 'rec-processing', tabindex: '-1' }, 'Tidying up your recording…')] : []),
        ...(s === 'done' ? [doneRow] : []),
      );
      const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
      if (hadFocus || lost) {
        const target = s === 'recording' ? stopBtn : s === 'done' ? playBtn : s === 'idle' ? recordBtn : s === 'countdown' ? stage : stage.querySelector('.rec-processing');
        if (s === 'countdown' && !stage.hasAttribute('tabindex')) stage.setAttribute('tabindex', '-1');
        try {
          target?.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    };

    const wait = (ms) => new Promise((r) => setTimeout(r, ms * (Number(globalThis.SB_TEST?.timeScale) || 1)));

    recordBtn.addEventListener('click', async () => {
      if (ctl) return;
      // The microphone is a grown-up's tool here: once a child has had the phone, ask for the hold.
      if (!(await grownUpCheck({ title: 'Grown-ups: record the name?', lead: 'Press and hold for 3 seconds, then say the name in your own voice.' }))) return;
      if (life.signal.aborted || ctl) return;
      stopPlaying();
      ctl = new AbortController();
      life.signal.addEventListener('abort', () => ctl?.abort(), { once: true });
      setStage('countdown');
      for (const n of [3, 2, 1]) {
        count.textContent = String(n);
        count.classList.remove('is-tick');
        void count.offsetWidth;
        count.classList.add('is-tick');
        status.textContent = n === 3 ? `Get ready to say “${display}”… ${n}` : String(n);
        await wait(700);
        if (life.signal.aborted) return;
      }
      setStage('recording');
      status.textContent = `Say “${display}” now.`;
      try {
        const result = await rec.recordName({
          maxMs: 4000,
          signal: ctl.signal,
          onLevel: (level) => {
            meterBars.forEach((b, i) => b.style.setProperty('--lvl', String(Math.max(0.12, Math.min(1, level * (1.25 - Math.abs(i - 3) * 0.18))))));
          },
        });
        if (life.signal.aborted) return;
        setStage('processing');
        // A new take: memory only until "Done" (so Back keeps what was saved before).
        recording = { ...result, fresh: true };
        ctx.scratch?.put(takeId, result.blob);
        if (life.signal.aborted) return;
        useRecording = true;
        toggle.checked = true;
        recordBtn.querySelector('.btn-text').textContent = 'Record again';
        setStage('done');
        const secs = result.durationMs ? ` (${(result.durationMs / 1000).toFixed(1)} seconds)` : '';
        status.textContent = `Got it${secs}. Play it back to check.`;
        renderPreview();
      } catch (err) {
        if (life.signal.aborted) return;
        setStage(recording ? 'done' : 'idle');
        status.textContent = err?.message || 'Something went wrong while recording. Please try again.';
      } finally {
        ctl = null;
      }
    });
    stopBtn.addEventListener('click', () => ctl?.abort());
    playBtn.addEventListener('click', () => {
      if (recording?.blob) playWith(playBtn, (signal) => rec.playBlob(recording.blob, { signal }).catch(() => (status.textContent = 'That recording won’t play on this device. Try recording again.')));
    });
    toggle.addEventListener('change', () => {
      useRecording = toggle.checked && Boolean(recording);
      renderPreview();
    });

    setStage(recording ? 'done' : 'idle');
    return h(
      'div',
      { class: 'alt alt-record' },
      h('div', { class: 'alt-head' }, h('span', { class: 'alt-icon alt-icon-rec', 'aria-hidden': 'true' }, icon('record', { size: 20 })), h('h3', {}, 'Record your voice')),
      h('p', { class: 'alt-hint' }, 'Grown-ups: record the name in your own voice, and the story will play it each time the name comes up. The recording stays on this phone.'),
      stage,
      status,
    );
  }

  // ---- Done ----------------------------------------------------------------------------------
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  // "Done" (not "let's read!"): it goes back to the book's page, where Start reading is.
  const done = button({ text: 'Done', icon: 'check', variant: 'primary', size: 'lg', testid: 'pronunciation-done', class: 'done-button' });
  done.addEventListener('click', async () => {
    stopPlaying();
    done.disabled = true;
    const chosen = selected ?? candidates[0] ?? { say: display, label: 'As written', source: 'as-written' };
    const keepRecording = Boolean(recording);
    // Keep a new take now (it was in memory until the parent said Done).
    if (recording?.fresh) await ctx.blobs.put(recordingId, recording.blob);
    ctx.scratch?.delete(takeId);
    const pronunciation = { ...storedPronunciation(chosen), useRecording: Boolean(useRecording && keepRecording), recordingId: keepRecording ? recordingId : null };
    // Still no dictionary and nobody picked: keep it a stand-in, so the dictionary's best match replaces it when it arrives.
    if (!lexicon && !chosenHere && (saved.provisional || !saved.say)) pronunciation.provisional = true;
    // Don't keep a voice recording we're not going to use.
    if (!keepRecording && saved.recordingId) ctx.blobs.delete(saved.recordingId).catch?.(() => {});
    if (life.signal.aborted) return;
    const latest = ctx.state.profiles.find((p) => p.id === profile.id) ?? profile;
    // Update this child only: the child the story is for (and anyone reading together) stays the same.
    ctx.setState((s) => updateProfile(s, { ...latest, pronunciation }));
    toast(`Lovely — we’ll say ${display} like that.`, { kind: 'success', timeout: 2600 });
    ctx.navigate(editReturn(bookId, ctx.query));
  });

  // ---- Layout --------------------------------------------------------------------------------
  const voiceNote = h('p', { class: 'voice-note', hidden: true, 'data-testid': 'no-voice' }, icon('info', { size: 18 }), h('span', {}, 'This browser has no reading voice at the moment, so you won’t hear anything yet. The story still works — or try recording your own voice below.'));
  // Only online voices here? Ask the grown-up (privacy) rather than saying there's no voice.
  const consent = voiceConsentCard(ctx, { signal: life.signal, name: display, onChange: () => (voiceNote.hidden = true) });
  Promise.resolve(narrator.ready)
    .catch(() => null)
    .then(() => {
      let needsConsent = false;
      try {
        needsConsent = Boolean(narrator.voiceStatus?.()?.needsConsent);
      } catch {
        needsConsent = false;
      }
      if (!life.signal.aborted && !narrator.hasVoice?.() && !needsConsent && !globalThis.SB_TEST?.forceSilent) voiceNote.hidden = false;
    });

  const head = h(
    'section',
    { class: 'say-head' },
    h('p', { class: 'eyebrow' }, 'One quick check'),
    h('h1', {}, 'How do we say ', h('span', { class: 'say-name' }, display), '?'),
    h('p', { class: 'lead' }, 'Children light up when a story gets their name right. Tap ', h('span', { class: 'inline-play', 'aria-label': 'play' }, icon('play', { size: 14 })), ' to listen, then choose the one that sounds right.'),
    voiceNote,
    consent,
  );
  const storyCard = h('section', { class: 'card story-check', 'aria-labelledby': 'story-check-title' },
    h('div', { class: 'story-check-head' }, h('h2', { id: 'story-check-title' }, 'Try it in the story'), hearBtn),
    preview,
    voicePrivacyLine(ctx, PRIVACY_WORDS.voice, { signal: life.signal, line: h('p', { class: 'field-hint story-voice-note', 'data-testid': 'story-voice-note' }) }));
  const alts = h('section', { class: 'alts', 'aria-labelledby': 'alts-title' },
    h('h2', { id: 'alts-title', class: 'alts-title' }, 'None of these?'),
    h('div', { class: 'alt-grid' }, typeBlock, sayBlockHost, recordBlockHost));

  const footer = h('div', { class: 'done-bar' }, h('div', { class: 'done-bar-inner' }, done));
  const { el } = screen(ctx, {
    name: 'say',
    back: { href: `#/b/${bookId}/name?child=${encodeURIComponent(profile.id)}${ctx.query?.from === 'settings' ? '&from=settings' : ''}`, label: 'Back to the name', text: 'Name' },
    body: [head, h('div', { class: 'say-columns' }, h('div', { class: 'say-main' }, list, storyCard), alts), live],
    footer,
  });
  root.append(el);
  renderList();

  // The names dictionary hadn't arrived when this screen opened (a slow
  // connection): add its suggestions when it does, without undoing a choice.
  if (!lexicon && typeof ctx.getLexicon === 'function') {
    const dictNote = h('p', { class: 'dict-note', 'data-testid': 'dict-note', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ` Looking ${display} up in our names dictionary…`);
    list.before(dictNote);
    Promise.resolve(ctx.getLexicon())
      .catch(() => null)
      .then((index) => {
        if (life.signal.aborted) return;
        if (!index) {
          dictNote.remove();
          return;
        }
        lexicon = index;
        const mine = candidates.filter((c) => c.source === 'custom' || c.source === 'heard');
        const keep = chosenHere ? selected : null;
        candidates = mergeCandidates(baseCandidates(), mine).list;
        if (keep) {
          const same = candidates.find((c) => norm(c.say) === norm(keep.say));
          if (same) selected = same;
          else {
            candidates = [...candidates, keep];
            selected = keep;
          }
        } else selected = candidates[Math.max(0, savedIndex(candidates))] ?? null;
        renderList();
        const found = candidates[0]?.source === 'dictionary';
        dictNote.replaceChildren(found ? `Found ${display} in our names dictionary.` : '');
        dictNote.hidden = !found;
        if (found) setTimeout(() => dictNote.remove(), 4000);
      });
  }

  return () => {
    life.abort();
    stopPlaying();
    updateCustomSoon.cancel();
    ctx.scratch?.delete(takeId);
  };
}

/** Parent-friendly text for why "say it" came back empty. */
export function recognitionMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'To use this, please allow the microphone when your browser asks. You can also type how it sounds instead.';
    case 'no-speech':
    case 'no-match':
    case 'timeout':
      return 'We didn’t quite catch that. Try again, a little closer to the phone.';
    case 'network':
      return 'Your browser’s speech service isn’t reachable right now. Try typing how it sounds instead.';
    case 'aborted':
      return 'Stopped listening.';
    case 'audio-capture':
      return 'We couldn’t find a microphone. Try typing how it sounds instead.';
    default:
      return 'That didn’t work this time. Try again, or type how it sounds instead.';
  }
}
