// The name "speech tool": turns a typed name into a short list of
// pronunciations a parent can audition and choose from.
//
// Layers, most trusted first:
//   1. dictionary  - curated pronunciations (data/names.json)
//   2. as written  - what the voice does with the plain spelling
//   3. suggestions - spelling-pattern rules for names we don't know
//   4. custom      - the parent types it how it sounds ("shih-VAWN" or "Shivawn")
//   5. heard       - the parent says it and speech recognition spells it (audio/recognise.js)
//   6. recording   - the parent's own recording is played in the story (audio/recorder.js)

import { buildIndex, lookupVariants } from './lexicon.js';
import { suggestFromRules } from './rules.js';
import { looksLikeRespelling, respellToIpa, respellToSay } from './respell.js';

export { buildIndex } from './lexicon.js';
export { respellToIpa, respellToSay, looksLikeRespelling, parseRespelling } from './respell.js';

/**
 * @typedef {{
 *   id: string, say: string, ipa: string, respell: string, label: string,
 *   source: 'dictionary'|'as-written'|'suggestion'|'custom'|'heard', origin?: string
 * }} Candidate
 */

let cached = null;

/** Fetch and index the dictionary once. Resolves to an empty index if it can't be loaded. */
export function loadLexicon(url = new URL('../../data/names.json', import.meta.url).href) {
  cached ??= fetch(url)
    .then((r) => (r.ok ? r.json() : { entries: [] }))
    .catch(() => ({ entries: [] }))
    .then((data) => buildIndex(data));
  return cached;
}

const sameSay = (a, b) => a.trim().toLocaleLowerCase('en-GB') === b.trim().toLocaleLowerCase('en-GB');

/**
 * Pronunciation choices for a name, most likely first.
 * @param {Map} index dictionary index from buildIndex()/loadLexicon()
 * @param {string} display the name as it will appear in the book
 * @returns {Candidate[]}
 */
export function getCandidates(index, display, { max = 4 } = {}) {
  /** @type {Candidate[]} */
  const out = [];
  const push = (c) => {
    if (out.length >= max || !c.say || out.some((o) => sameSay(o.say, c.say))) return;
    out.push({ ipa: '', respell: '', ...c, id: `${c.source}-${out.length}` });
  };
  const asWritten = { say: display, label: 'As written', source: 'as-written' };
  const known = index ? lookupVariants(index, display) : [];

  if (known.length) {
    for (const v of known.slice(0, Math.max(1, max - 1))) {
      push({ say: v.say, ipa: v.ipa, respell: v.respell, label: v.label || v.origin || 'Dictionary', source: 'dictionary', origin: v.origin });
    }
    push(asWritten);
  } else {
    push(asWritten);
    for (const s of suggestFromRules(display, { max })) push({ say: s.say, label: s.label, source: 'suggestion' });
  }
  return out;
}

/** A pronunciation typed by the parent: a respelling ("shih-VAWN") or a sounds-like spelling ("Shivawn"). */
export function customCandidate(text, source = 'custom') {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (looksLikeRespelling(t)) {
    return { id: source, say: respellToSay(t), ipa: respellToIpa(t), respell: t, label: source === 'heard' ? 'What we heard' : 'Your spelling', source };
  }
  return { id: source, say: t, ipa: '', respell: '', label: source === 'heard' ? 'What we heard' : 'Your spelling', source };
}

/** What gets stored on the child's profile. */
export function toPronunciation(candidate) {
  const { say, ipa = '', respell = '', label = '', source } = candidate;
  return { say, ipa, respell, label, source, useRecording: false, recordingId: null };
}
