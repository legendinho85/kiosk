// "What's your child's name?" — the first thing a parent sees after scanning
// the QR code (via landing.js), and the add-a-child / change-the-name screen
// (#/b/:book/name, #/b/:book/name?child=<id>).
//
// The name box sits at the very top. Below it the real book cover redraws
// with the name in it as the parent types.

import { h, icon, button, linkButton, debounce } from '../ui.js';
import { screen, privacyLine, envBanner } from '../chrome.js';
import { createCover } from '../cover.js';
import { normaliseName, NAME_ERRORS, NAME_MAX_LENGTH } from '../../core/personalise.js';
import { newId, upsertProfile } from '../../core/storage.js';
import { getCandidates } from '../../pronounce/index.js';
import { storedPronunciation } from './pronunciation.js';
import { selectChild } from '../../family/family.js';

/** Names longer than this (in letters) are offered a nickname ("What do you call them at home?"). */
export const LONG_NAME_LETTERS = 10;

/** Letters in a name, ignoring spaces, hyphens and apostrophes. */
export function letterCount(name) {
  return [...String(name ?? '').replace(/[^\p{L}\p{M}]/gu, '').normalize('NFC')].length;
}

/** The parts of a name: "Anna-Sophia Rose" -> ["Anna", "Sophia", "Rose"]. */
export function nameParts(display) {
  return String(display ?? '').split(/[\s-]+/).filter((p) => /\p{L}/u.test(p));
}

/** Offer a nickname? Long names (more than 10 letters) and names with several parts. */
export function nicknameOffer(display) {
  return letterCount(display) > LONG_NAME_LETTERS || nameParts(display).length > 1;
}

/** A likely short name to offer with one tap: the first part of a name with several ("Anna" for "Anna-Sophia"). */
export function nicknameSuggestion(display) {
  const parts = nameParts(display);
  if (parts.length < 2) return '';
  const first = normaliseName(parts[0].replace(/\.$/, ''));
  return first.ok && letterCount(first.display) >= 2 ? first.display : '';
}

/** The words above the nickname box, or '' when no nickname is offered. */
export function longNameHint(display) {
  if (!nicknameOffer(display)) return '';
  return `What a lovely name! We’ll use the short name in the story and the pictures, and keep “${display}” as their full name.`;
}

/**
 * Which name goes where: `display` is used in the stories and pictures, the
 * typed name is kept as `fullName` when a nickname is chosen.
 * @param {string} typed
 * @param {string} nickname '' for none
 * @returns {{ok: true, display: string, key: string, fullName: string|null} | {ok: false, field: 'name'|'nickname', error: string}}
 */
export function resolveNames(typed, nickname = '') {
  const full = normaliseName(typed);
  if (!full.ok) return { ok: false, field: 'name', error: full.error };
  if (!String(nickname ?? '').trim()) return { ok: true, display: full.display, key: full.key, fullName: null };
  const nick = normaliseName(nickname);
  if (!nick.ok) return { ok: false, field: 'nickname', error: nick.error };
  return { ok: true, display: nick.display, key: nick.key, fullName: nick.key === full.key ? null : full.display };
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
  return storedPronunciation(first ?? { say: display, label: 'As written', source: 'as-written' });
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
    value: editing ? profile.fullName || profile.display : '',
  });
  const error = h('p', { id: 'name-error', class: 'field-error', 'data-testid': 'name-error', role: 'alert', hidden: true });

  // "What do you call them at home?" — for long names, names with several
  // parts, or a name that sounds like someone in the story (js/core/clash.js).
  const nickInput = h('input', {
    id: 'nickname',
    class: 'text-input nick-input',
    type: 'text',
    'data-testid': 'nickname-input',
    autocomplete: 'off',
    autocapitalize: 'words',
    autocorrect: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    maxlength: String(NAME_MAX_LENGTH),
    placeholder: 'e.g. Max',
    'aria-describedby': 'name-hint nick-error',
    value: editing && profile.fullName ? profile.display : '',
  });
  const nickError = h('p', { id: 'nick-error', class: 'field-error', 'data-testid': 'nickname-error', role: 'alert', hidden: true });
  const hintText = h('span', { class: 'nick-lead' });
  const suggestHost = h('div', { class: 'nick-suggest' });
  const hint = h(
    'div',
    { class: 'field-hint nick-card', 'data-testid': 'nickname-offer', hidden: true },
    icon('heart', { size: 18 }),
    h('div', { class: 'nick-body' },
      h('label', { class: 'nick-label', for: 'nickname' }, 'What do you call them at home? ', h('span', { class: 'optional' }, '(optional)')),
      h('p', { id: 'name-hint', 'data-testid': 'name-hint' }, hintText),
      h('div', { class: 'nick-row' }, nickInput, suggestHost),
      nickError),
  );
  let clashLib = null;
  import('../../core/clash.js').then((m) => (clashLib = m)).catch(() => {});
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
  const formPanel = h('section', { class: 'name-panel' }, envBanner({ signal: ctx.signal }), chips, form);
  // Not the parent? Grandparents, gift-givers, and families who were sent a file.
  const extras = editing
    ? null
    : h('nav', { class: 'family-extras', 'aria-label': 'For family and friends' },
        h('p', { class: 'family-extras-title' }, 'For family and friends'),
        h('div', { class: 'family-extras-row' },
          linkButton({ text: 'Give it as a gift', href: `#/b/${bookId}/gift`, icon: 'gift', variant: 'link', size: 'sm', testid: 'go-gift' }),
          linkButton({ text: 'Record it in your voice', href: `#/b/${bookId}/record`, icon: 'mic', variant: 'link', size: 'sm', testid: 'go-record' }),
          linkButton({ text: 'Open a family recording', href: '#/open', icon: 'file', variant: 'link', size: 'sm', testid: 'open-pack' })));
  const coverPanel = h('section', { class: 'cover-panel', 'aria-label': 'Your book' }, cover.el, h('p', { class: 'cover-note' }, icon('sparkle', { size: 18 }), h('span', {}, 'Watch the name appear on the cover.')), extras);

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
  const clashFor = (display) => {
    try {
      return clashLib && ctx.book?.characters ? clashLib.clashMessage(display, clashLib.nameClashes(display, ctx.book.characters)) : '';
    } catch {
      return '';
    }
  };
  const showHint = (display) => {
    const clash = display ? clashFor(display) : '';
    const msg = clash || longNameHint(display);
    const keep = Boolean(nickInput.value.trim()) && Boolean(display);
    hintText.textContent = msg || (keep ? `We’ll use the short name in the story and the pictures, and keep “${display}” as their full name.` : '');
    hint.hidden = !msg && !keep;
    hint.classList.toggle('is-clash', Boolean(clash));
    const suggestion = nicknameSuggestion(display);
    suggestHost.replaceChildren(
      suggestion && normaliseName(nickInput.value).display !== suggestion
        ? button({ text: suggestion, icon: 'plus', variant: 'chip', size: 'sm', testid: 'nickname-suggestion', attrs: { 'aria-label': `Use ${suggestion}` }, onClick: () => { nickInput.value = suggestion; update(); update.flush(); nickInput.focus(); } })
        : null,
    );
  };

  const update = debounce(() => {
    const r = normaliseName(input.value);
    const nick = normaliseName(nickInput.value);
    const shown = r.ok ? (nickInput.value.trim() && nick.ok ? nick.display : r.display) : '';
    if (shown) cover.setName(shown, { pop: true });
    else if (!input.value.trim()) cover.setName('');
    showHint(r.ok ? r.display : '');
    if (showErrors) showError(r.ok ? '' : nameError(input.value));
    if (nickError.textContent && (!nickInput.value.trim() || nick.ok)) {
      nickError.hidden = true;
      nickError.textContent = '';
    }
  }, 160);
  input.addEventListener('input', update);
  input.addEventListener('blur', () => update.flush());
  nickInput.addEventListener('input', update); // Enter submits the form like the name box

  function pick(p) {
    ctx.setState((s) => selectChild(s, p.id));
    ctx.navigate(`#/b/${bookId}`);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    update.flush();
    const r = resolveNames(input.value, hint.hidden ? '' : nickInput.value);
    if (!r.ok) {
      if (r.field === 'nickname') {
        nickError.textContent = NAME_ERRORS[r.error] ?? NAME_ERRORS['invalid-chars'];
        nickError.hidden = false;
        nickInput.setAttribute('aria-invalid', 'true');
        nickInput.focus();
        return;
      }
      showErrors = true;
      showError(nameError(input.value));
      input.focus();
      return;
    }
    nickInput.removeAttribute('aria-invalid');
    // Same child typed again? Pick them rather than making a twin.
    const existing = !editing && ctx.state.profiles.find((p) => p.key === r.key);
    if (existing) {
      if (existing.display !== r.display || (r.fullName && existing.fullName !== r.fullName)) ctx.setState((s) => upsertProfile(s, { ...existing, display: r.display, ...(r.fullName ? { fullName: r.fullName } : {}) }));
      pick(existing);
      return;
    }
    continueBtn.disabled = true;
    const lexicon = ctx.lexicon ?? (await ctx.getLexicon?.().catch(() => null)) ?? null;
    if (ctx.signal?.aborted) return;
    const keepSound = editing && profile.key === r.key && profile.pronunciation?.say;
    const names = { display: r.display, key: r.key };
    let next = editing
      ? { ...profile, ...names, pronunciation: keepSound ? profile.pronunciation : { ...defaultPronunciation(lexicon, r.display), recordingId: profile.pronunciation?.recordingId ?? null, useRecording: false } }
      : { id: newId('child'), ...names, pronunciation: defaultPronunciation(lexicon, r.display) };
    if (r.fullName) next = { ...next, fullName: r.fullName };
    else if ('fullName' in next) {
      next = { ...next };
      delete next.fullName;
    }
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
