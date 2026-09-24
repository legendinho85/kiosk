// #/print/:book — printable test pages (js/ar/print.js): each spread with
// blank name spots, plus a back cover with the QR code, for trying the magic
// window without a real printed book.

import { h, button, linkButton } from '../ui.js';
import { messageScreen } from '../chrome.js';
import { fallbackLandingUrl } from './qr.js';

export function render(root, ctx) {
  const { book, bookId } = ctx;
  const pages = h('div', { class: 'print-pages', 'data-testid': 'print-pages' }, h('div', { class: 'reader-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Preparing the pages…'));
  const bar = h(
    'div',
    { class: 'print-bar no-print' },
    linkButton({ text: 'Back', href: `#/qr/${bookId}`, icon: 'back', variant: 'quiet', size: 'md', testid: 'back' }),
    h('h1', { class: 'print-title' }, 'Printable test pages'),
    button({ text: 'Print', icon: 'print', variant: 'primary', size: 'md', testid: 'print-now', onClick: () => window.print() }),
  );
  root.append(h('div', { class: 'screen screen-print', 'data-screen': 'print' }, bar, pages));
  let cleanup = null;
  let gone = false;

  (async () => {
    let print;
    let qr = null;
    try {
      print = await import('../../ar/print.js');
    } catch {
      if (!gone) root.replaceChildren(messageScreen(ctx, { title: 'Test pages are nearly ready', message: 'This part is still being built. The QR code page works already.', testid: 'print-missing', actions: [linkButton({ text: 'Show the QR code', href: `#/qr/${bookId}`, icon: 'qr', variant: 'primary' })] }));
      return;
    }
    try {
      qr = await import('../../ar/qr.js');
    } catch {
      qr = null;
    }
    if (gone) return;
    pages.replaceChildren();
    const landingUrl = qr?.landingUrlFor?.(bookId) ?? fallbackLandingUrl(bookId);
    const c = await print.renderPrintPages(pages, { book, bookId, baseUrl: ctx.baseUrl, landingUrl });
    if (gone) c?.();
    else cleanup = c;
  })().catch((err) => {
    console.error('[app] print pages failed', err);
    if (!gone) pages.replaceChildren(h('p', { class: 'lead' }, 'The pages didn’t load. Please try again.'));
  });

  return () => {
    gone = true;
    try {
      if (typeof cleanup === 'function') cleanup();
    } catch {
      /* ignore */
    }
  };
}
