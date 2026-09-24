// Spelling-pattern rules that suggest alternative pronunciations for names
// that are not in the dictionary. The parent listens to each suggestion and
// picks the one that sounds right (or types their own), so the rules aim for
// precision over coverage: each language style only fires on spelling
// signals that are rare in English, and at most two styles are offered.
// Output is a plain-text "say" spelling for an English TTS voice.

/**
 * @typedef {{id: string, label: string, signals?: Array<RegExp | ((s: string) => boolean)>, signal?: RegExp, steps: Array<[RegExp, string]>}} Rule
 */

// Mandarin given names are one or two pinyin syllables ("Xiao", "Zixuan").
const PINYIN_1_2 = (() => {
  const I = '(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])';
  const F = '(?:iang|iong|uang|ang|eng|ing|ong|ian|iao|uai|uan|ai|ei|ao|ou|an|en|in|un|ia|ie|iu|ua|uo|ui|er|a|o|e|i|u)';
  return new RegExp(`^${I}?${F}(?:${I}${F})?$`);
})();

/**
 * Language/orthography styles. Each has several spelling signals; the style
 * with the most matching signals wins (ties go to the earlier style), and
 * only one style is applied, so "José" is not also given a French reading.
 */
export const STYLE_RULES = [
  {
    id: 'ga',
    label: 'Irish / Gaelic style',
    signals: [/bh/, /mh/, /aoi/, /ao(dh|bh|mh|ise|in)/, /[aeiouáéíóú]dh/, /iamh|eamh/, /^(sio|sadh|seo)/, /^se[aá]n/, /ói|óí/, /[áéíóú][^áéíóú]*[áéíóú]/],
    steps: [
      [/([^aeiouy])e$/, '$1a'], [/^sio/, 'shi'], [/^seo/, 'sho'], [/^se(?=[aá])/, 'sh'], [/s(?=[ií])/g, 'sh'],
      [/^sadhbh$/, 'sive'], [/aodh$/, 'ay'], [/aodh/g, 'ayd'], [/aoibh/g, 'eev'], [/aoi/g, 'ee'], [/ao/g, 'ee'], [/iamh$/, 'eev'], [/eamh$/, 'av'],
      [/adhg$/, 'yge'], [/rs(?=[aeéií])/g, 'rsh'], [/ói/g, 'oh'], [/oi/g, 'o'],
      [/bh/g, 'v'], [/mh/g, 'v'], [/dh/g, ''], [/th/g, 'h'], [/c/g, 'k'],
      [/á/g, 'aw'], [/é/g, 'ay'], [/í/g, 'ee'], [/ó/g, 'oh'], [/ú/g, 'oo'],
    ],
  },
  {
    id: 'cy',
    label: 'Welsh style',
    signals: [/dd/, /ll/, /ff/, /^rh/, /wy/, /[ŵŷ]/, /[^aeiou]w[^aeiouy]/, /^gw[^aeiouy]/, /uw$/],
    steps: [
      [/ll/g, 'thl'], [/dd/g, 'th'], [/ff/g, '\u0001'], [/f/g, 'v'], [/\u0001/g, 'f'], [/wy/g, 'wee'],
      [/uw/g, 'ew'], [/([^aeiou])w([^aeiouy]|$)/g, '$1oo$2'], [/ŵ/g, 'oo'], [/ŷ/g, 'ee'],
      [/u(?!w)/g, 'ee'], [/y/g, 'i'], [/c/g, 'k'], [/si(?=[aeiouâ])/g, 'sh'], [/â/g, 'ah'], [/ê/g, 'ay'], [/î/g, 'ee'], [/ô/g, 'oh'],
    ],
  },
  {
    id: 'pl',
    label: 'Polish style',
    signals: [/sz/, /cz/, /rz/, /[łśćźżńąę]/, /ciech/, /^wo/, /^wi[ek]/],
    steps: [
      [/ch/g, '\u0001'], [/szcz/g, 'shch'], [/sz/g, 'sh'], [/cz/g, 'ch'], [/rz|ż/g, 'zh'], [/ś|si(?=[aeiou])/g, 'sh'],
      [/ć|ci(?=[aeiou])/g, 'ch'], [/ź|zi(?=[aeiou])/g, 'zh'], [/ń/g, 'ny'], [/ł/g, '\u0002'], [/w/g, 'v'],
      [/\u0002/g, 'w'], [/j/g, 'y'], [/ą/g, 'on'], [/ę/g, 'en'], [/c/g, 'ts'], [/y(?![aeiou])/g, 'i'],
      [/ó|u/g, 'oo'], [/\u0001/g, 'h'],
    ],
  },
  {
    id: 'zh',
    label: 'Mandarin (pinyin) style',
    signals: [(s) => PINYIN_1_2.test(s) && /x|q|zh/.test(s)],
    steps: [
      [/(^|[aeioung])zh/g, '$1j'], [/(^|[aeioung])x/g, '$1sh'], [/(^|[aeioung])q/g, '$1ch'], [/(^|[aeioung])c(?!h)/g, '$1ts'],
      [/(^|[aeioung])z/g, '$1dz'], [/ao/g, 'ow'], [/iu/g, 'yo'], [/ui/g, 'way'], [/uan/g, 'wan'], [/ong/g, 'oong'],
      [/ian/g, 'yen'], [/ei/g, 'ay'], [/ai/g, 'eye'], [/i$/, 'ee'],
    ],
  },
  {
    id: 'it',
    label: 'Italian style',
    signals: [/cch/, /gli/, /gn[aeiou]/, /[cg]i[aou]/, /zz/, /^chi|chi[aeo]/, /che$/],
    steps: [
      [/cch|ch/g, 'k'], [/gli/g, 'lyi'], [/gn/g, 'ny'], [/ci(?=[aou])/g, 'ch'], [/gi(?=[aou])/g, 'j'],
      [/c(?=[ei])/g, 'ch'], [/g(?=[ei])/g, 'j'], [/zz/g, 'ts'], [/([^aeiou])e$/, '$1ay'], [/([^aeiou])i$/, '$1ee'],
    ],
  },
  {
    id: 'es',
    label: 'Spanish / Portuguese style',
    signals: [/ñ/, /^j(ua|av|ai|org|oaq|esú)/, /^x[iae]/, /qu[ií]/, /ão/, /ç[aou]/, /[áíóú]/, /é$/, /^gui/, /ll[aeiou]/],
    steps: [
      [/ão/g, 'ow'], [/ç/g, 's'], [/ñ/g, 'ny'], [/^gui/, 'gee'], [/ll/g, 'y'], [/qu(?=[eiéí])/g, 'k'], [/j/g, 'h'], [/^x/, 'h'],
      [/g(?=[eéií])/g, 'h'], [/oa/g, 'wa'], [/ai(?=[^aeiou])/g, 'y'], [/ei/g, 'ay'],
      [/á/g, 'ah'], [/é/g, 'ay'], [/í/g, 'ee'], [/ó/g, 'oh'], [/ú/g, 'oo'], [/([^aeiou])e$/, '$1ay'],
    ],
  },
  {
    id: 'fr',
    label: 'French style',
    signals: [/eau/, /aux?$/, /oi/, /ou[^r]/, /ille$/, /[èêë]/, /ç/, /ette$/, /elle$/, /[^aeiou]ie$/, /ault$/, /ée$/, /^é/],
    steps: [
      [/eau|aux?$|au/g, 'oh'], [/oi/g, 'wah'], [/ille$/, 'ee'], [/ou/g, 'oo'], [/ée$|é|ier$|ez$|er$/g, 'ay'],
      [/[èêë]/g, 'eh'], [/ç/g, 's'], [/ch/g, 'sh'], [/j/g, 'zh'], [/g(?=[eéi])/g, 'zh'], [/qu/g, 'k'],
      [/th/g, 't'], [/ette$/, 'et'], [/elle$/, 'el'], [/ine$/, 'een'], [/ie$/, 'ee'], [/se$/, 'z'],
      [/([^aeiouy])e$/, '$1'], [/(?<=[aeiouhy])[stdx]$/, ''], [/^h/, ''],
    ],
  },
];

/** English-spelling ambiguities; these can fire alongside a style rule. */
export const ENGLISH_RULES = [
  { id: 'isl', label: 'Silent "s" ("Eye-la")', signal: /^isl/, steps: [[/^isl/, 'eyel']] },
  { id: 'long-i', label: '"Eye" sound', signal: /^i[^aeiouvsl][aeiou]/, steps: [[/^i/, 'eye']] },
  { id: 'ea-ee', label: '"Ee-a" ending', signal: /[^aeiou]eah?$/, steps: [[/eah?$/, 'eea']] },
  { id: 'ea-ay', label: '"Ay-a" ending', signal: /[^aeiou]eah?$/, steps: [[/eah?$/, 'aya']] },
  { id: 'ch-k', label: 'Hard "k"', signal: /^ch[lr]?[aeiouy]/, steps: [[/^ch/, 'k']] },
  { id: 'ch-sh', label: 'Soft "sh"', signal: /^ch[aeiouy]/, steps: [[/^ch/, 'sh']] },
  { id: 'x-z', label: '"Z" sound', signal: /^x[aeiouy]/, steps: [[/^x/, 'z']] },
  { id: 'ei-ay', label: '"Ay" sound', signal: /[^aeiou]ei[^aeiou]/, steps: [[/ei/, 'ay']] },
  { id: 'ei-ee', label: '"Ee" sound', signal: /[^aeiou]ei[^aeiou]/, steps: [[/ei/, 'ee']] },
  { id: 'ei-eye', label: '"Eye" sound', signal: /[^aeiou]ei[^aeiou]/, steps: [[/ei/, 'y']] },
  { id: 'ae-ay', label: '"Ay" sound', signal: /[^aeiou]ae[^aeiou]/, steps: [[/ae/, 'ay']] },
];

export const RULES = [...STYLE_RULES, ...ENGLISH_RULES];

const test = (sig, s) => (typeof sig === 'function' ? sig(s) : sig.test(s));

/** How strongly a style's spelling signals match (0 = not at all). */
export function styleScore(rule, lowerPart) {
  return rule.signals.filter((sig) => test(sig, lowerPart)).length;
}

function matches(rule, s) {
  return rule.signals ? styleScore(rule, s) > 0 : test(rule.signal, s);
}

function capitalise(s) {
  return s.charAt(0).toLocaleUpperCase('en-GB') + s.slice(1);
}

/** Apply one rule to a single lower-case name part. Returns null if it doesn't apply or changes nothing. */
export function applyRule(rule, lowerPart) {
  if (!matches(rule, lowerPart)) return null;
  let s = lowerPart;
  for (const [re, rep] of rule.steps) s = s.replace(re, rep);
  s = s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z\- ]/g, '');
  return s && s !== lowerPart ? s : null;
}

/** The best-matching language style for a name part, or null. */
export function bestStyle(lowerPart) {
  let best = null;
  let bestScore = 0;
  for (const rule of STYLE_RULES) {
    const score = styleScore(rule, lowerPart);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Suggest alternative "say" spellings for an unknown name.
 * @param {string} display name as shown ("Wojciech")
 * @returns {Array<{say: string, label: string, rule: string}>}
 */
export function suggestFromRules(display, { max = 3 } = {}) {
  const parts = String(display).split(/([ -])/);
  const lowerParts = parts.map((p) => p.toLocaleLowerCase('en-GB'));
  const seen = new Set([String(display).toLocaleLowerCase('en-GB')]);
  const out = [];
  const add = (rewritten, rule) => {
    const say = capitalise(rewritten.join('').replace(/-/g, ' '));
    const key = say.toLocaleLowerCase('en-GB');
    if (seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push({ say, label: rule.label, rule: rule.id });
  };
  const isSep = (p) => p === ' ' || p === '-';

  // 1. One language style per name part (each part picks its own best style).
  const styled = lowerParts.map((p) => (isSep(p) ? null : bestStyle(p)));
  if (styled.some(Boolean)) {
    const rewritten = lowerParts.map((p, i) => (styled[i] ? applyRule(styled[i], p) ?? p : p));
    if (rewritten.join('') !== lowerParts.join('')) add(rewritten, styled.find(Boolean));
  }
  // 2. English spelling ambiguities.
  for (const rule of ENGLISH_RULES) {
    let changed = false;
    const rewritten = lowerParts.map((p) => {
      if (isSep(p)) return p;
      const r = applyRule(rule, p);
      if (r) changed = true;
      return r ?? p;
    });
    if (changed) add(rewritten, rule);
  }
  return out;
}
