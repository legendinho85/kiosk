// #/b/:book/read/:page — the child-facing reader (js/reader/reader.js).
// Turning pages updates the address without re-mounting the reader
// (history.replaceState doesn't fire hashchange), so a reload or the back
// button lands on the right page.
//
// Family features (docs/architecture.md §11): siblings reading together are
// one "person" ("Amara and Zak"; "Amara & Zak" in the pictures), the
// grown-up's recorded reading chosen for this child plays instead of the
// computer voice (with its label, "Read by Nana in Urdu", and language: no
// word-by-word highlighting for a reading in another language), and bedtime
// mode comes from settings. The end page offers "Find your first letter"
// (#/b/:book/letters) when settings.letterActivity is on.
//
// The reader is the child's screen, so nothing here leads to a grown-up
// screen without the press-and-hold gate: Home asks for the hold (the page
// carries on if nobody holds it), the camera asks every time, and Goodnight
// ends on a calm "Night night" card (read it again, or grown-ups hold to
// leave) rather than on the grown-ups' ready screen. Where the child got to
// is remembered, so the ready screen can offer "Carry on from page 5".

import { h, icon, button, clearToasts } from '../ui.js';
import { openParentGate, holdButton, markGatePassed, enterChildMode, CAMERA_GATE } from '../parent-gate.js';
import { messageScreen } from '../chrome.js';
import { activeProfile, readingChildren, prefs } from '../../core/storage.js';
import { fillTemplate } from '../../core/personalise.js';
import { readingPerson, readingAdapter, childReading } from '../../family/family.js';
import { savePlace, placeFor, placeWho } from '../place.js';

export { savePlace, placeFor, placeWho };

/** Clamp a page parameter to the book. */
export function pageParam(value, pageCount) {
  const n = Number.parseInt(String(value ?? '1'), 10);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, n), Math.max(1, pageCount || 1));
}

/** Is the "Find your first letter" game offered after the story? (settings.letterActivity, on by default.) */
export function lettersOffered(settings) {
  return settings?.letterActivity === true;
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
  // The child has the phone now: whatever a grown-up unlocked is locked again.
  enterChildMode();
  const startPage = pageParam(ctx.params.page, book.pages.length);
  const person = readingPerson(ctx.state);
  const kids = readingChildren(ctx.state);
  // Grown-up messages don't belong on the child's screen.
  clearToasts();
  // A heading for screen readers (the reader itself is a labelled region).
  const heading = h('h1', { class: 'sr-only', tabindex: '-1' }, fillTemplate(book.title ?? '', person));
  const host = h('div', { class: 'reader-host', 'data-testid': 'reader-host' }, h('div', { class: 'reader-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Opening the book…'));
  root.append(h('main', { class: 'reader-main', id: 'main', tabindex: '-1' }, heading, host));
  let reader = null;
  let gone = false;
  let asking = false; // a gate dialog is open
  let saidGoodnight = false;
  let nightGate = null;
  const readHash = (n) => `#/b/${bookId}/read/${n}`;
  const safePrefs = { get: (k, d) => { try { return prefs.get(k, d); } catch { return d; } }, set: (k, v) => { try { prefs.set(k, v); } catch { /* ignore */ } } };

  // The reader's Goodnight pill fades the page to dark, then leaves: we take over there.
  host.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-testid=goodnight]')) saidGoodnight = true;
  }, true);
  const inGoodnight = () => saidGoodnight || Boolean(host.querySelector('[data-testid=reader].is-goodnight'));

  /** "Night night, Ava." — a calm end: read it again, or a grown-up holds to go back to the book. */
  function showGoodnight() {
    try {
      reader?.destroy();
    } catch {
      /* ignore */
    }
    reader = null;
    nightGate = holdButton({
      label: 'Grown-ups: press and hold for 3 seconds to go back to the book',
      onUnlock: () => {
        markGatePassed();
        if (!gone) ctx.navigate(`#/b/${bookId}`);
      },
    });
    const again = button({ text: 'Read it again', icon: 'book', variant: 'night', size: 'lg', testid: 'goodnight-again', class: 'goodnight-again', onClick: () => ctx.navigate(readHash(1)) });
    host.replaceChildren(
      h('section', { class: 'goodnight-card', 'data-testid': 'goodnight-card', 'aria-labelledby': 'goodnight-text' },
        h('span', { class: 'goodnight-moon', 'aria-hidden': 'true' }, icon('moon', { size: 96 })),
        h('p', { class: 'goodnight-text', id: 'goodnight-text', role: 'status' }, `Night night, ${person.display}.`),
        again,
        h('div', { class: 'goodnight-grownups' }, h('p', { class: 'goodnight-grownups-title' }, 'Grown-ups'), nightGate.el)),
    );
    savePlace(safePrefs, bookId, book.pages.length, book.pages.length, kids);
  }

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
      person,
      pronunciation: profile.pronunciation,
      reading: readingAdapter(childReading(ctx.state, bookId), ctx.blobs),
      bedtime: Boolean(ctx.state.settings?.bedtime),
      settings: ctx.state.settings,
      narrator: ctx.narrator,
      sfx: ctx.sfx,
      startPage,
      onPageChange: (n) => {
        // Only while we're still the screen on show.
        if (gone || !location.hash.startsWith(`#/b/${bookId}/read`)) return;
        replaceHash(readHash(n));
        savePlace(safePrefs, bookId, n, book.pages.length, kids);
      },
      onExit: async () => {
        if (gone || asking) return;
        if (inGoodnight()) {
          showGoodnight();
          return;
        }
        // Home is a grown-up decision too: a toddler's tap mustn't land on the grown-ups' screens.
        asking = true;
        const ok = await openParentGate({ title: 'Grown-ups: leave the story?', lead: 'Press and hold for 3 seconds to go back to the book’s page. We’ll remember where you got to.' });
        asking = false;
        if (gone) return;
        if (ok) ctx.navigate(`#/b/${bookId}`);
        else reader?.replay?.(); // nobody held it: carry on with this page
      },
      // "Find your first letter" after the last page (docs §12), when the grown-ups want it offered.
      onLetters: lettersOffered(ctx.state.settings) ? () => !gone && ctx.navigate(`#/b/${bookId}/letters`, { replace: true }) : undefined,
      // The camera is a grown-up decision: the child can't open it alone. The
      // hold is asked for every time here (an earlier pass doesn't count in the
      // reader), and the magic window replaces this page in the history.
      onMagic: async (n) => {
        if (gone || asking) return;
        asking = true;
        const ok = await openParentGate(CAMERA_GATE);
        asking = false;
        if (ok && !gone) ctx.navigate(`#/b/${bookId}/magic/${n}`, { replace: true });
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
    nightGate?.destroy();
    reader?.destroy();
    reader = null;
  };
}
