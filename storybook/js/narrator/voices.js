// Finding the best speech voice to read to a small British child.
//
// Every browser and device exposes a different, messy list of voices: Chrome
// adds network "Google" voices after a delay, Edge has lovely "Online
// (Natural)" voices, iOS lists dozens of languages plus joke voices like
// "Bubbles" and "Grandpa", Android sometimes uses "en_GB" instead of "en-GB",
// and Safari returns an empty list until it is ready. rankVoices() is a pure
// function over that list so it can be tested with real-world examples;
// discoverVoices() copes with the timing.

/** Joke and "Eloquence" voices on Apple devices: fun, but not for a bedtime story. */
export const NOVELTY_VOICES = [
  'Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Good News', 'Jester', 'Organ', 'Pipe Organ',
  'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox', 'Deranged', 'Hysterical', 'Princess',
  'Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley', 'Fred', 'Junior', 'Ralph',
];
const NOVELTY_RE = new RegExp(`^(?:${NOVELTY_VOICES.map((n) => n.replace(/ /g, '\\s+')).join('|')})(?:\\s*\\(|\\s*$)`, 'i');

/**
 * Voices we know read well to children, best first. Matched as whole words in
 * the voice name, so "Microsoft Sonia Online (Natural) - English (United
 * Kingdom)" matches "Sonia". Warm adult voices come before the child voice
 * (Maisie), which is charming but harder for toddlers to follow.
 */
const PREFERRED = [
  'Sonia', 'Libby', 'Serena', 'Martha', 'Kate', 'Google UK English Female', 'Ryan', 'Arthur', 'Daniel', 'Hollie',
  'Abbi', 'Bella', 'Olivia', 'Thomas', 'Oliver', 'Alfie', 'Elliot', 'Ethan', 'Noah', 'Stephanie', 'Jamie',
  'Google UK English Male', 'Hazel', 'Susan', 'George', 'Maisie',
  'Emily', 'Moira', 'Connor', 'Natasha', 'William', 'Karen', 'Catherine', 'Lee', 'Molly', 'Mitchell', 'Leah', 'Luke',
  'Tessa', 'Neerja', 'Prabhat', 'Rishi', 'Veena', 'Isha', 'Aria', 'Jenny', 'Ava', 'Samantha', 'Allison', 'Zoe',
];
const PREFERRED_RE = PREFERRED.map((n) => new RegExp(`\\b${n}\\b`, 'i'));

/** Old, robotic voices that still work but should not win. */
const DATED_RE = /^(?:Agnes|Bruce|Kathy|Vicki|Victoria)\b|espeak|e-speak|pico/i;

const REGION3 = { GBR: 'GB', USA: 'US', AUS: 'AU', IRL: 'IE', NZL: 'NZ', ZAF: 'ZA', IND: 'IN', CAN: 'CA', SGP: 'SG' };

/** "en_GB", "EN-gb", "eng-GBR", "en-Latn-GB" -> "en-GB"; "" when unknown. */
export function normaliseLang(lang) {
  const parts = String(lang ?? '').trim().replace(/_/g, '-').split('-').filter(Boolean);
  if (!parts.length) return '';
  let l = parts[0].toLowerCase();
  if (l === 'eng') l = 'en';
  let r = parts.slice(1).find((p) => /^[A-Za-z]{2,3}$|^\d{3}$/.test(p)) ?? '';
  r = r.toUpperCase();
  r = REGION3[r] ?? r;
  return r ? `${l}-${r}` : l;
}

// en-GB first; then the other Commonwealth/Irish accents; then American; then any English.
const TIER1 = ['en-IE', 'en-AU', 'en-NZ', 'en-ZA', 'en-IN'];

/** 0 = en-GB, 1 = en-IE/AU/NZ/ZA/IN, 2 = en-US, 3 = other English, 4 = not English. */
export function langTier(lang) {
  const l = normaliseLang(lang);
  if (l === 'en-GB') return 0;
  if (TIER1.includes(l)) return 1;
  if (l === 'en-US') return 2;
  if (l === 'en' || l.startsWith('en-')) return 3;
  return 4;
}

/** Name or URI marks it as a joke / Eloquence voice. */
export function isNoveltyVoice(voice) {
  const name = String(voice?.name ?? '').trim();
  const uri = String(voice?.voiceURI ?? '');
  if (NOVELTY_RE.test(name)) return true;
  if (/eloquence/i.test(uri)) return true;
  return new RegExp(`speech\\.synthesis\\.voice\\.(?:${NOVELTY_VOICES.map((n) => n.replace(/ /g, '')).join('|')})$`, 'i').test(uri);
}

/**
 * How natural a voice is likely to sound, from its name and URI.
 * @returns {{quality: 'natural'|'enhanced'|'standard'|'basic'|'novelty', score: number}}
 */
export function voiceQuality(voice) {
  if (isNoveltyVoice(voice)) return { quality: 'novelty', score: -100 };
  const text = `${voice?.name ?? ''} ${voice?.voiceURI ?? ''}`;
  if (/premium/i.test(text)) return { quality: 'natural', score: 45 };
  if (/\bnatural\b|neural|wavenet|studio|journey|chirp/i.test(text)) return { quality: 'natural', score: 42 };
  if (/\bonline\b/i.test(text)) return { quality: 'natural', score: 36 };
  if (/enhanced/i.test(text)) return { quality: 'enhanced', score: 32 };
  if (/^Google\b/i.test(String(voice?.name ?? ''))) return { quality: 'enhanced', score: 24 };
  if (/super-?compact/i.test(text)) return { quality: 'basic', score: -8 };
  if (DATED_RE.test(String(voice?.name ?? '')) || DATED_RE.test(String(voice?.voiceURI ?? ''))) return { quality: 'basic', score: -15 };
  return { quality: 'standard', score: 0 };
}

/**
 * Which kind of device we are on, for the few ranking rules that differ.
 * iPadOS reports itself as a Mac, so touch points give it away.
 * @returns {'ios'|'android'|'mac'|'windows'|'linux'|'other'}
 */
export function detectPlatform(nav = globalThis.navigator) {
  const ua = String(nav?.userAgent ?? '');
  const touch = Number(nav?.maxTouchPoints ?? 0);
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && touch > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux|CrOS/i.test(ua)) return 'linux';
  return 'other';
}

const REGION_LABEL = {
  'en-GB': 'UK', 'en-IE': 'Irish', 'en-AU': 'Australian', 'en-NZ': 'New Zealand', 'en-ZA': 'South African',
  'en-IN': 'Indian', 'en-US': 'American', 'en-CA': 'Canadian', 'en-SG': 'Singapore', 'en-SC': 'Scottish',
};

/** Short, parent-friendly name: "Microsoft Sonia Online (Natural) - English (United Kingdom)" -> "Sonia". */
export function shortVoiceName(name) {
  let s = String(name ?? '').trim();
  s = s.replace(/^Microsoft\s+/i, '');
  s = s.replace(/\s*-\s*English\b.*$/i, '');
  s = s.replace(/\s+Online\s*\(Natural\)/i, '');
  s = s.replace(/\s+Desktop\b/i, '');
  s = s.replace(/\s*\((?:Enhanced|Premium|English[^)]*\)?)\)?\s*$/i, '');
  return s.trim() || String(name ?? '');
}

/**
 * @typedef {{
 *   uri: string, name: string, lang: string, local: boolean, isDefault: boolean,
 *   label: string, quality: string, novelty: boolean, english: boolean, tier: number, rank: number,
 *   voice: any
 * }} RankedVoice
 */

/**
 * Sort voices best-first for reading an English story to a UK child.
 * Order: joke voices always last; then language tier (en-GB, then
 * IE/AU/NZ/ZA/IN, then US, then other English, then everything else); within
 * a tier, the most natural-sounding voice first (natural/neural/premium/
 * enhanced/online), with a nudge towards known-good voices, local voices on
 * phones (they work offline and start instantly), and the device default.
 *
 * @param {Array<{voiceURI?: string, name?: string, lang?: string, localService?: boolean, default?: boolean}>} voices
 * @param {{platform?: string}} [opts]
 * @returns {RankedVoice[]}
 */
export function rankVoices(voices, { platform = 'other' } = {}) {
  const seen = new Set();
  const rows = [];
  (Array.isArray(voices) ? voices : Array.from(voices ?? [])).forEach((voice, index) => {
    if (!voice) return;
    const uri = String(voice.voiceURI || voice.name || '');
    const key = `${uri}|${voice.name}|${voice.lang}`;
    if (!uri || seen.has(key)) return; // Safari sometimes lists a voice twice
    seen.add(key);
    const lang = normaliseLang(voice.lang);
    const novelty = isNoveltyVoice(voice);
    const { quality, score: q } = voiceQuality(voice);
    const tier = langTier(lang);
    const local = voice.localService !== false;
    let score = q;
    const pref = PREFERRED_RE.findIndex((re) => re.test(String(voice.name ?? '')));
    if (pref >= 0) score += 10 - pref * 0.15;
    if (voice.default) score += 3;
    if (platform === 'ios' && local) score += 15;
    if (platform === 'android' && local) score += 6;
    rows.push({
      voice,
      uri,
      name: String(voice.name ?? uri),
      lang,
      local,
      isDefault: Boolean(voice.default),
      label: `${shortVoiceName(voice.name ?? uri)}${REGION_LABEL[lang] ? ` (${REGION_LABEL[lang]})` : lang ? ` (${lang})` : ''}`,
      quality,
      novelty,
      english: tier < 4,
      tier,
      score,
      sub: tier === 1 ? TIER1.indexOf(lang) : 0,
      index,
    });
  });
  rows.sort(
    (a, b) =>
      Number(a.novelty) - Number(b.novelty) ||
      a.tier - b.tier ||
      b.score - a.score ||
      a.sub - b.sub ||
      a.index - b.index,
  );
  return rows.map(({ score, sub, index, ...row }, rank) => ({ ...row, rank: rank + 1 }));
}

/**
 * The voice to use: the parent's saved choice if it still exists, otherwise
 * the best-ranked English voice that isn't a joke voice.
 * @param {RankedVoice[]} ranked
 * @param {string|null} [voiceURI]
 * @param {Set<string>} [exclude] voices that have failed this session
 * @returns {RankedVoice|null}
 */
export function pickVoice(ranked, voiceURI = null, exclude = new Set()) {
  const ok = (r) => !exclude.has(r.uri);
  if (voiceURI) {
    const chosen = ranked.find((r) => ok(r) && r.uri === voiceURI) ?? ranked.find((r) => ok(r) && r.name === voiceURI);
    if (chosen) return chosen;
  }
  return ranked.find((r) => ok(r) && r.english && !r.novelty) ?? ranked.find(ok) ?? null;
}

/** addEventListener where available (older Safari only has onvoiceschanged). Returns an unsubscribe function. */
function listen(target, type, fn) {
  try {
    if (typeof target.addEventListener === 'function') {
      target.addEventListener(type, fn);
      return () => {
        try {
          target.removeEventListener(type, fn);
        } catch {
          /* ignore */
        }
      };
    }
    const prop = `on${type}`;
    const prev = target[prop];
    const chained = function (e) {
      try {
        prev?.call(this, e);
      } finally {
        fn(e);
      }
    };
    target[prop] = chained;
    return () => {
      if (target[prop] === chained) target[prop] = prev ?? null;
    };
  } catch {
    return () => {};
  }
}

function readVoices(synth) {
  try {
    return Array.from(synth.getVoices() ?? []);
  } catch {
    return [];
  }
}

/**
 * Wait for the voice list. Resolves as soon as any voices are known, or after
 * `timeoutMs` with whatever there is (possibly []). Never rejects.
 * Chrome fills the list asynchronously ('voiceschanged'); Safari may return
 * [] at first and never fire the event, so we also poll.
 * @returns {Promise<any[]>}
 */
export function discoverVoices(synth = globalThis.speechSynthesis, { timeoutMs = 1500, pollMs = 120 } = {}) {
  return new Promise((resolve) => {
    if (!synth || typeof synth.getVoices !== 'function') return resolve([]);
    let done = false;
    let poll = null;
    let timer = null;
    let off = () => {};
    const finish = (list) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      off();
      resolve(list);
    };
    const check = () => {
      const v = readVoices(synth);
      if (v.length) finish(v);
    };
    off = listen(synth, 'voiceschanged', check);
    check();
    if (done) return;
    poll = setInterval(check, pollMs);
    timer = setTimeout(() => finish(readVoices(synth)), timeoutMs);
  });
}

/**
 * Keep listening for voice-list changes (Chrome adds its network voices a
 * moment after the local ones). Returns an unsubscribe function.
 */
export function watchVoices(synth, onChange) {
  if (!synth || typeof synth.getVoices !== 'function') return () => {};
  return listen(synth, 'voiceschanged', () => onChange(readVoices(synth)));
}

/** Plain, serialisable description of a ranked voice (what listVoices() returns). */
export function voiceInfo(r) {
  return {
    uri: r.uri,
    name: r.name,
    lang: r.lang,
    local: r.local,
    isDefault: r.isDefault,
    label: r.label,
    quality: r.quality,
    novelty: r.novelty,
    english: r.english,
    rank: r.rank,
  };
}
