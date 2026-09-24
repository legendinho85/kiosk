// Online voices are opt-in (architecture §11): voices with localService ===
// false send the words they read — including the child's name — to Google or
// Microsoft, so the narrator only uses them once settings.allowOnlineVoices is
// true. Voice lists are modelled on what real browsers report.

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createNarrator } from '../../js/narrator/narrator.js';
import { rankVoices, pickVoice, usableVoices, voiceStatusOf } from '../../js/narrator/voices.js';
import { planLines } from '../../js/narrator/plan.js';
import { person } from '../../js/core/personalise.js';

const v = (name, lang, extra = {}) => ({ name, lang, voiceURI: extra.voiceURI ?? name, localService: extra.local ?? true, default: Boolean(extra.default) });
const online = (name, lang) => v(name, lang, { local: false });

// Chrome on Windows 11 (UK): SAPI voices on the device + Google's network voices.
const CHROME_WINDOWS = [
  v('Microsoft David - English (United States)', 'en-US', { default: true }),
  v('Microsoft Mark - English (United States)', 'en-US'),
  v('Microsoft Zira - English (United States)', 'en-US'),
  v('Microsoft George - English (United Kingdom)', 'en-GB'),
  v('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
  v('Microsoft Susan - English (United Kingdom)', 'en-GB'),
  online('Google Deutsch', 'de-DE'),
  online('Google US English', 'en-US'),
  online('Google UK English Female', 'en-GB'),
  online('Google UK English Male', 'en-GB'),
  online('Google español', 'es-ES'),
  online('Google français', 'fr-FR'),
  online('Google 日本語', 'ja-JP'),
];

// Chrome on a Mac: macOS voices (local) + Google's network voices.
const CHROME_MAC = [
  v('Daniel', 'en-GB', { default: true }),
  v('Karen', 'en-AU'),
  v('Moira', 'en-IE'),
  v('Samantha', 'en-US'),
  v('Bubbles', 'en-US'),
  v('Grandma (English (UK))', 'en-GB'),
  online('Google UK English Female', 'en-GB'),
  online('Google UK English Male', 'en-GB'),
  online('Google US English', 'en-US'),
];

// Edge on Windows: two local SAPI voices, lots of "Online (Natural)" ones.
const EDGE_WINDOWS = [
  v('Microsoft David - English (United States)', 'en-US', { default: true }),
  v('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
  v('Microsoft George - English (United Kingdom)', 'en-GB'),
  online('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
  online('Microsoft Guy Online (Natural) - English (United States)', 'en-US'),
  online('Microsoft Maisie Online (Natural) - English (United Kingdom)', 'en-GB'),
  online('Microsoft Thomas Online (Natural) - English (United Kingdom)', 'en-GB'),
  online('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB'),
  online('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB'),
  online('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB'),
  online('Microsoft Emily Online (Natural) - English (Ireland)', 'en-IE'),
  online('Microsoft Natasha Online (Natural) - English (Australia)', 'en-AU'),
  online('Microsoft Katja Online (Natural) - German (Germany)', 'de-DE'),
];

// Chromium on Linux with no speech-dispatcher voices: only Google's network voices.
const CHROME_LINUX_BARE = [
  online('Google US English', 'en-US'),
  online('Google UK English Female', 'en-GB'),
  online('Google UK English Male', 'en-GB'),
  online('Google Deutsch', 'de-DE'),
];

// A German Windows PC in Chrome: the only on-device voice is German.
const CHROME_WINDOWS_DE = [
  v('Microsoft Hedda - German (Germany)', 'de-DE', { default: true }),
  v('Microsoft Katja - German (Germany)', 'de-DE'),
  online('Google Deutsch', 'de-DE'),
  online('Google UK English Female', 'en-GB'),
  online('Google US English', 'en-US'),
];

const apple = (name, lang, uri, extra = {}) => v(name, lang, { voiceURI: uri, ...extra });
// Safari on macOS: every voice is on the device.
const SAFARI_MAC = [
  apple('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel', { default: true }),
  apple('Kate (Enhanced)', 'en-GB', 'com.apple.voice.enhanced.en-GB.Kate'),
  apple('Serena (Premium)', 'en-GB', 'com.apple.voice.premium.en-GB.Serena'),
  apple('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha'),
  apple('Grandma (English (UK))', 'en-GB', 'com.apple.eloquence.en-GB.Grandma'),
  apple('Bubbles', 'en-US', 'com.apple.speech.synthesis.voice.Bubbles'),
];
// iOS 17 Safari: on-device Siri and compact voices.
const IOS17 = [
  apple('Martha', 'en-GB', 'com.apple.ttsbundle.siri_Martha_en-GB_compact'),
  apple('Arthur', 'en-GB', 'com.apple.ttsbundle.siri_Arthur_en-GB_compact'),
  apple('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'),
  apple('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha', { default: true }),
  apple('Karen', 'en-AU', 'com.apple.voice.compact.en-AU.Karen'),
  apple('Eddy (English (UK))', 'en-GB', 'com.apple.eloquence.en-GB.Eddy'),
  apple('Anna', 'de-DE', 'com.apple.voice.compact.de-DE.Anna'),
];

// ---- A minimal fake speechSynthesis on mock timers -----------------------------

class FakeUtterance {
  constructor(text) {
    Object.assign(this, { text, voice: null, lang: '', rate: 1, pitch: 1, volume: 1 });
    this.onstart = this.onend = this.onerror = this.onboundary = null;
  }
}

class FakeSynth extends EventTarget {
  constructor(voices) {
    super();
    this.voices = voices;
    this.spoken = [];
    this.speaking = false;
    this.pending = false;
    this.paused = false;
    this.timers = [];
    this.current = null;
  }
  getVoices() {
    return this.voices;
  }
  speak(u) {
    this.spoken.push(u);
    this.current = u;
    this.speaking = true;
    const words = [...u.text.matchAll(/\S+/g)];
    const at = (ms, fn) => this.timers.push(setTimeout(() => this.current === u && fn(), ms));
    at(10, () => u.onstart?.({}));
    words.forEach((m, i) => at(10 + i * 100, () => u.onboundary?.({ name: 'word', charIndex: m.index })));
    at(10 + Math.max(1, words.length) * 100, () => {
      this.speaking = false;
      this.current = null;
      u.onend?.({});
    });
  }
  cancel() {
    const u = this.current;
    this.timers.splice(0).forEach(clearTimeout);
    this.speaking = false;
    this.current = null;
    if (u) setTimeout(() => u.onerror?.({ error: 'interrupted' }), 0);
  }
  resume() {
    this.paused = false;
  }
}

const flush = () => new Promise((r) => setImmediate(r));
async function advance(ms, step = 5) {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(step);
    await flush();
  }
}

/** settings is a live object: tests flip allowOnlineVoices / voiceURI on it. */
function setup(voices, { platform = 'windows', ...settings } = {}) {
  const synth = new FakeSynth(voices);
  const s = { voiceURI: null, rate: 0.9, pitch: 1.05, allowOnlineVoices: false, ...settings };
  const narrator = createNarrator({ getSettings: () => s, synth, Utterance: FakeUtterance, platform });
  return { synth, narrator, settings: s };
}

const isOnline = (u) => u.voice && u.voice.localService === false;
const siobhan = person('Siobhan', 'Shi vawn');

async function read(narrator, lines, who = siobhan) {
  const seen = [];
  const plan = planLines(lines, who);
  const p = narrator.play(plan, { onUnit: (l, u) => seen.push(`${l}:${u}`) });
  let result;
  p.then((r) => (result = r));
  await advance(8000);
  const total = plan.lines.reduce((n, l) => n + l.units.length, 0);
  return { result, seen, total };
}

test.beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
  delete globalThis.SB_TEST;
});
test.afterEach(() => {
  mock.timers.reset();
});

// ---- Pure helpers ---------------------------------------------------------------

test('usableVoices: on-device voices only without consent; everything with it', () => {
  const ranked = rankVoices(CHROME_WINDOWS, { platform: 'windows' });
  assert.ok(usableVoices(ranked, false).every((r) => r.local));
  assert.equal(usableVoices(ranked, false).length, 6);
  assert.equal(usableVoices(ranked, true).length, ranked.length);
  // Only online English voices (and a local German one): nothing may read the English story.
  assert.deepEqual(usableVoices(rankVoices(CHROME_WINDOWS_DE), false), []);
  assert.deepEqual(usableVoices(rankVoices(CHROME_LINUX_BARE), false), []);
  // No English anywhere: the device's own voices are kept (as before round 2).
  const germanOnly = rankVoices([v('Anna', 'de-DE'), online('Google Deutsch', 'de-DE')]);
  assert.deepEqual(usableVoices(germanOnly, false).map((r) => r.name), ['Anna']);
});

test('pickVoice: a saved online voice falls back to the best on-device voice without consent', () => {
  const ranked = rankVoices(CHROME_WINDOWS, { platform: 'windows' });
  assert.equal(pickVoice(ranked, null, new Set(), { allowOnline: true }).name, 'Google UK English Female');
  assert.equal(pickVoice(ranked, null, new Set(), { allowOnline: false }).name, 'Microsoft Hazel - English (United Kingdom)');
  assert.equal(pickVoice(ranked, 'Google UK English Male', new Set(), { allowOnline: false }).name, 'Microsoft Hazel - English (United Kingdom)');
  assert.equal(pickVoice(ranked, 'Google UK English Male', new Set(), { allowOnline: true }).name, 'Google UK English Male');
  assert.equal(pickVoice(ranked, 'Microsoft Susan - English (United Kingdom)', new Set(), { allowOnline: false }).name, 'Microsoft Susan - English (United Kingdom)');
  assert.equal(pickVoice(ranked).name, 'Google UK English Female', 'the default (no options) is unchanged for existing callers');
  assert.equal(pickVoice(rankVoices(CHROME_LINUX_BARE), null, new Set(), { allowOnline: false }), null);
});

test('voiceStatusOf counts on-device and online voices and spots when consent is needed', () => {
  const ranked = rankVoices(EDGE_WINDOWS, { platform: 'windows' });
  assert.deepEqual(voiceStatusOf(ranked, { allowOnline: false, current: ranked.find((r) => r.local) }), {
    local: 3,
    online: 9, // English only: Katja (German) isn't shown
    usingOnline: false,
    needsConsent: false,
  });
  assert.equal(voiceStatusOf(ranked, { allowOnline: true, current: ranked[0] }).usingOnline, true);
  assert.deepEqual(voiceStatusOf(rankVoices(CHROME_LINUX_BARE), { allowOnline: false }), { local: 0, online: 3, usingOnline: false, needsConsent: true });
  assert.equal(voiceStatusOf(rankVoices(CHROME_LINUX_BARE), { allowOnline: true, current: null }).needsConsent, false);
  assert.equal(voiceStatusOf(rankVoices(CHROME_WINDOWS_DE), { allowOnline: false }).needsConsent, true);
  assert.deepEqual(voiceStatusOf([], {}), { local: 0, online: 0, usingOnline: false, needsConsent: false });
});

// ---- The narrator ---------------------------------------------------------------

test('Chrome on Windows, consent off: Hazel (on device) reads; Google voices are listed, flagged online, never used', async () => {
  const { synth, narrator } = setup(CHROME_WINDOWS);
  const list = await narrator.ready;
  assert.equal(list[0].name, 'Google UK English Female', 'ranking is unchanged: settings still show the best voices');
  assert.equal(list[0].online, true);
  assert.equal(list.find((x) => /Hazel/.test(x.name)).online, false);
  assert.ok(list.every((x) => typeof x.online === 'boolean'));
  assert.equal(narrator.currentVoice().name, 'Microsoft Hazel - English (United Kingdom)');
  assert.deepEqual(narrator.voiceStatus(), { local: 6, online: 3, usingOnline: false, needsConsent: false });

  narrator.unlock();
  const r = await read(narrator, ['Pass, pass, pass to {name}!', 'Goal, {name}!']);
  assert.equal(r.result, 'done');
  assert.equal(r.seen.length, r.total);
  assert.ok(synth.spoken.length >= 3);
  assert.ok(!synth.spoken.some(isOnline), `online voice used: ${synth.spoken.filter(isOnline).map((u) => u.voice.name)}`);
  assert.ok(synth.spoken.filter((u) => u.volume > 0).every((u) => /Hazel/.test(u.voice.name)));
});

test('Chrome on Windows, consent given: the Google UK voice reads, and voiceStatus says so', async () => {
  const { synth, narrator } = setup(CHROME_WINDOWS, { allowOnlineVoices: true });
  await narrator.ready;
  assert.equal(narrator.currentVoice().name, 'Google UK English Female');
  assert.equal(narrator.currentVoice().online, true);
  assert.deepEqual(narrator.voiceStatus(), { local: 6, online: 3, usingOnline: true, needsConsent: false });
  const r = await read(narrator, ['Hello {name}.']);
  assert.equal(r.result, 'done');
  assert.ok(synth.spoken.every((u) => u.voice.name === 'Google UK English Female'));
});

test('a saved online voiceURI falls back to the best on-device voice until consent is given', async () => {
  const { synth, narrator, settings } = setup(CHROME_MAC, { platform: 'mac', voiceURI: 'Google UK English Male' });
  await narrator.ready;
  assert.equal(narrator.currentVoice().name, 'Daniel');
  await read(narrator, ['Goal, {name}!']);
  assert.ok(synth.spoken.every((u) => u.voice.name === 'Daniel'));
  settings.allowOnlineVoices = true;
  assert.equal(narrator.currentVoice().name, 'Google UK English Male');
  assert.equal(narrator.voiceStatus().usingOnline, true);
});

test('previewing an online voice without consent speaks with an on-device voice instead', async () => {
  const { synth, narrator } = setup(EDGE_WINDOWS);
  await narrator.ready;
  const p = narrator.speakText('Hello Siobhan! Ready to play?', { voiceURI: 'Microsoft Sonia Online (Natural) - English (United Kingdom)' });
  await advance(3000);
  assert.equal(await p, 'done');
  assert.equal(synth.spoken.length, 1);
  assert.equal(synth.spoken[0].voice.name, 'Microsoft Hazel - English (United Kingdom)');
});

test('Edge: consent off reads with Hazel, consent on with Sonia (Online, Natural)', async () => {
  const { synth, narrator, settings } = setup(EDGE_WINDOWS);
  const list = await narrator.ready;
  assert.equal(list.length, 12);
  assert.ok(/Sonia/.test(list[0].name) && list[0].online);
  assert.deepEqual(narrator.voiceStatus(), { local: 3, online: 9, usingOnline: false, needsConsent: false });
  await read(narrator, ['Tiffin to {name}... thud!']);
  assert.ok(synth.spoken.every((u) => /Hazel/.test(u.voice.name)));
  settings.allowOnlineVoices = true;
  synth.spoken.length = 0;
  await read(narrator, ['Tiffin to {name}... thud!']);
  assert.ok(synth.spoken.length > 0 && synth.spoken.every((u) => /Sonia/.test(u.voice.name)));
});

test('only online voices (Chromium on Linux): silent timed mode with highlighting, needsConsent, and not a single utterance', async () => {
  const { synth, narrator, settings } = setup(CHROME_LINUX_BARE, { platform: 'linux' });
  const list = await narrator.ready;
  assert.equal(list.length, 3, 'the online voices are still listed for settings');
  assert.ok(list.every((x) => x.online));
  assert.equal(narrator.mode, 'silent');
  assert.equal(narrator.hasVoice(), false);
  assert.equal(narrator.currentVoice(), null);
  assert.deepEqual(narrator.voiceStatus(), { local: 0, online: 3, usingOnline: false, needsConsent: true });

  narrator.unlock(); // a tap must not wake a network voice either
  const r = await read(narrator, ['Pass, pass, pass to {name}!', 'Goal!']);
  assert.equal(r.result, 'done');
  assert.equal(r.seen.length, r.total, 'every word still lights up');
  const said = narrator.speakText('Siobhan');
  await advance(2000);
  assert.equal(await said, 'done');
  assert.equal(synth.spoken.length, 0, `spoke: ${synth.spoken.map((u) => JSON.stringify(u.text))}`);

  // The grown-up agrees: speech with the Google UK voice from the next sentence on.
  settings.allowOnlineVoices = true;
  assert.equal(narrator.mode, 'speech');
  assert.deepEqual(narrator.voiceStatus(), { local: 0, online: 3, usingOnline: true, needsConsent: false });
  const r2 = await read(narrator, ['Goal, {name}!']);
  assert.equal(r2.result, 'done');
  assert.ok(synth.spoken.length > 0 && synth.spoken.every((u) => u.voice.name === 'Google UK English Female'));
});

test('no on-device English voice (German PC): silent rather than reading the story in German, until consent', async () => {
  const { synth, narrator } = setup(CHROME_WINDOWS_DE);
  await narrator.ready;
  assert.equal(narrator.mode, 'silent');
  assert.equal(narrator.voiceStatus().needsConsent, true);
  narrator.unlock(); // may borrow the on-device German voice to wake the engine, silently
  const r = await read(narrator, ['Hello {name}.']);
  assert.equal(r.result, 'done');
  assert.equal(r.seen.length, r.total);
  assert.ok(!synth.spoken.some(isOnline));
  assert.ok(synth.spoken.every((u) => u.volume === 0), 'nothing audible in German');
});

test('withdrawing consent mid-story switches to an on-device voice from the next sentence', async () => {
  const { synth, narrator, settings } = setup(CHROME_WINDOWS, { allowOnlineVoices: true });
  await narrator.ready;
  const plan = planLines(['One two three.', 'Four five six.'], person('Ava'));
  let result;
  narrator.play(plan).then((r) => (result = r));
  await advance(100);
  assert.equal(synth.spoken[0].voice.name, 'Google UK English Female');
  settings.allowOnlineVoices = false;
  await advance(3000);
  assert.equal(result, 'done');
  assert.equal(synth.spoken.length, 2);
  assert.equal(synth.spoken[1].voice.name, 'Microsoft Hazel - English (United Kingdom)');
});

test('Safari on a Mac and on iOS: every voice is on the device, so consent changes nothing', async () => {
  for (const [voices, platform, best] of [
    [SAFARI_MAC, 'mac', 'Serena (Premium)'],
    [IOS17, 'ios', 'Martha'],
  ]) {
    const { synth, narrator } = setup(voices, { platform });
    await narrator.ready;
    assert.equal(narrator.currentVoice().name, best);
    const status = narrator.voiceStatus();
    assert.equal(status.online, 0);
    assert.equal(status.needsConsent, false);
    assert.equal(status.usingOnline, false);
    assert.ok(status.local >= 5);
    narrator.unlock();
    const r = await read(narrator, ['Night night, {name}.']);
    assert.equal(r.result, 'done');
    assert.ok(synth.spoken.filter((u) => u.volume > 0).every((u) => u.voice.name === best));
  }
});

test('voices that arrive late (Chrome adds its network voices after a moment) are counted, never auto-used', async () => {
  const synthVoices = CHROME_WINDOWS.filter((x) => x.localService);
  const { synth, narrator } = setup(synthVoices);
  await narrator.ready;
  assert.deepEqual(narrator.voiceStatus(), { local: 6, online: 0, usingOnline: false, needsConsent: false });
  synth.voices = CHROME_WINDOWS;
  synth.dispatchEvent(new Event('voiceschanged'));
  assert.deepEqual(narrator.voiceStatus(), { local: 6, online: 3, usingOnline: false, needsConsent: false });
  assert.equal(narrator.currentVoice().name, 'Microsoft Hazel - English (United Kingdom)');
});

test('no speech engine at all: voiceStatus is all zeros and never asks for consent', async () => {
  const narrator = createNarrator({ getSettings: () => ({}), synth: undefined, Utterance: undefined });
  await narrator.ready;
  assert.deepEqual(narrator.voiceStatus(), { local: 0, online: 0, usingOnline: false, needsConsent: false });
});
