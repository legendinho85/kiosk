// Everything is stored on this device only: the child's name and
// pronunciation in localStorage, the optional name recording in IndexedDB.
// Both can be unavailable (private mode, embedded previews), so every call
// falls back to memory and never throws.

const KEY = 'starring.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  voiceURI: null, // preferred speechSynthesis voice; null = best en-GB voice
  rate: 0.9, // toddlers like it a touch slower
  pitch: 1.05,
  highlight: true, // read-along word highlighting
  sfx: true,
  autoTurn: false, // turn pages automatically after the payoff line
  readPrompts: true, // speak "Slide the ball to Ava!" prompts
  camera: false, // magic-window mode on by default?
  allowOnlineVoices: false, // online voices send the story text (and the name) to Google/Microsoft: opt-in only
  bedtime: false, // audio-first sleepy mode: dim screen, story carries on page by page
  easyRead: false, // dyslexia-friendly reading text: bigger, more letter/word/line spacing, clearer font
  highContrast: false, // darker text on plain backgrounds, stronger outlines on controls
  letterActivity: true, // offer "Find your first letter" after the story
});

/**
 * @typedef {{say: string, ipa: string, respell: string, label: string, source: string, useRecording: boolean, recordingId: string|null}} Pronunciation
 * @typedef {{from: string, text: string, recordingId: string|null, createdAt: number}} GiftMessage
 * @typedef {{
 *   id: string, display: string, key: string, pronunciation: Pronunciation,
 *   fullName?: string,          // the full name when `display` is the name used in stories ("Max" for "Maximilian")
 *   gift?: GiftMessage,         // a message from whoever gave the book, played before the first read
 *   createdAt: number, updatedAt: number
 * }} Profile
 * @typedef {{
 *   id: string, bookId: string, readerName: string,     // e.g. "Grandma Rose"
 *   language?: string,                                  // e.g. "Urdu", "Polish", "Cymraeg" (home languages); empty = English
 *   parts: Record<string, {main?: string|null, after?: string|null}>, // page n -> blob ids ("main" = text + prompt, "after" = after lines)
 *   note?: string, createdAt: number, updatedAt: number
 * }} Reading  // a grown-up's recorded reading of a whole book (grandparent mode)
 * @typedef {{
 *   profiles: Profile[], activeProfileId: string|null, settings: typeof DEFAULT_SETTINGS, lastBook?: string|null,
 *   together: string[],                       // profile ids reading together (siblings), empty = just the active child
 *   readings: Reading[], activeReading: Record<string, string|null>  // bookId -> reading id to play (null = computer voice)
 * }} AppState
 */

let memory = null;

function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = `${KEY}.probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/** @returns {AppState} */
export function loadState() {
  let raw = null;
  const ls = safeLocalStorage();
  try {
    raw = ls ? JSON.parse(ls.getItem(KEY) ?? 'null') : memory;
  } catch {
    raw = null;
  }
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    profiles: Array.isArray(s.profiles) ? s.profiles.filter((p) => p && p.id && p.display) : [],
    activeProfileId: s.activeProfileId ?? null,
    settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) },
    lastBook: s.lastBook ?? null,
    together: Array.isArray(s.together) ? s.together.filter((id) => typeof id === 'string') : [],
    readings: Array.isArray(s.readings) ? s.readings.filter((r) => r && r.id && r.bookId) : [],
    activeReading: s.activeReading && typeof s.activeReading === 'object' ? { ...s.activeReading } : {},
  };
}

/** @param {AppState} state */
export function saveState(state) {
  memory = JSON.parse(JSON.stringify(state));
  const ls = safeLocalStorage();
  try {
    ls?.setItem(KEY, JSON.stringify(state));
    return Boolean(ls);
  } catch {
    return false;
  }
}

export function newId(prefix = 'p') {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}

/** @param {AppState} state */
export function activeProfile(state) {
  return state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
}

/** Insert or replace a profile and make it active. Returns the new state. */
export function upsertProfile(state, profile) {
  const now = Date.now();
  const p = { createdAt: now, ...profile, updatedAt: now };
  const profiles = state.profiles.some((x) => x.id === p.id) ? state.profiles.map((x) => (x.id === p.id ? p : x)) : [...state.profiles, p];
  return { ...state, profiles, activeProfileId: p.id };
}

export function removeProfile(state, id) {
  const profiles = state.profiles.filter((p) => p.id !== id);
  return {
    ...state,
    profiles,
    activeProfileId: state.activeProfileId === id ? profiles[0]?.id ?? null : state.activeProfileId,
    together: (state.together ?? []).filter((t) => t !== id),
  };
}

/**
 * The children reading right now: the "together" group (siblings, up to 3)
 * when one is set and still valid, otherwise just the active child.
 * @returns {Profile[]}
 */
export function readingChildren(state) {
  const byId = new Map(state.profiles.map((p) => [p.id, p]));
  const group = (state.together ?? []).map((id) => byId.get(id)).filter(Boolean).slice(0, 3);
  if (group.length > 1) return group;
  const one = activeProfile(state);
  return one ? [one] : [];
}

/** Set (or clear, with fewer than 2 ids) the siblings reading together. */
export function setTogether(state, ids) {
  const valid = [...new Set(ids)].filter((id) => state.profiles.some((p) => p.id === id)).slice(0, 3);
  return { ...state, together: valid.length > 1 ? valid : [] };
}

// ---- Recorded readings (grandparent mode) ------------------------------------

/** Readings recorded for a book, newest first. */
export function readingsFor(state, bookId) {
  return (state.readings ?? []).filter((r) => r.bookId === bookId).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Insert or replace a reading; `activate` makes it the one played for its book. */
export function upsertReading(state, reading, { activate = true } = {}) {
  const now = Date.now();
  const r = { createdAt: now, parts: {}, ...reading, updatedAt: now };
  const readings = (state.readings ?? []).some((x) => x.id === r.id) ? state.readings.map((x) => (x.id === r.id ? r : x)) : [...(state.readings ?? []), r];
  const activeReading = activate ? { ...(state.activeReading ?? {}), [r.bookId]: r.id } : { ...(state.activeReading ?? {}) };
  return { ...state, readings, activeReading };
}

/** Remove a reading from state. Returns {state, blobIds} so the caller can delete the audio too. */
export function removeReading(state, id) {
  const r = (state.readings ?? []).find((x) => x.id === id);
  const blobIds = r ? Object.values(r.parts ?? {}).flatMap((p) => [p.main, p.after]).filter(Boolean) : [];
  const activeReading = Object.fromEntries(Object.entries(state.activeReading ?? {}).map(([book, rid]) => [book, rid === id ? null : rid]));
  return { state: { ...state, readings: (state.readings ?? []).filter((x) => x.id !== id), activeReading }, blobIds };
}

/** "Read by Nana" / "Read by Nana in Urdu". */
export function readingLabel(reading) {
  if (!reading) return '';
  const who = String(reading.readerName ?? '').trim() || 'a grown-up';
  const lang = String(reading.language ?? '').trim();
  return lang && !/^english$/i.test(lang) ? `Read by ${who} in ${lang}` : `Read by ${who}`;
}

/** The reading chosen for a book, if it still exists. */
export function activeReadingFor(state, bookId) {
  const id = state.activeReading?.[bookId];
  return id ? (state.readings ?? []).find((r) => r.id === id && r.bookId === bookId) ?? null : null;
}

// ---- Small per-device preferences --------------------------------------------
// For module-level odds and ends (e.g. how the magic window was lined up) that
// don't belong in AppState. Separate key, same fallbacks.

const PREFS_KEY = 'starring.prefs.v1';
let memPrefs = {};

function readPrefs() {
  const ls = safeLocalStorage();
  try {
    return ls ? JSON.parse(ls.getItem(PREFS_KEY) ?? '{}') ?? {} : memPrefs;
  } catch {
    return memPrefs;
  }
}

export const prefs = {
  get(key, fallback = null) {
    const all = readPrefs();
    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : fallback;
  },
  set(key, value) {
    const all = { ...readPrefs(), [key]: value };
    memPrefs = all;
    try {
      safeLocalStorage()?.setItem(PREFS_KEY, JSON.stringify(all));
    } catch {
      /* memory only */
    }
  },
};

// ---- Blobs (name recordings, readings, gift messages) -----------------------

const DB = 'starring';
const STORE = 'recordings';
const memBlobs = new Map();

function openDb() {
  return new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const blobs = {
  async put(id, blob) {
    memBlobs.set(id, blob);
    await tx('readwrite', (s) => s.put(blob, id));
  },
  async get(id) {
    if (memBlobs.has(id)) return memBlobs.get(id);
    const b = await tx('readonly', (s) => s.get(id));
    if (b) memBlobs.set(id, b);
    return b ?? null;
  },
  async delete(id) {
    memBlobs.delete(id);
    await tx('readwrite', (s) => s.delete(id));
  },
};

/** Remove every trace of the app's data from this device. */
export async function forgetEverything() {
  memory = null;
  memBlobs.clear();
  memPrefs = {};
  try {
    safeLocalStorage()?.removeItem(KEY);
    safeLocalStorage()?.removeItem(PREFS_KEY);
  } catch {
    /* ignore */
  }
  try {
    globalThis.indexedDB?.deleteDatabase(DB);
  } catch {
    /* ignore */
  }
}
