// Turns a page's lines into a narration plan: short speech utterances (one
// per sentence, which avoids long-utterance bugs in some browsers), clips of
// the parent's own recording of the name, and pauses. Each segment knows which
// read-along units it covers and where they sit in the utterance text, so
// word-boundary events (or estimated timings) can drive highlighting.

import { tokenizeLine } from '../core/personalise.js';

/**
 * @typedef {{kind: 'speech', line: number, text: string, units: Array<{u: number, start: number, end: number}>}} SpeechSegment
 * @typedef {{kind: 'clip', line: number, units: Array<{u: number}>, recordingId: string}} ClipSegment
 * @typedef {{kind: 'pause', ms: number}} PauseSegment
 * @typedef {SpeechSegment|ClipSegment|PauseSegment} Segment
 */

const SENTENCE_END = /[.!?…]["'”’)]*$/;

/**
 * @param {string[]} lines template lines ("Pass, pass, pass to {name}!")
 * @param {{display: string, say: string, count?: number}} person  (count > 1: siblings; recordings are then not used)
 * @param {{useRecording?: boolean, recordingId?: string|null, linePauseMs?: number}} [opts]
 * @returns {{lines: ReturnType<typeof tokenizeLine>[], segments: Segment[]}}
 */
export function planLines(lines, person, { useRecording = false, recordingId = null, linePauseMs = 350 } = {}) {
  const tokenized = lines.map((l) => tokenizeLine(l, person));
  /** @type {Segment[]} */
  const segments = [];
  // Siblings reading together: the voice says the joined names ("Amara and
  // Zak"), so one child's recorded name never stands in for all of them.
  const together = (person?.count ?? 1) > 1;
  const clip = Boolean(useRecording && recordingId && !together);

  tokenized.forEach((line, li) => {
    if (segments.length && linePauseMs > 0 && line.units.length) segments.push({ kind: 'pause', ms: linePauseMs });
    /** @type {SpeechSegment|null} */
    let cur = null;
    const flush = () => {
      if (cur && cur.units.length) segments.push(cur);
      cur = null;
    };
    line.units.forEach((unit, u) => {
      // The parent's recording replaces the plain name; possessives ("Ava's")
      // stay with the voice because a recording can't grow an "'s".
      if (clip && unit.isName && unit.nameForm !== 'poss') {
        flush();
        segments.push({ kind: 'clip', line: li, units: [{ u }], recordingId });
        if (SENTENCE_END.test(unit.text)) segments.push({ kind: 'pause', ms: 250 });
        return;
      }
      cur ??= { kind: 'speech', line: li, text: '', units: [] };
      if (cur.text) cur.text += ' ';
      const start = cur.text.length;
      cur.text += unit.say;
      cur.units.push({ u, start, end: cur.text.length });
      if (SENTENCE_END.test(unit.say)) flush();
    });
    flush();
  });
  return { lines: tokenized, segments };
}

/** Which unit (index into segment.units) a speech boundary charIndex falls in. */
export function unitForCharIndex(segment, charIndex) {
  let best = 0;
  segment.units.forEach((x, i) => {
    if (x.start <= charIndex) best = i;
  });
  return best;
}

function syllables(word) {
  return Math.max(1, (String(word).toLowerCase().match(/[aeiouyà-ÿ]+/g) || []).length);
}

/** Rough spoken duration of one unit, for highlighting when the voice gives no word events. */
export function estimateUnitMs(say, rate = 1) {
  const r = Math.min(2, Math.max(0.5, rate || 1));
  let ms = 110 + syllables(say) * 185;
  if (/[,;:]["'”’)]*$/.test(say)) ms += 170;
  if (SENTENCE_END.test(say)) ms += 300;
  return Math.round(ms / r);
}

/** Estimated timeline (ms offsets) for each unit of a speech segment. */
export function estimateTimeline(segment, rate = 1) {
  let t = 0;
  return segment.units.map((x) => {
    const at = t;
    t += estimateUnitMs(segment.text.slice(x.start, x.end), rate);
    return { at, u: x.u, index: segment.units.indexOf(x), dur: t - at };
  });
}
