// Child safety and the fixes around it: the grown-ups' pass ends when a
// child-facing screen shows, where the story got to, in-page anchors that
// aren't routes, tab titles, the provisional pronunciation saved before the
// names dictionary loads, and "Forget everything" reaching memory too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gatePassed, markGatePassed, enterChildMode, inChildMode, renewGatePass, clearGatePass, grownUpCheck, PASS_MS, CAMERA_GATE } from '../../js/app/parent-gate.js';
import { savePlace, placeFor, placeWho } from '../../js/app/place.js';
import { isRouteHash } from '../../js/app/router.js';
import { pageTitle, SCREEN_TITLES } from '../../js/app/boot.js';
import { defaultPronunciation, upgradePronunciations, editReturn, storedPronunciation } from '../../js/app/screens/name.js';
import { storedPronunciation as fromSay } from '../../js/app/screens/pronunciation.js';
import { deleteChildMessage, forgetInMemory } from '../../js/app/screens/settings.js';
import { cameraAvailable } from '../../js/app/screens/ready.js';
import { coverLabel, BLANK_NAME } from '../../js/app/cover.js';
import { scratch } from '../../js/app/scratch.js';
import { giftDraft, hasGiftDraft } from '../../js/family/drafts.js';
import { PRIVACY_WORDS, usingOnlineVoice } from '../../js/app/chrome.js';
import { buildIndex } from '../../js/pronounce/index.js';

const lexicon = buildIndex(JSON.parse(readFileSync(new URL('../../data/names.json', import.meta.url), 'utf8')));

test('a grown-up’s hold lasts a minute on grown-up screens, and ends when a child screen shows', async () => {
  clearGatePass();
  assert.equal(gatePassed(), false);
  const t = Date.now();
  markGatePassed(t);
  assert.equal(gatePassed(t + 1000), true);
  assert.equal(gatePassed(t + PASS_MS + 1), false, 'about a minute, not ten');
  assert.ok(PASS_MS <= 2 * 60 * 1000);
  renewGatePass(t + PASS_MS - 10);
  assert.equal(gatePassed(t + PASS_MS + 5), true, 'renewed while on grown-up screens');
  enterChildMode();
  assert.equal(gatePassed(), false, 'the reader (or letters, or the camera) ends the pass');
  assert.equal(inChildMode(), true);
  renewGatePass();
  assert.equal(gatePassed(), false, 'an ended pass can’t be renewed');
  markGatePassed();
  assert.equal(inChildMode(), false, 'a grown-up’s hold hands the phone back to the grown-ups');
  // No child has had the phone: nothing to ask (a grown-up setting up isn't slowed down).
  clearGatePass();
  assert.equal(await grownUpCheck(), true);
  assert.match(CAMERA_GATE.lead, /Nothing is recorded/);
});

test('where the story got to: remembered per book and per children, cleared at the start and the end', () => {
  const mem = new Map();
  const store = { get: (k, d) => (mem.has(k) ? mem.get(k) : d), set: (k, v) => mem.set(k, v) };
  const ava = [{ id: 'a' }];
  const both = [{ id: 'z' }, { id: 'a' }];
  assert.equal(placeWho(both), 'a,z', 'order doesn’t matter');
  savePlace(store, 'goal', 5, 8, ava);
  assert.equal(placeFor(store, 'goal', 8, ava), 5);
  assert.equal(placeFor(store, 'goal', 8, both), 0, 'not for a different group');
  assert.equal(placeFor(store, 'digger', 8, ava), 0, 'per book');
  savePlace(store, 'goal', 8, 8, ava);
  assert.equal(placeFor(store, 'goal', 8, ava), 0, 'finished: start again');
  savePlace(store, 'goal', 3, 8, ava);
  savePlace(store, 'goal', 1, 8, ava);
  assert.equal(placeFor(store, 'goal', 8, ava), 0, 'back at the cover');
});

test('only "#/…" hashes are routes: "#main" (the skip link) is an in-page jump', () => {
  for (const h of ['', '#', '#/', '#/b/x', '#!/b/x/read/2']) assert.equal(isRouteHash(h), true, h);
  for (const h of ['#main', '#gift-title', '#b/x']) assert.equal(isRouteHash(h), false, h);
});

test('every screen has its own tab title, never with the child’s name', () => {
  const book = { title: 'Goal, {name}!' };
  assert.equal(pageTitle(book), 'Goal! — a Tiffin & Me story');
  assert.equal(pageTitle(book, 'read'), 'Reading — Goal! — Tiffin & Me');
  assert.equal(pageTitle(book, 'say'), 'How we say the name — Goal! — Tiffin & Me');
  assert.equal(pageTitle(null, 'settings'), 'Settings — Tiffin & Me');
  assert.equal(pageTitle(book, 'nope'), 'Goal! — a Tiffin & Me story');
  for (const route of ['read', 'magic', 'letters', 'record', 'gift', 'settings']) assert.ok(SCREEN_TITLES[route], route);
});

test('a pronunciation guessed without the names dictionary is provisional, and upgraded when it arrives', () => {
  const guess = defaultPronunciation(null, 'Siobhán');
  assert.equal(guess.source, 'as-written');
  assert.equal(guess.provisional, true);
  const withDict = defaultPronunciation(lexicon, 'Siobhán');
  assert.equal(withDict.source, 'dictionary');
  assert.equal('provisional' in withDict, false);
  const chosen = { id: 'c2', display: 'Niamh', key: 'niamh', pronunciation: { say: 'Nee-am', source: 'custom', useRecording: false, recordingId: null } };
  const state = { profiles: [{ id: 'c1', display: 'Siobhán', key: 'siobhan', pronunciation: { ...guess, recordingId: 'rec_c1', useRecording: true } }, chosen] };
  const next = upgradePronunciations(state, lexicon);
  const s = next.profiles[0].pronunciation;
  assert.deepEqual([s.say, s.respell, s.source, s.provisional, s.recordingId, s.useRecording], ['Shi vawn', 'shih-VAWN', 'dictionary', undefined, 'rec_c1', true]);
  assert.equal(next.profiles[1], chosen, 'a grown-up’s choice is never replaced');
  assert.equal(upgradePronunciations(next, lexicon), next, 'nothing to do: same state');
  assert.equal(upgradePronunciations(state, null), state);
  assert.equal(fromSay, storedPronunciation, 'the pronunciation screen shares it');
});

test('edits started in settings go back to settings', () => {
  assert.equal(editReturn('goal', { from: 'settings' }), '#/settings');
  assert.equal(editReturn('goal', {}), '#/b/goal');
  assert.equal(editReturn('goal', undefined), '#/b/goal');
});

test('removing a child says what goes, readings made for them included', () => {
  assert.match(deleteChildMessage({ display: 'Ava' }), /Ava’s name, pronunciation, any recording of the name and any gift message/);
  assert.match(deleteChildMessage({ display: 'Ava' }, 1), /the reading recorded for Ava/);
  assert.match(deleteChildMessage({ display: 'Ava' }, 2), /the 2 readings recorded for Ava/);
});

test('"Forget everything" also forgets what is only in memory: the gift draft, name takes, the grown-ups’ pass', () => {
  const d = giftDraft('goal');
  d.childName = 'Niamh';
  d.text = 'Happy birthday!';
  scratch.put('rec_x_take', new Blob(['x']));
  markGatePassed();
  forgetInMemory();
  assert.equal(hasGiftDraft('goal'), false);
  assert.equal(giftDraft('goal').text, '');
  assert.equal(scratch.has('rec_x_take'), false);
  assert.equal(gatePassed(), false);
});

test('privacy words never promise "everything stays on this phone" once an online voice reads', () => {
  const ctx = (allow, status) => ({ state: { settings: { allowOnlineVoices: allow } }, narrator: { voiceStatus: () => status } });
  assert.equal(usingOnlineVoice(ctx(false, { usingOnline: true })), false, 'not without consent');
  assert.equal(usingOnlineVoice(ctx(true, { usingOnline: true })), true);
  assert.equal(usingOnlineVoice(ctx(true, { usingOnline: false })), false, 'a local voice was found after all');
  assert.equal(usingOnlineVoice(ctx(true, null)), true, 'can’t tell yet: assume it may be sent');
  for (const w of Object.values(PRIVACY_WORDS)) {
    assert.match(w.online, /Google or Microsoft/);
    assert.doesNotMatch(w.online, /Everything stays/);
  }
});

test('the camera check (without loading the magic window) and the blank cover’s name', () => {
  assert.equal(cameraAvailable({ navigator: { mediaDevices: { getUserMedia() {} } }, isSecureContext: true }), true);
  assert.equal(cameraAvailable({ navigator: { mediaDevices: { getUserMedia() {} } }, isSecureContext: false }), false);
  assert.equal(cameraAvailable({ navigator: {} }), false);
  assert.equal(coverLabel('Goal, {name}!', ''), `Book cover: Goal, ${BLANK_NAME}!`);
  assert.equal(coverLabel('Beep beep, {name}!', 'Ava'), 'Book cover: Beep beep, Ava!');
  assert.equal(coverLabel("{NAME}'s big day", 'Ava'), "Book cover: AVA's big day");
});
