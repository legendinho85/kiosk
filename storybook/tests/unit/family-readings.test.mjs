// A grown-up's recorded reading belongs to the child it says the name of
// (js/family/family.js, js/family/pack.js): it plays for that child only, the
// choice of who reads is remembered per child, and it goes when the child is
// removed. The gift draft keeps the giver's recordings in memory only.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readingIsFor, readingIsOnlyFor, childReadings, childReading, chooseReading, readingChoiceKey, readingChildFields,
  readingsOnlyFor, updateProfile, dropReadingChoices, asciiSlug,
} from '../../js/family/family.js';
import { buildPack, readPack, importPack, asciiSlug as packSlug } from '../../js/family/pack.js';
import { giftDraft, clearGiftDraft, draftBlobs, hasGiftDraft } from '../../js/family/drafts.js';
import { loadState, upsertReading, removeProfile, removeReading, activeReadingFor, setTogether } from '../../js/core/storage.js';

const BOOK = 'tiffin-football';
const BOOKS = [{ id: BOOK, title: 'Goal, {name}!' }, { id: 'tiffin-digger', title: 'Beep beep, {name}!' }];
const kid = (id, display, extra = {}) => ({ id, display, key: display.toLowerCase(), pronunciation: { say: display }, ...extra });
const ava = kid('c_ava', 'Ava');
const zak = kid('c_zak', 'Zak');
const max = kid('c_max', 'Max', { fullName: 'Maximilian' });
function wav(n = 200) {
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  [...'RIFF'].forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  v.setUint32(4, 36 + n * 2, true);
  [...'WAVEfmt '].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true);
  v.setUint32(28, 44100, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  [...'data'].forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0)));
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(6000 * Math.sin(i / 4)), true);
  return new Blob([buf], { type: 'audio/wav' });
}
const memBlobs = () => {
  const map = new Map();
  return { map, put: async (id, b) => void map.set(id, b), get: async (id) => map.get(id) ?? null, delete: async (id) => void map.delete(id) };
};
const base = (extra = {}) => ({ ...loadState(), profiles: [ava, zak, max], activeProfileId: 'c_ava', ...extra });
const reading = (id, fields = {}, t = 1) => ({ id, bookId: BOOK, readerName: 'Grandma Rose', parts: { 1: { main: `${id}_p1_main`, after: null } }, createdAt: t, updatedAt: t, ...fields });

test('a reading is for the child it was recorded for (by id, else by name); older readings are for anyone', () => {
  assert.deepEqual(readingChildFields(ava), { childId: 'c_ava', childKey: 'ava', childName: 'Ava' });
  assert.deepEqual(readingChildFields({ display: 'Niamh' }), { childKey: 'niamh', childName: 'Niamh' });
  assert.deepEqual(readingChildFields(null), {});
  const forAva = reading('r1', readingChildFields(ava));
  assert.equal(readingIsFor(forAva, ava), true);
  assert.equal(readingIsFor(forAva, zak), false);
  assert.equal(readingIsFor(forAva, kid('c_other', 'Ava')), false, 'the id wins over the name');
  assert.equal(readingIsFor(reading('r2', { childKey: 'maximilian' }), max), true, 'a full name matches too');
  const legacy = reading('r3');
  assert.equal(readingIsFor(legacy, zak), true, 'a reading that doesn’t say is for anyone');
  assert.equal(readingIsOnlyFor(legacy, zak), false, 'but it isn’t only Zak’s');
  assert.equal(readingIsFor(forAva, null), false);
});

test('Grandma’s reading for Ava plays for Ava, not for Zak; the choice is remembered per child', () => {
  let s = upsertReading(base(), reading('r_ava', readingChildFields(ava)), { activate: true });
  s = chooseReading(s, BOOK, 'c_ava', 'r_ava');
  assert.equal(childReading(s, BOOK)?.id, 'r_ava', 'Ava hears Grandma');
  assert.deepEqual(childReadings(s, BOOK, zak), [], 'nothing to choose for Zak');
  const asZak = { ...s, activeProfileId: 'c_zak' };
  assert.equal(activeReadingFor(asZak, BOOK)?.id, 'r_ava', '(the book-level choice still points at it)');
  assert.equal(childReading(asZak, BOOK), null, 'but Zak gets the computer voice');
  // Zak gets his own reading from Dad; Ava keeps Grandma.
  let t = upsertReading(asZak, reading('r_zak', { ...readingChildFields(zak), readerName: 'Dad' }, 2), { activate: true });
  t = chooseReading(t, BOOK, 'c_zak', 'r_zak');
  assert.equal(childReading(t, BOOK)?.id, 'r_zak');
  assert.equal(childReading({ ...t, activeProfileId: 'c_ava' }, BOOK)?.id, 'r_ava', 'switching back keeps Ava’s choice');
  // Ava chooses the computer voice: remembered for her only.
  const u = chooseReading({ ...t, activeProfileId: 'c_ava' }, BOOK, 'c_ava', null);
  assert.equal(childReading(u, BOOK), null);
  assert.equal(childReading({ ...u, activeProfileId: 'c_zak' }, BOOK)?.id, 'r_zak');
  assert.equal(u.activeReading[readingChoiceKey(BOOK, 'c_ava')], null);
  // Reading together: a recording says one name, so the computer voice reads.
  assert.equal(childReading(setTogether(t, ['c_zak', 'c_ava']), BOOK), null);
  // A deleted reading is never played.
  assert.equal(childReading(removeReading(t, 'r_zak').state, BOOK), null);
});

test('removing a child: their readings (and reading choices) go too; other children keep theirs', () => {
  let s = upsertReading(base(), reading('r_ava', readingChildFields(ava)));
  s = upsertReading(s, reading('r_zak', readingChildFields(zak)));
  s = upsertReading(s, reading('r_old'));
  s = chooseReading(chooseReading(s, BOOK, 'c_ava', 'r_ava'), BOOK, 'c_zak', 'r_zak');
  assert.deepEqual(readingsOnlyFor(s, ava).map((r) => r.id), ['r_ava'], 'not the legacy reading');
  let next = removeProfile(s, 'c_ava');
  for (const r of readingsOnlyFor(s, ava)) next = removeReading(next, r.id).state;
  next = dropReadingChoices(next, 'c_ava');
  assert.deepEqual(next.readings.map((r) => r.id).sort(), ['r_old', 'r_zak']);
  assert.equal(Object.keys(next.activeReading).some((k) => k.endsWith('::c_ava')), false);
  assert.equal(childReading({ ...next, activeProfileId: 'c_zak' }, BOOK)?.id, 'r_zak');
});

test('editing a profile doesn’t change who the story is for or who reads together', () => {
  const s = setTogether(base(), ['c_ava', 'c_max']);
  const next = updateProfile(s, { ...zak, display: 'Zac', key: 'zac' });
  assert.equal(next.activeProfileId, 'c_ava');
  assert.deepEqual(next.together, ['c_ava', 'c_max']);
  assert.equal(next.profiles.find((p) => p.id === 'c_zak').display, 'Zac');
  // The whole profile is replaced (a removed nickname's fullName goes).
  const { fullName, ...plain } = max;
  assert.equal('fullName' in updateProfile(s, { ...plain, display: 'Maximilian' }).profiles.find((p) => p.id === 'c_max'), false);
});

test('importing a reading pack: it becomes the named child’s, chosen for them', async () => {
  const file = await buildPack({ kind: 'reading', bookId: BOOK, readerName: 'Grandma Rose', createdAt: 1790000000000, parts: { 1: { main: wav() } }, child: { display: 'Zak' } });
  const parsed = await readPack(file, { books: BOOKS });
  const { state, summary } = await importPack(base(), parsed, memBlobs());
  const r = state.readings[0];
  assert.deepEqual([r.childId, r.childKey, r.childName], ['c_zak', 'zak', 'Zak']);
  assert.equal(summary.childId, 'c_zak');
  assert.equal(childReading({ ...state, activeProfileId: 'c_zak' }, BOOK)?.id, r.id, 'plays for Zak');
  assert.equal(childReading(state, BOOK), null, 'not for Ava');
  // A child who isn't on this phone: the reading keeps their name and waits for them.
  const other = await importPack(base(), await readPack(await buildPack({ kind: 'reading', bookId: BOOK, readerName: 'Nana', parts: { 1: { main: wav() } }, child: { display: 'Niamh' } }), { books: BOOKS }), memBlobs());
  assert.deepEqual([other.state.readings[0].childId, other.state.readings[0].childKey], [undefined, 'niamh']);
  assert.equal(other.summary.childId, null);
  assert.equal(other.state.profiles.length, 3, 'a reading pack never adds a child by itself');
  assert.equal(readingIsFor(other.state.readings[0], kid('c_new', 'Niamh')), true, 'it becomes Niamh’s when she is added');
});

test('importing a gift with a reading: the reading is the gift child’s', async () => {
  const file = await buildPack({ kind: 'gift', bookId: BOOK, readerName: 'Auntie Jo', parts: { 1: { main: wav() } }, child: { display: 'Siobhan', pronunciation: { say: 'Shi vawn' } }, message: { from: 'Auntie Jo', text: 'Hi' } });
  const { state, summary } = await importPack(base(), await readPack(file, { books: BOOKS }), memBlobs());
  const siobhan = state.profiles.find((p) => p.display === 'Siobhan');
  assert.equal(summary.childId, siobhan.id);
  assert.equal(state.readings[0].childId, siobhan.id);
  assert.equal(childReading(state, BOOK)?.id, state.readings[0].id, 'Siobhan (now active) hears Auntie Jo');
  assert.equal(childReading({ ...state, activeProfileId: 'c_ava' }, BOOK), null, 'Ava doesn’t');
});

test('the gift draft keeps the giver’s recordings in memory, and forgets them', async () => {
  clearGiftDraft();
  const d = giftDraft(BOOK);
  d.childName = 'Niamh';
  const store = draftBlobs(d);
  await store.put('r_p1_main', wav());
  assert.ok(await store.get('r_p1_main'));
  d.reading = { id: 'r', bookId: BOOK, parts: { 1: { main: 'r_p1_main', after: null } } };
  assert.equal(giftDraft(BOOK).blobs.size, 1, 'survives moving between screens');
  clearGiftDraft();
  assert.equal(hasGiftDraft(BOOK), false);
  assert.equal(d.blobs.size, 0, 'the audio is dropped');
  assert.equal(giftDraft(BOOK).reading, null);
  clearGiftDraft();
});

test('asciiSlug lives in family.js and pack.js still offers it', () => {
  assert.equal(asciiSlug('Grandma Rosé'), 'Grandma-Rose');
  assert.equal(packSlug, asciiSlug);
});
