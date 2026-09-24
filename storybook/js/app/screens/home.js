// #/ — the shelf: every book we know about, and how the QR code works.

import { h, icon, linkButton } from '../ui.js';
import { screen } from '../chrome.js';
import { createCover } from '../cover.js';
import { loadBookList, loadBook, bookUrl } from '../../core/book.js';
import { activeProfile, activeReadingFor, readingLabel } from '../../core/storage.js';
import { fillTemplate, person as makePerson } from '../../core/personalise.js';
import { readingPerson } from '../../family/family.js';

/** A shelf title with the child's name (or names) in it: "Goal, Ava!" / "Goal, you!" with no child yet. */
export function shelfTitle(entry, who) {
  return fillTemplate(String(entry?.title ?? ''), who ?? makePerson('you'));
}

export function render(root, ctx) {
  const shelf = h('ul', { class: 'shelf', role: 'list', 'aria-busy': 'true', 'data-testid': 'shelf' }, h('li', { class: 'shelf-loading' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Finding your books…'));
  const child = activeProfile(ctx.state);
  const who = readingPerson(ctx.state);

  const how = h(
    'section',
    { class: 'card how-qr', 'aria-labelledby': 'how-title' },
    h('h2', { id: 'how-title' }, 'How it works'),
    h('ol', { class: 'how-steps' },
      step('qr', 'Scan the code', 'Every Tiffin & Me book has a QR code on the back. Point your phone’s camera at it.'),
      step('edit', 'Type your child’s name', 'Check how it sounds — we’ll help you get it just right.'),
      step('sparkle', 'Read together', 'The story reads aloud with their name in it, and the pictures come alive as little hands work the book.')),
  );

  const family = h(
    'section',
    { class: 'card home-family', 'aria-labelledby': 'home-family-title' },
    h('span', { class: 'give-art', 'aria-hidden': 'true' }, icon('heart', { size: 24 })),
    h('div', {},
      h('h2', { id: 'home-family-title' }, 'Did someone send you a recording?'),
      h('p', {}, 'Grandparents can record the whole book in their own voice, and gifts come with a message. Open the file here.'),
      linkButton({ text: 'Open a family recording', href: '#/open', icon: 'file', variant: 'secondary', size: 'sm', testid: 'open-pack' })),
  );

  const body = [
    h('section', { class: 'home-head' },
      h('p', { class: 'eyebrow' }, child ? `Hello again, ${who?.display ?? child.display}’s grown-up` : 'Personalised read-along stories'),
      h('h1', {}, 'Tiffin & Me books'),
      h('p', { class: 'lead' }, 'Board books with flaps, wheels and sliders — and a story that knows your child’s name.')),
    shelf,
    family,
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
    const books = list.filter((e) => e && typeof e.id === 'string' && /^[a-z0-9-]+$/.test(e.id));
    if (!books.length) {
      shelf.replaceChildren(h('li', { class: 'shelf-error' }, 'No books here yet — check back soon.'));
      shelf.removeAttribute('aria-busy');
      return;
    }
    shelf.classList.toggle('is-single', books.length === 1);
    shelf.classList.toggle('is-many', books.length > 1);
    shelf.replaceChildren(...books.map((entry) => bookCard(entry)));
    shelf.removeAttribute('aria-busy');
  })();

  function bookCard(entry) {
    const coverHost = h('div', { class: 'shelf-cover' }, h('div', { class: 'shelf-cover-loading', 'aria-hidden': 'true' }));
    const reading = activeReadingFor(ctx.state, entry.id);
    const card = h(
      'li',
      { class: 'card shelf-book', 'data-testid': 'shelf-book', 'data-book': entry.id },
      coverHost,
      h('div', { class: 'shelf-text' },
        h('p', { class: 'eyebrow' }, entry.series ?? 'Tiffin & Me'),
        h('h2', { 'data-testid': 'shelf-title' }, shelfTitle(entry, who)),
        h('p', { class: 'shelf-sub' }, entry.subtitle ?? '', entry.subtitle && entry.ages ? ' · ' : '', entry.ages ? h('span', { class: 'nowrap' }, `Ages ${entry.ages}`) : null),
        reading && (who?.count ?? 1) === 1 ? h('p', { class: 'ready-pill shelf-pill' }, icon('heart', { size: 16 }), readingLabel(reading)) : null,
        linkButton({ text: child ? `Read with ${who?.display ?? child.display}` : 'Open', href: `#/b/${entry.id}`, icon: 'book', variant: 'primary', size: 'md', testid: 'open-book', class: 'shelf-open' })),
    );
    // The live cover needs the full book (for its scene); fine to fail quietly
    // (a book still being illustrated shows a simple placeholder).
    loadBook(entry.id)
      .then((book) => {
        if (ctx.signal?.aborted) return;
        coverHost.replaceChildren(createCover({ book, bookId: entry.id, baseUrl: bookUrl(entry.id), display: who?.display ?? '', art: who?.art, signal: ctx.signal, caption: false }).el);
      })
      .catch(() => coverHost.replaceChildren(h('div', { class: 'shelf-cover-missing' }, icon('book', { size: 48 }), h('span', {}, 'Coming soon'))));
    return card;
  }
}

function step(ic, title, text) {
  return h('li', { class: 'how-step' }, h('span', { class: 'how-icon', 'aria-hidden': 'true' }, icon(ic, { size: 26 })), h('div', {}, h('strong', {}, title), h('p', {}, text)));
}
