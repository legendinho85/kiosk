// "Sounds like a character" check. If a child is called Tiffany and the
// hero is Tiffin, a toddler hearing "Tiffin passes to Tiffany" can't tell who
// is who, so the app offers a nickname for the stories instead.

import { nameKey } from './personalise.js';

/** Levenshtein edit distance. */
export function editDistance(a, b) {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

// Collapse spellings that sound alike: "Tiffany" / "Tiffani" / "Tifanie" -> "tifani".
export function soundKey(name) {
  return nameKey(name)
    .replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f')
    .replace(/ck|q|c(?=[aou])|ch(?=r)/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/[yi]e$|ey$|ee$|ie$|y$/, 'i')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1')
    .replace(/h(?![aeiou])/g, '');
}

/**
 * Characters in the book whose names a toddler could confuse with the child's.
 * @param {string} childName name used in the stories
 * @param {string[]} characters e.g. ["Tiffin", "Goose", "Frog"]
 * @returns {Array<{character: string, reason: 'same'|'sounds-like'|'starts-like'}>}
 */
export function nameClashes(childName, characters = []) {
  const child = soundKey(childName);
  if (!child) return [];
  const out = [];
  for (const character of characters) {
    const c = soundKey(character);
    if (!c) continue;
    if (child === c) {
      out.push({ character, reason: 'same' });
      continue;
    }
    const shorter = Math.min(child.length, c.length);
    const dist = editDistance(child, c);
    // Two-letter slips on longer names ("Tifini"/"Tifin"), one on short ones.
    if (dist <= (shorter >= 5 ? 2 : 1)) {
      out.push({ character, reason: 'sounds-like' });
      continue;
    }
    // Same opening sound ("Tiff" / "Tiffin"), or one name starts with the other.
    const prefix = Math.min(4, shorter);
    const startsLike = (shorter >= 4 && child.slice(0, prefix) === c.slice(0, prefix)) || (shorter >= 3 && (c.startsWith(child) || child.startsWith(c)));
    if (startsLike) out.push({ character, reason: 'starts-like' });
  }
  return out;
}

/** Parent-friendly message for the first clash, or ''. */
export function clashMessage(childName, clashes) {
  const first = clashes[0];
  if (!first) return '';
  const who = first.character;
  return first.reason === 'same'
    ? `${childName} is also the name of ${who} in this story! To help little ones follow who's who, you could use a nickname in the stories.`
    : `${childName} sounds a bit like ${who} in this story. To help little ones follow who's who, you could use a nickname in the stories.`;
}
