// #/stickers/:book — printable name stickers for the real book
// (js/ar/stickers.js, docs/architecture.md §12): every blank name spot in the
// printed book gets a sticker at its printed size, on A4 sheets. A
// screen-free way to see the name in the pictures.
//
// Linked from the QR screen, settings ("Print and share") and the ready
// screen. `?from=qr|settings` says where Back goes (the book by default).

import { h, button, linkButton } from '../ui.js';
import { readingPerson } from '../../family/family.js';

/** Where the Back button goes. */
export function stickersBack(from, bookId) {
  if (from === 'qr') return { href: `#/qr/${bookId}`, label: 'Back to the QR code' };
  if (from === 'settings') return { href: '#/settings', label: 'Back to settings' };
  return { href: `#/b/${bookId}`, label: 'Back to the book' };
}

/** The printed book's page width in mm (the sticker scale), with a safe default. */
export function trimFor(book) {
  const t = Number(book?.print?.trimMm);
  return Number.isFinite(t) && t > 0 ? t : 180;
}

export function render(root, ctx) {
  const { book, bookId } = ctx;
  const back = stickersBack(ctx.query?.from, bookId);
  const who = readingPerson(ctx.state);
  const printBtn = button({ text: 'Print', icon: 'print', variant: 'primary', size: 'md', testid: 'print-now', onClick: () => window.print() });
  const bar = h(
    'div',
    { class: 'print-bar no-print' },
    linkButton({ text: 'Back', label: back.label, href: back.href, icon: 'back', variant: 'quiet', size: 'md', testid: 'back' }),
    h('h1', { class: 'print-title' }, 'Name stickers'),
    printBtn,
  );
  const body = h('main', { class: 'stickers-body', id: 'main', 'data-testid': 'stickers-host' });
  root.append(h('div', { class: 'screen screen-print screen-stickers', 'data-screen': 'stickers' }, bar, body));

  // No child yet: nothing to print. Say so, and go and add one.
  if (!who) {
    printBtn.hidden = true;
    body.append(
      h(
        'section',
        { class: 'card stickers-empty', 'data-testid': 'stickers-no-child' },
        h('h2', {}, 'Add your child’s name first'),
        h('p', { class: 'lead' }, 'The stickers carry their name, in the same letters as the pictures. Type it in, then come back here to print.'),
        linkButton({ text: 'Add your child’s name', href: `#/b/${bookId}/name`, icon: 'edit', variant: 'primary', size: 'lg', testid: 'stickers-add-child' }),
      ),
    );
    return null;
  }

  body.append(h('div', { class: 'reader-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Making your stickers…'));
  let cleanup = null;
  let gone = false;
  const failed = (message) => {
    if (gone) return;
    printBtn.hidden = true;
    body.replaceChildren(
      h('section', { class: 'card stickers-empty', 'data-testid': 'stickers-missing' }, h('h2', {}, 'The stickers didn’t load'), h('p', { class: 'lead' }, message), linkButton({ text: 'Back', href: back.href, icon: 'back', variant: 'secondary', size: 'md' })),
    );
  };

  (async () => {
    let mod;
    try {
      mod = await import('../../ar/stickers.js');
    } catch (err) {
      console.warn('[app] name stickers unavailable', err);
      failed('This part is still being built. Please try again later.');
      return;
    }
    if (gone) return;
    body.replaceChildren();
    const c = await mod.renderStickerSheet(body, { book, bookId, baseUrl: ctx.baseUrl, person: who, trimMm: trimFor(book), printButton: false, signal: ctx.signal });
    if (gone) c?.();
    else cleanup = c;
  })().catch((err) => {
    console.error('[app] name stickers failed', err);
    failed('Please check your connection and try again.');
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
