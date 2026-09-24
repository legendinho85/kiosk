// Harness for js/ar/stickers.js (see index.html for the query parameters).
import { loadBook, bookUrl } from '../../../js/core/book.js';
import { person, togetherPerson } from '../../../js/core/personalise.js';
import { renderStickerSheet, measureBookSpots } from '../../../js/ar/stickers.js';

const q = new URLSearchParams(location.search);
if (q.get('bar') === '0') document.querySelector('[data-testid=harness-bar]')?.remove();
const bookId = q.get('book') ?? 'tiffin-football';
const names = (q.get('names') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const who = names.length > 1 ? togetherPerson(names.map((display) => ({ display }))) : person(names[0] ?? q.get('name') ?? 'Ava');

const h = (window.__h = { ready: false, error: null, cleanup: null, person: who });
try {
  const book = await loadBook(bookId);
  h.book = book;
  h.mount = async (opts = {}) => {
    h.cleanup?.();
    h.cleanup = await renderStickerSheet(document.getElementById('app'), {
      book,
      bookId,
      baseUrl: bookUrl(bookId),
      person: who,
      trimMm: Number(q.get('trim') ?? 180),
      printButton: q.get('print') !== '0',
      ...opts,
    });
  };
  /** The measured spots of the book (tests/fixtures/stickers/*.spots.json are snapshots of this). */
  h.measure = () => measureBookSpots(book, { baseUrl: bookUrl(bookId), trimMm: Number(q.get('trim') ?? 180) });
  if (q.get('mount') !== '0') await h.mount();
} catch (err) {
  h.error = String(err?.stack ?? err);
  console.error(err);
}
h.ready = true;
