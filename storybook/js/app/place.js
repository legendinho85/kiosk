// Where the child got to in a book, so the ready screen can offer "Carry on
// from page 5" after a trip Home mid-story. A small per-device preference
// (storage.prefs, wiped by "Forget everything"), kept per book and per group
// of children; the first and last pages clear it.

const PLACE_KEY = 'reader.place';

/** Who is being read to, as one string (the same children in any order). */
export function placeWho(kids) {
  return (kids ?? []).map((k) => k.id).sort().join(',');
}

/**
 * Remember the page a book is open at, for these children. The first page and
 * the last page (the story is finished) clear it.
 * @param {{get: Function, set: Function}} store prefs
 */
export function savePlace(store, bookId, page, pageCount, kids) {
  const all = { ...(store.get(PLACE_KEY, {}) ?? {}) };
  if (page > 1 && page < pageCount && kids?.length) all[bookId] = { page, who: placeWho(kids) };
  else delete all[bookId];
  store.set(PLACE_KEY, all);
}

/** The page to carry on from (2 .. last-1), or 0 when there's nothing to carry on for these children. */
export function placeFor(store, bookId, pageCount, kids) {
  const p = (store.get(PLACE_KEY, {}) ?? {})[bookId];
  const page = Number(p?.page);
  if (!Number.isInteger(page) || page < 2 || page >= pageCount) return 0;
  return p.who === placeWho(kids) ? page : 0;
}

