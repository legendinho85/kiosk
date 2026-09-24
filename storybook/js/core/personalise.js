// Name handling and story personalisation.
//
// Story text is written with placeholders:
//   {name}                 the child's name as the parent typed it ("Siobhan")
//   {name's}               possessive ("Siobhan's")
//   {NAME}                 upper case, for shirts / banners ("SIOBHAN")
//   {say:display|spoken}   show one thing, say another (for words TTS gets wrong)
//
// A "person" is { display, say }: `display` is what appears on the page and
// `say` is the text we hand to the speech engine so the name is pronounced
// correctly (e.g. { display: "Niamh", say: "Neeve" }).
//
// tokenizeLine() turns a template line into read-along units (one per word,
// punctuation attached) with character offsets in both the displayed and the
// spoken string, so speech "boundary" events can be mapped back to the word
// that should be highlighted.

export const NAME_MAX_LENGTH = 24;

const APOSTROPHES = /[‘’ʼ`´]/g;
const DASHES = /[‐-―−]/g;
// Letters (any script) and combining marks, joined by single spaces, hyphens,
// apostrophes, or ". " (as in "St. John"); an optional trailing full stop.
const VALID_NAME = /^\p{L}[\p{L}\p{M}]*(?:(?:[ '\-]|\. ?)\p{L}[\p{L}\p{M}]*)*\.?$/u;

const FOLD = { ł: 'l', ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

/** Lower-case, accent-free key used for dictionary lookups: "Oisín" -> "oisin", "D'Arcy" -> "darcy". */
export function nameKey(name) {
  return String(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[łøæœßđðþı]/g, (c) => FOLD[c])
    .replace(APOSTROPHES, '')
    .replace(/['.]/g, '')
    .replace(DASHES, '-')
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleCasePart(part) {
  // "o'neill" -> "O'Neill", "d'arcy" -> "D'Arcy", "ta'liyah" -> "Ta'liyah"
  const lower = part.toLocaleLowerCase('en-GB');
  const cap = (s) => s.charAt(0).toLocaleUpperCase('en-GB') + s.slice(1);
  const m = /^(\p{L})'(\p{L}.*)$/u.exec(lower);
  return m ? `${m[1].toLocaleUpperCase('en-GB')}'${cap(m[2])}` : cap(lower);
}

/**
 * Clean up a name typed by a parent.
 * @returns {{ok: true, display: string, key: string} | {ok: false, error: 'empty'|'too-long'|'invalid-chars'}}
 */
export function normaliseName(raw) {
  const display0 = String(raw ?? '')
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim();
  if (!display0) return { ok: false, error: 'empty' };
  if ([...display0].length > NAME_MAX_LENGTH) return { ok: false, error: 'too-long' };
  if (!VALID_NAME.test(display0)) return { ok: false, error: 'invalid-chars' };

  // Only fix the case when the parent typed all-lower or ALL-UPPER; respect
  // deliberate mixed case like "DeShawn" or "McKenzie".
  const letters = display0.replace(/[^\p{L}]/gu, '');
  const allLower = letters === letters.toLocaleLowerCase('en-GB');
  const allUpper = letters === letters.toLocaleUpperCase('en-GB');
  const hasCase = letters.toLocaleLowerCase('en-GB') !== letters.toLocaleUpperCase('en-GB');
  let display = display0;
  if (hasCase && (allLower || (allUpper && letters.length > 1))) {
    display = display0.split(/([ \-])/).map((p) => (p === ' ' || p === '-' ? p : titleCasePart(p))).join('');
  }
  return { ok: true, display, key: nameKey(display) };
}

export const NAME_ERRORS = {
  empty: 'Please type a name.',
  'too-long': `That name is a bit long for the pages — please use up to ${NAME_MAX_LENGTH} letters (a nickname works well).`,
  'invalid-chars': 'Please use letters only (spaces, hyphens and apostrophes are fine).',
};

/** UK house style: always add 's ("James's", "Ava's"). */
export function possessive(name) {
  return `${name}'s`;
}

export function upper(name) {
  return String(name).toLocaleUpperCase('en-GB');
}

/** Normalise a person object; `say` defaults to the displayed name. */
export function person(display, say) {
  const s = String(say ?? '').trim();
  return { display: String(display), say: s || String(display) };
}

const PLACEHOLDER = /\{(name's|name|NAME|Name|say:[^|{}]*\|[^{}]*)\}/g;

/** Split a template into text and placeholder chunks. */
export function parseTemplate(template) {
  const chunks = [];
  let last = 0;
  for (const m of String(template).matchAll(PLACEHOLDER)) {
    if (m.index > last) chunks.push({ kind: 'text', text: template.slice(last, m.index) });
    const tag = m[1];
    if (tag.startsWith('say:')) {
      const [display, spoken] = tag.slice(4).split('|');
      chunks.push({ kind: 'say', display, spoken });
    } else {
      chunks.push({ kind: 'name', form: tag === "name's" ? 'poss' : tag === 'NAME' ? 'upper' : 'plain' });
    }
    last = m.index + m[0].length;
  }
  if (last < template.length) chunks.push({ kind: 'text', text: template.slice(last) });
  return chunks;
}

/** Placeholders like "{nmae}" that the template engine does not understand. */
export function unknownPlaceholders(template) {
  const known = new Set();
  for (const m of String(template).matchAll(PLACEHOLDER)) known.add(m.index);
  return [...String(template).matchAll(/\{[^}]*\}/g)].filter((m) => !known.has(m.index)).map((m) => m[0]);
}

function nameDisplay(p, form) {
  if (form === 'poss') return possessive(p.display);
  if (form === 'upper') return upper(p.display);
  return p.display;
}

function nameSpoken(p, form) {
  // Never upper-case spoken text: some engines spell out capitals letter by letter.
  return form === 'poss' ? possessive(p.say) : p.say;
}

/** Fill a template for display (titles, banners). */
export function fillTemplate(template, p) {
  const pp = typeof p === 'string' ? person(p) : p;
  return parseTemplate(template)
    .map((c) => (c.kind === 'text' ? c.text : c.kind === 'say' ? c.display : nameDisplay(pp, c.form)))
    .join('');
}

/** Fill a template as it should be spoken. */
export function fillSpoken(template, p) {
  return tokenizeLine(template, p).spoken;
}

function shoutToSpeech(s) {
  // "GOAL!" -> "Goal!" so engines don't read it as G-O-A-L. Single letters and "I" untouched.
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2 || letters !== letters.toLocaleUpperCase('en-GB') || letters === letters.toLocaleLowerCase('en-GB')) return s;
  const lower = s.toLocaleLowerCase('en-GB');
  const i = lower.search(/\p{L}/u);
  return lower.slice(0, i) + lower.charAt(i).toLocaleUpperCase('en-GB') + lower.slice(i + 1);
}

/**
 * Tokenise a template line into read-along units.
 * @returns {{display: string, spoken: string, units: Array<{
 *   text: string, say: string, isName: boolean, nameForm: ('plain'|'poss'|'upper'|null), isWord: boolean,
 *   dStart: number, dEnd: number, sStart: number, sEnd: number}>}}
 */
export function tokenizeLine(template, p) {
  const pp = typeof p === 'string' ? person(p) : p;
  const units = [];
  let cur = null;
  const flush = () => {
    if (cur) units.push(cur);
    cur = null;
  };
  const ensure = () => (cur ??= { text: '', say: '', isName: false, nameForm: null, hasSay: false });

  for (const chunk of parseTemplate(template)) {
    if (chunk.kind === 'text') {
      for (const ch of chunk.text) {
        if (/\s/.test(ch)) flush();
        else {
          const u = ensure();
          u.text += ch;
          u.say += ch;
        }
      }
    } else if (chunk.kind === 'say') {
      const u = ensure();
      u.text += chunk.display;
      u.say += chunk.spoken;
      u.hasSay = true;
    } else {
      const u = ensure();
      u.text += nameDisplay(pp, chunk.form);
      u.say += nameSpoken(pp, chunk.form);
      u.isName = true;
      u.nameForm ??= chunk.form;
    }
  }
  flush();

  let display = '';
  let spoken = '';
  for (const u of units) {
    if (!u.isName && !u.hasSay) u.say = shoutToSpeech(u.say);
    delete u.hasSay;
    u.isWord = /[\p{L}\p{N}]/u.test(u.text);
    if (display) display += ' ';
    if (spoken) spoken += ' ';
    u.dStart = display.length;
    display += u.text;
    u.dEnd = display.length;
    u.sStart = spoken.length;
    spoken += u.say;
    u.sEnd = spoken.length;
  }
  return { display, spoken, units };
}

/** Index of the unit whose spoken range contains `charIndex` (or the nearest one before it). */
export function unitAtSpokenIndex(units, charIndex) {
  let best = -1;
  for (let i = 0; i < units.length; i++) {
    if (units[i].sStart <= charIndex) best = i;
    else break;
  }
  return best;
}
