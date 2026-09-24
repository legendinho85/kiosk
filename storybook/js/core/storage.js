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
});

/**
 * @typedef {{say: string, ipa: string, respell: string, label: string, source: string, useRecording: boolean, recordingId: string|null}} Pronunciation
 * @typedef {{id: string, display: string, key: string, pronunciation: Pronunciation, createdAt: number, updatedAt: number}} Profile
 * @typedef {{profiles: Profile[], activeProfileId: string|null, settings: typeof DEFAULT_SETTINGS, lastBook?: string|null}} AppState
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
  return { ...state, profiles, activeProfileId: state.activeProfileId === id ? profiles[0]?.id ?? null : state.activeProfileId };
}

// ---- Blobs (name recordings) ------------------------------------------------

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
  try {
    safeLocalStorage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    globalThis.indexedDB?.deleteDatabase(DB);
  } catch {
    /* ignore */
  }
}
