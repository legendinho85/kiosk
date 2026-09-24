import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, compileRoute, matchRoute, buildHash } from '../../js/app/router.js';

const routes = [
  { path: '/', name: 'home' },
  { path: '/b/:book', name: 'landing' },
  { path: '/b/:book/name', name: 'name' },
  { path: '/b/:book/say', name: 'say' },
  { path: '/b/:book/read/:page', name: 'read' },
  { path: '/b/:book/read', name: 'read' },
  { path: '/b/:book/magic/:page', name: 'magic' },
  { path: '/settings', name: 'settings' },
  { path: '/qr/:book', name: 'qr' },
  { path: '/print/:book', name: 'print' },
  { path: '/stickers/:book', name: 'stickers' },
  { path: '/b/:book/letters', name: 'letters' },
  { path: '/b/:book/record', name: 'record' },
  { path: '/b/:book/gift', name: 'gift' },
  { path: '/open', name: 'open' },
];
const nameOf = (hash) => matchRoute(routes, hash)?.route.name ?? null;

test('parseHash normalises empty hashes, slashes and queries', () => {
  assert.deepEqual(parseHash(''), { path: '/', query: {} });
  assert.deepEqual(parseHash('#'), { path: '/', query: {} });
  assert.deepEqual(parseHash('#/'), { path: '/', query: {} });
  assert.deepEqual(parseHash('#/b/x/'), { path: '/b/x', query: {} });
  assert.deepEqual(parseHash('#b/x'), { path: '/b/x', query: {} });
  assert.deepEqual(parseHash('#//b//x'), { path: '/b/x', query: {} });
  assert.deepEqual(parseHash('#!/settings'), { path: '/settings', query: {} });
  assert.deepEqual(parseHash('#/b/x/name?child=p_1&x=a%20b'), { path: '/b/x/name', query: { child: 'p_1', x: 'a b' } });
});

test('every contract route matches with its params', () => {
  assert.equal(nameOf('#/'), 'home');
  assert.equal(nameOf(''), 'home');
  assert.deepEqual(matchRoute(routes, '#/b/tiffin-football').params, { book: 'tiffin-football' });
  assert.equal(nameOf('#/b/tiffin-football'), 'landing');
  assert.equal(nameOf('#/b/tiffin-football/name'), 'name');
  assert.equal(nameOf('#/b/tiffin-football/name?child=abc'), 'name');
  assert.equal(matchRoute(routes, '#/b/tiffin-football/name?child=abc').query.child, 'abc');
  assert.equal(nameOf('#/b/tiffin-football/say'), 'say');
  assert.deepEqual(matchRoute(routes, '#/b/tiffin-football/read/3').params, { book: 'tiffin-football', page: '3' });
  assert.equal(nameOf('#/b/tiffin-football/read'), 'read');
  assert.deepEqual(matchRoute(routes, '#/b/tiffin-football/magic/5').params, { book: 'tiffin-football', page: '5' });
  assert.equal(nameOf('#/settings'), 'settings');
  assert.equal(nameOf('#/settings/'), 'settings');
  assert.deepEqual(matchRoute(routes, '#/qr/tiffin-football').params, { book: 'tiffin-football' });
  assert.equal(nameOf('#/print/tiffin-football'), 'print');
  // Round 2 and 3 routes, for either book.
  assert.deepEqual(matchRoute(routes, '#/stickers/tiffin-digger?from=qr').params, { book: 'tiffin-digger' });
  assert.equal(matchRoute(routes, '#/stickers/tiffin-digger?from=qr').query.from, 'qr');
  assert.equal(nameOf('#/b/tiffin-digger/letters'), 'letters');
  assert.equal(nameOf('#/b/tiffin-digger/record'), 'record');
  assert.equal(nameOf('#/b/tiffin-digger/gift'), 'gift');
  assert.equal(nameOf('#/b/tiffin-digger/read/2'), 'read');
  assert.equal(nameOf('#/open'), 'open');
  assert.equal(nameOf('#/stickers'), null);
});

test('main.js registers every route (contract §8, §11, §12)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
  for (const path of ['/', '/b/:book', '/b/:book/name', '/b/:book/say', '/b/:book/read/:page', '/b/:book/magic/:page', '/settings', '/qr/:book', '/print/:book', '/b/:book/record', '/b/:book/gift', '/open', '/stickers/:book', '/b/:book/letters']) {
    assert.ok(src.includes(`path: '${path}'`), `route ${path}`);
  }
});

test('unknown paths and extra segments do not match', () => {
  assert.equal(nameOf('#/nope'), null);
  assert.equal(nameOf('#/b'), null);
  assert.equal(nameOf('#/b/x/read/1/extra'), null);
  assert.equal(nameOf('#/settingsx'), null);
  assert.equal(nameOf('#/qr'), null);
});

test('params are decoded, and bad escapes do not throw', () => {
  assert.equal(matchRoute(routes, '#/b/a%20b').params.book, 'a b');
  assert.equal(matchRoute(routes, '#/b/%E0%A4%A').params.book, '%E0%A4%A');
});

test('the first matching route wins and patterns escape regex characters', () => {
  const r = [{ path: '/a.b/:x' }, { path: '/a/:x' }];
  assert.equal(matchRoute(r, '#/a.b/1').route, r[0]);
  assert.equal(matchRoute(r, '#/aXb/1'), null);
  const wild = compileRoute('/files/*');
  assert.deepEqual(wild.keys, ['rest']);
  assert.ok(wild.re.test('/files/a/b/c'));
});

test('buildHash fills params and query, encoding both', () => {
  assert.equal(buildHash('/b/:book/read/:page', { book: 'tiffin-football', page: 2 }), '#/b/tiffin-football/read/2');
  assert.equal(buildHash('/b/:book/name', { book: 'x' }, { child: 'p 1', empty: '', none: null }), '#/b/x/name?child=p+1');
  const back = matchRoute(routes, buildHash('/b/:book/name', { book: 'x y' }, { child: 'a&b' }));
  assert.equal(back.params.book, 'x y');
  assert.equal(back.query.child, 'a&b');
});
