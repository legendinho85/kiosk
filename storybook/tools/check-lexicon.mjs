// Check the pronunciation dictionary (data/names.json).
//
//   node tools/check-lexicon.mjs [path/to/names.json] [--json] [--strict]
//
// 1. Structure: required fields, IPA and "say" character sets, respellings
//    that parse, duplicate spellings across entries.
// 2. Consistency: does the respelling ("shih-VAWN") convert to roughly the
//    same sounds as the IPA ("ʃɪˈvɔːn")?
// 3. Speakability (needs espeak-ng installed): when a plain English voice
//    reads the "say" text, does it come out close to the IPA? espeak-ng is
//    only a proxy for commercial voices, so this is a warning, not an error.
//
// Exit code 1 on structural errors (or on any warning with --strict).

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { nameKey } from '../js/core/personalise.js';
import { parseRespelling, respellToIpa } from '../js/pronounce/respell.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--')) ?? new URL('../data/names.json', import.meta.url).pathname;
const asJson = args.includes('--json');
const strict = args.includes('--strict');

const IPA_OK = /^[a-zæɑɒɔəɚɛɜɪʊʌɐɨʉøœɵɤɯyʏɶçðŋɡɣɬɫɲɹɾʁʃʒθχʔʎʝβɦɕʑʂʐɟʋɰˈˌːˑ̃̊ʰʷʲ̩̯͡ .\-]+$/u;
const SAY_OK = /^[A-Za-z][A-Za-z '\-]*$/;

// Collapse IPA to coarse phoneme classes so dialect-level differences
// (æ/a, ə/ʌ/ɐ, length marks, r symbols) don't count as errors.
const MULTI = [
  ['tʃ', 'C'], ['t͡ʃ', 'C'], ['dʒ', 'J'], ['d͡ʒ', 'J'], ['eɪ', 'A'], ['aɪ', 'I'], ['ɔɪ', 'O'], ['aʊ', 'W'],
  ['əʊ', 'U'], ['oʊ', 'U'], ['ɛə', 'E'], ['eə', 'E'], ['ɪə', 'R'], ['iə', 'R'], ['ʊə', 'Q'], ['uə', 'Q'], ['ju', 'Y'],
];
const SINGLE = {
  ɹ: 'r', ɾ: 'r', r: 'r', ɐ: 'ə', ʌ: 'ə', ə: 'ə', ɚ: 'ə', æ: 'a', a: 'a', ɑ: 'ɑ', ɒ: 'o', ɔ: 'o', o: 'o',
  e: 'e', ɛ: 'e', i: 'i', ɪ: 'ɪ', ɨ: 'ɪ', u: 'u', ʊ: 'ʊ', ɜ: 'ɜ', ɡ: 'g', g: 'g', ɫ: 'l', l: 'l',
};

export function coarse(ipa) {
  let s = String(ipa).normalize('NFC').replace(/[ˈˌːˑ.\s\-̩̯ʔ]/g, '');
  for (const [k, v] of MULTI) s = s.split(k).join(v);
  return [...s].map((c) => SINGLE[c] ?? c).join('');
}

export function distance(a, b) {
  const x = [...a];
  const y = [...b];
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  return d[x.length][y.length];
}

/** Similarity 0..1 between two IPA strings at coarse phoneme level. */
export function similarity(ipaA, ipaB) {
  const a = coarse(ipaA);
  const b = coarse(ipaB);
  if (!a && !b) return 1;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

/** Index of the stressed vowel group (0-based), or -1 if unmarked. */
export function stressIndex(ipa) {
  const s = String(ipa).replace(/\s+/g, '');
  const at = s.indexOf('ˈ');
  if (at < 0) return -1;
  const before = coarse(s.slice(0, at));
  return (before.match(/[aeiouɑɒɔəɛɜɪʊAIOWUERQY]+/g) || []).length;
}

function hasEspeak() {
  try {
    execFileSync('espeak-ng', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function espeakBatch(texts) {
  // One process for everything: each text on its own line, one IPA line out.
  const out = execFileSync('espeak-ng', ['-v', 'en-gb', '-q', '--ipa'], { input: texts.join('\n'), encoding: 'utf8' });
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length === texts.length ? lines : null;
}

async function main() {
  const data = JSON.parse(await readFile(file, 'utf8'));
  const entries = data.entries ?? [];
  const errors = [];
  const warnings = [];
  const seen = new Map();
  const variants = [];

  entries.forEach((e, i) => {
    const at = `${e?.name ?? `#${i}`}`;
    if (!e?.name) return errors.push(`${at}: missing name`);
    if (!Array.isArray(e.variants) || !e.variants.length) errors.push(`${at}: no variants`);
    for (const sp of [e.name, ...(e.spellings ?? [])]) {
      const k = nameKey(sp);
      if (seen.has(k) && seen.get(k) !== e.name) warnings.push(`${at}: spelling "${sp}" also belongs to ${seen.get(k)}`);
      seen.set(k, e.name);
    }
    (e.variants ?? []).forEach((v, j) => {
      const vat = `${at} [${j + 1}]`;
      if (!v.ipa || !IPA_OK.test(v.ipa)) errors.push(`${vat}: bad ipa "${v.ipa}"`);
      if (!v.say || !SAY_OK.test(v.say)) errors.push(`${vat}: bad say "${v.say}"`);
      if (!v.label) warnings.push(`${vat}: no label`);
      if (v.respell) {
        const parsed = parseRespelling(v.respell);
        if (parsed.errors.length) errors.push(`${vat}: respelling "${v.respell}": ${parsed.errors.join('; ')}`);
        else if (v.ipa) {
          const sim = similarity(respellToIpa(v.respell), v.ipa);
          if (sim < 0.6) warnings.push(`${vat}: respelling ${v.respell} -> ${respellToIpa(v.respell)} doesn't match ipa ${v.ipa} (${sim.toFixed(2)})`);
        }
      }
      variants.push({ at: vat, entry: e.name, ...v });
    });
  });

  const speak = [];
  if (hasEspeak() && variants.length) {
    const said = espeakBatch(variants.map((v) => v.say ?? ''));
    if (said) {
      variants.forEach((v, i) => {
        const sim = similarity(said[i], v.ipa ?? '');
        const stressOk = stressIndex(v.ipa) < 0 || stressIndex(said[i]) === stressIndex(v.ipa);
        speak.push({ at: v.at, say: v.say, ipa: v.ipa, espeak: said[i], sim: Number(sim.toFixed(2)), stressOk });
        if (sim < 0.7) warnings.push(`${v.at}: "${v.say}" is read as ${said[i]}, wanted ${v.ipa} (${sim.toFixed(2)})`);
      });
    } else {
      warnings.push('espeak-ng output could not be aligned; skipped speakability check');
    }
  } else {
    warnings.push('espeak-ng not installed; skipped speakability check');
  }

  const stressMismatches = speak.filter((s) => !s.stressOk).length;
  const summary = {
    entries: entries.length,
    variants: variants.length,
    errors: errors.length,
    warnings: warnings.length,
    meanSpeakSimilarity: speak.length ? Number((speak.reduce((a, s) => a + s.sim, 0) / speak.length).toFixed(3)) : null,
    stressMismatches,
  };
  if (asJson) {
    console.log(JSON.stringify({ summary, errors, warnings, speak }, null, 2));
  } else {
    console.log(summary);
    for (const e of errors) console.log(`ERROR  ${e}`);
    for (const w of warnings) console.log(`warn   ${w}`);
  }
  if (errors.length || (strict && warnings.length)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
