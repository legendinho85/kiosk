import test from 'node:test';
import assert from 'node:assert/strict';
import { lineWithBlanks } from '../../js/ar/print.js';
import { adviceFor, asFolderUrl } from '../../tools/make-qr.mjs';

test('lineWithBlanks leaves a blank where the child’s name goes', () => {
  const B = { blank: true };
  assert.deepEqual(lineWithBlanks('Pass, pass, pass to {name}!'), ['Pass, pass, pass to ', B, '!']);
  assert.deepEqual(lineWithBlanks('Tiffin to {name}... thud!'), ['Tiffin to ', B, '... thud!']);
  assert.deepEqual(lineWithBlanks("Where is {name's} shirt?"), ['Where is ', B, "'s shirt?"]);
  assert.deepEqual(lineWithBlanks('GO {NAME}, GO!'), ['GO ', B, ', GO!']);
  assert.deepEqual(lineWithBlanks('{name}!'), [B, '!']);
  assert.deepEqual(lineWithBlanks('Night night, Tiffin. Night night, {name}.'), ['Night night, Tiffin. Night night, ', B, '.']);
  assert.deepEqual(lineWithBlanks('Warm up, Tiffin!'), ['Warm up, Tiffin!']);
  // Sibling choices print the single-child side; {say:...} prints what's shown.
  assert.deepEqual(lineWithBlanks('Where {is|are} {name}?'), ['Where is ', B, '?']);
  assert.deepEqual(lineWithBlanks('{say:Peep|Peeeep}! Kick-off!'), ['Peep! Kick-off!']);
  assert.deepEqual(lineWithBlanks(''), []);
  assert.deepEqual(lineWithBlanks(undefined), []);
});

test('make-qr: base URLs are treated as folders', () => {
  assert.equal(asFolderUrl('https://example.com/app').href, 'https://example.com/app/');
  assert.equal(asFolderUrl('https://example.com/app/').href, 'https://example.com/app/');
  assert.equal(asFolderUrl('https://example.com/app/index.html').href, 'https://example.com/app/index.html');
  assert.equal(asFolderUrl('https://example.com/app/?x=1#y').href, 'https://example.com/app/');
  assert.throws(() => asFolderUrl('not a url'));
});

test('make-qr: advice about links, names and printed size', () => {
  const short = adviceFor({ url: 'HTTPS://MHAPPY.UK/B1', size: 25, moduleMm: 0.75, margin: 4 });
  assert.equal(short.mm, 24.8);
  assert.deepEqual(short.notes, []);
  const long = adviceFor({ url: 'https://example.com/app/?b=tiffin-football', size: 33, moduleMm: 0.75, margin: 4 });
  assert.equal(long.mm, 30.8);
  assert.ok(long.notes.some((n) => /short redirect/.test(n)));
  const bad = adviceFor({ url: 'http://x/?name=Ava', size: 25, moduleMm: 0.4, margin: 4 });
  assert.ok(bad.notes.some((n) => /not https/.test(n)));
  assert.ok(bad.notes.some((n) => /carries a name/.test(n)));
  assert.ok(bad.notes.some((n) => /too small/.test(n)));
  assert.ok(bad.notes.some((n) => /small; aim for 20-25 mm/.test(n)));
});
