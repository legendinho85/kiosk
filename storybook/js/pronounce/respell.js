// Pronunciation respelling ("shih-VAWN") -> IPA ("ʃɪˈvɔːn") and -> text that a
// plain text-to-speech voice will read the right way ("Shi vawn").
//
// House key (based on Wikipedia's English respelling key, British targets):
//   a /æ/ cat · ah /ɑː/ father · ar /ɑː/ car · air /ɛə/ hair · aw /ɔː/ law
//   ay /eɪ/ day · e, eh /ɛ/ bed · ee /iː/ see · eer /ɪə/ near · ew /juː/ few
//   i, ih /ɪ/ sit · eye, igh /aɪ/ (and y as a syllable's vowel: "MY-luh")
//   o /ɒ/ hot · oh /əʊ/ go · oo /uː/ food · uu /ʊ/ book · oor /ʊə/ · or /ɔː/ for
//   ow /aʊ/ now · oy /ɔɪ/ boy · u /ʌ/ cup · uh /ə/ (schwa) · ur /ɜː/ fur
//   ch /tʃ/ · j /dʒ/ · sh /ʃ/ · zh /ʒ/ · th /θ/ thin · dh /ð/ this · ng /ŋ/
//   kh /x/ loch · hl /ɬ/ Welsh ll · g always hard · y /j/ before a vowel
// Syllables are separated by hyphens, words by spaces; the stressed syllable
// is written in CAPITALS. Parents rarely follow a key exactly, so the parser
// is lenient (it also understands ai, ey, ea, oa, ou, er, ph, ck, x, c, q...).

// Vowel spellings, longest first. `r` marks r-coloured vowels, whose /r/ is
// only pronounced before a vowel (British English is non-rhotic).
const VOWELS = [
  ['err', 'ɛr'], ['arr', 'ær'], ['irr', 'ɪr'], ['orr', 'ɒr'], ['urr', 'ʌr'],
  ['eye', 'aɪ'], ['igh', 'aɪ'], ['air', 'ɛə', 'r'], ['are', 'ɛə', 'r'], ['eer', 'ɪə', 'r'], ['ear', 'ɪə', 'r'],
  ['oor', 'ʊə', 'r'], ['our', 'aʊə', 'r'],
  ['ah', 'ɑː'], ['ar', 'ɑː', 'r'], ['aw', 'ɔː'], ['ay', 'eɪ'], ['ai', 'eɪ'], ['ey', 'eɪ'], ['eh', 'ɛ'],
  ['ee', 'iː'], ['ea', 'iː'], ['ew', 'juː'], ['ih', 'ɪ'], ['oh', 'əʊ'], ['oa', 'əʊ'], ['oo', 'uː'],
  ['uu', 'ʊ'], ['or', 'ɔː', 'r'], ['ow', 'aʊ'], ['ou', 'aʊ'], ['oy', 'ɔɪ'], ['oi', 'ɔɪ'], ['uh', 'ə'],
  ['ur', 'ɜː', 'r'], ['er', 'ɜː', 'r'], ['ue', 'uː'], ['ə', 'ə'],
  ['a', 'æ'], ['e', 'ɛ'], ['i', 'ɪ'], ['o', 'ɒ'], ['u', 'ʌ'],
];

const CONSONANTS = [
  ['tch', 'tʃ'], ['ch', 'tʃ'], ['sh', 'ʃ'], ['zh', 'ʒ'], ['th', 'θ'], ['dh', 'ð'], ['ng', 'ŋ'], ['kh', 'x'],
  ['hl', 'ɬ'], ['ph', 'f'], ['wh', 'w'], ['ck', 'k'], ['qu', 'kw'], ['dj', 'dʒ'],
  ['b', 'b'], ['c', 'k'], ['d', 'd'], ['f', 'f'], ['g', 'ɡ'], ['h', 'h'], ['j', 'dʒ'], ['k', 'k'], ['l', 'l'],
  ['m', 'm'], ['n', 'n'], ['p', 'p'], ['q', 'k'], ['r', 'r'], ['s', 's'], ['t', 't'], ['v', 'v'], ['w', 'w'],
  ['x', 'ks'], ['z', 'z'],
];

const VOWEL_START = /^(err|arr|irr|orr|urr|eye|igh|air|are|eer|ear|oor|our|ah|ar|aw|ay|ai|ey|eh|ee|ea|ew|ih|oh|oa|oo|uu|or|ow|ou|oy|oi|uh|ur|er|ue|ə|[aeiouy])/;

function isStressed(syl) {
  const letters = syl.replace(/[^A-Za-z]/g, '');
  return letters.length > 0 && letters === letters.toUpperCase() && /[A-Z]/.test(letters);
}

/**
 * Parse a respelling into syllables of phonemes.
 * @returns {{words: Array<Array<{text: string, stressed: boolean, phonemes: Array<{ipa: string, vowel: boolean, rColoured?: boolean}>}>>, errors: string[]}}
 */
export function parseRespelling(input) {
  const errors = [];
  const words = String(input ?? '')
    .trim()
    .replace(/[‐-―]/g, '-')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const syllables = word.split(/-+/).filter(Boolean);
      // If the parent capitalised only the first letter ("Shivawn") that is not a stress mark.
      const explicitStress = syllables.length > 1 && syllables.some(isStressed) && !syllables.every(isStressed);
      return syllables.map((text) => {
        const stressed = explicitStress && isStressed(text);
        const s = text.toLowerCase().replace(/[^a-zə]/g, (c) => {
          errors.push(`Unexpected character "${c}" in "${text}"`);
          return '';
        });
        const phonemes = [];
        let i = 0;
        let sawVowel = false;
        while (i < s.length) {
          const rest = s.slice(i);
          // "y" is the consonant /j/ at the start of a syllable before a vowel
          // ("YEL-uh") or between vowels ("KY-yuh"); otherwise it is the vowel
          // /aɪ/ ("kye", "MY-luh").
          if (rest[0] === 'y') {
            const next = rest.slice(1);
            const prev = phonemes[phonemes.length - 1];
            if (rest === 'ye' && i > 0) {
              phonemes.push({ ipa: 'aɪ', vowel: true });
              sawVowel = true;
              i += 2;
              continue;
            }
            if (VOWEL_START.test(next) && !/^y/.test(next) && (i === 0 || (prev && prev.vowel))) {
              phonemes.push({ ipa: 'j', vowel: false });
            } else {
              phonemes.push({ ipa: 'aɪ', vowel: true });
              sawVowel = true;
            }
            i += 1;
            continue;
          }
          // A final "e" after a consonant is silent when the syllable already has a vowel ("TYGE").
          if (rest === 'e' && sawVowel && phonemes.length && !phonemes[phonemes.length - 1].vowel) {
            i += 1;
            continue;
          }
          const v = VOWELS.find(([k]) => rest.startsWith(k));
          const c = CONSONANTS.find(([k]) => rest.startsWith(k));
          // Prefer the longer match; ties go to vowels ("ow" vs "o"+"w").
          if (v && (!c || v[0].length >= c[0].length)) {
            phonemes.push({ ipa: v[1], vowel: true, rColoured: v[2] === 'r', src: v[0] });
            sawVowel = true;
            i += v[0].length;
          } else if (c) {
            const prev = phonemes[phonemes.length - 1];
            // Doubled letters are one sound ("ll", "nn"), except inside digraphs.
            if (!(prev && !prev.vowel && prev.ipa === c[1] && c[0].length === 1 && s[i - 1] === s[i])) {
              phonemes.push({ ipa: c[1], vowel: false });
            }
            i += c[0].length;
          } else {
            i += 1;
          }
        }
        if (!sawVowel && phonemes.length) errors.push(`No vowel in syllable "${text}"`);
        return { text, stressed, phonemes };
      });
    });
  return { words, errors };
}

/** "shih-VAWN" -> "ʃɪˈvɔːn"; "EYE-luh" -> "ˈaɪlə"; "MAIR-ee" -> "ˈmɛəriː". */
export function respellToIpa(input) {
  const { words } = parseRespelling(input);
  return words
    .map((syllables) => {
      const flat = [];
      syllables.forEach((syl) => syl.phonemes.forEach((p, pi) => flat.push({ ...p, stressMark: syl.stressed && pi === 0 })));
      let out = '';
      flat.forEach((p, i) => {
        if (p.stressMark) out += 'ˈ';
        const beforeVowel = Boolean(flat[i + 1]?.vowel);
        // "er" before a vowel is /ɛr/ as in "Eric"; otherwise it is /ɜː/.
        out += p.src === 'er' && beforeVowel ? 'ɛ' : p.ipa;
        // Linking r: an r-coloured vowel only sounds its /r/ before another vowel.
        if (p.rColoured && beforeVowel) out += 'r';
      });
      // An unstressed "er" at the end of a word is a schwa ("PET-er" -> ˈpɛtə).
      const last = syllables[syllables.length - 1];
      if (syllables.length > 1 && last && !last.stressed) out = out.replace(/ɜː$/, 'ə');
      return out;
    })
    .join(' ');
}

// Spellings that plain TTS voices read reliably.
function syllableToSayText(text, { stressed, final, alone }) {
  let s = text.toLowerCase().replace(/[^a-z]/g, '');
  s = s.replace(/dh/g, 'th').replace(/kh/g, 'k').replace(/hl/g, 'thl');
  if (!stressed) {
    if (s === 'uh') s = 'a';
    else if (s.endsWith('uh') && (final || alone)) s = `${s.slice(0, -2)}a`;
    else if (s.endsWith('uh')) s = `${s.slice(0, -2)}u`;
  }
  s = s.replace(/ih$/, 'i').replace(/ih(?=[^aeiou])/, 'i');
  return s;
}

function joinSyllables(parts) {
  let out = '';
  for (const p of parts) {
    // Stop two vowels merging into a new sound: glide with y after ee/i
    // ("chee" + "a" -> "cheeya"), with w after oo/o/u ("loo" + "a" -> "loowa"),
    // otherwise keep them apart with a hyphen.
    if (out && /[aeiou]$/.test(out) && /^[aeiou]/.test(p)) {
      if (/(ee|i)$/.test(out)) out += 'y';
      else if (/(oo|o|u)$/.test(out)) out += 'w';
      else out += '-';
    }
    out += p;
  }
  return out;
}

/**
 * Respelling -> text for a plain TTS voice. Syllables are joined into a
 * pseudo-word; when stress is not on the first syllable we split just before
 * it ("shih-VAWN" -> "Shi vawn") which reliably moves the accent in most
 * English voices, while leaving the unstressed part light.
 */
export function respellToSay(input) {
  const { words } = parseRespelling(input);
  const out = words.map((syllables) => {
    const texts = syllables.map((s, i) =>
      syllableToSayText(s.text, { stressed: s.stressed, final: i === syllables.length - 1, alone: syllables.length === 1 }),
    );
    const stressIdx = syllables.findIndex((s) => s.stressed);
    if (stressIdx <= 0) return joinSyllables(texts);
    return `${joinSyllables(texts.slice(0, stressIdx))} ${joinSyllables(texts.slice(stressIdx))}`;
  });
  const s = out.join(' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Does this look like a stress-marked respelling ("shih-VAWN") rather than a plain spelling? */
export function looksLikeRespelling(input) {
  const s = String(input ?? '').trim();
  if (!s) return false;
  const syllables = s.split(/[\s-]+/).filter(Boolean);
  return s.includes('-') || (syllables.length > 1 && syllables.some(isStressed) && !syllables.every(isStressed));
}
