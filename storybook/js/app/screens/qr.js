// #/qr/:book — the QR code a printed book carries, on screen. Handy for
// demos: open this on a laptop and scan it with a phone.

import { h, icon, button, linkButton, toast } from '../ui.js';
import { screen } from '../chrome.js';
import { fillTemplate } from '../../core/personalise.js';

/** The URL a printed QR code opens (our own version of qr.js's landingUrlFor, for when that module is missing). */
export function fallbackLandingUrl(bookId, loc = globalThis.location) {
  const base = new URL('./', `${loc.origin}${loc.pathname}`);
  base.search = `?b=${encodeURIComponent(bookId)}`;
  return base.href;
}

/** Copy text; resolves true on success. Falls back to a hidden textarea + execCommand. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = h('textarea', { class: 'sr-only', readonly: true }, text);
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand?.('copy');
      ta.remove();
      return Boolean(ok);
    } catch {
      return false;
    }
  }
}

export function render(root, ctx) {
  const { book, bookId } = ctx;
  const codeBox = h('div', { class: 'qr-code', 'data-testid': 'qr-code', role: 'img', 'aria-label': 'QR code for this book' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }));
  const urlText = h('code', { class: 'qr-url', 'data-testid': 'qr-url' }, fallbackLandingUrl(bookId));
  const copyBtn = button({
    text: 'Copy link',
    icon: 'copy',
    variant: 'secondary',
    size: 'md',
    testid: 'copy-link',
    onClick: async () => {
      const ok = await copyText(urlText.textContent);
      toast(ok ? 'Link copied.' : 'Couldn’t copy — press and hold the link to copy it.', { kind: ok ? 'success' : 'info' });
    },
  });

  const body = h(
    'section',
    { class: 'qr-screen' },
    h('p', { class: 'eyebrow' }, 'For demos'),
    h('h1', {}, `Scan to read “${fillTemplate(book.title, 'you')}”`),
    h('p', { class: 'lead' }, 'This is the code on the back of the printed book. Point a phone’s camera at it to open the read-along.'),
    h('div', { class: 'card qr-card' }, codeBox, urlText, h('div', { class: 'qr-actions' },
      copyBtn,
      linkButton({ text: 'Printable test pages', href: `#/print/${bookId}`, icon: 'print', variant: 'secondary', size: 'md', testid: 'qr-print' }),
      linkButton({ text: 'Name stickers', href: `#/stickers/${bookId}?from=qr`, icon: 'sticker', variant: 'secondary', size: 'md', testid: 'qr-stickers' }))),
    h('p', { class: 'field-hint qr-hint' }, icon('info', { size: 16 }), h('span', {}, 'The phone needs to reach this computer: use a shared Wi-Fi address or a public (https) link. The camera and microphone need https.')),
  );
  root.append(screen(ctx, { name: 'qr', back: { href: `#/b/${bookId}`, label: 'Back to the book', text: 'Back' }, body }).el);

  import('../../ar/qr.js')
    .then((m) => {
      if (ctx.signal?.aborted) return;
      const url = m.landingUrlFor?.(bookId) ?? fallbackLandingUrl(bookId);
      urlText.textContent = url;
      // qrSvg returns our own generated markup (no user input), safe to inline.
      codeBox.innerHTML = m.qrSvg(url, { moduleSize: 8, margin: 4 });
      codeBox.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    })
    .catch(() => {
      if (ctx.signal?.aborted) return;
      codeBox.replaceChildren(h('p', { class: 'qr-missing' }, icon('qr', { size: 40 }), h('span', {}, 'The QR code maker isn’t available yet — the link below works the same way.')));
    });
}
