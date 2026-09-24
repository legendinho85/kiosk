// Family features shared by the grown-up screens (docs/architecture.md §11):
// who is being read to (siblings together), a grown-up's recorded reading
// (the teleprompter steps, the adapter the reader plays, the Yoto/Tonie
// audio file), and the words used when sharing a pack. Pure helpers apart
// from the blob store that is passed in, so they are unit-tested in Node.

import { fillTemplate, togetherPerson, person as makePerson } from '../core/personalise.js';
import { readingChildren, readingLabel } from '../core/storage.js';
import { asciiSlug } from './pack.js';

/** Up to this many children can share a story. */
export const MAX_TOGETHER = 3;

/**
 * The children reading now, as one narrator "person" (siblings: "Amara and Zak",
 * drawn in the pictures as "Amara & Zak"). Null when no child is set up.
 * @param {object} state
 */
export function readingPerson(state) {
  const kids = readingChildren(state);
  if (!kids.length) return null;
  return togetherPerson(kids.map((p) => ({ display: p.display, say: p.pronunciation?.say || p.display })));
}

/** The joined names as drawn in the pictures: "Amara & Zak". */
export function artNames(children) {
  return children.map((c) => c.display).join(' & ');
}

// ---- Recorded readings (grandparent mode) ------------------------------------------

const MECHANIC_WORDS = {
  flap: ['lifts the flap', 'the flap'],
  wheel: ['turns the wheel', 'the wheel'],
  slider: ['moves the slider', 'the slider'],
  'pull-tab': ['pulls the tab', 'the tab'],
  'push-button': ['presses the button', 'the button'],
};

/**
 * Everything a grown-up reads aloud, in order: one step per page part.
 * "main" = the page's text and its prompt (read before the child works the
 * moving part); "after" = the lines read once it has moved.
 * @param {object} book
 * @returns {Array<{n: number, part: 'main'|'after', lines: string[], promptIndex: number, pageKind: string, mechanic: string|null, title: string, cue: string}>}
 */
export function recordingSteps(book) {
  const steps = [];
  for (const page of book?.pages ?? []) {
    const n = page.n;
    const text = (page.text ?? []).filter((l) => String(l).trim());
    const prompt = String(page.prompt ?? '').trim();
    const after = (page.after ?? []).filter((l) => String(l).trim());
    const mech = page.mechanic?.type && page.mechanic.type !== 'none' ? page.mechanic.type : null;
    const words = MECHANIC_WORDS[mech] ?? ['has a go', 'it'];
    const where = page.kind === 'cover' ? 'The cover' : page.kind === 'end' ? 'The last page' : `Page ${n}`;
    const mainLines = prompt ? [...text, prompt] : text;
    if (mainLines.length) {
      steps.push({
        n,
        part: 'main',
        lines: mainLines,
        promptIndex: prompt ? mainLines.length - 1 : -1,
        pageKind: page.kind,
        mechanic: mech,
        title: where,
        cue: mech && after.length ? `Then stop — they’ll have a go at ${words[1]}.` : page.kind === 'end' ? 'Nice and slow — it’s bedtime.' : '',
      });
    }
    if (after.length) {
      steps.push({
        n,
        part: 'after',
        lines: after,
        promptIndex: -1,
        pageKind: page.kind,
        mechanic: mech,
        title: `${where}, after your listener ${words[0]}`,
        cue: '',
      });
    }
  }
  return steps;
}

/** How much of a book a reading covers. */
export function readingCoverage(reading, steps) {
  const done = steps.filter((s) => reading?.parts?.[s.n]?.[s.part]).length;
  return { done, total: steps.length, complete: steps.length > 0 && done === steps.length };
}

/** Every blob id a reading uses. */
export function readingBlobIds(reading) {
  return Object.values(reading?.parts ?? {}).flatMap((p) => [p?.main, p?.after]).filter(Boolean);
}

/**
 * What the reader needs to play a recorded reading (docs §11 "Reader additions").
 * @param {object|null} reading a stored Reading
 * @param {{get(id: string): Promise<Blob|null>}} blobs
 * @returns {{readerName: string, language: string, label: string, getPart(n: number, part: 'main'|'after'): Promise<Blob|null>} | null}
 */
export function readingAdapter(reading, blobs) {
  if (!reading) return null;
  return {
    readerName: reading.readerName ?? '',
    language: reading.language ?? '',
    label: readingLabel(reading),
    async getPart(n, part) {
      const id = reading.parts?.[n]?.[part];
      if (!id) return null;
      try {
        return (await blobs.get(id)) ?? null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * The pieces of one audio file of a whole reading, in page order: each
 * recorded part, a pause after the "main" part (while little hands work the
 * book), and a soft chime between pages (turn the page!).
 * @param {object} book
 * @param {object} reading
 * @param {(id: string) => Promise<Blob|null>} getBlob
 * @returns {Promise<{parts: Array<Blob|{silenceMs: number}|{chime: true}>, clips: number, missing: number}>}
 */
export async function readingAudioParts(book, reading, getBlob) {
  const out = [];
  let clips = 0;
  let missing = 0;
  const pages = book?.pages ?? [];
  for (const page of pages) {
    const got = [];
    for (const part of ['main', 'after']) {
      const id = reading?.parts?.[page.n]?.[part];
      if (!id) continue;
      let blob = null;
      try {
        blob = await getBlob(id);
      } catch {
        blob = null;
      }
      if (blob && blob.size) got.push({ part, blob });
      else missing++;
    }
    if (!got.length) continue;
    if (clips) out.push({ silenceMs: 700 }, { chime: true }, { silenceMs: 500 });
    got.forEach((g, i) => {
      if (i) out.push({ silenceMs: 1600 });
      out.push(g.blob);
      clips++;
    });
  }
  if (clips) out.push({ silenceMs: 800 });
  return { parts: out, clips, missing };
}

/**
 * "Goal-Ava-read-by-Grandma-Rose.wav"
 * @param {object} book
 * @param {{display: string}|null} person
 * @param {{readerName?: string}} reading
 */
export function readingAudioFilename(book, person, reading) {
  const title = fillTemplate(book?.title ?? 'Story', makePerson(person?.display || 'you'));
  const who = String(reading?.readerName ?? '').trim();
  return `${asciiSlug(title, 'Story')}${who ? `-read-by-${asciiSlug(who, 'family')}` : ''}.wav`;
}

/** The book's title with the name in it ("Goal, Ava!"), or the subtitle when there's no name. */
export function storyTitle(book, name) {
  const title = String(book?.title ?? '');
  if (name) return fillTemplate(title, makePerson(name));
  return String(book?.subtitle || fillTemplate(title.replace(/,?\s*\{name\}/g, ''), makePerson('you'))).trim();
}

// ---- Sharing words ---------------------------------------------------------------------

/** The line sent alongside a reading pack. */
export function readingShareText({ readerName, title, landingUrl }) {
  const who = String(readerName ?? '').trim() || 'Someone';
  return `${who} has recorded “${title}” for you. Open the Tiffin & Me read-along at ${landingUrl} and choose “Open a family recording”.`;
}

/** The line sent alongside a gift pack. */
export function giftShareText({ childName, from, landingUrl }) {
  const giver = String(from ?? '').trim();
  return `A gift for ${childName}${giver ? ` from ${giver}` : ''}! Open the Tiffin & Me read-along at ${landingUrl} and choose “Open a family recording”.`;
}

/** Friendly "2 min 5 s" / "45 s". */
export function formatDuration(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

/** "0:07" for a recording clock. */
export function clock(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
