// A gift being set up on the giver's phone. It lives in memory only (it is
// not the giver's child, so nothing about it is saved to the device), and
// survives moving between the gift screen and the record-a-reading screen.

let gift = null;

/**
 * The gift draft for a book (a fresh one when the book changes).
 * @param {string} bookId
 * @returns {{bookId: string, childName: string, fullName: string, pronunciation: object|null, from: string, text: string,
 *   audio: Blob|null, audioMs: number, readingId: string|null, includeReading: boolean}}
 */
export function giftDraft(bookId) {
  if (!gift || gift.bookId !== bookId) {
    gift = { bookId, childName: '', fullName: '', pronunciation: null, from: '', text: '', audio: null, audioMs: 0, readingId: null, includeReading: true };
  }
  return gift;
}

/** Is a gift being set up for this book? */
export function hasGiftDraft(bookId) {
  return Boolean(gift && gift.bookId === bookId && gift.childName);
}

/** Forget the draft (after wrapping, or when starting again). */
export function clearGiftDraft() {
  gift = null;
}
