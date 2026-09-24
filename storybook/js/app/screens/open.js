// #/open — "Open a family recording": the file a grandparent or a gift-giver
// sent (a family pack, js/family/pack.js). Choose it, see what it is
// ("Grandma Rose has recorded Goal, Ava! for you"), add it, and go to the book.
//
// The file is untrusted: readPack() checks it, and everything from it is
// shown as plain text.

import { h, icon, button, toast, setBusy, respellNode } from '../ui.js';
import { screen, privacyLine } from '../chrome.js';
import { readPack, importPack, PACK_ACCEPT, PACK_EXTENSION } from '../../family/pack.js';
import { storyTitle } from '../../family/family.js';
import { activeProfile, upsertProfile, newId } from '../../core/storage.js';
import { loadBookList, loadBook, bookUrl } from '../../core/book.js';
import { createCover } from '../cover.js';
import { defaultPronunciation } from './name.js';

/** The headline for a checked pack. */
export function packHeadline(parsed, activeName = '') {
  if (parsed.kind === 'gift') {
    const from = parsed.message?.from;
    return `A gift for ${parsed.child.display}${from ? ` from ${from}` : ''}`;
  }
  const who = parsed.readerName || 'Someone who loves you';
  const title = storyTitle(parsed.book, parsed.child?.display || activeName);
  return `${who} has recorded “${title}” for you`;
}

export function render(root, ctx) {
  const life = new AbortController();
  const lastBook = ctx.state.lastBook;
  const back = lastBook ? { href: `#/b/${lastBook}`, label: 'Back to the book', text: 'Back' } : { href: '#/', label: 'All books', text: 'Books' };
  let playCtl = null;
  let parsed = null;

  const input = h('input', { type: 'file', accept: PACK_ACCEPT, id: 'pack-file', class: 'file-input', 'data-testid': 'pack-file' });
  const pick = h('label', { for: 'pack-file', class: 'btn btn-primary btn-lg pick-file', 'data-testid': 'pack-pick' }, icon('file', { size: 24 }), h('span', { class: 'btn-text' }, 'Choose the file'));
  const dropZone = h(
    'section',
    { class: 'card open-drop', 'data-testid': 'open-drop' },
    h('div', { class: 'open-drop-art', 'aria-hidden': 'true' }, icon('file', { size: 44 })),
    h('p', { class: 'open-drop-text' }, 'It’s a file ending in ', h('strong', {}, PACK_EXTENSION), '. Save it to this phone first (in WhatsApp: open it and tap Share → Save to Files), then choose it here.'),
    h('div', { class: 'open-drop-actions' }, input, pick),
    h('p', { class: 'open-drop-hint' }, 'On a computer you can also drop the file here.'),
  );
  const stage = h('div', { class: 'open-stage', 'aria-live': 'polite' });

  const head = h(
    'section',
    { class: 'open-head' },
    h('p', { class: 'eyebrow' }, 'From the family'),
    h('h1', {}, 'Open a family recording'),
    h('p', { class: 'lead' }, 'Has someone sent you a Tiffin & Me reading or a gift? Open it here, and the story will play in their voice.'),
  );
  const { el } = screen(ctx, { name: 'open', back, body: [head, h('div', { class: 'open-grid' }, h('div', { class: 'open-main' }, dropZone, stage), h('div', { class: 'open-side' }, privacyLine('The file is opened on this phone. Nothing is uploaded.')))] });
  root.append(el);

  function stopPlaying() {
    playCtl?.abort();
    playCtl = null;
    for (const b of stage.querySelectorAll('.is-playing')) b.classList.remove('is-playing');
  }

  async function playBlob(btn, blob) {
    if (btn.classList.contains('is-playing')) return stopPlaying();
    stopPlaying();
    playCtl = new AbortController();
    const my = playCtl;
    btn.classList.add('is-playing');
    try {
      const rec = await import('../../audio/recorder.js');
      await rec.playBlob(blob, { signal: my.signal });
    } catch {
      toast('That recording won’t play on this device.', { kind: 'error' });
    } finally {
      btn.classList.remove('is-playing');
      if (playCtl === my) playCtl = null;
    }
  }

  function showError(message) {
    stage.replaceChildren(
      h('div', { class: 'card open-error', role: 'alert', 'data-testid': 'pack-error' },
        h('span', { class: 'open-error-icon', 'aria-hidden': 'true' }, icon('alert', { size: 26 })),
        h('div', {}, h('h2', {}, 'We couldn’t open that file'), h('p', {}, message))),
    );
    dropZone.hidden = false;
  }

  async function check(file) {
    stopPlaying();
    parsed = null;
    stage.replaceChildren(h('p', { class: 'open-checking', 'data-testid': 'pack-checking' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Opening the file…'));
    try {
      parsed = await readPack(file, { books: () => loadBookList() });
    } catch (err) {
      if (!life.signal.aborted) showError(err?.message || 'That file didn’t work. Please try another.');
      return;
    }
    if (life.signal.aborted) return;
    showConfirm();
  }

  function showConfirm() {
    const p = parsed;
    const active = activeProfile(ctx.state);
    const isGift = p.kind === 'gift';
    const heading = packHeadline(p, active?.display ?? '');
    const details = [];
    if (p.partCount) {
      const pages = p.pageCount === 1 ? '1 page' : `${p.pageCount} pages`;
      details.push(isGift ? `Plus a reading of ${pages} of the book by ${p.readerName || p.message?.from || 'them'}` : `${pages} read aloud${p.language ? ` in ${p.language}` : ''}`);
    }
    const firstPart = Object.values(p.parts)[0];
    const sample = firstPart?.main ?? firstPart?.after ?? null;

    const listenBtn = sample ? button({ text: 'Listen to a bit', icon: 'play', variant: 'secondary', size: 'sm', testid: 'pack-listen', onClick: () => playBlob(listenBtn, sample) }) : null;
    const giftBits = [];
    if (isGift) {
      if (p.message?.text) giftBits.push(h('blockquote', { class: 'gift-quote', 'data-testid': 'pack-message' }, p.message.text));
      if (p.message?.audio) {
        const msgBtn = button({ text: p.message.from ? `Hear ${p.message.from}’s message` : 'Hear the message', icon: 'play', variant: 'play-soft', size: 'md', testid: 'pack-message-play', onClick: () => playBlob(msgBtn, p.message.audio) });
        giftBits.push(msgBtn);
      }
      const pr = p.child.pronunciation;
      const sayBtn = button({ text: 'Listen', label: `Listen to how we’ll say ${p.child.display}`, icon: 'speaker', variant: 'soft', size: 'sm', testid: 'pack-say', onClick: () => ctx.narrator?.speakText?.(pr.say)?.catch?.(() => {}) });
      giftBits.push(h('div', { class: 'said-row' }, h('p', { class: 'said-as' }, `We’ll say ${p.child.display} `, pr.respell ? respellNode(pr.respell) : h('strong', {}, `“${pr.say}”`)), sayBtn));
    }
    const addBtn = button({ text: isGift ? `Add ${p.child.display} to this phone` : 'Add it to this phone', icon: 'check', variant: 'primary', size: 'lg', testid: 'pack-import' });
    addBtn.addEventListener('click', () => doImport(addBtn));
    const cancelBtn = button({ text: 'Choose a different file', variant: 'link', size: 'sm', testid: 'pack-cancel', onClick: () => { stopPlaying(); stage.replaceChildren(); dropZone.hidden = false; input.value = ''; } });

    // The book's own cover, with the child's name on it.
    const coverHost = h('div', { class: 'pack-cover' }, h('span', { class: 'pack-card-art', 'aria-hidden': 'true' }, icon(isGift ? 'gift' : 'heart', { size: 30 })));
    const coverName = p.child?.display || active?.display || '';
    loadBook(p.bookId)
      .then((book) => {
        if (life.signal.aborted || parsed !== p) return;
        const cover = createCover({ book, bookId: p.bookId, baseUrl: bookUrl(p.bookId), display: coverName, signal: life.signal, caption: false });
        coverHost.prepend(cover.el);
        coverHost.classList.add('has-cover');
      })
      .catch(() => {});
    const title = h('h2', { class: 'pack-title', 'data-testid': 'pack-title', tabindex: '-1' }, heading);
    stage.replaceChildren(
      h('section', { class: `card pack-card${isGift ? ' is-gift' : ''}`, 'data-testid': 'pack-confirm' },
        coverHost,
        h('p', { class: 'eyebrow' }, isGift ? 'A gift' : 'A family recording'),
        title,
        isGift ? null : h('div', { class: 'pack-listen-row' }, h('p', { class: 'pack-details' }, details.join(' · ')), listenBtn),
        ...giftBits,
        isGift && details.length ? h('div', { class: 'pack-listen-row is-extra' }, icon('heart', { size: 18 }), h('p', { class: 'pack-details' }, details.join(' · ')), listenBtn) : null,
        h('div', { class: 'pack-actions' }, addBtn, cancelBtn),
        h('p', { class: 'field-hint' }, 'It stays on this phone. You can remove it any time in settings.')),
    );
    dropZone.hidden = true;
    title.focus({ preventScroll: true });
    stage.scrollIntoView?.({ block: 'nearest' });
  }

  async function doImport(btn) {
    if (!parsed) return;
    stopPlaying();
    setBusy(btn, true);
    const p = parsed;
    let result;
    try {
      result = await importPack(ctx.state, p, ctx.blobs);
    } catch (err) {
      setBusy(btn, false);
      showError(err?.message || 'We couldn’t keep that file on this phone. Please try again.');
      return;
    }
    if (life.signal.aborted) return;
    let next = result.state;
    // A reading for a child this phone doesn't know yet: set them up so the story can start.
    if (p.kind === 'reading' && p.child && !next.profiles.length) {
      const lexicon = ctx.lexicon ?? (await ctx.getLexicon?.().catch(() => null)) ?? null;
      next = upsertProfile(next, { id: newId('child'), display: p.child.display, key: p.child.key, pronunciation: defaultPronunciation(lexicon, p.child.display) });
    }
    ctx.setState({ ...next, lastBook: p.bookId });
    const s = result.summary;
    toast(p.kind === 'gift' ? `${s.childName} is all set${s.giftFrom ? ` — with a message from ${s.giftFrom}` : ''}!` : `${s.readerName ? `${s.readerName}’s` : 'The'} reading is ready to play.`, { kind: 'success', timeout: 5000 });
    ctx.navigate(`#/b/${p.bookId}`);
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) check(file);
  });
  // Computers: drag and drop.
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('is-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('is-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) check(file);
  });

  return () => {
    life.abort();
    stopPlaying();
  };
}
