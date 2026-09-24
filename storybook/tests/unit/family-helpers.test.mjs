// Family features helpers (js/family/family.js) and the pure bits of the new
// grown-up screens (record, gift, open, ready, home).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readingPerson, artNames, selectChild, recordingSteps, readingCoverage, readingBlobIds, readingAdapter, readingAudioParts,
  readingAudioFilename, storyTitle, readingShareText, giftShareText, formatDuration, clock, MAX_TOGETHER,
} from '../../js/family/family.js';
import { giftDraft, hasGiftDraft, clearGiftDraft } from '../../js/family/drafts.js';
import { setTogether, loadState } from '../../js/core/storage.js';
import { togetherIds, readingMeta } from '../../js/app/screens/ready.js';
import { packHeadline } from '../../js/app/screens/open.js';
import { giftInstructions } from '../../js/app/screens/gift.js';
import { recorderMessage, READING_MAX_MS } from '../../js/app/screens/record.js';
import { shelfTitle } from '../../js/app/screens/home.js';

const book = JSON.parse(readFileSync(new URL('../../books/tiffin-football/book.json', import.meta.url), 'utf8'));
const digger = JSON.parse(readFileSync(new URL('../../books/tiffin-digger/book.json', import.meta.url), 'utf8'));

const kid = (id, display, say = display) => ({ id, display, key: display.toLowerCase(), pronunciation: { say } });

test('reading together: one person for up to three children', () => {
  let state = { ...loadState(), profiles: [kid('a', 'Amara'), kid('z', 'Zak', 'Zack'), kid('l', 'Li'), kid('m', 'Mo')], activeProfileId: 'a' };
  assert.deepEqual(readingPerson(state), { display: 'Amara', say: 'Amara' });
  state = setTogether(state, ['a', 'z']);
  assert.deepEqual(readingPerson(state), { display: 'Amara and Zak', say: 'Amara and Zack', count: 2, art: 'Amara & Zak' });
  assert.equal(artNames(state.profiles.slice(0, 3)), 'Amara & Zak & Li');
  assert.equal(readingPerson({ ...loadState(), profiles: [] }), null);
  // Switching to a child outside the group drops the group; inside keeps it.
  assert.deepEqual(selectChild(state, 'z').together, ['a', 'z']);
  assert.deepEqual(selectChild(state, 'l').together, []);
  assert.equal(selectChild(state, 'l').activeProfileId, 'l');
  // The picker's rules: add, remove, never empty, at most three.
  assert.equal(MAX_TOGETHER, 3);
  assert.deepEqual(togetherIds(['a'], 'z', true), ['a', 'z']);
  assert.deepEqual(togetherIds(['a', 'z'], 'z', false), ['a']);
  assert.deepEqual(togetherIds(['a'], 'a', false), ['a'], 'the last child stays');
  assert.deepEqual(togetherIds(['a', 'z', 'l'], 'm', true), ['a', 'z', 'l']);
});

test('recording steps: every page part in order, prompts marked, cover and end included', () => {
  const steps = recordingSteps(book);
  assert.equal(steps.length, 14, 'cover + 6 spreads × 2 + end');
  assert.deepEqual(steps.slice(0, 3).map((s) => `${s.n}:${s.part}`), ['1:main', '2:main', '2:after']);
  const p2 = steps[1];
  assert.deepEqual(p2.lines, ["It's football day!", 'Tiffin has boots. Tiffin has a ball.', "Where {is|are} {name's} {shirt|shirts}?", 'Lift the flap on the kit bag!']);
  assert.equal(p2.promptIndex, 3);
  assert.equal(p2.mechanic, 'flap');
  assert.match(p2.cue, /the flap/);
  assert.equal(steps[2].title, 'Page 2, after your listener lifts the flap');
  assert.equal(steps[0].title, 'The cover');
  assert.equal(steps.at(-1).title, 'The last page');
  assert.equal(steps.at(-1).promptIndex, -1);
  assert.equal(recordingSteps(digger).length > 8, true, 'the second book works too');
  assert.deepEqual(recordingSteps(null), []);
});

test('coverage, blob ids and the adapter the reader plays', async () => {
  const steps = recordingSteps(book);
  const reading = { id: 'r1', bookId: 'tiffin-football', readerName: 'Grandma Rose', parts: { 1: { main: 'b1', after: null }, 2: { main: 'b2', after: 'b3' } } };
  assert.deepEqual(readingCoverage(reading, steps), { done: 3, total: 14, complete: false });
  assert.deepEqual(readingBlobIds(reading), ['b1', 'b2', 'b3']);
  const blobs = new Map([['b1', new Blob(['one'])], ['b2', new Blob(['two'])]]);
  const adapter = readingAdapter(reading, { get: async (id) => blobs.get(id) ?? null });
  assert.equal(adapter.readerName, 'Grandma Rose');
  assert.equal(adapter.label, 'Read by Grandma Rose');
  assert.equal(await (await adapter.getPart(2, 'main')).text(), 'two');
  assert.equal(await adapter.getPart(2, 'after'), null, 'a missing blob is null');
  assert.equal(await adapter.getPart(5, 'main'), null);
  const broken = readingAdapter(reading, { get: async () => { throw new Error('db gone'); } });
  assert.equal(await broken.getPart(1, 'main'), null, 'storage errors never reach the reader');
  assert.equal(readingAdapter(null, {}), null);
  assert.equal(readingAdapter({ ...reading, language: 'Urdu' }, {}).label, 'Read by Grandma Rose in Urdu');
});

test('one audio file: parts in page order, a pause for little hands, a chime between pages', async () => {
  const reading = { parts: { 3: { main: 'c', after: 'd' }, 1: { main: 'a' }, 2: { main: null, after: 'gone' } } };
  const store = { a: new Blob(['A']), c: new Blob(['C']), d: new Blob(['D']) };
  const { parts, clips, missing } = await readingAudioParts(book, reading, async (id) => store[id] ?? null);
  assert.equal(clips, 3);
  assert.equal(missing, 1);
  const shape = await Promise.all(parts.map(async (p) => (p instanceof Blob ? await p.text() : p.chime ? 'chime' : `${p.silenceMs}ms`)));
  assert.deepEqual(shape, ['A', '700ms', 'chime', '500ms', 'C', '1600ms', 'D', '800ms']);
  const empty = await readingAudioParts(book, { parts: {} }, async () => null);
  assert.deepEqual(empty, { parts: [], clips: 0, missing: 0 });
});

test('names for files and the words that go with them', () => {
  assert.equal(readingAudioFilename(book, { display: 'Ava' }, { readerName: 'Grandma Rose' }), 'Goal-Ava-read-by-Grandma-Rose.wav');
  assert.equal(readingAudioFilename(book, { display: 'Zoë' }, { readerName: '' }), 'Goal-Zoe.wav');
  assert.equal(readingAudioFilename(digger, { display: 'Amara and Zak' }, { readerName: 'Nana' }), 'Beep-beep-Amara-and-Zak-read-by-Nana.wav');
  assert.equal(storyTitle(book, 'Ava'), 'Goal, Ava!');
  assert.equal(storyTitle(book, ''), 'A Tiffin & Me football story');
  assert.equal(storyTitle({ title: 'Goal, {name}!' }, ''), 'Goal!');
  assert.match(readingShareText({ readerName: 'Grandma Rose', title: 'Goal, Ava!', landingUrl: 'https://x.test/?b=tiffin-football' }), /Grandma Rose has recorded “Goal, Ava!” for you\. .*https:\/\/x\.test\/\?b=tiffin-football.*Open a family recording/);
  assert.match(giftShareText({ childName: 'Ava', from: 'Auntie Jo', landingUrl: 'u' }), /^A gift for Ava from Auntie Jo!/);
  assert.match(giftShareText({ childName: 'Ava', from: '', landingUrl: 'u' }), /^A gift for Ava!/);
  assert.equal(giftInstructions('Ava', 'x.test/?b=tiffin-football'), 'Send this file to Ava’s grown-up. They open x.test/?b=tiffin-football and tap “Open a family recording”.');
  assert.equal(formatDuration(45_000), '45 s');
  assert.equal(formatDuration(125_000), '2 min 5 s');
  assert.equal(formatDuration(120_000), '2 min');
  assert.equal(clock(7_900), '0:07');
  assert.equal(clock(READING_MAX_MS), '1:00');
});

test('screen words: pack headlines, reading details, recorder problems, shelf titles', () => {
  const parsedReading = { kind: 'reading', readerName: 'Grandma Rose', book: { title: 'Goal, {name}!', subtitle: 'A Tiffin & Me football story' }, child: { display: 'Ava' } };
  assert.equal(packHeadline(parsedReading), 'Grandma Rose has recorded “Goal, Ava!” for you');
  assert.equal(packHeadline({ ...parsedReading, child: null }, 'Siobhan'), 'Grandma Rose has recorded “Goal, Siobhan!” for you');
  assert.equal(packHeadline({ ...parsedReading, child: null, readerName: '' }), 'Someone who loves you has recorded “A Tiffin & Me football story” for you');
  assert.equal(packHeadline({ kind: 'gift', child: { display: 'Ava' }, message: { from: 'Auntie Jo' } }), 'A gift for Ava from Auntie Jo');
  assert.equal(packHeadline({ kind: 'gift', child: { display: 'Ava' }, message: { from: '' } }), 'A gift for Ava');
  const steps = recordingSteps(book);
  const now = new Date('2026-09-24T12:00:00Z');
  const done = { parts: Object.fromEntries(steps.map((s) => [s.n, { main: 'x', after: 'y' }])), updatedAt: Date.parse('2026-09-20T12:00:00Z') };
  assert.match(readingMeta(done, steps, now), /^Recorded 20 Sept? · every page$/);
  assert.match(readingMeta({ parts: { 1: { main: 'x' } }, updatedAt: Date.parse('2025-01-02T12:00:00Z'), language: 'Urdu' }, steps, now), /^Recorded 2 Jan 2025 · 1 of 14 parts · in Urdu$/);
  assert.match(recorderMessage('denied'), /allow the microphone/);
  assert.match(recorderMessage('silent'), /couldn’t hear/);
  assert.match(recorderMessage('???'), /try again/i);
  assert.equal(shelfTitle({ title: 'Beep beep, {name}!' }, { display: 'Amara and Zak', say: 'x', count: 2 }), 'Beep beep, Amara and Zak!');
  assert.equal(shelfTitle({ title: 'Goal, {name}!' }, null), 'Goal, you!');
});

test('the gift draft lives in memory, one book at a time', () => {
  clearGiftDraft();
  const d = giftDraft('tiffin-football');
  assert.equal(hasGiftDraft('tiffin-football'), false);
  d.childName = 'Ava';
  assert.equal(giftDraft('tiffin-football').childName, 'Ava', 'survives moving between screens');
  assert.equal(hasGiftDraft('tiffin-football'), true);
  assert.equal(giftDraft('tiffin-digger').childName, '', 'another book starts fresh');
  assert.equal(hasGiftDraft('tiffin-football'), false);
  clearGiftDraft();
});
