// Shared pieces of the grown-up screens: the top bar (series name, back,
// gated settings), the page scaffold, and friendly error panels.

import { h, icon, button, linkButton, tiffinMark } from './ui.js';
import { openParentGate, gatePassed } from './parent-gate.js';

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
