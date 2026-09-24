// #/b/:book/magic/:page — the magic window (js/ar/magic-window.js): the
// camera shows the real book with the child's name drawn onto the page.
//
// The camera is a grown-up decision (docs/compliance-checklist.md, "put the
// magic window behind a grown-up step"). The gate lives here, on the route
// itself, so every way in asks for the hold: the ready screen's button, a
// link, a reload, a restored tab or the back button. The reader asks with
// its own dialog and comes here straight after a hold. The camera is never
// started until a grown-up has held the gate in this page load.
//
// Coming in from the reader and going back to it replace the history entry
// (navigate(..., {replace: true})), so the magic window never sits in the
// history behind the reader, where Back would open the camera again.

import { h, button, linkButton } from '../ui.js';
import { messageScreen, screen } from '../chrome.js';
import { holdButton, gatePassed, markGatePassed, enterChildMode, CAMERA_GATE } from '../parent-gate.js';
import { activeProfile } from '../../core/storage.js';
import { readingPerson } from '../../family/family.js';
import { pageParam, replaceHash } from './read.js';

export function render(root, ctx) {
  const { book, bookId } = ctx;
  const profile = activeProfile(ctx.state);
  if (!profile) {
    ctx.navigate(`#/b/${bookId}`, { replace: true });
    return null;
  }
  const page = pageParam(ctx.params.page, book.pages.length);
  let current = page;
  let win = null;
  let gate = null;
  let gone = false;

  const cleanup = () => {
    gone = true;
    gate?.destroy();
    gate = null;
    try {
      win?.destroy?.();
    } catch {
      /* ignore */
    }
    win = null;
  };

  // No grown-up has just held the gate: ask here, before anything touches the camera.
  if (!gatePassed()) {
    gate = holdButton({
      label: 'Grown-ups: press and hold for 3 seconds to open the camera',
      onUnlock: () => {
        markGatePassed();
        if (gone) return;
        gate?.destroy();
        gate = null;
        root.replaceChildren();
        openWindow();
      },
    });
    const body = h(
      'section',
      { class: 'gate-screen', 'data-testid': 'magic-gate' },
      h('h1', {}, CAMERA_GATE.title),
      h('p', { class: 'lead' }, CAMERA_GATE.lead),
      gate.el,
      button({ text: 'Not now', variant: 'quiet', testid: 'magic-gate-cancel', onClick: () => ctx.navigate(`#/b/${bookId}`, { replace: true }) }),
    );
    root.append(screen(ctx, { name: 'magic-gate', back: { href: `#/b/${bookId}`, label: 'Back to the book', text: 'Back' }, settings: false, body }).el);
    return cleanup;
  }

  openWindow();
  return cleanup;

  function openWindow() {
    // The child holds the phone now: the grown-ups' pass ends here.
    enterChildMode();
    const heading = h('h1', { class: 'sr-only', tabindex: '-1' }, 'Magic window');
    const host = h('div', { class: 'magic-host', 'data-testid': 'magic-host' }, h('div', { class: 'reader-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Opening the camera…'));
    root.append(h('main', { class: 'magic-main', id: 'main', tabindex: '-1' }, heading, host));
    const backToReading = () => ctx.navigate(`#/b/${bookId}/read/${current}`, { replace: true });
    const unavailable = (title, message) =>
      host.replaceChildren(messageScreen(ctx, {
        title,
        message,
        testid: 'magic-unavailable',
        actions: [linkButton({ text: 'Back to the story', href: `#/b/${bookId}/read/${page}`, icon: 'book', variant: 'primary', testid: 'magic-back' })],
      }));

    (async () => {
      let mod;
      try {
        mod = await import('../../ar/magic-window.js');
      } catch {
        if (!gone) unavailable('The magic window is nearly ready', 'This part is still being built. You can read the story on screen in the meantime.');
        return;
      }
      if (gone) return;
      if (!mod.isCameraSupported?.()) {
        unavailable('This device can’t open the camera here', 'The magic window needs a camera and a secure (https) link. You can still read the story on screen.');
        return;
      }
      host.replaceChildren();
      const w = await mod.mountMagicWindow(host, {
        book,
        bookId,
        baseUrl: ctx.baseUrl,
        page,
        person: readingPerson(ctx.state),
        narrator: ctx.narrator,
        sfx: ctx.sfx,
        onExit: backToReading,
        onPage: (n) => {
          current = n;
          if (!gone && location.hash.startsWith(`#/b/${bookId}/magic`)) replaceHash(`#/b/${bookId}/magic/${n}`);
        },
      });
      if (gone) w?.destroy?.();
      else win = w;
    })().catch((err) => {
      console.error('[app] the magic window failed to open', err);
      if (!gone) unavailable('The camera didn’t start', 'Please check the camera permission for this site, then try again.');
    });
  }
}
