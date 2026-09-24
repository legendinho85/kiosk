// "Siobhan's story is ready": the cover with the name on it, a big Start
// button, the magic window (when there's a camera), who we're reading for
// and how we say it, and a short how-to for grown-ups.

import { h, icon, button, linkButton, respellNode } from '../ui.js';
import { screen, privacyLine } from '../chrome.js';
import { createCover } from '../cover.js';
import { person as makePerson, possessive } from '../../core/personalise.js';
import { planLines } from '../../narrator/plan.js';

/** How the saved pronunciation is described to the parent ("shih-VAWN", or “Siobhan” as written). */
export function pronunciationSummary(profile) {
  const p = profile?.pronunciation ?? {};
  if (p.useRecording && p.recordingId) return { kind: 'recording', text: 'your recording' };
  if (p.respell) return { kind: 'respell', text: p.respell };
  const say = p.say || profile?.display || '';
  return { kind: 'say', text: say };
}

/** A person object for the narrator from a saved profile. */
export function profilePerson(profile) {
  return makePerson(profile.display, profile.pronunciation?.say || profile.display);
}

/** Play the child's name the way the story will say it (voice or recording). */
export async function sayName(ctx, profile, { signal } = {}) {
  const pr = profile.pronunciation ?? {};
  const plan = planLines(['{name}'], profilePerson(profile), { useRecording: Boolean(pr.useRecording), recordingId: pr.recordingId ?? null });
  try {
    ctx.narrator.stop?.();
    return await ctx.narrator.play(plan, { signal });
  } catch {
    return 'stopped';
  }
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 * @param {object} profile the active child
 */
export function renderReady(root, ctx, profile) {
  const bookId = ctx.bookId;
  const book = ctx.book;
  const others = ctx.state.profiles.filter((p) => p.id !== profile.id);
  const life = new AbortController();

  const cover = createCover({ book, bookId, baseUrl: ctx.baseUrl, display: profile.display, signal: ctx.signal });

  const start = linkButton({ text: 'Start reading', href: `#/b/${bookId}/read/1`, icon: 'play', variant: 'primary', size: 'xl', testid: 'start-reading', class: 'start-button' });
  const magicBtn = linkButton({ text: 'Magic window', href: `#/b/${bookId}/magic/1`, icon: 'camera', variant: 'secondary', size: 'lg', testid: 'open-magic', class: 'magic-button' });
  const magicNote = h('p', { class: 'magic-note' }, icon('sparkle', { size: 18 }), h('span', {}, `Point your camera at the real book and watch ${profile.display}’s name appear on the page.`));
  const magicWrap = h('div', { class: 'magic-wrap', hidden: true }, magicBtn, magicNote);

  // Only offer the magic window when this device can do it.
  import('../../ar/magic-window.js')
    .then((m) => {
      if (!ctx.signal?.aborted && m.isCameraSupported?.()) magicWrap.hidden = false;
    })
    .catch(() => {
      /* not built yet or unavailable: simply don't offer it */
    });

  // ---- Who we're reading for ---------------------------------------------------------
  const summary = pronunciationSummary(profile);
  const hearBtn = button({ label: `Hear how we say ${profile.display}`, icon: 'speaker', variant: 'soft', size: 'md', testid: 'hear-name', class: 'hear-name' });
  hearBtn.addEventListener('click', async () => {
    hearBtn.classList.add('is-playing');
    await sayName(ctx, profile, { signal: life.signal });
    hearBtn.classList.remove('is-playing');
  });
  const saidAs = h(
    'p',
    { class: 'said-as' },
    'We say it ',
    summary.kind === 'respell' ? respellNode(summary.text) : summary.kind === 'recording' ? h('strong', {}, 'with your recording') : h('strong', {}, `“${summary.text}”`),
  );

  const childCard = h(
    'section',
    { class: 'card child-card', 'aria-labelledby': 'reading-for' },
    h('div', { class: 'child-card-top' },
      h('span', { class: 'child-avatar', 'aria-hidden': 'true' }, [...profile.display][0]?.toLocaleUpperCase('en-GB') ?? '★'),
      h('div', { class: 'child-card-text' }, h('h2', { id: 'reading-for', class: 'child-card-title' }, 'Reading for ', h('span', { class: 'child-name', 'data-testid': 'active-child' }, profile.display)), saidAs),
      hearBtn),
    h('div', { class: 'child-links' },
      linkButton({ text: 'Change name', href: `#/b/${bookId}/name?child=${encodeURIComponent(profile.id)}`, icon: 'edit', variant: 'link', size: 'sm', testid: 'change-child' }),
      linkButton({ text: 'Change how we say it', href: `#/b/${bookId}/say`, icon: 'ear', variant: 'link', size: 'sm', testid: 'change-say' }),
      linkButton({ text: 'Add a child', href: `#/b/${bookId}/name`, icon: 'plus', variant: 'link', size: 'sm', testid: 'add-child' })),
    others.length
      ? h('div', { class: 'switch-row' },
          h('span', { class: 'switch-label' }, 'Switch to'),
          others.map((p) => button({
            text: p.display,
            variant: 'chip',
            size: 'sm',
            testid: 'switch-child',
            attrs: { 'data-child': p.id },
            onClick: () => {
              ctx.setState((s) => ({ ...s, activeProfileId: p.id }));
              ctx.navigate(`#/b/${bookId}`);
            },
          })))
      : null,
  );

  const tips = h(
    'section',
    { class: 'card tips', 'aria-labelledby': 'tips-title' },
    h('h2', { id: 'tips-title' }, 'How to read together'),
    h('ol', { class: 'tip-list' },
      tip('book', 'Sit together with the real book', 'Open it at the cover and prop your phone where you can both see it.'),
      tip('hand', 'Let little hands do the magic', 'When the story asks, your child can work the flap, wheel or slider on the book — or on the screen.'),
      tip('forward', 'Turn the pages together', `Turn the book’s page when the story does. Tap the arrow to move on — or switch on “turn pages automatically” in settings.`)),
  );

  const hero = h(
    'section',
    { class: 'ready-hero' },
    h('p', { class: 'eyebrow' }, 'All set'),
    h('h1', { class: 'ready-title' }, `${possessive(profile.display)} story is ready`),
    h('div', { class: 'ready-cover' }, cover.el),
    h('div', { class: 'ready-actions' }, start, magicWrap),
  );

  const { el } = screen(ctx, { name: 'ready', body: [hero, h('div', { class: 'ready-side' }, childCard, tips, privacyLine('Everything stays on this phone. No account, no tracking.'))] });
  root.append(el);
  return () => {
    life.abort();
    ctx.narrator.stop?.();
  };
}

function tip(ic, title, text) {
  return h('li', { class: 'tip' }, h('span', { class: 'tip-icon', 'aria-hidden': 'true' }, icon(ic, { size: 24 })), h('div', {}, h('strong', {}, title), h('p', {}, text)));
}

/** Direct use (not routed on its own; landing.js decides). */
export function render(root, ctx) {
  const profile = ctx.state.profiles.find((p) => p.id === ctx.state.activeProfileId);
  if (!profile) {
    ctx.navigate(`#/b/${ctx.bookId}`, { replace: true });
    return null;
  }
  return renderReady(root, ctx, profile);
}
