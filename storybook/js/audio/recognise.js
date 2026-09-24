// "Say it": the grown-up says the child's name and the browser's speech
// recogniser writes down what it heard. Recognisers are good at spelling a
// name the way it *sounds* ("Neeve" for Niamh), which is exactly what the
// speech voice needs, so the results become pronunciation candidates.
//
// Recognition usually happens on the browser maker's servers, so the screen
// must show PRIVACY_NOTE before starting. Everything fails soft: any error,
// timeout or refusal just gives an empty list.

export const PRIVACY_NOTE = "Your browser may send this recording to its speech service (e.g. Google or Apple) to turn it into text. We don't keep it.";

function RecognitionClass() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

/** Does this browser offer speech recognition? (Chrome, Edge, Safari; not Firefox) */
export function isRecognitionSupported() {
  return Boolean(RecognitionClass());
}

// Words people say around a name ("her name is Siobhan", "um, Ava").
const FILLERS = new Set([
  'um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'mm', 'ah', 'oh', 'okay', 'ok', 'so', 'and', 'the', 'a', 'an',
  'my', 'name', 'names', "name's", 'is', "it's", 'its', 'it', 'this', 'that', "that's", 'her', 'his', 'their', 'they', 'called', 'hello', 'hi',
]);

function titleCaseWord(w) {
  const letters = w.replace(/[^\p{L}]/gu, '');
  // Respect deliberate mixed case from the recogniser ("McKenzie", "DeShawn").
  const mixed = letters !== letters.toLocaleLowerCase('en-GB') && letters !== letters.toLocaleUpperCase('en-GB');
  if (mixed) return w.charAt(0).toLocaleUpperCase('en-GB') + w.slice(1);
  return w
    .toLocaleLowerCase('en-GB')
    .split(/([-'])/)
    .map((part, i, arr) => {
      // "o'neill" -> "O'Neill", but "ta'liyah" -> "Ta'liyah" (only after a single letter).
      if (i > 0 && arr[i - 1] === "'" && arr[i - 2]?.length !== 1) return part;
      return part.charAt(0).toLocaleUpperCase('en-GB') + part.slice(1);
    })
    .join('');
}

/**
 * Turn raw recogniser alternatives into tidy name spellings, best first:
 * punctuation stripped, filler words dropped, single-word results before
 * multi-word ones (a split name like "Shiv on" still helps the voice), title
 * case, no duplicates, at most `max`.
 * @param {Array<string|{transcript: string, confidence?: number}>} alternatives
 * @param {{max?: number}} [opts]
 * @returns {string[]}
 */
export function cleanTranscripts(alternatives, { max = 5 } = {}) {
  const singles = [];
  const multis = [];
  for (const alt of alternatives ?? []) {
    const raw = typeof alt === 'string' ? alt : alt?.transcript;
    const words = String(raw ?? '')
      .normalize('NFC')
      .replace(/[‘’ʼ`´]/g, "'")
      .replace(/[‐-―−]/g, '-')
      .replace(/[^\p{L}\p{M}'\- ]+/gu, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
      .filter(Boolean)
      .filter((w) => !FILLERS.has(w.toLocaleLowerCase('en-GB')));
    if (words.length === 1) singles.push(words[0]);
    else if (words.length > 1 && words.length <= 3) multis.push(words.join(' '));
  }
  const out = [];
  const seen = new Set();
  for (const s of [...singles, ...multis]) {
    const t = s.split(' ').map(titleCaseWord).join(' ');
    const key = t.toLocaleLowerCase('en-GB');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Listen for the grown-up saying the name once.
 * @param {{lang?: string, maxAlternatives?: number, timeoutMs?: number, max?: number, signal?: AbortSignal,
 *   onStart?: () => void, onError?: (code: string) => void}} [opts]
 *   onStart fires when the browser is actually listening (show "Listening…");
 *   onError reports why nothing came back ('not-allowed', 'no-speech', 'network', 'timeout', …).
 * @returns {Promise<string[]>} distinct spellings, best first ([] on any failure)
 */
export function hearName({ lang = 'en-GB', maxAlternatives = 5, timeoutMs = 6000, max = 5, signal, onStart, onError } = {}) {
  return new Promise((resolve) => {
    const Rec = RecognitionClass();
    if (!Rec || signal?.aborted) return resolve([]);
    let rec;
    try {
      rec = new Rec();
      rec.lang = lang;
      rec.maxAlternatives = maxAlternatives;
      rec.interimResults = false;
      rec.continuous = false;
    } catch {
      return resolve([]);
    }
    const finals = [];
    const interims = []; // some Safari versions never mark a result final
    let settled = false;
    let timer = null;
    let grace = null;
    const tell = (fn, arg) => {
      try {
        fn?.(arg);
      } catch {
        /* ignore UI errors */
      }
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      signal?.removeEventListener('abort', onAbort);
      rec.onresult = rec.onerror = rec.onend = rec.onnomatch = rec.onstart = rec.onaudiostart = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
      const names = cleanTranscripts(finals.length ? finals : interims, { max });
      if (error && !names.length) tell(onError, error);
      resolve(names);
    };
    const onAbort = () => finish('aborted');
    signal?.addEventListener('abort', onAbort, { once: true });

    rec.onstart = () => tell(onStart);
    rec.onresult = (e) => {
      let sawFinal = false;
      const results = e?.results ?? [];
      for (let i = e?.resultIndex ?? 0; i < results.length; i++) {
        const r = results[i];
        const into = r.isFinal === false ? interims : finals;
        if (r.isFinal !== false) sawFinal = true;
        for (let j = 0; j < r.length; j++) {
          const alt = r[j] ?? r.item?.(j);
          if (alt?.transcript) into.push({ transcript: alt.transcript, confidence: alt.confidence });
        }
      }
      if (sawFinal) finish();
    };
    rec.onnomatch = () => finish('no-match');
    rec.onerror = (e) => finish(e?.error || 'error');
    rec.onend = () => finish(finals.length || interims.length ? undefined : 'no-speech');

    timer = setTimeout(() => {
      // Ask politely first so a result in flight still arrives, then give up.
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      grace = setTimeout(() => finish('timeout'), 800);
    }, timeoutMs);

    try {
      rec.start();
    } catch {
      finish('start-failed');
    }
  });
}
