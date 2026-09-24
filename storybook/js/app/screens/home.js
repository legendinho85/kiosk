// #/ — the shelf: every book we know about, and how the QR code works.

import { h, icon, linkButton } from '../ui.js';
import { screen } from '../chrome.js';
import { createCover } from '../cover.js';
import { loadBookList, loadBook, bookUrl } from '../../core/book.js';
import { activeProfile } from '../../core/storage.js';

export function render(root, ctx) {
  const shelf = h('ul', { class: 'shelf', role: 'list', 'aria-busy': 'true' }, h('li', { class: 'shelf-loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Finding your books…'));
  const child = activeProfile(ctx.state);

  const how = h(
    'section',
    { class: 'card how-qr', 'aria-labelledby': 'how-title' },
    h('h2', { id: 'how-title' }, 'How it works'),
    h('ol', { class: 'how-steps' },
      step('qr', 'Scan the code', 'Every Tiffin & Me book has a QR code on the back. Point your phone’s camera at it.'),
      step('edit', 'Type your child’s name', 'Check how it sounds — we’ll help you get it just right.'),
      step('sparkle', 'Read together', 'The story reads aloud with their name in it, and the pictures come alive as little hands work the book.')),
  );

  const body = [
    h('section', { class: 'home-head' },
      h('p', { class: 'eyebrow' }, child ? `Hello again, ${child.display}’s grown-up` : 'Personalised read-along stories'),
      h('h1', {}, 'Tiffin & Me books'),
      h('p', { class: 'lead' }, 'Board books with flaps, wheels and sliders — and a story that knows your child’s name.')),
    shelf,
    how,
  ];
  root.append(screen(ctx, { name: 'home', body }).el);

  (async () => {
    let list = [];
    try {
      list = await loadBookList();
    } catch {
      shelf.replaceChildren(h('li', { class: 'shelf-error' }, 'We couldn’t load the list of books. Please check your connection and try again.'));
      shelf.removeAttribute('aria-busy');
      return;
    }
    if (ctx.signal?.aborted) return;
    shelf.replaceChildren(...list.map((entry) => bookCard(entry)));
    shelf.removeAttribute('aria-busy');
  })();

  function bookCard(entry) {
    const coverHost = h('div', { class: 'shelf-cover' });
    const card = h(
      'li',
      { class: 'card shelf-book', 'data-testid': 'shelf-book', 'data-book': entry.id },
      coverHost,
      h('div', { class: 'shelf-text' },
        h('p', { class: 'eyebrow' }, entry.series ?? 'Tiffin & Me'),
        h('h2', {}, String(entry.title ?? '').replace(/\{name\}/g, child?.display ?? 'you')),
        h('p', { class: 'shelf-sub' }, entry.subtitle ?? '', entry.subtitle && entry.ages ? ' · ' : '', entry.ages ? h('span', { class: 'nowrap' }, `Ages ${entry.ages}`) : null),
        linkButton({ text: 'Open', href: `#/b/${entry.id}`, icon: 'book', variant: 'primary', size: 'md', testid: 'open-book' })),
    );
    // The live cover needs the full book (for its scene); fine to fail quietly.
    loadBook(entry.id)
      .then((book) => {
        if (ctx.signal?.aborted) return;
        coverHost.append(createCover({ book, bookId: entry.id, baseUrl: bookUrl(entry.id), display: child?.display ?? '', signal: ctx.signal, caption: false }).el);
      })
      .catch(() => coverHost.append(h('div', { class: 'shelf-cover-missing' }, icon('book', { size: 48 }))));
    return card;
  }
}

function step(ic, title, text) {
  return h('li', { class: 'how-step' }, h('span', { class: 'how-icon', 'aria-hidden': 'true' }, icon(ic, { size: 26 })), h('div', {}, h('strong', {}, title), h('p', {}, text)));
}
