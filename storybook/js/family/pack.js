// Family packs: one JSON file a family shares by WhatsApp, email or AirDrop
// (there is no server). Two kinds:
//   - "reading": a grown-up's recording of the whole book ("Read by Grandma Rose"),
//   - "gift": a book set up as a present: the child's name and how it is said,
//     a written (and optionally spoken) message, and optionally a reading too.
// See docs/architecture.md section 11 ("Family packs") for the format.
//
// A pack that arrives on a phone is UNTRUSTED input. readPack() checks every
// field before anything is kept: file size, format and version, a known book,
// page numbers, text lengths (control and direction-override characters are
// removed), strict base64, an audio MIME allow-list and a look at the audio's
// first bytes to make sure it really is that kind of audio. Nothing from a
// pack is ever put into the page as HTML; the screens use text nodes only.

import { normaliseName, nameKey, NAME_MAX_LENGTH } from '../core/personalise.js';
import { newId, upsertProfile, upsertReading } from '../core/storage.js';

export const PACK_FORMAT = 'starring-pack';
export const PACK_VERSION = 1;
export const PACK_KINDS = Object.freeze(['reading', 'gift']);
export const PACK_EXTENSION = '.starring.json';
export const PACK_ACCEPT = '.json,application/json';

const MB = 1024 * 1024;
export const PACK_LIMITS = Object.freeze({
  fileBytes: 30 * MB, // the whole file, as it arrives
  partBytes: 12 * MB, // one recording, decoded
  audioBytes: 22 * MB, // all recordings together, decoded (30 MB of base64 is about 22.5 MB)
  pages: 60, // page numbers 1..60
  readerName: 40,
  from: 40,
  message: 400,
  language: 30,
  say: 60,
  respell: 60,
  ipa: 80,
  label: 40,
});

/** Audio types a pack may carry (normalised: lower case, without codec parameters). */
export const AUDIO_TYPES = Object.freeze([
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave',
  'audio/webm', 'audio/ogg',
  'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
  'audio/mpeg', 'audio/mp3',
]);

// Which container each allowed type must really be (checked on the first bytes).
const FAMILY = {
  'audio/wav': ['wav'], 'audio/x-wav': ['wav'], 'audio/wave': ['wav'], 'audio/vnd.wave': ['wav'],
  'audio/webm': ['webm'], 'audio/ogg': ['ogg'],
  'audio/mp4': ['mp4'], 'audio/x-m4a': ['mp4'], 'audio/m4a': ['mp4'], 'audio/aac': ['aac', 'mp4'],
  'audio/mpeg': ['mp3'], 'audio/mp3': ['mp3'],
};

export const PACK_MESSAGES = Object.freeze({
  'not-a-file': 'Please choose the file that was sent to you.',
  empty: 'That file is empty. Ask for it to be sent again.',
  'too-big': 'That file is too big to be a Tiffin & Me recording (the limit is 30 MB).',
  'not-a-pack': 'That doesn’t look like a Tiffin & Me family recording. It should be a file ending in “.starring.json”.',
  'newer-version': 'This recording was made with a newer version of the read-along. Please reload this page and try again.',
  'bad-kind': 'We don’t know what to do with this file. It may be from a newer version of the read-along.',
  'unknown-book': 'This recording is for a book we don’t know. Check it’s a Tiffin & Me book, or reload this page and try again.',
  'no-books': 'We couldn’t check which book this is for. Please check your connection and try again.',
  'no-audio': 'We couldn’t find any recordings in this file. Ask for it to be sent again.',
  'bad-child': 'The child’s name in this gift can’t be used. Ask the giver to set it up again.',
  'read-failed': 'We couldn’t open that file. Please try again.',
  'nothing-to-send': 'There’s nothing recorded yet to send.',
});

/** Error with a `code` (a key of PACK_MESSAGES) and a parent-friendly message. */
export class PackError extends Error {
  constructor(code, detail = '') {
    super(PACK_MESSAGES[code] ?? PACK_MESSAGES['not-a-pack']);
    this.name = 'PackError';
    this.code = code;
    if (detail) this.detail = detail;
  }
}

// ---- Small pure helpers (unit-tested) -------------------------------------------

// C0/C1 controls (newlines are handled separately), bidi overrides/isolates
// (they can make "Grandma" display as something else), zero-width joiners
// used for spoofing are left alone because emoji need them.
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩﻿]/g;

/**
 * Clean untrusted text: strings only, NFC, no control or direction-override
 * characters, whitespace tidied, at most `max` characters (code points).
 * @param {unknown} value
 * @param {number} max
 * @param {{multiline?: boolean}} [opts] keep single line breaks (messages)
 * @returns {string}
 */
export function cleanText(value, max, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL, '');
  s = multiline
    ? s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : s.replace(/\s+/g, ' ').trim();
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max).join('').trim() : s;
}

/** Lower-case MIME type without parameters ("audio/webm;codecs=opus" -> "audio/webm"), or ''. */
export function baseMime(type) {
  return String(type ?? '').split(';')[0].trim().toLowerCase();
}

/** Is this an audio type a pack may carry? */
export function isAllowedAudio(type) {
  return AUDIO_TYPES.includes(baseMime(type));
}

/**
 * What kind of audio file the bytes start like, or null.
 * @param {Uint8Array} b
 * @returns {'wav'|'webm'|'ogg'|'mp4'|'mp3'|'aac'|null}
 */
export function sniffAudio(b) {
  if (!b || b.length < 12) return null;
  const ascii = (from, to) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(4, 8) === 'ftyp') return 'mp4';
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac'; // ADTS: sync word, layer 00
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3'; // MPEG audio frame sync
  return null;
}

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Bytes a base64 string decodes to (without decoding it). */
export function base64Size(s) {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return (s.length / 4) * 3 - pad;
}

/**
 * Strict base64 -> bytes. Whitespace (line-wrapped base64) is ignored; anything
 * else that isn't base64 is refused.
 * @returns {Uint8Array|null}
 */
export function decodeBase64(value) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/[ \t\r\n]+/g, '');
  if (!s || s.length % 4 !== 0 || !B64.test(s)) return null;
  let bin;
  try {
    bin = atob(s);
  } catch {
    return null;
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Bytes -> base64 (chunked, so big recordings don't overflow the call stack). */
export function encodeBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** An ASCII slug for filenames: "Grandma Rosé" -> "Grandma-Rose". */
export function asciiSlug(text, fallback = 'family') {
  const s = String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || fallback;
}

/**
 * "<book>-<reader-or-child>.starring.json", e.g. "tiffin-football-Grandma-Rose.starring.json".
 * @param {{kind?: string, bookId: string, readerName?: string, child?: {display?: string}|null, message?: {from?: string}|null}} pack
 */
export function packFilename(pack) {
  const who = pack?.kind === 'gift' ? pack?.child?.display || pack?.message?.from : pack?.readerName || pack?.child?.display;
  return `${asciiSlug(pack?.bookId, 'book')}-${asciiSlug(who)}${PACK_EXTENSION}`;
}

const isBlob = (x) => Boolean(x && typeof x === 'object' && typeof x.arrayBuffer === 'function' && typeof x.size === 'number');
const PAGE_KEY = /^[1-9][0-9]{0,2}$/;
const BOOK_ID = /^[a-z0-9-]{1,60}$/;

// ---- Building a pack --------------------------------------------------------------

async function audioEntry(blob) {
  if (!isBlob(blob) || !blob.size) return null;
  const type = baseMime(blob.type) || 'audio/wav';
  if (!isAllowedAudio(type)) return null;
  if (blob.size > PACK_LIMITS.partBytes) throw new PackError('too-big');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { mime: type, data: encodeBase64(bytes) };
}

/**
 * Build a family pack file.
 * @param {{
 *   kind: 'reading'|'gift', bookId: string, createdAt?: number,
 *   readerName?: string, language?: string,
 *   parts?: Record<string|number, {main?: Blob|null, after?: Blob|null}>,
 *   child?: {display: string, fullName?: string|null, pronunciation?: object}|null,
 *   message?: {from?: string, text?: string, audio?: Blob|null}|null,
 * }} opts
 * @returns {Promise<Blob>} application/json
 * @throws {PackError} 'bad-kind' | 'unknown-book' | 'too-big' | 'nothing-to-send'
 */
export async function buildPack({ kind, bookId, createdAt = Date.now(), readerName = '', language = '', parts = {}, child = null, message = null } = {}) {
  if (!PACK_KINDS.includes(kind)) throw new PackError('bad-kind');
  if (!BOOK_ID.test(String(bookId ?? ''))) throw new PackError('unknown-book');
  const pack = { format: PACK_FORMAT, version: PACK_VERSION, kind, bookId, createdAt: Number.isFinite(createdAt) ? Math.round(createdAt) : Date.now() };
  const name = cleanText(readerName, PACK_LIMITS.readerName);
  if (name) pack.readerName = name;
  const lang = cleanText(language, PACK_LIMITS.language);
  if (lang) pack.language = lang;

  const outParts = {};
  let bytes = 0;
  const keys = Object.keys(parts ?? {}).filter((k) => PAGE_KEY.test(k) && Number(k) <= PACK_LIMITS.pages).sort((a, b) => Number(a) - Number(b));
  for (const n of keys) {
    const main = await audioEntry(parts[n]?.main);
    const after = await audioEntry(parts[n]?.after);
    if (!main && !after) continue;
    bytes += (main ? base64Size(main.data) : 0) + (after ? base64Size(after.data) : 0);
    outParts[n] = { main, after };
  }
  if (Object.keys(outParts).length) pack.parts = outParts;

  if (child?.display) {
    const pr = child.pronunciation ?? {};
    pack.child = {
      display: cleanText(child.display, NAME_MAX_LENGTH),
      fullName: cleanText(child.fullName ?? '', NAME_MAX_LENGTH) || null,
      pronunciation: {
        say: cleanText(pr.say ?? child.display, PACK_LIMITS.say),
        ipa: cleanText(pr.ipa ?? '', PACK_LIMITS.ipa),
        respell: cleanText(pr.respell ?? '', PACK_LIMITS.respell),
        label: cleanText(pr.label ?? '', PACK_LIMITS.label),
        source: 'gift',
      },
    };
  }
  if (kind === 'gift' && message) {
    const audio = await audioEntry(message.audio);
    if (audio) bytes += base64Size(audio.data);
    pack.message = { from: cleanText(message.from, PACK_LIMITS.from), text: cleanText(message.text, PACK_LIMITS.message, { multiline: true }), audio };
  }
  if (kind === 'reading' && !pack.parts) throw new PackError('nothing-to-send');
  if (kind === 'gift' && !pack.child) throw new PackError('bad-child');
  if (bytes > PACK_LIMITS.audioBytes) throw new PackError('too-big');
  const json = JSON.stringify(pack);
  if (json.length > PACK_LIMITS.fileBytes) throw new PackError('too-big');
  return new Blob([json], { type: 'application/json' });
}

// ---- Reading a pack (untrusted) ---------------------------------------------------

/**
 * @typedef {{
 *   format: string, version: number, kind: 'reading'|'gift', bookId: string, book: {id: string, title?: string, subtitle?: string},
 *   createdAt: number, readerName: string, language: string,
 *   parts: Record<string, {main: Blob|null, after: Blob|null}>, pageCount: number, partCount: number,
 *   child: {display: string, key: string, fullName: string|null, pronunciation: object}|null,
 *   message: {from: string, text: string, audio: Blob|null}|null,
 *   bytes: number, warnings: string[],
 * }} ParsedPack
 */

/**
 * Check and decode one {mime, data} audio entry. Returns a Blob, or null with a
 * warning when it isn't acceptable (a bad part never stops the rest).
 */
function readAudio(entry, where, budget, warnings) {
  if (entry == null) return null;
  if (typeof entry !== 'object' || Array.isArray(entry)) {
    warnings.push(`${where}: not a recording`);
    return null;
  }
  const mime = baseMime(entry.mime);
  if (!isAllowedAudio(mime)) {
    warnings.push(`${where}: “${String(entry.mime ?? '').slice(0, 40)}” is not an allowed audio type`);
    return null;
  }
  if (typeof entry.data !== 'string' || !entry.data) {
    warnings.push(`${where}: no audio data`);
    return null;
  }
  // Size first (cheap), then decode.
  const approx = Math.floor((entry.data.length * 3) / 4);
  if (approx > PACK_LIMITS.partBytes) {
    warnings.push(`${where}: recording too long`);
    return null;
  }
  if (budget.used + approx > PACK_LIMITS.audioBytes) {
    warnings.push(`${where}: over the size limit`);
    return null;
  }
  const bytes = decodeBase64(entry.data);
  if (!bytes || !bytes.length) {
    warnings.push(`${where}: damaged audio data`);
    return null;
  }
  const kind = sniffAudio(bytes);
  if (!kind || !FAMILY[mime].includes(kind)) {
    warnings.push(`${where}: not really ${mime}`);
    return null;
  }
  budget.used += bytes.length;
  return new Blob([bytes], { type: mime });
}

async function knownBooks(books) {
  let list = books;
  if (typeof list === 'function') list = await list();
  if (!Array.isArray(list)) {
    try {
      const { loadBookList } = await import('../core/book.js');
      list = await loadBookList();
    } catch {
      throw new PackError('no-books');
    }
  }
  return list.map((b) => (typeof b === 'string' ? { id: b } : b)).filter((b) => b && typeof b.id === 'string');
}

async function fileText(file) {
  if (typeof file.text === 'function') return file.text();
  if (typeof file.arrayBuffer === 'function') return new TextDecoder().decode(await file.arrayBuffer());
  throw new PackError('not-a-file');
}

/**
 * Read and check a pack file chosen by the parent.
 * @param {Blob|File} file
 * @param {{books?: Array<string|{id: string, title?: string, subtitle?: string}> | (() => Promise<Array>)}} [opts]
 *   the books this app knows (default: books/index.json)
 * @returns {Promise<ParsedPack>}
 * @throws {PackError}
 */
export async function readPack(file, { books } = {}) {
  if (!isBlob(file)) throw new PackError('not-a-file');
  if (!file.size) throw new PackError('empty');
  if (file.size > PACK_LIMITS.fileBytes) throw new PackError('too-big');
  let text;
  try {
    text = await fileText(file);
  } catch (err) {
    throw err instanceof PackError ? err : new PackError('read-failed');
  }
  if (text.length > PACK_LIMITS.fileBytes) throw new PackError('too-big');
  let raw;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new PackError('not-a-pack');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.format !== PACK_FORMAT) throw new PackError('not-a-pack');
  if (!Number.isInteger(raw.version) || raw.version < 1) throw new PackError('not-a-pack');
  if (raw.version > PACK_VERSION) throw new PackError('newer-version');
  if (!PACK_KINDS.includes(raw.kind)) throw new PackError('bad-kind');
  if (typeof raw.bookId !== 'string' || !BOOK_ID.test(raw.bookId)) throw new PackError('unknown-book');
  const list = await knownBooks(books);
  const book = list.find((b) => b.id === raw.bookId);
  if (!book) throw new PackError('unknown-book');

  const warnings = [];
  const budget = { used: 0 };
  const now = Date.now();
  const createdAt = Number.isFinite(raw.createdAt) && raw.createdAt > 0 && raw.createdAt < now + 7 * 864e5 ? Math.round(raw.createdAt) : now;

  // Pages: numbered keys 1..60 only; everything else is ignored.
  const parts = {};
  let partCount = 0;
  const rawParts = raw.parts && typeof raw.parts === 'object' && !Array.isArray(raw.parts) ? raw.parts : {};
  for (const key of Object.keys(rawParts)) {
    if (!PAGE_KEY.test(key) || Number(key) > PACK_LIMITS.pages) {
      warnings.push(`page “${key.slice(0, 12)}” ignored`);
      continue;
    }
    const entry = rawParts[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const main = readAudio(entry.main, `page ${key} (main)`, budget, warnings);
    const after = readAudio(entry.after, `page ${key} (after)`, budget, warnings);
    if (!main && !after) continue;
    parts[key] = { main, after };
    partCount += (main ? 1 : 0) + (after ? 1 : 0);
  }

  let child = null;
  if (raw.child && typeof raw.child === 'object' && !Array.isArray(raw.child)) {
    const n = normaliseName(cleanText(raw.child.display, NAME_MAX_LENGTH + 8));
    if (n.ok) {
      const full = normaliseName(cleanText(raw.child.fullName, NAME_MAX_LENGTH + 8));
      const pr = raw.child.pronunciation && typeof raw.child.pronunciation === 'object' ? raw.child.pronunciation : {};
      const say = cleanText(pr.say, PACK_LIMITS.say);
      child = {
        display: n.display,
        key: n.key,
        fullName: full.ok && full.key !== n.key ? full.display : null,
        pronunciation: {
          say: /\p{L}/u.test(say) ? say : n.display,
          ipa: cleanText(pr.ipa, PACK_LIMITS.ipa),
          respell: cleanText(pr.respell, PACK_LIMITS.respell),
          label: cleanText(pr.label, PACK_LIMITS.label),
          source: 'gift',
          useRecording: false,
          recordingId: null,
        },
      };
    } else if (raw.kind === 'gift') {
      throw new PackError('bad-child');
    }
  }

  let message = null;
  if (raw.kind === 'gift') {
    if (!child) throw new PackError('bad-child');
    const m = raw.message && typeof raw.message === 'object' && !Array.isArray(raw.message) ? raw.message : {};
    message = {
      from: cleanText(m.from, PACK_LIMITS.from),
      text: cleanText(m.text, PACK_LIMITS.message, { multiline: true }),
      audio: readAudio(m.audio, 'spoken message', budget, warnings),
    };
  }
  if (raw.kind === 'reading' && !partCount) throw new PackError('no-audio');

  return {
    format: PACK_FORMAT,
    version: raw.version,
    kind: raw.kind,
    bookId: raw.bookId,
    book: { id: book.id, title: typeof book.title === 'string' ? book.title : '', subtitle: typeof book.subtitle === 'string' ? book.subtitle : '' },
    createdAt,
    readerName: cleanText(raw.readerName, PACK_LIMITS.readerName),
    language: cleanText(raw.language, PACK_LIMITS.language),
    parts,
    pageCount: Object.keys(parts).length,
    partCount,
    child,
    message,
    bytes: budget.used,
    warnings,
  };
}

// ---- Importing a pack -------------------------------------------------------------

/** Blob id for one recorded part of a reading. */
export function partBlobId(readingId, n, part) {
  return `${readingId}_p${n}_${part}`;
}

/**
 * Keep a checked pack on this device: the recordings (blobs), a Reading (made
 * the one played for its book), and for gifts the child's profile and message.
 * Opening the same pack twice replaces the first copy rather than adding a twin.
 * @param {import('../core/storage.js').AppState} state
 * @param {ParsedPack} parsed from readPack()
 * @param {{put(id: string, blob: Blob): Promise<void>, delete(id: string): Promise<void>}} blobs
 * @returns {Promise<{state: object, summary: {kind: string, bookId: string, readingId: string|null, readerName: string,
 *   pages: number, parts: number, replaced: boolean, childId: string|null, childName: string|null, newChild: boolean,
 *   keptPronunciation: boolean, giftFrom: string|null}}>}
 */
export async function importPack(state, parsed, blobs) {
  let next = state;
  const summary = {
    kind: parsed.kind,
    bookId: parsed.bookId,
    readingId: null,
    readerName: parsed.readerName || parsed.message?.from || '',
    pages: parsed.pageCount,
    parts: parsed.partCount,
    replaced: false,
    childId: null,
    childName: null,
    newChild: false,
    keptPronunciation: false,
    giftFrom: null,
  };
  const safeDelete = async (id) => {
    try {
      await blobs.delete(id);
    } catch {
      /* already gone */
    }
  };

  // ---- the recorded reading (reading packs, and gifts that include one) ----
  if (parsed.partCount) {
    const readerName = summary.readerName;
    const same = (next.readings ?? []).find((r) => r.bookId === parsed.bookId && r.packCreatedAt === parsed.createdAt && (r.readerName ?? '') === readerName);
    const id = same?.id ?? newId('reading');
    const parts = {};
    for (const [n, p] of Object.entries(parsed.parts)) {
      const entry = { main: null, after: null };
      for (const part of ['main', 'after']) {
        if (!p[part]) continue;
        const blobId = partBlobId(id, n, part);
        await blobs.put(blobId, p[part]);
        entry[part] = blobId;
      }
      parts[n] = entry;
    }
    // A replaced copy may have had parts this one doesn't.
    if (same) {
      for (const [n, p] of Object.entries(same.parts ?? {})) for (const part of ['main', 'after']) if (p?.[part] && !parts[n]?.[part]) await safeDelete(p[part]);
    }
    const reading = { id, bookId: parsed.bookId, readerName, parts, packCreatedAt: parsed.createdAt, source: 'pack' };
    if (parsed.language) reading.language = parsed.language;
    if (same?.createdAt) reading.createdAt = same.createdAt;
    next = upsertReading(next, reading, { activate: true });
    summary.readingId = id;
    summary.replaced = Boolean(same);
  }

  // ---- the child and the gift message (gift packs) ----
  if (parsed.kind === 'gift' && parsed.child) {
    const c = parsed.child;
    const existing = next.profiles.find((p) => p.key === c.key || (p.fullName && nameKey(p.fullName) === c.key) || (c.fullName && p.key === nameKey(c.fullName)));
    const id = existing?.id ?? newId('child');
    let recordingId = null;
    if (parsed.message?.audio) {
      recordingId = `gift_${id}_${parsed.createdAt}`;
      await blobs.put(recordingId, parsed.message.audio);
    }
    const old = existing?.gift?.recordingId;
    if (old && old !== recordingId) await safeDelete(old);
    const gift = { from: parsed.message?.from ?? '', text: parsed.message?.text ?? '', recordingId, createdAt: parsed.createdAt };
    // The parent's own choice of how the name is said wins over the giver's.
    const profile = existing
      ? { ...existing, gift }
      : { id, display: c.display, key: c.key, pronunciation: { ...c.pronunciation }, gift, ...(c.fullName ? { fullName: c.fullName } : {}) };
    next = upsertProfile(next, profile);
    summary.childId = id;
    summary.childName = profile.display;
    summary.newChild = !existing;
    summary.keptPronunciation = Boolean(existing);
    summary.giftFrom = gift.from || null;
  }
  return { state: next, summary };
}
