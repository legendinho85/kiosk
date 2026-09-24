import test from 'node:test';
import assert from 'node:assert/strict';
import { testHookFromSearch, entryRedirect, appBaseForPath, shouldRegisterSw, isInIframe, docSettingAttrs, applyDocSettings, pageTitle } from '../../js/app/boot.js';

const loc = (href) => {
  const u = new URL(href);
  return { pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, hostname: u.hostname };
};

test('?test=1 turns on silent, fast narration; anything else leaves it off', () => {
  assert.deepEqual(testHookFromSearch('?test=1'), { forceSilent: true, timeScale: 0.05 });
  assert.deepEqual(testHookFromSearch('?b=x&test=1&scale=0.5'), { forceSilent: true, timeScale: 0.5 });
  assert.deepEqual(testHookFromSearch('?test=1&scale=-3'), { forceSilent: true, timeScale: 0.05 });
  assert.equal(testHookFromSearch(''), null);
  assert.equal(testHookFromSearch('?test=0'), null);
  assert.equal(testHookFromSearch(undefined), null);
});

test('the QR code query ?b=<id> becomes the book route, keeping other parameters', () => {
  assert.equal(entryRedirect(loc('https://h.example/?b=tiffin-football')), '/#/b/tiffin-football');
  assert.equal(entryRedirect(loc('https://h.example/app/index.html?b=tiffin-football')), '/app/index.html#/b/tiffin-football');
  assert.equal(entryRedirect(loc('https://h.example/app/?b=tiffin-football&test=1')), '/app/?test=1#/b/tiffin-football');
  assert.equal(entryRedirect(loc('https://h.example/app/?test=1&b=tiffin-football')), '/app/?test=1#/b/tiffin-football');
});

test('a production path /b/<id> becomes the book route under the app folder', () => {
  assert.equal(entryRedirect(loc('https://h.example/b/tiffin-football')), '/#/b/tiffin-football');
  assert.equal(entryRedirect(loc('https://h.example/stories/b/tiffin-football/')), '/stories/#/b/tiffin-football');
  assert.equal(entryRedirect(loc('https://h.example/b/tiffin-football?test=1')), '/?test=1#/b/tiffin-football');
  assert.equal(appBaseForPath('/stories/b/tiffin-football'), '/stories/');
  assert.equal(appBaseForPath('/b/Not_Valid'), null);
  assert.equal(appBaseForPath('/app/'), null);
});

test('an explicit hash route wins; no book means no redirect', () => {
  assert.equal(entryRedirect(loc('https://h.example/?b=tiffin-football#/settings')), '/#/settings');
  assert.equal(entryRedirect(loc('https://h.example/?b=tiffin-football#')), '/#/b/tiffin-football');
  assert.equal(entryRedirect(loc('https://h.example/')), null);
  assert.equal(entryRedirect(loc('https://h.example/#/b/x')), null);
  assert.equal(entryRedirect(loc('https://h.example/b/UPPER')), null);
});

test('odd book ids from the query are encoded, not trusted', () => {
  assert.equal(entryRedirect(loc('https://h.example/?b=a%2Fb%3Fc')), '/#/b/a%2Fb%3Fc');
});

test('the service worker registers only on https, outside frames, outside tests', () => {
  const env = { inIframe: false, hasServiceWorker: true };
  assert.equal(shouldRegisterSw(loc('https://h.example/'), env), true);
  assert.equal(shouldRegisterSw(loc('https://h.example/?test=1'), env), false);
  assert.equal(shouldRegisterSw(loc('https://h.example/'), { ...env, inIframe: true }), false);
  assert.equal(shouldRegisterSw(loc('https://h.example/'), { ...env, hasServiceWorker: false }), false);
  assert.equal(shouldRegisterSw(loc('http://h.example/'), env), false);
  assert.equal(shouldRegisterSw(loc('http://localhost:8080/'), env), false);
  assert.equal(shouldRegisterSw(loc('http://localhost:8080/?sw=1'), env), true);
  assert.equal(shouldRegisterSw(loc('http://h.example/?sw=1'), env), false);
});

test('isInIframe treats an unreadable parent as a frame', () => {
  const self = {};
  assert.equal(isInIframe({ self, top: self }), false);
  assert.equal(isInIframe({ self, top: {} }), true);
  assert.equal(isInIframe({ self, get top() { throw new Error('cross-origin'); } }), true);
});

test('reading comfort settings become attributes on <html>', () => {
  assert.deepEqual(docSettingAttrs({ easyRead: true, highContrast: true }), { 'data-easy-read': 'true', 'data-contrast': 'high' });
  assert.deepEqual(docSettingAttrs({ easyRead: false, highContrast: false }), { 'data-easy-read': null, 'data-contrast': null });
  assert.deepEqual(docSettingAttrs(undefined), { 'data-easy-read': null, 'data-contrast': null });
  assert.deepEqual(docSettingAttrs({ easyRead: 'yes' }), { 'data-easy-read': null, 'data-contrast': null }, 'only a real true counts');
  const attrs = new Map();
  const el = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) };
  applyDocSettings(el, { easyRead: true, highContrast: false });
  assert.deepEqual([...attrs], [['data-easy-read', 'true']]);
  applyDocSettings(el, { easyRead: false, highContrast: true });
  assert.deepEqual([...attrs], [['data-contrast', 'high']]);
  applyDocSettings(el, {});
  assert.equal(attrs.size, 0);
  assert.doesNotThrow(() => applyDocSettings(null, { easyRead: true }));
  assert.doesNotThrow(() => applyDocSettings({ setAttribute() { throw new Error('x'); }, removeAttribute() { throw new Error('x'); } }, { easyRead: true }));
});

test('the tab title names the book, never the child', () => {
  assert.equal(pageTitle({ title: 'Goal, {name}!' }), 'Goal! — a Tiffin & Me story');
  assert.equal(pageTitle({ title: 'Beep beep, {name}!' }), 'Beep beep! — a Tiffin & Me story');
  assert.equal(pageTitle({ title: '{name} and the moon' }), 'and the moon — a Tiffin & Me story');
  assert.equal(pageTitle(null), 'Tiffin & Me read-along');
  assert.equal(pageTitle({ title: '{name}' }), 'Tiffin & Me read-along');
});
