// #/b/:book — where the QR code on the back of the book lands.
// First visit: the name form. Once a child is set up: the ready screen
// ("Siobhan's story is ready", start reading, magic window).

import { activeProfile } from '../../core/storage.js';
import { renderNameForm } from './name.js';
import { renderReady } from './ready.js';

/** @param {HTMLElement} root @param {object} ctx */
export function render(root, ctx) {
  const profile = activeProfile(ctx.state);
  if (profile) return renderReady(root, ctx, profile);
  return renderNameForm(root, ctx, { mode: ctx.state.profiles.length ? 'add' : 'first' });
}
