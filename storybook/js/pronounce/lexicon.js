// Name pronunciation dictionary (data/names.json).
//
// File format:
// { "version": 1, "entries": [ {
//     "name": "Oisín", "spellings": ["Oisin", "Osheen"], "origin": "Irish",
//     "variants": [ { "ipa": "ɔˈʃiːn", "respell": "uh-SHEEN", "say": "A sheen", "label": "Irish" } ],
//     "note": "", "confidence": "high" } ] }
//
// `say` is plain text tuned so that ordinary TTS voices pronounce the name
// correctly; `ipa` is for engines that accept phonemes (SSML <phoneme>).

import { nameKey } from '../core/personalise.js';

/** @typedef {{ipa: string, respell: string, say: string, label: string}} Variant */
/** @typedef {{name: string, spellings?: string[], origin?: string, variants: Variant[], note?: string, confidence?: string}} Entry */

/** Build a lookup index: key -> entries (a spelling can belong to more than one entry). */
export function buildIndex(data) {
  const entries = Array.isArray(data) ? data : data?.entries ?? [];
  /** @type {Map<string, Entry[]>} */
  const index = new Map();
  for (const entry of entries) {
    if (!entry?.name || !Array.isArray(entry.variants) || entry.variants.length === 0) continue;
    for (const spelling of [entry.name, ...(entry.spellings ?? [])]) {
      const key = nameKey(spelling);
      if (!key) continue;
      const list = index.get(key) ?? [];
      if (!list.includes(entry)) list.push(entry);
      index.set(key, list);
    }
  }
  return index;
}

/**
 * Variants for a whole name. Tries the full name first ("Anne-Marie"), then
 * each part ("Mary Kate" -> Mary + Kate) and combines them.
 * @returns {Array<Variant & {origin?: string, entryName: string}>}
 */
export function lookupVariants(index, display, { maxCombos = 4 } = {}) {
  const key = nameKey(display);
  const direct = index.get(key);
  if (direct) {
    return direct.flatMap((e) => e.variants.map((v) => ({ ...v, origin: e.origin, entryName: e.name })));
  }
  const parts = String(display).split(/[ -]+/).filter(Boolean);
  if (parts.length < 2) return [];
  const perPart = parts.map((p) => {
    const found = index.get(nameKey(p));
    if (!found) return [{ ipa: '', respell: '', say: p, label: '', entryName: p, unknown: true }];
    return found.flatMap((e) => e.variants.map((v) => ({ ...v, origin: e.origin, entryName: e.name })));
  });
  if (perPart.every((vs) => vs[0].unknown)) return [];
  // Cartesian product, most-common variants first, capped.
  let combos = [[]];
  for (const vs of perPart) {
    combos = combos.flatMap((c) => vs.map((v) => [...c, v])).slice(0, maxCombos);
  }
  return combos.map((combo) => ({
    say: combo.map((v) => v.say).join(' '),
    ipa: combo.every((v) => v.ipa) ? combo.map((v) => v.ipa).join(' ') : '',
    respell: combo.every((v) => v.respell) ? combo.map((v) => v.respell).join(' ') : '',
    label: combo.map((v) => v.label).filter(Boolean).join(' + ') || 'Combined',
    origin: [...new Set(combo.map((v) => v.origin).filter(Boolean))].join(' / '),
    entryName: combo.map((v) => v.entryName).join(' '),
  }));
}

/** Find the dictionary entry for a single name, if any. */
export function findEntry(index, display) {
  return index.get(nameKey(display))?.[0] ?? null;
}
