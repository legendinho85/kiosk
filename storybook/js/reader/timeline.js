// Read-along timing for things the reader can't get word events from: a
// grown-up's recorded reading of a page (grandparent mode), and restarting a
// sentence after a pause. Pure functions, unit-tested in
// tests/unit/reader-timeline.test.mjs.
//
// A recorded part covers several blocks of lines, e.g. the page text and then
// the prompt ("main"), or the "after" lines. We estimate how long each word
// takes to say (the same estimate the silent narrator uses), then stretch the
// whole timeline to the clip's real length, so the highlight keeps pace with
// Grandma whether she reads briskly or slowly.

import { estimateUnitMs } from '../narrator/plan.js';

const PUNCT_MS = 120; // a lone "—" or "..." barely takes any time to say

/**
 * @typedef {{part: string, line: number, u: number, at: number, dur: number}} ClipStep
 *   `part` is the block ('text' | 'prompt' | 'after'); `line`/`u` index into that block's tokenised lines.
 */

/**
 * Estimated timeline for a recorded part.
 * @param {Array<{part: string, lines: Array<{units: Array<{say: string, isWord?: boolean}>}>}>} blocks
 *   tokenised lines (tokenizeLine / planLines().lines) per block, in reading order
 * @param {{rate?: number, linePauseMs?: number, blockPauseMs?: number}} [opts]
 * @returns {{steps: ClipStep[], total: number}}
 */
export function clipTimeline(blocks, { rate = 1, linePauseMs = 350, blockPauseMs = 700 } = {}) {
  const steps = [];
  let t = 0;
  let any = false;
  for (const block of blocks ?? []) {
    let firstLine = true;
    (block?.lines ?? []).forEach((line, li) => {
      const units = line?.units ?? [];
      if (!units.length) return;
      if (any) t += firstLine ? blockPauseMs : linePauseMs;
      firstLine = false;
      any = true;
      units.forEach((unit, u) => {
        const word = unit.isWord ?? /[\p{L}\p{N}]/u.test(String(unit.say ?? ''));
        const dur = word ? estimateUnitMs(String(unit.say ?? ''), rate) : PUNCT_MS;
        steps.push({ part: block.part, line: li, u, at: t, dur });
        t += dur;
      });
    });
  }
  return { steps, total: t };
}

/**
 * Stretch (or squeeze) an estimated timeline to a clip's real duration. A
 * recording starts and ends with a breath of silence, so the words are spread
 * over the middle of the clip. An unknown duration leaves the estimate as it is.
 * @param {{steps: ClipStep[], total: number}} timeline
 * @param {number|null} durationMs
 * @param {{leadMs?: number, tailMs?: number}} [opts] defaults: 4% / 6% of the clip, at most 250 / 400 ms
 * @returns {{steps: ClipStep[], total: number, factor: number}}
 */
export function stretchTimeline(timeline, durationMs, { leadMs, tailMs } = {}) {
  const steps = timeline?.steps ?? [];
  const total = Number(timeline?.total) || 0;
  if (!(durationMs > 0) || !(total > 0) || !steps.length) {
    return { steps: steps.map((s) => ({ ...s })), total, factor: 1 };
  }
  const lead = Math.max(0, leadMs ?? Math.min(250, durationMs * 0.04));
  const tail = Math.max(0, tailMs ?? Math.min(400, durationMs * 0.06));
  const span = Math.max(durationMs * 0.5, durationMs - lead - tail);
  const factor = span / total;
  const round = (n) => Math.round(n * 10) / 10;
  return {
    steps: steps.map((s) => ({ ...s, at: round(lead + s.at * factor), dur: round(s.dur * factor) })),
    total: durationMs,
    factor,
  };
}

/** Index of the step being said at time `t` (ms from the clip's start); -1 before the first word. */
export function stepAt(steps, t) {
  let best = -1;
  for (let i = 0; i < (steps?.length ?? 0); i++) {
    if (steps[i].at <= t) best = i;
    else break;
  }
  return best;
}

/**
 * Where a paused recording should carry on (ms into the clip): a little
 * before where it stopped, at the start of a word, so the child hears the
 * words lead in again; never back across into the previous block (the prompt
 * doesn't turn back into the page text).
 * @param {ClipStep[]} steps  a stretched timeline's steps
 * @param {number} pos  where the clip was stopped (ms)
 * @param {{backupMs?: number}} [opts]
 */
export function clipResumeAt(steps, pos, { backupMs = 800 } = {}) {
  if (!(pos > 0) || !steps?.length) return 0;
  const here = stepAt(steps, pos);
  let back = stepAt(steps, pos - backupMs);
  if (here >= 0 && back >= 0 && steps[back].part !== steps[here].part) back = steps.findIndex((x) => x.part === steps[here].part);
  return back >= 0 ? Math.max(0, steps[back].at) : 0;
}

/** When the reading reaches the first word of `part` (ms), or null if it has none. */
export function partStart(steps, part) {
  return steps?.find((s) => s.part === part)?.at ?? null;
}

/**
 * A narration plan that starts again from the sentence containing `from`
 * (the word being read when the story was paused). Speech engines can't
 * reliably resume mid-utterance, so the sentence is simply read again.
 * planLines() makes one speech segment per sentence, and `lines` stays the
 * same so highlighting still lines up with the words on screen.
 * @param {{lines: any[], segments: Array<{kind: string, line?: number, units?: Array<{u: number}>}>}} plan
 * @param {{line: number, u: number}|null} from
 */
export function resumePlan(plan, from) {
  const segs = plan?.segments ?? [];
  if (!from) return plan;
  const covers = (s) => s.kind !== 'pause' && s.line === from.line && (s.units ?? []).some((x) => x.u === from.u);
  let i = segs.findIndex(covers);
  if (i < 0) {
    // The word isn't in any segment (e.g. it was already past): start at the
    // first segment of that line or later.
    i = segs.findIndex((s) => s.kind !== 'pause' && s.line >= from.line);
    if (i < 0) return { ...plan, segments: [] };
  }
  // A clip of the parent saying the name is its own segment; restart the
  // speech that led up to it too, so the sentence makes sense.
  while (i > 0 && segs[i - 1].kind !== 'pause' && segs[i - 1].line === segs[i].line && !endsSentence(segs[i - 1])) i--;
  return { ...plan, segments: segs.slice(i) };
}

function endsSentence(seg) {
  if (seg.kind !== 'speech') return false;
  return /[.!?…]["'”’)]*$/.test(String(seg.text ?? '').trim());
}

/** Scale a timer for tests (SB_TEST.timeScale), like the silent narrator does. */
export function testScale(ms) {
  const s = Number(globalThis.SB_TEST?.timeScale);
  return s > 0 ? ms * s : ms;
}
