// "What's your child's name?" — the first thing a parent sees after scanning
// the QR code (via landing.js), and the add-a-child / change-the-name screen
// (#/b/:book/name, #/b/:book/name?child=<id>).
//
// The name box sits at the very top. Below it the real book cover redraws
// with the name in it as the parent types.

import { h, icon, button, debounce } from '../ui.js';
import { screen, privacyLine } from '../chrome.js';
import { createCover } from '../cover.js';
import { normaliseName, NAME_ERRORS, NAME_MAX_LENGTH } from '../../core/personalise.js';
import { newId, upsertProfile } from '../../core/storage.js';
import { getCandidates, toPronunciation } from '../../pronounce/index.js';

/** Names longer than this (in letters) get a gentle "what do you call them at home?" hint. */
export const LONG_NAME_LETTERS = 12;

/** Letters in a name, ignoring spaces, hyphens and apostrophes. */
export function letterCount(name) {
  return [...String(name ?? '').replace(/[^\p{L}\p{M}]/gu, '').normalize('NFC')].length;
}

/** The hint to show for a long name, or '' when it's fine. */
export function longNameHint(display) {
  if (letterCount(display) <= LONG_NAME_LETTERS) return '';
  return 'What a lovely name! If there’s a shorter name you use at home, try that — it fits the pictures (and little mouths) best.';
}

/**
 * Validate what the parent typed. Returns the error text to show, or '' if fine.
 * @param {string} raw
 */
export function nameError(raw) {
  const r = normaliseName(raw);
  return r.ok ? '' : NAME_ERRORS[r.error] ?? NAME_ERRORS['invalid-chars'];
}

/** The best-guess pronunciation for a new name (dictionary first, else as written). */
export function defaultPronunciation(lexicon, display) {
  const [first] = getCandidates(lexicon, display, { max: 4 });
  return toPronunciation(first ?? { say: display, label: 'As written', source: 'as-written' });
}

/**
 * Render the name form.
 * @param {HTMLElement} root
 * @param {object} ctx
 * @param {{mode?: 'first'|'add'|'edit', profile?: object|null}} [opts]
 */
export function renderNameForm(root, ctx, { mode = 'first', profile = null } = {}) {
  const bookId = ctx.bookId;
  const others = ctx.state.profiles.filter((p) => p.id !== profile?.id);
  const editing = mode === 'edit' && profile;

  const input = h('input', {
    id: 'child-name',
    class: 'name-input',
    type: 'text',
    name: 'child-name',
    'data-testid': 'name-input',
    autocomplete: 'off',
    autocapitalize: 'words',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'next',
    maxlength: String(NAME_MAX_LENGTH),
    placeholder: 'e.g. Ava',
    'aria-describedby': 'name-help name-error name-hint',
    value: editing ? profile.display : '',
  });
  const error = h('p', { id: 'name-error', class: 'field-error', 'data-testid': 'name-error', role: 'alert', hidden: true });
  const hint = h('p', { id: 'name-hint', class: 'field-hint', 'data-testid': 'name-hint', hidden: true }, icon('heart', { size: 18 }), h('span'));
  const continueBtn = button({ text: 'Continue', iconAfter: 'arrow', variant: 'primary', size: 'lg', type: 'submit', testid: 'name-continue', class: 'name-continue' });

  const heading = editing ? `Change ${profile.display}’s name` : mode === 'add' ? 'Who’s reading today?' : 'What’s your child’s name?';
  const lead = editing
    ? 'Fix the spelling, or use the name you call them at home.'
    : 'We’ll read the story aloud with their name in it, and write it into the pictures.';

  const form = h(
    'form',
    { class: 'name-form', novalidate: true, autocomplete: 'off' },
    h('h1', { class: 'name-title' }, h('label', { for: 'child-name' }, heading)),
    h('p', { class: 'lead', id: 'name-help' }, lead),
    h('div', { class: 'name-row' }, input, continueBtn),
    error,
    hint,
    privacyLine(),
  );

  const chips = !editing && others.length
    ? h(
        'nav',
        { class: 'child-chips', 'aria-label': 'Children on this phone' },
        h('p', { class: 'eyebrow' }, 'Welcome back'),
        h('div', { class: 'chip-row' }, others.map((p) =>
          h('button', { type: 'button', class: 'child-chip', 'data-testid': 'child-chip', 'data-child': p.id, onClick: () => pick(p) },
            h('span', { class: 'child-chip-initial', 'aria-hidden': 'true' }, [...p.display][0]?.toLocaleUpperCase('en-GB') ?? '★'),
            h('span', { class: 'child-chip-text' }, 'Reading for ', h('strong', {}, p.display), '?'),
            icon('forward', { size: 20 })))),
        h('p', { class: 'chips-or' }, h('span', {}, 'or add someone new')),
      )
    : null;

  const cover = createCover({ book: ctx.book, bookId, baseUrl: ctx.baseUrl, display: editing ? profile.display : '', signal: ctx.signal });
  const formPanel = h('section', { class: 'name-panel' }, chips, form);
  const coverPanel = h('section', { class: 'cover-panel', 'aria-label': 'Your book' }, cover.el, h('p', { class: 'cover-note' }, icon('sparkle', { size: 18 }), h('span', {}, 'Watch the name appear on the cover.')));

  const back = editing || mode === 'add' ? { href: `#/b/${bookId}`, label: 'Back', text: 'Back' } : null;
  const { el } = screen(ctx, { name: 'name', back, body: [formPanel, coverPanel] });
  root.append(el);

  // ---- Behaviour -----------------------------------------------------------------
  let showErrors = false;
  const showError = (msg) => {
    error.textContent = msg;
    error.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };
  const showHint = (display) => {
    const msg = longNameHint(display);
    hint.lastChild.textContent = msg;
    hint.hidden = !msg;
  };

  const update = debounce(() => {
    const r = normaliseName(input.value);
    if (r.ok) cover.setName(r.display, { pop: true });
    else if (!input.value.trim()) cover.setName('');
    showHint(r.ok ? r.display : '');
    if (showErrors) showError(r.ok ? '' : nameError(input.value));
  }, 160);
  input.addEventListener('input', update);
  input.addEventListener('blur', () => update.flush());

  function pick(p) {
    ctx.setState((s) => ({ ...s, activeProfileId: p.id }));
    ctx.navigate(`#/b/${bookId}`);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    update.flush();
    const r = normaliseName(input.value);
    if (!r.ok) {
      showErrors = true;
      showError(nameError(input.value));
      input.focus();
      return;
    }
    // Same child typed again? Pick them rather than making a twin.
    const existing = !editing && ctx.state.profiles.find((p) => p.key === r.key);
    if (existing) {
      if (existing.display !== r.display) ctx.setState((s) => upsertProfile(s, { ...existing, display: r.display }));
      pick(existing);
      return;
    }
    continueBtn.disabled = true;
    const lexicon = ctx.lexicon ?? (await ctx.getLexicon?.().catch(() => null)) ?? null;
    if (ctx.signal?.aborted) return;
    const keepSound = editing && profile.key === r.key && profile.pronunciation?.say;
    const next = editing
      ? { ...profile, display: r.display, key: r.key, pronunciation: keepSound ? profile.pronunciation : { ...defaultPronunciation(lexicon, r.display), recordingId: profile.pronunciation?.recordingId ?? null, useRecording: false } }
      : { id: newId('child'), display: r.display, key: r.key, pronunciation: defaultPronunciation(lexicon, r.display) };
    ctx.setState((s) => upsertProfile(s, next));
    ctx.navigate(`#/b/${bookId}/say`);
  });

  // Phones: while the keyboard is up, keep the box and the cover in view together.
  const vv = globalThis.visualViewport;
  const narrow = globalThis.matchMedia?.('(max-width: 759px)');
  let typing = false;
  const syncTyping = () => {
    const short = (vv?.height ?? innerHeight) < 600 && Boolean(narrow?.matches);
    const next = document.activeElement === input && short;
    if (next === typing) return;
    typing = next;
    el.classList.toggle('is-typing', typing);
    if (typing) requestAnimationFrame(() => formPanel.scrollIntoView?.({ block: 'start' }));
  };
  input.addEventListener('focus', syncTyping);
  input.addEventListener('blur', () => setTimeout(syncTyping, 120));
  vv?.addEventListener('resize', syncTyping);

  // First visit on a big screen: the cursor waits in the box. On phones we
  // don't pop the keyboard over the cover before the parent has seen it.
  if (mode !== 'first' || matchMedia?.('(pointer: fine)').matches) {
    try {
      input.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }
  if (editing) update();

  return () => {
    update.cancel();
    vv?.removeEventListener('resize', syncTyping);
  };
}

/** #/b/:book/name — add a child, or ?child=<id> to change a name. */
export function render(root, ctx) {
  const id = ctx.query?.child;
  const profile = id ? ctx.state.profiles.find((p) => p.id === id) ?? null : null;
  return renderNameForm(root, ctx, { mode: profile ? 'edit' : ctx.state.profiles.length ? 'add' : 'first', profile });
}
