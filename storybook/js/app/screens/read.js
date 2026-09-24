// #/b/:book/read/:page — the child-facing reader (js/reader/reader.js).
// Turning pages updates the address without re-mounting the reader
// (history.replaceState doesn't fire hashchange), so a reload or the back
// button lands on the right page.

import { h, clearToasts } from '../ui.js';
import { openParentGate, gatePassed } from '../parent-gate.js';
import { messageScreen } from '../chrome.js';
import { activeProfile } from '../../core/storage.js';
import { profilePerson } from './ready.js';

/** Clamp a page parameter to the book. */
export function pageParam(value, pageCount) {
  const n = Number.parseInt(String(value ?? '1'), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, n), Math.max(1, pageCount || 1));
}

/** Replace the current hash without a navigation (and without the router noticing). */
export function replaceHash(hash) {
  try {
    history.replaceState(history.state, '', hash);
  } catch {
    /* sandboxed: the address just won't update */
  }
}

export function render(root, ctx) {
  const { book, bookId } = ctx;
  const profile = activeProfile(ctx.state);
  if (!profile) {
    ctx.navigate(`#/b/${bookId}`, { replace: true });
    return null;
  }
  const startPage = pageParam(ctx.params.page, book.pages.length);
  // Grown-up messages don't belong on the child's screen.
  clearToasts();
  const host = h('div', { class: 'reader-host', 'data-testid': 'reader-host' }, h('div', { class: 'reader-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Opening the book…'));
  root.append(host);
  let reader = null;
  let gone = false;
  const readHash = (n) => `#/b/${bookId}/read/${n}`;

  (async () => {
    let mod;
    try {
      mod = await import('../../reader/reader.js');
    } catch (err) {
      console.warn('[app] reader unavailable', err);
      if (!gone) host.replaceChildren(messageScreen(ctx, { title: 'The reader isn’t ready yet', message: 'Please try again in a moment.', testid: 'reader-missing' }));
      return;
    }
    if (gone) return;
    host.replaceChildren();
    const r = await mod.mountReader(host, {
      book,
      bookId,
      baseUrl: ctx.baseUrl,
      person: profilePerson(profile),
      pronunciation: profile.pronunciation,
      settings: ctx.state.settings,
      narrator: ctx.narrator,
      sfx: ctx.sfx,
      startPage,
      onPageChange: (n) => {
        // Only while we're still the screen on show.
        if (!gone && location.hash.startsWith(`#/b/${bookId}/read`)) replaceHash(readHash(n));
      },
      onExit: () => ctx.navigate(`#/b/${bookId}`),
      // The camera is a grown-up decision: the child can't open it alone.
      onMagic: async (n) => {
        const ok = gatePassed() || (await openParentGate({ title: 'Grown-ups: open the camera?', lead: 'Press and hold for 3 seconds to use the magic window. We look at the page. Nothing is recorded.' }));
        if (ok && !gone) ctx.navigate(`#/b/${bookId}/magic/${n}`);
      },
    });
    if (gone) r.destroy();
    else reader = r;
  })().catch((err) => {
    console.error('[app] the reader failed to open', err);
    if (!gone) host.replaceChildren(messageScreen(ctx, { title: 'The story didn’t open', message: 'Please go back and try again.', testid: 'reader-error' }));
  });

  return () => {
    gone = true;
    reader?.destroy();
    reader = null;
  };
}
