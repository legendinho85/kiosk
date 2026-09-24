// #/b/:book/letters — "Find your first letter" (js/activities/letter-trace.js,
// docs/architecture.md §12): the child finds the first letter of their name
// among a few tiles, then traces it with a finger. Offered at the end of the
// story (the reader's end-page pill) when settings.letterActivity is on.
//
// Child-facing, like the reader: no grown-up messages, no links out, and the
// grown-ups' pass ends here (enterChildMode). Done or Skip goes back to the
// story's last page (Read again / Goodnight), never to the grown-ups' ready
// screen. Siblings reading together take turns ("Amara & Zak": A, then Z).

import { h, clearToasts, linkButton } from '../ui.js';
import { messageScreen } from '../chrome.js';
import { enterChildMode } from '../parent-gate.js';
import { activeProfile } from '../../core/storage.js';
import { readingPerson } from '../../family/family.js';

/**
 * The options mountLetterTrace gets from the app (pure, for unit tests).
 * @param {object} state app state
 * @param {{book?: object|null, done: () => void}} opts
 */
export function letterTraceOptions(state, { book = null, done }) {
  return {
    person: readingPerson(state),
    bedtime: Boolean(state?.settings?.bedtime),
    // The name's language (Welsh "Ll", Dutch "IJ"...). The book's language
    // until profiles carry a home language of their own.
    lang: book?.lang ?? '',
    onDone: done,
    onSkip: done,
  };
}

export function render(root, ctx) {
  const { bookId } = ctx;
  if (!activeProfile(ctx.state)) {
    ctx.navigate(`#/b/${bookId}`, { replace: true });
    return null;
  }
  // The child has the phone: whatever a grown-up unlocked is locked again.
  enterChildMode();
  // Grown-up messages don't belong on the child's screen.
  clearToasts();
  const host = h(
    'div',
    { class: 'letters-host', 'data-testid': 'letters-host' },
    h('div', { class: 'reader-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Getting the letters ready…'),
  );
  root.append(h('main', { class: 'letters-main', id: 'main', tabindex: '-1' }, h('h1', { class: 'sr-only', tabindex: '-1' }, 'Find your first letter'), host));
  let api = null;
  let gone = false;
  let left = false;
  // Back to the end of the story, where the game was offered.
  const lastPage = Math.max(1, ctx.book?.pages?.length ?? 1);
  const backToBook = () => {
    if (gone || left) return;
    left = true;
    ctx.navigate(`#/b/${bookId}/read/${lastPage}`, { replace: true });
  };

  import('../../activities/letter-trace.js')
    .then(({ mountLetterTrace }) => {
      if (gone) return;
      host.replaceChildren();
      api = mountLetterTrace(host, {
        ...letterTraceOptions(ctx.state, { book: ctx.book, done: backToBook }),
        narrator: ctx.narrator,
        sfx: ctx.sfx,
      });
    })
    .catch((err) => {
      console.warn('[app] the letter game is unavailable', err);
      if (gone) return;
      host.replaceChildren(
        messageScreen(ctx, {
          title: 'The letter game isn’t ready yet',
          message: 'Please try again in a moment.',
          testid: 'letters-missing',
          actions: [linkButton({ text: 'Back to the story', href: `#/b/${bookId}/read/${lastPage}`, icon: 'book', variant: 'primary', testid: 'letters-back' })],
        }),
      );
    });

  return () => {
    gone = true;
    try {
      api?.destroy?.();
    } catch {
      /* ignore */
    }
    api = null;
  };
}
