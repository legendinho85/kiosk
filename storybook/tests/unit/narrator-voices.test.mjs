import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankVoices,
  pickVoice,
  normaliseLang,
  langTier,
  isNoveltyVoice,
  voiceQuality,
  detectPlatform,
  shortVoiceName,
  discoverVoices,
  watchVoices,
} from '../../js/narrator/voices.js';

// Voice lists modelled on what real browsers report (names, langs, URIs, flags).
const v = (name, lang, extra = {}) => ({ name, lang, voiceURI: extra.voiceURI ?? name, localService: extra.local ?? true, default: Boolean(extra.default) });

const CHROME_WINDOWS = [
  v('Microsoft David - English (United States)', 'en-US', { default: true }),
  v('Microsoft Mark - English (United States)', 'en-US'),
  v('Microsoft Zira - English (United States)', 'en-US'),
  v('Microsoft George - English (United Kingdom)', 'en-GB'),
  v('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
  v('Microsoft Susan - English (United Kingdom)', 'en-GB'),
  v('Google Deutsch', 'de-DE', { local: false }),
  v('Google US English', 'en-US', { local: false }),
  v('Google UK English Female', 'en-GB', { local: false }),
  v('Google UK English Male', 'en-GB', { local: false }),
  v('Google español', 'es-ES', { local: false }),
  v('Google français', 'fr-FR', { local: false }),
];

const MAC_NOVELTY = ['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Fred', 'Junior', 'Ralph'];
const ELOQUENCE = ['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley'];

const CHROME_MAC = [
  ...MAC_NOVELTY.map((n) => v(n, 'en-US')),
  ...ELOQUENCE.flatMap((n) => [v(`${n} (English (UK))`, 'en-GB'), v(`${n} (English (US))`, 'en-US')]),
  v('Alice', 'it-IT'),
  v('Daniel', 'en-GB', { default: true }),
  v('Karen', 'en-AU'),
  v('Moira', 'en-IE'),
  v('Rishi', 'en-IN'),
  v('Samantha', 'en-US'),
  v('Tessa', 'en-ZA'),
  v('Google UK English Female', 'en-GB', { local: false }),
  v('Google UK English Male', 'en-GB', { local: false }),
  v('Google US English', 'en-US', { local: false }),
];

const EDGE_WINDOWS = [
  v('Microsoft David - English (United States)', 'en-US', { default: true }),
  v('Microsoft Hazel - English (United Kingdom)', 'en-GB'),
  v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', { local: false }),
  v('Microsoft Guy Online (Natural) - English (United States)', 'en-US', { local: false }),
  v('Microsoft Maisie Online (Natural) - English (United Kingdom)', 'en-GB', { local: false }),
  v('Microsoft Thomas Online (Natural) - English (United Kingdom)', 'en-GB', { local: false }),
  v('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB', { local: false }),
  v('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB', { local: false }),
  v('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB', { local: false }),
  v('Microsoft Emily Online (Natural) - English (Ireland)', 'en-IE', { local: false }),
  v('Microsoft Natasha Online (Natural) - English (Australia)', 'en-AU', { local: false }),
];

const apple = (name, lang, uri, extra = {}) => v(name, lang, { voiceURI: uri, ...extra });
const IOS17 = [
  apple('Martha', 'en-GB', 'com.apple.ttsbundle.siri_Martha_en-GB_compact'),
  apple('Arthur', 'en-GB', 'com.apple.ttsbundle.siri_Arthur_en-GB_compact'),
  apple('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'),
  ...ELOQUENCE.map((n) => apple(`${n} (English (UK))`, 'en-GB', `com.apple.eloquence.en-GB.${n}`)),
  ...MAC_NOVELTY.map((n) => apple(n, 'en-US', `com.apple.speech.synthesis.voice.${n.replace(/ /g, '')}`)),
  apple('Karen', 'en-AU', 'com.apple.voice.compact.en-AU.Karen'),
  apple('Moira', 'en-IE', 'com.apple.voice.compact.en-IE.Moira'),
  apple('Rishi', 'en-IN', 'com.apple.voice.compact.en-IN.Rishi'),
  apple('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha', { default: true }),
  apple('Tessa', 'en-ZA', 'com.apple.voice.compact.en-ZA.Tessa'),
  apple('Amélie', 'fr-CA', 'com.apple.voice.compact.fr-CA.Amelie'),
  apple('Anna', 'de-DE', 'com.apple.voice.compact.de-DE.Anna'),
  apple('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'), // iOS sometimes lists a voice twice
];
const IOS18 = [
  ...IOS17,
  apple('Serena (Enhanced)', 'en-GB', 'com.apple.voice.enhanced.en-GB.Serena'),
  apple('Stephanie (Enhanced)', 'en-GB', 'com.apple.voice.enhanced.en-GB.Stephanie'),
];
const SAFARI_MAC = [
  apple('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel', { default: true }),
  apple('Kate (Enhanced)', 'en-GB', 'com.apple.voice.enhanced.en-GB.Kate'),
  apple('Jamie (Premium)', 'en-GB', 'com.apple.voice.premium.en-GB.Malcolm'),
  apple('Serena (Premium)', 'en-GB', 'com.apple.voice.premium.en-GB.Serena'),
  apple('Grandma (English (UK))', 'en-GB', 'com.apple.eloquence.en-GB.Grandma'),
  apple('Bubbles', 'en-US', 'com.apple.speech.synthesis.voice.Bubbles'),
];

const ANDROID_CHROME = [
  v('English United States', 'en-US', { default: true }),
  v('English United Kingdom', 'en_GB'),
  v('English India', 'en-IN'),
  v('English Australia', 'en-AU'),
  v('Deutsch Deutschland', 'de-DE'),
  v('español Estados Unidos', 'es-US'),
];

const FIREFOX_WINDOWS = [
  apple('Microsoft David Desktop - English (United States)', 'en-US', 'urn:moz-tts:sapi:Microsoft David Desktop - English (United States)?en-US', { default: true }),
  apple('Microsoft Hazel Desktop - English (Great Britain)', 'en-GB', 'urn:moz-tts:sapi:Microsoft Hazel Desktop - English (Great Britain)?en-GB'),
  apple('Microsoft Zira Desktop - English (United States)', 'en-US', 'urn:moz-tts:sapi:Microsoft Zira Desktop - English (United States)?en-US'),
];
const FIREFOX_LINUX = [
  apple('Afrikaans', 'af', 'urn:moz-tts:speechd:Afrikaans?af'),
  apple('English (America)', 'en-US', 'urn:moz-tts:speechd:English%20(America)?en-US', { default: true }),
  apple('English (Caribbean)', 'en-029', 'urn:moz-tts:speechd:English%20(Caribbean)?en-029'),
  apple('English (Great Britain)', 'en-GB', 'urn:moz-tts:speechd:English%20(Great%20Britain)?en-GB'),
  apple('English (Scotland)', 'en-GB-scotland', 'urn:moz-tts:speechd:English%20(Scotland)?en-GB-scotland'),
];
const FIREFOX_MAC = [
  apple('Eddy (English (UK))', 'en-GB', 'urn:moz-tts:osx:com.apple.eloquence.en-GB.Eddy'),
  apple('Daniel', 'en-GB', 'urn:moz-tts:osx:com.apple.voice.compact.en-GB.Daniel'),
  apple('Samantha', 'en-US', 'urn:moz-tts:osx:com.apple.voice.compact.en-US.Samantha', { default: true }),
];

const top = (list, platform) => rankVoices(list, { platform })[0];
const names = (ranked) => ranked.map((r) => r.name);

test('normaliseLang copes with underscores, case, 3-letter codes and scripts', () => {
  assert.equal(normaliseLang('en_GB'), 'en-GB');
  assert.equal(normaliseLang('EN-gb'), 'en-GB');
  assert.equal(normaliseLang('eng-GBR'), 'en-GB');
  assert.equal(normaliseLang('en-Latn-GB'), 'en-GB');
  assert.equal(normaliseLang('en-GB-scotland'), 'en-GB');
  assert.equal(normaliseLang('en'), 'en');
  assert.equal(normaliseLang(''), '');
  assert.equal(normaliseLang(undefined), '');
  assert.equal(langTier('en_GB'), 0);
  assert.equal(langTier('en-IE'), 1);
  assert.equal(langTier('en-IN'), 1);
  assert.equal(langTier('en-US'), 2);
  assert.equal(langTier('en-029'), 3);
  assert.equal(langTier('fr-FR'), 4);
});

test('novelty and Eloquence voices are recognised by name and by URI', () => {
  for (const n of [...MAC_NOVELTY, 'Grandpa (English (UK))', 'Shelley (English (United Kingdom))', 'Bad News']) assert.ok(isNoveltyVoice({ name: n }), n);
  assert.ok(isNoveltyVoice({ name: 'Something', voiceURI: 'com.apple.eloquence.en-GB.Something' }));
  assert.ok(isNoveltyVoice({ name: 'x', voiceURI: 'com.apple.speech.synthesis.voice.BadNews' }));
  for (const n of ['Daniel', 'Microsoft Sonia Online (Natural) - English (United Kingdom)', 'Google UK English Female', 'Samantha', 'Sandra', 'Frederick']) {
    assert.ok(!isNoveltyVoice({ name: n }), n);
  }
});

test('voiceQuality spots natural, enhanced and dated voices', () => {
  assert.equal(voiceQuality({ name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)' }).quality, 'natural');
  assert.equal(voiceQuality({ name: 'Serena (Premium)', voiceURI: 'com.apple.voice.premium.en-GB.Serena' }).quality, 'natural');
  assert.equal(voiceQuality({ name: 'Kate (Enhanced)' }).quality, 'enhanced');
  assert.equal(voiceQuality({ name: 'Google UK English Female' }).quality, 'enhanced');
  assert.equal(voiceQuality({ name: 'Daniel', voiceURI: 'com.apple.voice.compact.en-GB.Daniel' }).quality, 'standard');
  assert.equal(voiceQuality({ name: 'Vicki' }).quality, 'basic');
  assert.equal(voiceQuality({ name: 'Bubbles' }).quality, 'novelty');
});

test('Chrome on Windows: the Google UK voice beats the old SAPI voices and the US default', () => {
  const ranked = rankVoices(CHROME_WINDOWS, { platform: 'windows' });
  assert.equal(ranked[0].name, 'Google UK English Female');
  // Every en-GB voice comes before any en-US voice, and non-English voices come last.
  const tiers = ranked.map((r) => r.tier);
  assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b));
  assert.equal(ranked.at(-1).english, false);
  assert.equal(ranked[0].rank, 1);
});

test('Chrome on a Mac: joke voices sink to the bottom even when they are en-GB', () => {
  const ranked = rankVoices(CHROME_MAC, { platform: 'mac' });
  assert.equal(ranked[0].name, 'Google UK English Female');
  const firstNovelty = ranked.findIndex((r) => r.novelty);
  assert.ok(firstNovelty > 0);
  assert.ok(ranked.slice(firstNovelty).every((r) => r.novelty), 'nothing ordinary after the novelty block');
  assert.equal(ranked.filter((r) => r.novelty).length, MAC_NOVELTY.length + ELOQUENCE.length * 2);
  // Daniel is the best local voice, ahead of the Irish/Australian/US ones.
  const local = ranked.filter((r) => r.local && !r.novelty);
  assert.equal(local[0].name, 'Daniel');
  assert.deepEqual(
    local.slice(1, 5).map((r) => r.lang),
    ['en-IE', 'en-AU', 'en-ZA', 'en-IN'],
  );
});

test('Edge: the natural Online voices win, Sonia first, the child voice after the adults', () => {
  const ranked = rankVoices(EDGE_WINDOWS, { platform: 'windows' });
  assert.deepEqual(names(ranked).slice(0, 3), [
    'Microsoft Sonia Online (Natural) - English (United Kingdom)',
    'Microsoft Libby Online (Natural) - English (United Kingdom)',
    'Microsoft Ryan Online (Natural) - English (United Kingdom)',
  ]);
  const maisie = ranked.findIndex((r) => /Maisie/.test(r.name));
  const thomas = ranked.findIndex((r) => /Thomas/.test(r.name));
  const hazel = ranked.findIndex((r) => /Hazel/.test(r.name));
  assert.ok(thomas < maisie && maisie < hazel, 'natural voices (even the child one) beat the old local voice');
  assert.equal(ranked[0].label, 'Sonia (UK)');
  assert.equal(ranked[0].quality, 'natural');
  assert.equal(ranked[0].local, false);
});

test('iOS 17 Safari: a Siri en-GB voice, never Eddy or Grandma; duplicates removed', () => {
  const ranked = rankVoices(IOS17, { platform: 'ios' });
  assert.equal(ranked[0].name, 'Martha');
  assert.ok(['Arthur', 'Daniel'].includes(ranked[1].name));
  assert.equal(ranked.filter((r) => r.name === 'Daniel').length, 1);
  const gb = ranked.filter((r) => r.lang === 'en-GB' && !r.novelty);
  assert.deepEqual(gb.map((r) => r.name), ['Martha', 'Arthur', 'Daniel']);
  assert.ok(ranked.findIndex((r) => r.name.startsWith('Eddy')) > ranked.findIndex((r) => r.name === 'Anna'), 'novelty after even non-English voices');
});

test('iOS 18 with a downloaded Enhanced voice: that voice wins', () => {
  assert.equal(top(IOS18, 'ios').name, 'Serena (Enhanced)');
  assert.equal(top(IOS18, 'ios').quality, 'enhanced');
});

test('Safari on a Mac: Premium beats Enhanced beats compact', () => {
  const ranked = rankVoices(SAFARI_MAC, { platform: 'mac' });
  assert.deepEqual(names(ranked).slice(0, 4), ['Serena (Premium)', 'Jamie (Premium)', 'Kate (Enhanced)', 'Daniel']);
  assert.deepEqual(names(ranked).slice(4), ['Grandma (English (UK))', 'Bubbles']);
});

test('Android Chrome: the UK voice wins despite "en_GB" and a US default', () => {
  const ranked = rankVoices(ANDROID_CHROME, { platform: 'android' });
  assert.equal(ranked[0].name, 'English United Kingdom');
  assert.equal(ranked[0].lang, 'en-GB');
  assert.deepEqual(ranked.slice(1, 3).map((r) => r.lang), ['en-AU', 'en-IN']);
  assert.equal(ranked[3].lang, 'en-US');
});

test('Firefox on Windows, Linux and Mac', () => {
  assert.equal(top(FIREFOX_WINDOWS, 'windows').name, 'Microsoft Hazel Desktop - English (Great Britain)');
  assert.equal(top(FIREFOX_WINDOWS, 'windows').label, 'Hazel (UK)');
  const linux = rankVoices(FIREFOX_LINUX, { platform: 'linux' });
  assert.equal(linux[0].name, 'English (Great Britain)');
  assert.equal(linux.at(-1).name, 'Afrikaans');
  assert.equal(top(FIREFOX_MAC, 'mac').name, 'Daniel');
});

test('on iOS local voices get a boost over network ones; on desktop they do not', () => {
  const list = [v('Kate', 'en-GB', { local: false }), v('Daniel', 'en-GB', { local: true })];
  assert.equal(top(list, 'ios').name, 'Daniel');
  assert.equal(top(list, 'windows').name, 'Kate');
});

test('rankVoices tolerates junk input', () => {
  assert.deepEqual(rankVoices([]), []);
  assert.deepEqual(rankVoices(null), []);
  assert.equal(rankVoices([null, {}, v('Daniel', 'en-GB')]).length, 1);
});

test('shortVoiceName tidies long vendor names', () => {
  assert.equal(shortVoiceName('Microsoft Sonia Online (Natural) - English (United Kingdom)'), 'Sonia');
  assert.equal(shortVoiceName('Microsoft Hazel Desktop - English (Great Britain)'), 'Hazel');
  assert.equal(shortVoiceName('Serena (Premium)'), 'Serena');
  assert.equal(shortVoiceName('Eddy (English (UK))'), 'Eddy');
  assert.equal(shortVoiceName('Google UK English Female'), 'Google UK English Female');
});

test('pickVoice honours the saved choice, skips failed voices, avoids novelty', () => {
  const ranked = rankVoices(CHROME_MAC, { platform: 'mac' });
  assert.equal(pickVoice(ranked).name, 'Google UK English Female');
  assert.equal(pickVoice(ranked, 'Moira').name, 'Moira');
  assert.equal(pickVoice(ranked, 'Bubbles').name, 'Bubbles', 'an explicit choice is respected, even a silly one');
  assert.equal(pickVoice(ranked, 'no-such-voice').name, 'Google UK English Female');
  assert.equal(pickVoice(ranked, null, new Set(['Google UK English Female'])).name, 'Google UK English Male');
  assert.equal(pickVoice(ranked, 'Moira', new Set(['Moira'])).name, 'Google UK English Female');
  assert.equal(pickVoice([], null), null);
  const onlyNovelty = rankVoices([v('Bubbles', 'en-US')]);
  assert.equal(pickVoice(onlyNovelty).name, 'Bubbles', 'better a silly voice than none');
});

test('detectPlatform, including iPadOS pretending to be a Mac', () => {
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15' }), 'ios');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 }), 'ios');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 0 }), 'mac');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/128' }), 'android');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'windows');
  assert.equal(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), 'linux');
  assert.equal(detectPlatform(undefined), 'other');
});

// ---- discovery timing ---------------------------------------------------------

class FakeSynth extends EventTarget {
  constructor(voices = []) {
    super();
    this.voices = voices;
  }
  getVoices() {
    return this.voices;
  }
}

test('discoverVoices resolves at once when voices are already there', async () => {
  const list = await discoverVoices(new FakeSynth(IOS17), { timeoutMs: 50 });
  assert.equal(list.length, IOS17.length);
});

test('discoverVoices waits for voiceschanged (Chrome)', async () => {
  const synth = new FakeSynth();
  setTimeout(() => {
    synth.voices = CHROME_WINDOWS;
    synth.dispatchEvent(new Event('voiceschanged'));
  }, 20);
  const t0 = Date.now();
  const list = await discoverVoices(synth, { timeoutMs: 1000, pollMs: 500 });
  assert.equal(list.length, CHROME_WINDOWS.length);
  assert.ok(Date.now() - t0 < 400);
});

test('discoverVoices polls when the event never fires (Safari), and only has onvoiceschanged', async () => {
  const synth = { voices: [], getVoices() { return this.voices; }, onvoiceschanged: null };
  setTimeout(() => (synth.voices = SAFARI_MAC), 30);
  const list = await discoverVoices(synth, { timeoutMs: 1000, pollMs: 10 });
  assert.equal(list.length, SAFARI_MAC.length);
  assert.equal(synth.onvoiceschanged, null, 'restores the property afterwards');
});

test('discoverVoices gives up with [] on time, and copes with no engine or a throwing one', async () => {
  const t0 = Date.now();
  assert.deepEqual(await discoverVoices(new FakeSynth(), { timeoutMs: 60, pollMs: 10 }), []);
  assert.ok(Date.now() - t0 < 500);
  assert.deepEqual(await discoverVoices(undefined), []);
  assert.deepEqual(await discoverVoices({ getVoices() { throw new Error('nope'); } }, { timeoutMs: 30 }), []);
});

test('watchVoices reports later additions (Chrome network voices arrive late)', () => {
  const synth = new FakeSynth(CHROME_WINDOWS.slice(0, 3));
  const seen = [];
  const off = watchVoices(synth, (list) => seen.push(list.length));
  synth.voices = CHROME_WINDOWS;
  synth.dispatchEvent(new Event('voiceschanged'));
  off();
  synth.dispatchEvent(new Event('voiceschanged'));
  assert.deepEqual(seen, [CHROME_WINDOWS.length]);
});
