// #/settings — for grown-ups only (behind the press-and-hold gate).
// Children, voice, reading speed, story options, privacy, demo links.

import { h, icon, button, linkButton, confirmDialog, toast, respellNode } from '../ui.js';
import { screen } from '../chrome.js';
import { holdButton, gatePassed, markGatePassed } from '../parent-gate.js';
import { removeProfile, forgetEverything, loadState, DEFAULT_SETTINGS } from '../../core/storage.js';
import { pronunciationSummary } from './ready.js';

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
]);

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
                    ctx.setState((s) => ({ ...s, activeProfileId: p.id }));
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
      message: `This removes ${p.display}’s name, pronunciation and any recording from this phone.`,
      confirmText: 'Remove',
      danger: true,
      testid: 'confirm-delete',
    });
    if (!ok || life.signal.aborted) return;
    if (p.pronunciation?.recordingId) ctx.blobs.delete(p.pronunciation.recordingId).catch?.(() => {});
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
        h('p', { class: 'field-label', id: 'speed-title' }, 'Reading speed'),
        speedGroup),
      section('story-title', 'In the story', 'book', toggles),
      section('privacy-title', 'Privacy', 'shield',
        h('ul', { class: 'privacy-list' },
          h('li', {}, 'No account, no sign-up, no adverts, no tracking.'),
          h('li', {}, 'Names, pronunciations and recordings are stored only on this device.'),
          h('li', {}, 'The camera picture never leaves your phone and is never recorded.'),
          h('li', {}, '“Say it for us” uses your browser’s speech service, which may send that one clip to Google or Apple to turn it into text.')),
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
  };
}
