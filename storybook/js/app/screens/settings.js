// #/settings — for grown-ups only (behind the press-and-hold gate).
// Children, voice, reading speed, story options, privacy, demo links.

import { h, icon, button, linkButton, confirmDialog, toast, respellNode, setBusy } from '../ui.js';
import { screen } from '../chrome.js';
import { holdButton, gatePassed, markGatePassed } from '../parent-gate.js';
import { removeProfile, removeReading, forgetEverything, loadState, readingLabel, activeProfile, DEFAULT_SETTINGS } from '../../core/storage.js';
import { fillTemplate, person as makePerson } from '../../core/personalise.js';
import { readingCoverage, recordingSteps, selectChild } from '../../family/family.js';
import { pronunciationSummary } from './ready.js';
import { sendReading, playReading } from '../family-ui.js';

export const SPEEDS = Object.freeze([
  { id: 'slower', label: 'Slower', rate: 0.75 },
  { id: 'normal', label: 'Normal', rate: DEFAULT_SETTINGS.rate },
]);

/** The speed preset closest to a rate. */
export function speedFor(rate) {
  const r = Number(rate) || DEFAULT_SETTINGS.rate;
  return SPEEDS.reduce((best, s) => (Math.abs(s.rate - r) < Math.abs(best.rate - r) ? s : best), SPEEDS[1]);
}

export const TOGGLES = Object.freeze([
  { key: 'highlight', title: 'Highlight the words', text: 'Each word lights up as it’s read, so little eyes can follow along.' },
  { key: 'sfx', title: 'Sound effects', text: 'Whistles, kicks and cheers when things happen.' },
  { key: 'readPrompts', title: 'Read the “your turn” prompts', text: 'Like “Lift the flap on the kit bag!”' },
  { key: 'autoTurn', title: 'Turn pages automatically', text: 'Moves on by itself after each page. Leave off to turn the page together.' },
  { key: 'bedtime', title: 'Bedtime mode', text: 'A dim, calm screen and softer sounds; the story carries on by itself, page after page.' },
]);

/** The words next to the online-voices switch (privacy: be plain about what is sent where). */
export const ONLINE_VOICES_TEXT =
  'Some computers have nicer “online” voices from Google or Microsoft. To use them, the story’s words — including your child’s name — are sent to Google or Microsoft to be spoken. Leave this off to keep everything on this device.';

/** Voice list label: "Serena (en-GB)" with a hint for on-device voices. */
export function voiceLabel(v) {
  const name = v.label || v.name || 'Voice';
  return `${name} (${v.lang || 'unknown'})${v.local === false ? ' · online' : ''}`;
}

export function render(root, ctx) {
  const life = new AbortController();
  const bookId = ctx.state.lastBook || 'tiffin-football';
  const back = { href: `#/b/${bookId}`, label: 'Back to the story', text: 'Done' };

  if (!gatePassed()) {
    // Opened directly (or reloaded): ask for the grown-up hold first.
    const gate = holdButton({
      onUnlock: () => {
        markGatePassed();
        ctx.navigate('#/settings', { replace: true });
      },
    });
    const body = h(
      'section',
      { class: 'gate-screen', 'data-testid': 'gate-screen' },
      h('h1', {}, 'Grown-ups only'),
      h('p', { class: 'lead' }, 'Press and hold the lock for 3 seconds to open the settings.'),
      gate.el,
    );
    root.append(screen(ctx, { name: 'settings', back, settings: false, body }).el);
    return () => gate.destroy();
  }

  const settings = () => ctx.state.settings;
  const setSetting = (patch) => ctx.setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));

  // ---- Children ------------------------------------------------------------------------------
  const childList = h('ul', { class: 'settings-children', role: 'list' });
  function renderChildren() {
    const { profiles, activeProfileId } = ctx.state;
    childList.replaceChildren(
      ...(profiles.length
        ? profiles.map((p) => {
            const said = pronunciationSummary(p);
            return h(
              'li',
              { class: 'settings-child', 'data-testid': 'settings-child', 'data-child': p.id },
              h('span', { class: 'child-avatar', 'aria-hidden': 'true' }, [...p.display][0]?.toLocaleUpperCase('en-GB') ?? '★'),
              h('div', { class: 'settings-child-text' },
                h('p', { class: 'settings-child-name' }, p.display, p.id === activeProfileId ? h('span', { class: 'badge' }, 'Reading now') : null),
                h('p', { class: 'settings-child-say' }, 'Said ', said.kind === 'respell' ? respellNode(said.text) : said.kind === 'recording' ? 'with your recording' : `“${said.text}”`)),
              h('div', { class: 'settings-child-actions' },
                linkButton({ text: 'Edit name', href: `#/b/${bookId}/name?child=${encodeURIComponent(p.id)}`, icon: 'edit', variant: 'link', size: 'sm', testid: 'edit-child' }),
                button({
                  text: 'How we say it',
                  icon: 'ear',
                  variant: 'link',
                  size: 'sm',
                  testid: 'retune-child',
                  onClick: () => {
                    ctx.setState((s) => selectChild(s, p.id));
                    ctx.navigate(`#/b/${bookId}/say`);
                  },
                }),
                button({ text: 'Delete', icon: 'trash', variant: 'link-danger', size: 'sm', testid: 'delete-child', onClick: () => deleteChild(p) })),
            );
          })
        : [h('li', { class: 'settings-empty' }, 'No children added yet.')]),
    );
  }
  async function deleteChild(p) {
    const ok = await confirmDialog({
      title: `Remove ${p.display}?`,
      message: `This removes ${p.display}’s name, pronunciation, any recording and any gift message from this phone.`,
      confirmText: 'Remove',
      danger: true,
      testid: 'confirm-delete',
    });
    if (!ok || life.signal.aborted) return;
    if (p.pronunciation?.recordingId) ctx.blobs.delete(p.pronunciation.recordingId).catch?.(() => {});
    if (p.gift?.recordingId) ctx.blobs.delete(p.gift.recordingId).catch?.(() => {});
    ctx.setState((s) => removeProfile(s, p.id));
    renderChildren();
    toast(`${p.display} has been removed from this phone.`, { kind: 'success' });
  }
  renderChildren();

  // ---- Voice ---------------------------------------------------------------------------------
  const voiceSelect = h('select', { id: 'voice', class: 'select', 'data-testid': 'voice-select' }, h('option', { value: '' }, 'Automatic (best available)'));
  const voiceNote = h('p', { class: 'field-hint', id: 'voice-note' });
  const previewBtn = button({ text: 'Preview', icon: 'play', variant: 'secondary', size: 'md', testid: 'voice-preview', attrs: { 'aria-pressed': 'false' } });
  const active = ctx.state.profiles.find((p) => p.id === ctx.state.activeProfileId);
  const previewName = active ? active.pronunciation?.say || active.display : 'friend';
  const previewText = `Hello ${previewName}! Ready to play?`;
  let previewing = null;
  previewBtn.addEventListener('click', async () => {
    if (previewing) {
      previewing.abort();
      return;
    }
    previewing = new AbortController();
    previewBtn.classList.add('is-playing');
    try {
      await ctx.narrator.speakText(previewText, { signal: previewing.signal, voiceURI: voiceSelect.value || undefined });
    } catch {
      /* ignore */
    }
    previewing = null;
    previewBtn.classList.remove('is-playing');
  });
  voiceSelect.addEventListener('change', () => setSetting({ voiceURI: voiceSelect.value || null }));

  // Online voices are opt-in: they send the words (and the name) to Google or Microsoft.
  const onlineInput = h('input', {
    type: 'checkbox',
    role: 'switch',
    id: 'setting-allowOnlineVoices',
    class: 'switch-input',
    'data-testid': 'setting-allowOnlineVoices',
    checked: settings().allowOnlineVoices === true,
    onChange: (e) => {
      setSetting({ allowOnlineVoices: e.target.checked });
      toast(e.target.checked ? 'Online voices are on. The story’s words go to Google or Microsoft to be spoken.' : 'Online voices are off. Everything stays on this device.', { kind: 'info', timeout: 5000 });
    },
  });
  const onlineToggle = h('label', { class: 'toggle online-toggle', for: 'setting-allowOnlineVoices' },
    h('span', { class: 'toggle-text' }, h('strong', {}, 'Use online voices'), h('span', {}, ONLINE_VOICES_TEXT)),
    onlineInput,
    h('span', { class: 'switch', 'aria-hidden': 'true' }));
  Promise.resolve(ctx.narrator.ready)
    .catch(() => [])
    .then(() => {
      if (life.signal.aborted) return;
      let voices = [];
      try {
        voices = ctx.narrator.listVoices?.() ?? [];
      } catch {
        voices = [];
      }
      for (const v of voices) voiceSelect.append(h('option', { value: v.uri }, voiceLabel(v)));
      voiceSelect.value = voices.some((v) => v.uri === settings().voiceURI) ? settings().voiceURI : '';
      voiceNote.textContent = voices.length
        ? 'The story is read by a computer voice that comes with your phone or browser. Voices marked “online” send the words they read (including the name) to Google or Microsoft; the others stay on this device.'
        : 'No reading voices were found on this device, so the story shows the words without sound. Trying another browser (Chrome or Safari) often helps.';
      voiceSelect.disabled = !voices.length;
    });

  // ---- Speed -----------------------------------------------------------------------------------
  const speedGroup = h('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'speed-title' });
  const renderSpeed = () => {
    const cur = speedFor(settings().rate);
    speedGroup.replaceChildren(
      ...SPEEDS.map((s) =>
        h('label', { class: `segment${s.id === cur.id ? ' is-on' : ''}` },
          h('input', { type: 'radio', name: 'speed', value: s.id, checked: s.id === cur.id, 'data-testid': `speed-${s.id}`, onChange: () => { setSetting({ rate: s.rate }); renderSpeed(); } }),
          h('span', {}, s.label))),
    );
  };
  renderSpeed();

  // ---- Toggles ---------------------------------------------------------------------------------
  const toggles = h('div', { class: 'toggle-list' }, TOGGLES.map((t) => {
    const id = `setting-${t.key}`;
    const input = h('input', { type: 'checkbox', role: 'switch', id, class: 'switch-input', 'data-testid': id, checked: settings()[t.key] !== false, onChange: (e) => setSetting({ [t.key]: e.target.checked }) });
    return h('label', { class: 'toggle', for: id }, h('span', { class: 'toggle-text' }, h('strong', {}, t.title), h('span', {}, t.text)), input, h('span', { class: 'switch', 'aria-hidden': 'true' }));
  }));

  // ---- Family recordings ---------------------------------------------------------------------------
  const readingList = h('ul', { class: 'settings-readings', role: 'list', 'data-testid': 'settings-readings' });
  const bookInfo = new Map(); // bookId -> Promise<book|null>
  const loadBookInfo = (id) => {
    if (!bookInfo.has(id)) bookInfo.set(id, import('../../core/book.js').then((m) => m.loadBook(id)).catch(() => null));
    return bookInfo.get(id);
  };
  let playing = null; // {id, ctl, btn}
  const stopReading = () => {
    playing?.ctl.abort();
    playing?.btn?.classList.remove('is-playing');
    playing = null;
  };
  function renderReadings() {
    stopReading();
    const readings = [...(ctx.state.readings ?? [])].sort((a, b) => (a.bookId === b.bookId ? b.updatedAt - a.updatedAt : a.bookId.localeCompare(b.bookId)));
    if (!readings.length) {
      readingList.replaceChildren(h('li', { class: 'settings-empty' }, 'No family recordings yet.'));
      return;
    }
    const child = activeProfile(ctx.state);
    readingList.replaceChildren(
      ...readings.map((r) => {
        const isActive = ctx.state.activeReading?.[r.bookId] === r.id;
        const meta = h('p', { class: 'settings-reading-meta' }, '…');
        loadBookInfo(r.bookId).then((book) => {
          const title = book ? fillTemplate(book.title, makePerson(child?.display ?? 'you')) : r.bookId;
          const cov = book ? readingCoverage(r, recordingSteps(book)) : null;
          meta.textContent = `${title}${cov ? ` · ${cov.complete ? 'every page' : `${cov.done} of ${cov.total} parts`}` : ''}`;
        });
        const play = button({ text: 'Play', icon: 'play', variant: 'link', size: 'sm', testid: 'reading-play', attrs: { 'aria-pressed': 'false' } });
        play.addEventListener('click', async () => {
          if (playing?.id === r.id) return stopReading();
          stopReading();
          const ctl = new AbortController();
          playing = { id: r.id, ctl, btn: play };
          play.classList.add('is-playing');
          play.setAttribute('aria-pressed', 'true');
          await playReading(ctx, r, { signal: ctl.signal });
          play.classList.remove('is-playing');
          play.setAttribute('aria-pressed', 'false');
          if (playing?.ctl === ctl) playing = null;
        });
        const use = isActive
          ? null
          : button({
              text: 'Use this one',
              icon: 'check',
              variant: 'link',
              size: 'sm',
              testid: 'reading-use',
              onClick: () => {
                ctx.setState((s) => ({ ...s, activeReading: { ...(s.activeReading ?? {}), [r.bookId]: r.id } }));
                renderReadings();
                toast(`${readingLabel(r)} will read the story.`, { kind: 'success' });
              },
            });
        const send = button({ text: 'Send', icon: 'share', variant: 'link', size: 'sm', testid: 'reading-send' });
        const linkHost = h('div', { class: 'download-host', hidden: true });
        send.addEventListener('click', async () => {
          stopReading();
          setBusy(send, true);
          const book = await loadBookInfo(r.bookId);
          await sendReading(ctx, r, { book, childName: child?.display ?? '', host: linkHost });
          setBusy(send, false);
        });
        const del = button({ text: 'Delete', icon: 'trash', variant: 'link-danger', size: 'sm', testid: 'reading-delete', onClick: () => deleteReading(r) });
        return h(
          'li',
          { class: 'settings-reading', 'data-testid': 'settings-reading', 'data-reading': r.id },
          h('span', { class: 'reading-avatar', 'aria-hidden': 'true' }, icon('heart', { size: 20 })),
          h('div', { class: 'settings-child-text' },
            h('p', { class: 'settings-child-name' }, readingLabel(r), isActive ? h('span', { class: 'badge' }, 'Reads the story') : null),
            meta),
          h('div', { class: 'settings-child-actions' }, play, use, send, del),
          linkHost,
        );
      }),
    );
  }
  async function deleteReading(r) {
    stopReading();
    const ok = await confirmDialog({
      title: `Delete ${readingLabel(r).replace(/^Read by/, 'the reading by')}?`,
      message: 'This removes the recording from this phone. Anyone you sent it to keeps their copy.',
      confirmText: 'Delete',
      danger: true,
      testid: 'confirm-delete-reading',
    });
    if (!ok || life.signal.aborted) return;
    const { state, blobIds } = removeReading(ctx.state, r.id);
    ctx.setState(state);
    for (const id of blobIds) {
      try {
        await ctx.blobs.delete(id);
      } catch {
        /* already gone */
      }
    }
    renderReadings();
    toast('The reading has been deleted from this phone.', { kind: 'success' });
  }
  renderReadings();

  // ---- Privacy + forget ------------------------------------------------------------------------
  const forget = button({
    text: 'Forget everything on this device',
    icon: 'trash',
    variant: 'danger',
    size: 'md',
    testid: 'forget-everything',
    onClick: async () => {
      const ok = await confirmDialog({
        title: 'Forget everything?',
        message: 'This removes every name, pronunciation, recording and setting from this phone. It can’t be undone.',
        confirmText: 'Forget everything',
        danger: true,
        testid: 'confirm-forget',
      });
      if (!ok) return;
      await forgetEverything();
      ctx.setState({ ...loadState(), lastBook: bookId }, { persist: false });
      toast('Done — nothing about your family is stored on this device now.', { kind: 'success' });
      ctx.navigate(`#/b/${bookId}`);
    },
  });

  const section = (id, title, ic, ...children) =>
    h('section', { class: 'card settings-section', 'aria-labelledby': id }, h('h2', { id, class: 'section-title' }, h('span', { class: 'section-icon', 'aria-hidden': 'true' }, icon(ic, { size: 20 })), title), ...children);

  const body = [
    h('div', { class: 'settings-head' }, h('p', { class: 'eyebrow' }, 'For grown-ups'), h('h1', {}, 'Settings')),
    h('div', { class: 'settings-grid' },
      section('children-title', 'Children', 'heart', childList, linkButton({ text: 'Add a child', href: `#/b/${bookId}/name`, icon: 'plus', variant: 'secondary', size: 'sm', testid: 'settings-add-child' })),
      section('voice-title', 'Reading voice', 'speaker',
        h('label', { class: 'field-label', for: 'voice' }, 'Voice'),
        h('div', { class: 'voice-row' }, voiceSelect, previewBtn),
        voiceNote,
        onlineToggle,
        h('p', { class: 'field-label', id: 'speed-title' }, 'Reading speed'),
        speedGroup),
      section('family-title', 'Family recordings', 'mic',
        h('p', { class: 'field-hint family-hint' }, 'Readings recorded by grandparents and family, and ones sent to you. They stay on this phone unless you send them.'),
        readingList,
        h('div', { class: 'demo-links' },
          linkButton({ text: 'Record a reading', href: `#/b/${bookId}/record`, icon: 'mic', variant: 'secondary', size: 'sm', testid: 'settings-record' }),
          linkButton({ text: 'Open a family recording', href: '#/open', icon: 'file', variant: 'secondary', size: 'sm', testid: 'settings-open-pack' }),
          linkButton({ text: 'Set up a gift', href: `#/b/${bookId}/gift`, icon: 'gift', variant: 'secondary', size: 'sm', testid: 'settings-gift' }))),
      section('story-title', 'In the story', 'book', toggles),
      section('privacy-title', 'Privacy', 'shield',
        h('ul', { class: 'privacy-list' },
          h('li', {}, 'No account, no sign-up, no adverts, no tracking.'),
          h('li', {}, 'Names, pronunciations and recordings are stored only on this device.'),
          h('li', {}, 'The camera picture never leaves your phone and is never recorded.'),
          h('li', {}, '“Say it for us” uses your browser’s speech service, which may send that one clip to Google or Apple to turn it into text.'),
          h('li', {}, 'Online voices are off unless you switch them on (under “Reading voice”).'),
          h('li', {}, 'Family recordings and gifts travel only in the files you choose to send. Nothing is uploaded.')),
        forget),
      section('demo-title', 'For demos', 'qr',
        h('p', { class: 'field-hint' }, 'Show the book’s QR code on a laptop and scan it with a phone, or print test pages to try the magic window.'),
        h('div', { class: 'demo-links' },
          linkButton({ text: 'QR code', href: `#/qr/${bookId}`, icon: 'qr', variant: 'secondary', size: 'sm', testid: 'link-qr' }),
          linkButton({ text: 'Printable test pages', href: `#/print/${bookId}`, icon: 'print', variant: 'secondary', size: 'sm', testid: 'link-print' }),
          linkButton({ text: 'All books', href: '#/', icon: 'book', variant: 'secondary', size: 'sm' })))),
    h('p', { class: 'version', 'data-testid': 'version' }, `Tiffin & Me read-along · prototype v${ctx.version ?? ''}`),
  ];
  root.append(screen(ctx, { name: 'settings', back, settings: false, body }).el);

  return () => {
    life.abort();
    previewing?.abort();
    stopReading();
  };
}
