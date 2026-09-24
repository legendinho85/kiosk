import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, upsertProfile, removeProfile, activeProfile, DEFAULT_SETTINGS, blobs } from '../../js/core/storage.js';
import { validateBook } from '../../js/core/book.js';

test('state round-trips through the memory fallback when localStorage is missing', () => {
  const s0 = loadState();
  assert.deepEqual(s0.profiles, []);
  assert.deepEqual(s0.settings, { ...DEFAULT_SETTINGS });
  let s = upsertProfile(s0, { id: 'a', display: 'Ava', key: 'ava', pronunciation: { say: 'Ava' } });
  s = upsertProfile(s, { id: 'b', display: 'Leo', key: 'leo', pronunciation: { say: 'Leo' } });
  assert.equal(activeProfile(s).display, 'Leo');
  saveState(s);
  const back = loadState();
  assert.equal(back.profiles.length, 2);
  assert.equal(back.activeProfileId, 'b');
  const removed = removeProfile(back, 'b');
  assert.equal(removed.activeProfileId, 'a');
  const edited = upsertProfile(removed, { ...removed.profiles[0], display: 'Eva' });
  assert.equal(edited.profiles.length, 1);
  assert.equal(edited.profiles[0].display, 'Eva');
});

test('blobs fall back to memory without IndexedDB', async () => {
  await blobs.put('x', 'data');
  assert.equal(await blobs.get('x'), 'data');
  await blobs.delete('x');
  assert.equal(await blobs.get('x'), null);
});

const good = () => ({
  id: 'demo',
  title: 'Demo starring {name}',
  pages: [
    { n: 1, kind: 'cover', scene: 'scenes/p1.svg', text: ['Hi {name}'], mechanic: { type: 'none' } },
    {
      n: 2, kind: 'spread', scene: 'scenes/p2.svg', text: ['Pass to {name}!'], prompt: 'Slide it!', after: ['Goal!'],
      mechanic: {
        type: 'slider', control: { from: [100, 900], to: [600, 900], knob: '#p2-knob' },
        drives: [{ target: '#p2-ball', along: '#p2-path' }, { target: '#p2-leg', rotate: [0, -30], origin: [10, 10], range: [0, 0.3] }],
        complete: { show: ['#p2-goal'] },
      },
    },
  ],
});

test('validateBook accepts a well-formed book', () => {
  assert.deepEqual(validateBook(good()), []);
});

test('validateBook reports the problems a book author is likely to make', () => {
  const b = good();
  b.pages[1].text = ['Pass to {nmae}!'];
  b.pages[1].mechanic.control = { from: [1] };
  b.pages[1].mechanic.drives.push({ target: 'ball', rotate: [0, 1], opacity: [0, 1], range: [1, 0] });
  b.pages[0].n = 5;
  const errors = validateBook(b).join('\n');
  assert.match(errors, /unknown placeholder \{nmae\}/);
  assert.match(errors, /slider control needs from/);
  assert.match(errors, /target must be "#id"/);
  assert.match(errors, /exactly one of/);
  assert.match(errors, /range must be/);
  assert.match(errors, /n should be 1/);
  assert.deepEqual(validateBook(null), ['Book is not an object']);
});

test('siblings reading together', async () => {
  const { readingChildren, setTogether } = await import('../../js/core/storage.js');
  let s = loadState();
  s = { ...s, profiles: [], together: [] };
  s = upsertProfile(s, { id: 'a', display: 'Amara', key: 'amara', pronunciation: { say: 'Amara' } });
  s = upsertProfile(s, { id: 'z', display: 'Zak', key: 'zak', pronunciation: { say: 'Zak' } });
  assert.deepEqual(readingChildren(s).map((p) => p.id), ['z']);
  s = setTogether(s, ['a', 'z', 'z', 'ghost']);
  assert.deepEqual(readingChildren(s).map((p) => p.id), ['a', 'z']);
  s = setTogether(s, ['a']);
  assert.deepEqual(s.together, []);
  s = setTogether(s, ['a', 'z']);
  s = { ...s, activeProfileId: 'a' };
  assert.deepEqual(readingChildren(s).map((p) => p.id), ['a', 'z']);
  s = upsertProfile(s, { id: 'b', display: 'Bo', key: 'bo', pronunciation: { say: 'Bo' } });
  assert.deepEqual(readingChildren(s).map((p) => p.id), ['b'], 'a child outside the group reads alone');
  s = { ...s, activeProfileId: 'z' };
  s = removeProfile(s, 'z');
  assert.deepEqual(s.together, ['a']);
  assert.deepEqual(readingChildren(s).map((p) => p.id), ['a']);
});

test('recorded readings (grandparent mode)', async () => {
  const { upsertReading, removeReading, readingsFor, activeReadingFor } = await import('../../js/core/storage.js');
  let s = { ...loadState(), readings: [], activeReading: {} };
  s = upsertReading(s, { id: 'r1', bookId: 'b', readerName: 'Grandma', parts: { 1: { main: 'x1', after: null }, 2: { main: 'x2', after: 'y2' } } });
  assert.equal(activeReadingFor(s, 'b').readerName, 'Grandma');
  s = upsertReading(s, { id: 'r2', bookId: 'b', readerName: 'Grandpa', parts: {} }, { activate: false });
  assert.equal(activeReadingFor(s, 'b').id, 'r1');
  assert.equal(readingsFor(s, 'b').length, 2);
  const out = removeReading(s, 'r1');
  assert.deepEqual(out.blobIds.sort(), ['x1', 'x2', 'y2']);
  assert.equal(activeReadingFor(out.state, 'b'), null);
  saveState(out.state);
  assert.equal(loadState().readings.length, 1);
});

test('prefs survive without localStorage', async () => {
  const { prefs } = await import('../../js/core/storage.js');
  assert.equal(prefs.get('nope', 7), 7);
  prefs.set('align', { x: 1 });
  assert.deepEqual(prefs.get('align'), { x: 1 });
});

test('reading labels mention home languages', async () => {
  const { readingLabel } = await import('../../js/core/storage.js');
  assert.equal(readingLabel({ readerName: 'Nana' }), 'Read by Nana');
  assert.equal(readingLabel({ readerName: 'Nana', language: 'Urdu' }), 'Read by Nana in Urdu');
  assert.equal(readingLabel({ readerName: 'Taid', language: 'English' }), 'Read by Taid');
  assert.equal(readingLabel(null), '');
});
