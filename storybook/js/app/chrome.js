// Shared pieces of the grown-up screens: the top bar (series name, back,
// gated settings), the page scaffold, and friendly error panels.

import { h, icon, button, linkButton, tiffinMark, toast } from './ui.js';
import { openParentGate, gatePassed } from './parent-gate.js';
import { prefs } from '../core/storage.js';

export const SERIES_NAME = 'Tiffin & Me';

/**
 * Open settings behind the grown-ups' gate.
 * @param {{navigate: (hash: string) => void}} ctx
 */
export async function openSettings(ctx) {
  if (gatePassed() || (await openParentGate())) ctx.navigate('#/settings');
}

/**
 * The top bar.
 * @param {object} ctx screen context
 * @param {{back?: {href: string, label: string} | null, settings?: boolean, title?: string}} [opts]
 */
export function appBar(ctx, { back = null, settings = true } = {}) {
  const left = back
    ? h('a', { class: 'appbar-back', href: back.href, 'data-testid': 'back', 'aria-label': back.label }, icon('back', { size: 24 }), h('span', { class: 'appbar-back-text' }, back.text ?? 'Back'))
    : null;
  const brand = h('a', { class: 'brand', href: '#/', 'aria-label': `${SERIES_NAME}: all books` }, tiffinMark({ size: 38 }), h('span', { class: 'brand-name' }, SERIES_NAME));
  const gear = settings
    ? button({ label: 'Settings for grown-ups', icon: 'settings', variant: 'quiet', testid: 'open-settings', class: 'appbar-gear', onClick: () => openSettings(ctx) })
    : h('span', { class: 'appbar-spacer' });
  return h('header', { class: `appbar${back ? ' has-back' : ''}` }, h('div', { class: 'appbar-inner' }, left, brand, gear));
}

/**
 * A grown-up screen: top bar + <main>.
 * @param {object} ctx
 * @param {{name: string, back?: object|null, settings?: boolean, body: Node|Node[], footer?: Node|null}} opts
 * @returns {{el: HTMLElement, main: HTMLElement}}
 */
export function screen(ctx, { name, back = null, settings = true, body, footer = null }) {
  const main = h('main', { class: `screen-body ${name}-body`, id: 'main' }, body);
  const el = h('div', { class: `screen screen-${name}`, 'data-screen': name }, appBar(ctx, { back, settings }), main, footer);
  return { el, main };
}

/** Small reassurance line: what happens to the child's name. */
export function privacyLine(text = 'No account, no sign-up. The name stays on this phone.') {
  return h('p', { class: 'reassure' }, icon('shield', { size: 20 }), h('span', {}, text));
}

/**
 * A friendly full-screen message with a way home (unknown book, load failures).
 * @param {object} ctx
 * @param {{title: string, message: string, testid?: string, actions?: Node[]}} opts
 */
export function messageScreen(ctx, { title, message, testid = 'error', actions = null }) {
  const body = h(
    'section',
    { class: 'message-card', 'data-testid': testid },
    h('div', { class: 'message-art', 'aria-hidden': 'true' }, tiffinMark({ size: 120 }), h('span', { class: 'message-ball' }, icon('ball', { size: 40 }))),
    h('h1', {}, title),
    h('p', { class: 'lead' }, message),
    h('div', { class: 'message-actions' }, actions ?? [linkButton({ text: 'See all books', href: '#/', icon: 'book', variant: 'primary', testid: 'go-home' })]),
  );
  return screen(ctx, { name: 'message', body }).el;
}

/** The message for a book id that doesn't exist (or failed to load). */
export function bookErrorScreen(ctx, err) {
  const unknown = /unknown book/i.test(String(err?.message ?? ''));
  return messageScreen(ctx, unknown
    ? {
        title: 'We can’t find that book',
        message: 'The link or QR code doesn’t match a Tiffin & Me book we know. Check the code on the back of your book, or choose a book below.',
        testid: 'unknown-book',
      }
    : {
        title: 'The story didn’t load',
        message: 'Please check your internet connection and try again. Everything you’ve set up is still saved on this phone.',
        testid: 'load-error',
        actions: [
          button({ text: 'Try again', icon: 'refresh', variant: 'primary', testid: 'retry', onClick: () => location.reload() }),
          linkButton({ text: 'See all books', href: '#/', icon: 'book', variant: 'secondary' }),
        ],
      });
}

// ---- Environment and privacy notices ----------------------------------------------

let envDismissed = false;

/**
 * "This page opened inside Instagram, which can't read aloud…": shown at the
 * top of the landing and name screens when js/core/env.js says the page is
 * somewhere that will let the family down. Hidden when all is well, or if the
 * module is missing.
 * @param {{signal?: AbortSignal}} [opts]
 */
export function envBanner({ signal } = {}) {
  const text = h('p', { class: 'env-hint-text', 'data-testid': 'env-hint-text' });
  const close = button({ label: 'Hide this message', icon: 'close', variant: 'quiet', size: 'sm', testid: 'env-hint-close', class: 'env-hint-close' });
  const el = h('aside', { class: 'env-hint', role: 'note', 'aria-label': 'Tip for this browser', 'data-testid': 'env-hint', hidden: true }, h('span', { class: 'env-hint-icon', 'aria-hidden': 'true' }, icon('alert', { size: 20 })), text, close);
  close.addEventListener('click', () => {
    envDismissed = true;
    el.remove();
  });
  if (!envDismissed) {
    import('../core/env.js')
      .then((m) => {
        if (signal?.aborted) return;
        const hint = m.detectEnvironment?.()?.openInBrowserHint;
        if (hint) {
          text.textContent = hint;
          el.hidden = false;
        }
      })
      .catch(() => {});
  }
  return el;
}

const CONSENT_PREF = 'onlineVoices.declined';

/**
 * Asks the grown-up about online voices when this browser only has online
 * English voices (narrator.voiceStatus().needsConsent). Until they agree the
 * story reads silently with the words lighting up; the default is to stay
 * private. Hidden when there's nothing to ask.
 * @param {object} ctx screen context (narrator, setState, state, servicesReady)
 * @param {{signal?: AbortSignal, name?: string, onChange?: () => void}} [opts]
 */
export function voiceConsentCard(ctx, { signal, name = '', onChange } = {}) {
  const allow = button({ text: 'Use the online voice', icon: 'speaker', variant: 'secondary', size: 'md', testid: 'consent-allow' });
  const decline = button({ text: 'Stay private', icon: 'shield', variant: 'quiet', size: 'md', testid: 'consent-decline' });
  const who = name ? `${name}’s` : 'your child’s';
  const el = h(
    'section',
    { class: 'card consent-card', 'data-testid': 'voice-consent', 'aria-labelledby': 'consent-title', hidden: true },
    h('div', { class: 'consent-head' }, h('span', { class: 'consent-icon', 'aria-hidden': 'true' }, icon('speaker', { size: 22 })), h('h2', { id: 'consent-title' }, 'Hear the story read aloud?')),
    h('p', {}, 'The only reading voices in this browser are online voices from Google or Microsoft. To use one, the story’s words — including ', who, ' name — are sent to them.'),
    h('p', { class: 'consent-private' }, 'Or stay private: the words light up in time, and you read them aloud together.'),
    h('div', { class: 'consent-actions' }, allow, decline),
  );
  allow.addEventListener('click', () => {
    ctx.setState((s) => ({ ...s, settings: { ...s.settings, allowOnlineVoices: true } }));
    prefs.set(CONSENT_PREF, false);
    el.hidden = true;
    toast('The online voice will read the story. You can change this in settings.', { kind: 'success' });
    onChange?.();
  });
  decline.addEventListener('click', () => {
    prefs.set(CONSENT_PREF, true);
    el.hidden = true;
    toast('Staying private: the words will light up without a voice. You can change this in settings.', { kind: 'info', timeout: 6000 });
    onChange?.();
  });
  const check = () => {
    if (signal?.aborted || ctx.state.settings?.allowOnlineVoices || prefs.get(CONSENT_PREF, false)) return;
    let status = null;
    try {
      status = ctx.narrator?.voiceStatus?.() ?? null;
    } catch {
      status = null;
    }
    el.hidden = !status?.needsConsent;
  };
  Promise.resolve(ctx.servicesReady)
    .catch(() => null)
    .then(() => Promise.resolve(ctx.narrator?.ready).catch(() => null))
    .then(() => {
      check();
      // Some browsers list their voices a moment later.
      const t = setTimeout(check, 1500);
      signal?.addEventListener('abort', () => clearTimeout(t), { once: true });
    });
  return el;
}
