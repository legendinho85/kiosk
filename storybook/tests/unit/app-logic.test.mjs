import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHold, HOLD_MS } from '../../js/app/parent-gate.js';
import { letterCount, longNameHint, nameError, defaultPronunciation, LONG_NAME_LETTERS, nicknameOffer, nicknameSuggestion, resolveNames } from '../../js/app/screens/name.js';
import { storyLines, mergeCandidates, findSaved, candidateTitle, candidateNote, recognitionMessage, storedPronunciation } from '../../js/app/screens/pronunciation.js';
import { pronunciationSummary, profilePerson } from '../../js/app/screens/ready.js';
import { pageParam } from '../../js/app/screens/read.js';
import { speedFor, SPEEDS, TOGGLES, voiceLabel, ONLINE_VOICES_TEXT } from '../../js/app/screens/settings.js';
import { fallbackLandingUrl } from '../../js/app/screens/qr.js';
import { respellParts, debounce } from '../../js/app/ui.js';
import { createQuietNarrator } from '../../js/app/services.js';
import { buildIndex, getCandidates } from '../../js/pronounce/index.js';
import { DEFAULT_SETTINGS } from '../../js/core/storage.js';
import { NAME_ERRORS } from '../../js/core/personalise.js';

const book = JSON.parse(readFileSync(new URL('../../books/tiffin-football/book.json', import.meta.url), 'utf8'));
const lexicon = buildIndex(JSON.parse(readFileSync(new URL('../../data/names.json', import.meta.url), 'utf8')));

// ---- Parent gate -------------------------------------------------------------------------

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

test('the gate opens only after an unbroken three-second hold', () => {
  const c = clock();
  let opened = 0;
  const seen = [];
  const hold = createHold({ now: c.now, onProgress: (p) => seen.push(p), onComplete: () => opened++ });
  assert.equal(HOLD_MS, 3000);
  hold.start();
  c.advance(1500);
  assert.equal(hold.tick(), 0.5);
  c.advance(1499);
  assert.ok(hold.tick() < 1);
  assert.equal(opened, 0);
  c.advance(1);
  assert.equal(hold.tick(), 1);
  assert.equal(opened, 1);
  assert.equal(hold.done, true);
  // Completes once only.
  c.advance(5000);
  hold.tick();
  hold.start();
  assert.equal(opened, 1);
  assert.equal(seen.at(-1), 1);
});

test('letting go resets the hold (toddler taps never add up)', () => {
  const c = clock();
  let opened = false;
  const hold = createHold({ now: c.now, onComplete: () => (opened = true) });
  for (let i = 0; i < 10; i++) {
    hold.start();
    c.advance(900);
    hold.tick();
    hold.cancel();
    assert.equal(hold.progress, 0);
  }
  assert.equal(opened, false);
  assert.equal(hold.tick(), 0, 'ticking while not held does nothing');
  hold.start();
  hold.start(); // a second start while holding doesn't restart the clock
  c.advance(3000);
  hold.tick();
  assert.equal(opened, true);
});

test('a broken unlock handler does not break the gate', () => {
  const c = clock();
  const hold = createHold({ holdMs: 100, now: c.now, onComplete: () => { throw new Error('boom'); }, onProgress: () => { throw new Error('ui'); } });
  const warn = console.warn;
  console.warn = () => {};
  try {
    hold.start();
    c.advance(100);
    assert.equal(hold.tick(), 1);
    assert.equal(hold.done, true);
  } finally {
    console.warn = warn;
  }
});

// ---- Name screen -----------------------------------------------------------------------

test('long names get a gentle hint, counted in letters only', () => {
  assert.equal(LONG_NAME_LETTERS, 10);
  assert.equal(letterCount('Anna-Sophia'), 10);
  assert.equal(letterCount("D'Arcy O'Neill"), 11);
  assert.equal(letterCount('Zoë'), 3);
  assert.equal(letterCount('Zoë'), 3, 'combining marks join their letter');
  assert.equal(longNameHint('Maximilian'), '', '10 letters, one part: fine');
  assert.equal(longNameHint('Ava'), '');
  assert.match(longNameHint('Anna-Sophia'), /short name/, 'two parts');
  assert.match(longNameHint('Mary-Elizabeth'), /keep “Mary-Elizabeth” as their full name/);
  assert.match(longNameHint('Oluwaseuntobi'), /short name/, '13 letters');
});

test('nicknames: offered for long or several-part names; the short name is used in the story', () => {
  assert.equal(nicknameOffer('Maximilian'), false);
  assert.equal(nicknameOffer('Maximiliano'), true, '11 letters');
  assert.equal(nicknameOffer('Mary Kate'), true, 'two parts');
  assert.equal(nicknameOffer("D'Arcy"), false, 'an apostrophe is not a second part');
  assert.equal(nicknameSuggestion('Anna-Sophia'), 'Anna');
  assert.equal(nicknameSuggestion('mary elizabeth'), 'Mary');
  assert.equal(nicknameSuggestion('Oluwaseuntobi'), '', 'no guessing inside one long name');
  assert.equal(nicknameSuggestion('J Rose'), '', 'a single letter is not a name');
  assert.deepEqual(resolveNames('maximilian-james', 'max'), { ok: true, display: 'Max', key: 'max', fullName: 'Maximilian-James' });
  assert.deepEqual(resolveNames('Maximilian', ''), { ok: true, display: 'Maximilian', key: 'maximilian', fullName: null });
  assert.deepEqual(resolveNames('Ava', 'AVA'), { ok: true, display: 'Ava', key: 'ava', fullName: null }, 'same name: no full name kept');
  assert.deepEqual(resolveNames('', 'Max'), { ok: false, field: 'name', error: 'empty' });
  assert.deepEqual(resolveNames('Maximilian', 'Max2'), { ok: false, field: 'nickname', error: 'invalid-chars' });
});

test('name errors come from NAME_ERRORS', () => {
  assert.equal(nameError('Siobhan'), '');
  assert.equal(nameError('   '), NAME_ERRORS.empty);
  assert.equal(nameError('Ava2'), NAME_ERRORS['invalid-chars']);
  assert.equal(nameError('x'.repeat(30)), NAME_ERRORS['too-long']);
});

test('a new child starts with the dictionary pronunciation when there is one', () => {
  const siobhan = defaultPronunciation(lexicon, 'Siobhan');
  assert.equal(siobhan.source, 'dictionary');
  assert.equal(siobhan.respell, 'shih-VAWN');
  assert.equal(siobhan.useRecording, false);
  // A made-up name the dictionary will never contain.
  const zorvaxa = defaultPronunciation(lexicon, 'Zorvaxa');
  assert.equal(zorvaxa.source, 'as-written');
  assert.equal(zorvaxa.say, 'Zorvaxa');
  assert.equal(defaultPronunciation(null, 'Bo').say, 'Bo', 'no dictionary: as written');
});

// ---- Pronunciation screen ---------------------------------------------------------------

test('story lines: the title line and the goodnight line', () => {
  const lines = storyLines(book);
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Goal, {name}!');
  assert.match(lines[1], /Night night, \{name\}\./);
  assert.deepEqual(storyLines(null), ['Goal, {name}!']);
  assert.deepEqual(storyLines({ pages: [{ text: ['Hello {name}!'] }] }), ['Hello {name}!']);
  assert.deepEqual(storyLines({ pages: [{ text: ['A {name}.', 'B {name}.', 'C {name}.'] }] }, 3), ['A {name}.', 'C {name}.', 'B {name}.']);
  // Possessive-only lines are skipped: the plain name is what we're checking.
  assert.deepEqual(storyLines({ pages: [{ text: ["{name's} hat", 'Go {name}!'] }] }), ['Go {name}!']);
});

test('merging candidates skips ones that sound the same', () => {
  const base = getCandidates(lexicon, 'Siobhan');
  assert.equal(base[0].source, 'dictionary', 'dictionary first');
  const { list, added } = mergeCandidates(base, [
    { id: 'heard-1', say: 'shi vawn', source: 'heard' },
    { id: 'heard-2', say: 'Shivawn', source: 'heard' },
    { id: 'x', say: '', source: 'heard' },
  ]);
  assert.deepEqual(added.map((c) => c.id), ['heard-2']);
  assert.equal(list.length, base.length + 1);
  assert.equal(findSaved(list, { say: 'SHIVAWN' }), list.length - 1);
  assert.equal(findSaved(list, { say: 'nope' }), -1);
  assert.equal(findSaved(list, null), -1);
});

test('candidate titles and notes read naturally', () => {
  assert.equal(candidateTitle({ source: 'dictionary', label: 'Irish' }), 'Irish');
  assert.equal(candidateTitle({ source: 'as-written', label: 'As written' }), 'As it’s spelled');
  assert.equal(candidateTitle({ source: 'custom' }), 'Your spelling');
  assert.equal(candidateTitle({ source: 'heard' }), 'What we heard');
  assert.equal(candidateTitle({ source: 'suggestion', label: '' }), 'Suggestion');
  assert.match(candidateNote({ source: 'dictionary' }), /dictionary/);
  assert.equal(candidateNote({ source: 'mystery' }), '');
});

test('stored pronunciations never keep a language/origin guess', () => {
  const [dict] = getCandidates(lexicon, 'Siobhan');
  assert.equal(dict.label, 'Irish', 'shown on screen');
  const saved = storedPronunciation(dict);
  assert.equal(saved.label, '');
  assert.equal(saved.say, 'Shi vawn');
  assert.equal(saved.respell, 'shih-VAWN');
  assert.equal(storedPronunciation({ say: 'Shiow ming', label: 'Mandarin (pinyin) style', source: 'suggestion' }).label, '');
  assert.equal(storedPronunciation({ say: 'Shivawn', label: 'Your spelling', source: 'custom' }).label, 'Your spelling');
  assert.equal(defaultPronunciation(lexicon, 'Siobhan').label, '');
});

test('recognition failures get helpful messages', () => {
  assert.match(recognitionMessage('not-allowed'), /allow the microphone/);
  assert.match(recognitionMessage('no-speech'), /didn’t quite catch/);
  assert.match(recognitionMessage('network'), /typing/);
  assert.match(recognitionMessage('???'), /try again/i);
});

// ---- Ready / read / settings / qr -------------------------------------------------------

test('pronunciation summaries prefer the recording, then the respelling', () => {
  assert.deepEqual(pronunciationSummary({ display: 'Niamh', pronunciation: { say: 'Neeve', respell: 'NEEV' } }), { kind: 'respell', text: 'NEEV' });
  assert.deepEqual(pronunciationSummary({ display: 'Ava', pronunciation: { say: 'Ava' } }), { kind: 'say', text: 'Ava' });
  assert.deepEqual(pronunciationSummary({ display: 'Ava', pronunciation: { say: 'Ava', useRecording: true, recordingId: 'r' } }).kind, 'recording');
  assert.deepEqual(pronunciationSummary({ display: 'Ava' }), { kind: 'say', text: 'Ava' });
  assert.deepEqual(profilePerson({ display: 'Niamh', pronunciation: { say: 'Neeve' } }), { display: 'Niamh', say: 'Neeve' });
  assert.deepEqual(profilePerson({ display: 'Bo' }), { display: 'Bo', say: 'Bo' });
});

test('page parameters are clamped to the book', () => {
  assert.equal(pageParam('3', 8), 3);
  assert.equal(pageParam('0', 8), 1);
  assert.equal(pageParam('99', 8), 8);
  assert.equal(pageParam('abc', 8), 1);
  assert.equal(pageParam(undefined, 8), 1);
  assert.equal(pageParam('2', 0), 1);
});

test('reading speeds map to the nearest preset', () => {
  assert.equal(speedFor(DEFAULT_SETTINGS.rate).id, 'normal');
  assert.equal(speedFor(0.7).id, 'slower');
  assert.equal(speedFor(1.2).id, 'normal');
  assert.equal(speedFor(undefined).id, 'normal');
  assert.ok(SPEEDS.every((s) => s.rate > 0.5 && s.rate <= 1));
  assert.deepEqual(TOGGLES.map((t) => t.key).sort(), ['autoTurn', 'bedtime', 'highlight', 'readPrompts', 'sfx']);
  assert.match(ONLINE_VOICES_TEXT, /Google or Microsoft/);
  assert.match(ONLINE_VOICES_TEXT, /name/);
  assert.equal(voiceLabel({ label: 'Serena', lang: 'en-GB', local: true }), 'Serena (en-GB)');
  assert.equal(voiceLabel({ name: 'Google UK English Female', lang: 'en-GB', local: false }), 'Google UK English Female (en-GB) · online');
});

test('the fallback landing URL points at the app folder with ?b=', () => {
  assert.equal(fallbackLandingUrl('tiffin-football', { origin: 'https://h.example', pathname: '/app/index.html' }), 'https://h.example/app/?b=tiffin-football');
  assert.equal(fallbackLandingUrl('tiffin-football', { origin: 'http://127.0.0.1:8106', pathname: '/' }), 'http://127.0.0.1:8106/?b=tiffin-football');
});

// ---- UI helpers -------------------------------------------------------------------------

test('respellings mark the stressed syllable', () => {
  assert.deepEqual(respellParts('shih-VAWN'), [{ text: 'shih-', stressed: false }, { text: 'VAWN', stressed: true }]);
  assert.deepEqual(respellParts('uh-SHEEN'), [{ text: 'uh-', stressed: false }, { text: 'SHEEN', stressed: true }]);
  assert.deepEqual(respellParts('NEEV'), [{ text: 'NEEV', stressed: false }], 'all capitals: no stress marks');
  assert.deepEqual(respellParts('OH-luh-wuh SHAY-oon'), [
    { text: 'OH', stressed: true },
    { text: '-luh-wuh ', stressed: false },
    { text: 'SHAY', stressed: true },
    { text: '-oon', stressed: false },
  ]);
  assert.deepEqual(respellParts(''), []);
});

test('debounce runs once with the last arguments; flush and cancel work', async () => {
  const calls = [];
  const d = debounce((x) => calls.push(x), 20);
  d(1);
  d(2);
  d(3);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, [3]);
  d(4);
  d.flush();
  assert.deepEqual(calls, [3, 4]);
  d(5);
  d.cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, [3, 4]);
});

// ---- Quiet narrator (used when the real one can't load) ------------------------------------

test('the quiet narrator walks every word and can be stopped', async () => {
  globalThis.SB_TEST = { timeScale: 0.001 };
  try {
    const n = createQuietNarrator();
    assert.equal(n.hasVoice(), false);
    const seen = [];
    const { planLines } = await import('../../js/narrator/plan.js');
    const plan = planLines(['Goal, {name}!', 'Night night, {name}.'], { display: 'Siobhan', say: 'Shi vawn' });
    assert.equal(await n.play(plan, { onUnit: (line, u) => seen.push(`${line}:${u}`) }), 'done');
    assert.deepEqual(seen, ['0:0', '0:1', '1:0', '1:1', '1:2']);
    const words = [];
    assert.equal(await n.speakText('Hello there Ava', { onUnit: (i) => words.push(i) }), 'done');
    assert.deepEqual(words, [0, 1, 2]);
    const ctl = new AbortController();
    const p = n.play(plan, { signal: ctl.signal });
    ctl.abort();
    assert.equal(await p, 'stopped');
  } finally {
    delete globalThis.SB_TEST;
  }
});
