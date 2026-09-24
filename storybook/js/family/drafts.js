// A gift being set up on the giver's phone. It lives in memory only (it is
// not the giver's child, so nothing about it is saved to the device), and
// survives moving between the gift screen and the record-a-reading screen.
// That includes the giver's recorded reading: its takes are kept here (a
// Reading in `reading`, its audio in `blobs`), never in the device's storage,
// so an abandoned gift leaves nothing behind. "Forget everything" and
// starting another gift clear it (clearGiftDraft).

let gift = null;

/**
 * The gift draft for a book (a fresh one when the book changes).
 * @param {string} bookId
 * @returns {{bookId: string, childName: string, fullName: string, pronunciation: object|null, from: string, text: string,
 *   audio: Blob|null, audioMs: number, readingId: string|null, includeReading: boolean,
 *   reading: object|null, blobs: Map<string, Blob>}}
 */
export function giftDraft(bookId) {
  if (!gift || gift.bookId !== bookId) {
    gift = { bookId, childName: '', fullName: '', pronunciation: null, from: '', text: '', audio: null, audioMs: 0, readingId: null, includeReading: true, reading: null, blobs: new Map() };
  }
  return gift;
}

/** Is a gift being set up for this book? */
export function hasGiftDraft(bookId) {
  return Boolean(gift && gift.bookId === bookId && gift.childName);
}

/** Forget the draft (after "Forget everything", or when starting again). */
export function clearGiftDraft() {
  gift?.blobs?.clear?.();
  gift = null;
}

/**
 * The draft's audio store, shaped like storage.blobs (put/get/delete), for
 * the record screen and for wrapping the gift. Memory only.
 * @param {{blobs: Map<string, Blob>}} draft
 */
export function draftBlobs(draft) {
  const map = draft?.blobs ?? new Map();
  return {
    async put(id, blob) {
      map.set(id, blob);
    },
    async get(id) {
      return map.get(id) ?? null;
    },
    async delete(id) {
      map.delete(id);
    },
  };
}
