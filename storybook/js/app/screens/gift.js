// #/b/:book/gift — "Set it up as a gift".
//
// The giver (who isn't the child's parent) types the child's name and checks
// how it's said, writes a short message, can say it out loud too, and can
// record the whole book in their own voice. "Wrap it up" puts it all in one
// family pack file to send to the child's grown-up, who opens it on their
// phone: the book is then ready for the child, with the giver's message.
//
// Nothing about the child is saved on the giver's phone: the gift — name,
// message, spoken message and the giver's recorded reading — lives in a
// memory-only draft (js/family/drafts.js) and travels only in the file.

import { h, icon, button, linkButton, toast, setBusy, debounce } from '../ui.js';
import { screen, privacyLine } from '../chrome.js';
import { normaliseName, NAME_ERRORS, NAME_MAX_LENGTH } from '../../core/personalise.js';
import { buildPack, packFilename, PACK_LIMITS } from '../../family/pack.js';
import { giftDraft, clearGiftDraft, draftBlobs } from '../../family/drafts.js';
import { grownUpCheck } from '../parent-gate.js';
import { giftShareText, readingCoverage, recordingSteps, clock, formatDuration, storyTitle } from '../../family/family.js';
import { createPronunciationPicker } from '../pron-picker.js';
import { createCover } from '../cover.js';
import { offerFile, reportOffer, landingUrl, displayUrl, readingPartBlobs } from '../family-ui.js';
import { copyText } from './qr.js';
import { recorderMessage } from './record.js';

/** Longest spoken message, in ms. */
export const GIFT_MESSAGE_MAX_MS = 30000;

/** The instructions that go with a wrapped gift. */
export function giftInstructions(childName, url) {
  return `Send this file to ${childName}’s grown-up. They open ${url} and tap “Open a family recording”.`;
}

export function render(root, ctx) {
  const { book, bookId } = ctx;
  const draft = giftDraft(bookId);
  const life = new AbortController();
  let rec = null;
  let recCtl = null;
  let playCtl = null;
  let wrapped = null; // {blob, filename}
  const recReady = import('../../audio/recorder.js').then((m) => (rec = m)).catch(() => null);

  // ---- Who is it for? ----------------------------------------------------------------------------
  const nameInput = h('input', { id: 'gift-child', class: 'text-input gift-name-input', type: 'text', 'data-testid': 'gift-child', maxlength: String(NAME_MAX_LENGTH), autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', placeholder: 'e.g. Ava', value: draft.childName, 'aria-describedby': 'gift-child-error' });
  const nameError = h('p', { id: 'gift-child-error', class: 'field-error', role: 'alert', 'data-testid': 'gift-child-error', hidden: true });
  const picker = createPronunciationPicker(ctx, { signal: life.signal, onChange: (p) => (draft.pronunciation = p) });
  // Their book, with their name on the cover, just as they'll see it.
  const cover = createCover({ book, bookId, baseUrl: ctx.baseUrl, display: draft.childName, signal: ctx.signal, caption: false });
  const coverSoon = debounce((name) => cover.setName(name, { pop: true }), 180);
  const nameCard = h('section', { class: 'card gift-card-step', 'aria-labelledby': 'gift-who' },
    h('h2', { id: 'gift-who', class: 'gift-step-title' }, h('span', { class: 'gift-step-n' }, '1'), 'Who is it for?'),
    h('label', { class: 'field-label', for: 'gift-child' }, 'Their first name'),
    nameInput,
    nameError,
    picker.el,
    h('div', { class: 'gift-cover' }, cover.el, h('p', { class: 'cover-note' }, icon('sparkle', { size: 18 }), h('span', {}, 'Their book, ready when they open your gift.'))));

  const onName = () => {
    const r = normaliseName(nameInput.value);
    if (r.ok) {
      nameError.hidden = true;
      nameInput.removeAttribute('aria-invalid');
      if (draft.childName !== r.display) draft.pronunciation = null;
      draft.childName = r.display;
      picker.setName(r.display, draft.pronunciation);
      coverSoon(r.display);
    } else {
      draft.childName = '';
      picker.setName('');
      if (!nameInput.value.trim()) coverSoon('');
    }
    updateTitles();
  };
  nameInput.addEventListener('input', onName);
  nameInput.addEventListener('blur', () => {
    const r = normaliseName(nameInput.value);
    if (r.ok && nameInput.value !== r.display) nameInput.value = r.display;
  });

  // ---- Your message --------------------------------------------------------------------------------
  const fromInput = h('input', { id: 'gift-from', class: 'text-input', type: 'text', 'data-testid': 'gift-from', maxlength: String(PACK_LIMITS.from), autocomplete: 'off', autocapitalize: 'words', placeholder: 'e.g. Auntie Jo', value: draft.from });
  const textInput = h('textarea', { id: 'gift-text', class: 'text-input gift-textarea', 'data-testid': 'gift-text', maxlength: String(PACK_LIMITS.message), rows: '4', placeholder: 'e.g. Happy birthday! I can’t wait to read this with you. Love, Auntie Jo x', 'aria-describedby': 'gift-text-count' });
  textInput.value = draft.text;
  // The count is linked to the box (aria-describedby) but not a live region:
  // a screen reader would read it after every letter. Near the limit, a
  // separate polite message says how many are left, once typing pauses.
  const counter = h('p', { class: 'field-hint gift-count', id: 'gift-text-count' });
  const nearLimit = h('p', { class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'gift-text-left' });
  const updateCount = () => (counter.textContent = `${Array.from(textInput.value).length} / ${PACK_LIMITS.message}`);
  const announceLeft = debounce(() => {
    const left = PACK_LIMITS.message - Array.from(textInput.value).length;
    nearLimit.textContent = left <= 40 ? `${left} ${left === 1 ? 'character' : 'characters'} left` : '';
  }, 700);
  fromInput.addEventListener('input', () => (draft.from = fromInput.value));
  textInput.addEventListener('input', () => {
    draft.text = textInput.value;
    updateCount();
    announceLeft();
  });
  updateCount();

  const voiceHost = h('div', { class: 'gift-voice' });
  const messageCard = h('section', { class: 'card gift-card-step', 'aria-labelledby': 'gift-msg' },
    h('h2', { id: 'gift-msg', class: 'gift-step-title' }, h('span', { class: 'gift-step-n' }, '2'), 'Your message'),
    h('label', { class: 'field-label', for: 'gift-from' }, 'From'),
    fromInput,
    h('label', { class: 'field-label', for: 'gift-text' }, 'Write a few words'),
    textInput,
    counter,
    nearLimit,
    h('p', { class: 'field-label gift-say-label' }, 'Say it out loud too ', h('span', { class: 'optional' }, '(optional)')),
    voiceHost);

  // Spoken message: record / stop / listen / redo / remove.
  function renderVoice(state = draft.audio ? 'done' : 'idle', note = '') {
    const status = h('p', { class: 'alt-status', 'aria-live': 'polite', 'data-testid': 'gift-rec-status' }, note);
    if (state === 'idle') {
      voiceHost.replaceChildren(h('div', { class: 'alt-actions' }, button({ text: 'Record a message', icon: 'record', variant: 'record', size: 'md', testid: 'gift-record', onClick: () => recordMessage() })), status);
    } else if (state === 'recording') {
      const bars = Array.from({ length: 7 }, () => h('span', { class: 'rec-bar' }));
      const clk = h('span', { class: 'rec-clock' }, `0:00 / ${clock(GIFT_MESSAGE_MAX_MS)}`);
      voiceHost.replaceChildren(h('div', { class: 'rec-live' }, h('span', { class: 'rec-dot', 'aria-hidden': 'true' }), clk, h('div', { class: 'rec-meter', 'aria-hidden': 'true' }, bars), button({ text: 'Stop', icon: 'stop', variant: 'secondary', size: 'md', testid: 'gift-rec-stop', onClick: () => recCtl?.abort() })), status);
      return { bars, clk, status };
    } else if (state === 'processing') {
      voiceHost.replaceChildren(h('p', { class: 'rec-processing' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Tidying up your message…'));
    } else {
      const listen = button({ text: 'Listen', icon: 'play', variant: 'secondary', size: 'md', testid: 'gift-rec-listen' });
      listen.addEventListener('click', () => playMessage(listen));
      voiceHost.replaceChildren(
        h('p', { class: 'gift-voice-done' }, icon('check', { size: 18 }), h('span', {}, `Your message is recorded${draft.audioMs ? ` (${formatDuration(draft.audioMs)})` : ''}.`)),
        h('div', { class: 'alt-actions' }, listen, button({ text: 'Redo', icon: 'refresh', variant: 'secondary', size: 'md', testid: 'gift-rec-redo', onClick: () => recordMessage() }), button({ text: 'Remove', icon: 'trash', variant: 'link-danger', size: 'sm', testid: 'gift-rec-remove', onClick: () => { draft.audio = null; draft.audioMs = 0; renderVoice('idle'); } })),
        status,
      );
    }
    return { status };
  }

  async function recordMessage() {
    if (recCtl) return;
    // The microphone is a grown-up's tool: once a child has had the phone, ask for the hold.
    if (!(await grownUpCheck({ title: 'Grown-ups: record a message?', lead: 'Press and hold for 3 seconds, then say your message.' }))) return;
    if (life.signal.aborted) return;
    await recReady;
    if (!rec?.isRecordingSupported?.()) {
      renderVoice(draft.audio ? 'done' : 'idle', recorderMessage('unsupported'));
      return;
    }
    stopPlaying();
    recCtl = new AbortController();
    const my = recCtl;
    const ui = renderVoice('recording', 'Recording… say your message, then tap stop.');
    const t0 = Date.now();
    const tick = setInterval(() => (ui.clk.textContent = `${clock(Date.now() - t0)} / ${clock(GIFT_MESSAGE_MAX_MS)}`), 250);
    try {
      const result = await rec.recordName({
        maxMs: GIFT_MESSAGE_MAX_MS,
        autoStop: false,
        signal: my.signal,
        onLevel: (level) => ui.bars.forEach((b, i) => b.style.setProperty('--lvl', String(Math.max(0.12, Math.min(1, level * (1.25 - Math.abs(i - 3) * 0.18)))))),
      });
      clearInterval(tick);
      if (life.signal.aborted) return;
      renderVoice('processing');
      let blob = result.blob;
      try {
        const mix = await import('../../audio/mix.js');
        blob = (await mix.concatToWav([blob], { sampleRate: 22050 })) ?? blob;
      } catch {
        /* keep the original */
      }
      if (life.signal.aborted) return;
      draft.audio = blob;
      draft.audioMs = result.durationMs;
      renderVoice('done', 'Lovely. Listen back to check it.');
    } catch (err) {
      clearInterval(tick);
      if (!life.signal.aborted) renderVoice(draft.audio ? 'done' : 'idle', recorderMessage(err?.code));
    } finally {
      if (recCtl === my) recCtl = null;
    }
  }

  function stopPlaying() {
    playCtl?.abort();
    playCtl = null;
  }
  async function playMessage(btn) {
    if (playCtl) return stopPlaying();
    if (!draft.audio || !rec?.playBlob) return;
    playCtl = new AbortController();
    const my = playCtl;
    btn.classList.add('is-playing');
    try {
      await rec.playBlob(draft.audio, { signal: my.signal });
    } catch {
      /* ignore */
    } finally {
      btn.classList.remove('is-playing');
      if (playCtl === my) playCtl = null;
    }
  }

  // ---- Read them the whole story (optional) -------------------------------------------------------
  const readingHost = h('div', { class: 'gift-reading' });
  const readingCard = h('section', { class: 'card gift-card-step', 'aria-labelledby': 'gift-read' },
    h('h2', { id: 'gift-read', class: 'gift-step-title' }, h('span', { class: 'gift-step-n' }, '3'), h('span', {}, 'Read them the whole story ', h('span', { class: 'optional' }, '(optional)'))),
    readingHost);
  const steps = recordingSteps(book);
  function renderReading() {
    // The giver's reading lives in the draft (memory only), not in this phone's readings.
    const reading = draft.reading && draft.reading.id === draft.readingId ? draft.reading : null;
    if (!reading) {
      draft.readingId = null;
      const go = button({
        text: 'Record the book in your voice',
        icon: 'mic',
        variant: 'secondary',
        size: 'md',
        testid: 'gift-record-reading',
        onClick: () => {
          onName();
          if (!draft.childName) {
            showNameError();
            return;
          }
          ctx.navigate(`#/b/${bookId}/record?for=gift`);
        },
      });
      readingHost.replaceChildren(h('p', { class: 'alt-hint' }, 'Record every page with the name filled in — when they turn the pages, it’s your voice they’ll hear. It takes about three minutes.'), go);
      return;
    }
    const cov = readingCoverage(reading, steps);
    const toggle = h('input', { type: 'checkbox', role: 'switch', id: 'gift-include-reading', class: 'switch-input', 'data-testid': 'gift-include-reading', checked: draft.includeReading, onChange: (e) => (draft.includeReading = e.target.checked) });
    readingHost.replaceChildren(
      h('label', { class: 'switch-row', for: 'gift-include-reading' }, toggle, h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', { class: 'switch-text' }, `Include your reading${reading.language && !/^english$/i.test(reading.language) ? ` in ${reading.language}` : ''} (${cov.complete ? 'every page' : `${cov.done} of ${cov.total} parts`})`)),
      linkButton({ text: 'Record more of it', href: `#/b/${bookId}/record?for=gift&reading=${encodeURIComponent(reading.id)}`, icon: 'mic', variant: 'link', size: 'sm', testid: 'gift-reading-more' }),
    );
  }

  // ---- Wrap it up ------------------------------------------------------------------------------------
  const wrapBtn = button({ text: 'Wrap it up', icon: 'gift', variant: 'primary', size: 'lg', testid: 'gift-wrap', class: 'done-button' });
  const footer = h('div', { class: 'done-bar' }, h('div', { class: 'done-bar-inner' }, wrapBtn));
  const heading = h('h1', {}, 'Set it up as a gift');
  const lead = h('p', { class: 'lead' });
  const head = h('section', { class: 'gift-head' }, h('p', { class: 'eyebrow' }, 'Giving this book?'), heading, lead);
  function updateTitles() {
    const name = draft.childName;
    heading.textContent = name ? `A gift for ${name}` : 'Set it up as a gift';
    lead.textContent = `Add their name and a message, and we’ll wrap it into one file for you to send to ${name ? `${name}’s` : 'their'} grown-up. “${storyTitle(book, name)}” will be ready the moment they open it.`;
  }

  function showNameError() {
    nameError.textContent = normaliseName(nameInput.value).ok ? '' : NAME_ERRORS[normaliseName(nameInput.value).error] ?? NAME_ERRORS['invalid-chars'];
    nameError.hidden = !nameError.textContent;
    nameInput.setAttribute('aria-invalid', 'true');
    nameInput.focus();
    nameCard.scrollIntoView?.({ block: 'center' });
  }

  wrapBtn.addEventListener('click', async () => {
    onName();
    picker.flush();
    if (!draft.childName) return showNameError();
    stopPlaying();
    setBusy(wrapBtn, true);
    try {
      const reading = draft.includeReading && draft.reading && draft.reading.id === draft.readingId ? draft.reading : null;
      const pack = {
        kind: 'gift',
        bookId,
        readerName: reading ? reading.readerName || draft.from : '',
        language: reading?.language ?? '',
        parts: reading ? await readingPartBlobs(reading, draftBlobs(draft)) : {},
        child: { display: draft.childName, pronunciation: draft.pronunciation ?? picker.value() ?? { say: draft.childName } },
        message: { from: draft.from, text: draft.text, audio: draft.audio },
      };
      wrapped = { blob: await buildPack(pack), filename: packFilename(pack), childName: draft.childName, from: draft.from.trim() };
    } catch (err) {
      setBusy(wrapBtn, false);
      toast(err?.message || 'Sorry — we couldn’t wrap that up. Please try again.', { kind: 'error' });
      return;
    }
    setBusy(wrapBtn, false);
    if (life.signal.aborted) return;
    showWrapped();
    await send();
  });

  const linkHost = h('div', { class: 'download-host', hidden: true });
  async function send() {
    if (!wrapped) return;
    const url = await landingUrl(bookId);
    const how = await offerFile(wrapped.blob, wrapped.filename, {
      title: `A gift for ${wrapped.childName}`,
      text: giftShareText({ childName: wrapped.childName, from: wrapped.from, landingUrl: url }),
      host: linkHost,
    });
    reportOffer(how, { sent: 'Sent!', saved: `Saved to your downloads. Now send that file to ${wrapped.childName}’s grown-up.` });
  }

  function showWrapped() {
    const instructions = h('p', { class: 'gift-instructions', 'data-testid': 'gift-instructions' }, '…');
    landingUrl(bookId).then((u) => {
      // The same words as giftInstructions(), with the address picked out.
      const url = displayUrl(u);
      const [before, after] = giftInstructions(wrapped.childName, url).split(url);
      instructions.replaceChildren(before, h('strong', { class: 'gift-url' }, url), after);
    });
    const copyBtn = button({
      text: 'Copy these words',
      icon: 'copy',
      variant: 'secondary',
      size: 'sm',
      testid: 'gift-copy',
      onClick: async () => {
        const ok = await copyText(instructions.textContent);
        toast(ok ? 'Copied — paste it into your message.' : 'Couldn’t copy — press and hold the words to copy them.', { kind: ok ? 'success' : 'info' });
      },
    });
    const body = h(
      'section',
      { class: 'gift-done', 'data-testid': 'gift-done' },
      h('div', { class: 'done-art is-gift', 'aria-hidden': 'true' }, icon('gift', { size: 46 })),
      h('p', { class: 'eyebrow' }, 'All wrapped'),
      h('h1', {}, `${wrapped.childName}’s gift is ready`),
      h('div', { class: 'card gift-next' },
        h('h2', {}, 'What happens next'),
        instructions,
        h('div', { class: 'gift-next-actions' }, copyBtn, button({ text: 'Send it again', icon: 'share', variant: 'secondary', size: 'sm', testid: 'gift-send', onClick: () => send() }))),
      linkHost,
      h('p', { class: 'gift-file' }, icon('file', { size: 18 }), h('span', {}, 'The file: ', h('strong', {}, wrapped.filename))),
      privacyLine('Nothing is uploaded, and nothing is kept on this phone: the gift — your recordings too — is only in the file you send.'),
      h('div', { class: 'record-more' },
        button({ text: 'Set up another gift', icon: 'plus', variant: 'link', size: 'sm', testid: 'gift-another', onClick: () => { clearGiftDraft(); ctx.navigate(`#/b/${bookId}/gift`); } }),
        linkButton({ text: 'All books', href: '#/', icon: 'book', variant: 'link', size: 'sm' })),
    );
    root.querySelector('.gift-body')?.replaceChildren(body);
    root.querySelector('.screen-gift .done-bar')?.remove();
    body.querySelector('h1')?.focus?.();
  }

  const back = { href: `#/b/${bookId}`, label: 'Back to the book', text: 'Back' };
  const { el } = screen(ctx, {
    name: 'gift',
    back,
    body: [head, h('div', { class: 'gift-grid' }, h('div', { class: 'gift-col' }, nameCard, messageCard), h('div', { class: 'gift-col' }, readingCard, privacyLine('Nothing about the gift is saved on this phone, and nothing is uploaded: it stays on this page until you wrap it into the file you send. (Keep this page open until then.)')))],
    footer,
  });
  root.append(el);
  updateTitles();
  renderVoice();
  renderReading();
  if (draft.childName) picker.setName(draft.childName, draft.pronunciation);
  else nameInput.focus({ preventScroll: true });

  return () => {
    life.abort();
    recCtl?.abort();
    stopPlaying();
    picker.stop();
    coverSoon.cancel();
    announceLeft.cancel();
  };
}
