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
