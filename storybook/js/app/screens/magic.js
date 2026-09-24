// #/b/:book/magic/:page — the magic window (js/ar/magic-window.js): the
// camera shows the real book with the child's name drawn onto the page.

import { h, linkButton } from '../ui.js';
import { messageScreen } from '../chrome.js';
import { activeProfile } from '../../core/storage.js';
import { profilePerson } from './ready.js';
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
  const host = h('div', { class: 'magic-host', 'data-testid': 'magic-host' }, h('div', { class: 'reader-loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Opening the camera…'));
  root.append(host);
  let win = null;
  let gone = false;
  const backToReading = () => ctx.navigate(`#/b/${bookId}/read/${current}`);
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
      person: profilePerson(profile),
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

  return () => {
    gone = true;
    try {
      win?.destroy?.();
    } catch {
      /* ignore */
    }
    win = null;
  };
}
