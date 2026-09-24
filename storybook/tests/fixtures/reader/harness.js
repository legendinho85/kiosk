// Reader harness: mounts js/reader/reader.js with a book, a person and the
// real narrator/sfx when they exist (stubs otherwise). Everything the reader
// asks of its services is logged on window.__log for the e2e test.

const params = new URLSearchParams(location.search);
if (params.get('test') === '1') {
  globalThis.SB_TEST = { forceSilent: true, timeScale: Number(params.get('scale') ?? 0.05) };
  if (params.has('idle')) globalThis.SB_TEST.idleMs = Number(params.get('idle'));
}

const log = (window.__log = { speakText: [], speakOpts: [], play: [], sfx: [], sfxOpts: [], pages: [], exit: 0, magic: [], parts: [], clips: [], letters: 0 });

// Accessibility settings as the app applies them (docs/architecture.md section 12).
if (params.get('easy') === '1') document.documentElement.dataset.easyRead = 'true';
if (params.get('contrast') === 'high') document.documentElement.dataset.contrast = 'high';

// Watch recorded clips start and stop (recorder.js plays them with Web Audio
// once the page has had a tap, or an <audio> element before that).
{
  const t = () => Math.round(performance.now());
  const mediaPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(...args) {
    if (String(this.src).startsWith('blob:')) {
      const entry = { how: 'element', start: t(), end: null, offset: Number(this.currentTime) || 0 };
      log.clips.push(entry);
      const end = () => (entry.end ??= t());
      this.addEventListener('pause', end, { once: true });
      this.addEventListener('ended', end, { once: true });
      this.addEventListener('emptied', end, { once: true });
    }
    return mediaPlay.apply(this, args);
  };
  const srcStart = AudioBufferSourceNode.prototype.start;
  const srcStop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start = function start(...args) {
    const ms = (this.buffer?.duration ?? 0) * 1000;
    if ((window.__clipMs ?? []).some((x) => Math.abs(ms - x) < 80)) {
      // one of the reading's clips (not a sound effect's noise buffer); offset in seconds
      this.__entry = { how: 'webaudio', start: t(), end: null, offset: Number(args[1]) || 0 };
      log.clips.push(this.__entry);
      this.addEventListener('ended', () => (this.__entry.end ??= t()), { once: true });
    }
    return srcStart.apply(this, args);
  };
  AudioBufferSourceNode.prototype.stop = function stop(...args) {
    if (this.__entry) this.__entry.end ??= t();
    return srcStop.apply(this, args);
  };
}

const { mountReader, createSilentNarrator } = await import('../../../js/reader/reader.js');
const { validateBook, loadBook, bookUrl } = await import('../../../js/core/book.js');
const { person, togetherPerson } = await import('../../../js/core/personalise.js');

const bookId = params.get('book') ?? 'fixture';
let book;
let baseUrl;
if (bookId === 'fixture') {
  baseUrl = new URL('./book/', location.href).href;
  book = await (await fetch(new URL('book.json', baseUrl))).json();
  const problems = validateBook(book);
  if (problems.length) console.warn(`fixture book problems:\n${problems.join('\n')}`);
} else if (params.get('merge') === '1') {
  // Preview a book while the illustrators work: the draft plus whichever
  // pages/pN.json fragments exist (what tools/build-book.mjs will produce).
  baseUrl = bookUrl(bookId);
  book = await (await fetch(new URL('book.draft.json', baseUrl))).json();
  for (const page of book.pages) {
    const r = await fetch(new URL(`pages/p${page.n}.json`, baseUrl)).catch(() => null);
    if (!r?.ok) continue;
    const patch = await r.json();
    for (const key of ['text', 'prompt', 'after', 'n', 'kind']) delete patch[key];
    Object.assign(page, patch);
  }
  const problems = validateBook(book);
  if (problems.length) console.warn(`book problems:\n${problems.join('\n')}`);
} else {
  book = await loadBook(bookId);
  baseUrl = bookUrl(bookId);
}

const settings = {
  voiceURI: null,
  rate: 0.9,
  pitch: 1.05,
  highlight: params.get('highlight') !== '0',
  sfx: true,
  autoTurn: params.get('autoTurn') === '1',
  readPrompts: params.get('prompts') !== '0',
};

async function makeNarrator() {
  if (params.get('stub') !== '1') {
    try {
      const m = await import('../../../js/narrator/narrator.js');
      return m.createNarrator({ getSettings: () => settings, getRecording: async () => null });
    } catch (err) {
      console.info('narrator module not available yet; using the silent stub', err?.message);
    }
  }
  return createSilentNarrator();
}

async function makeSfx() {
  if (params.get('stub') !== '1') {
    try {
      const m = await import('../../../js/audio/sfx.js');
      return m.createSfx({ enabled: () => settings.sfx });
    } catch (err) {
      console.info('sfx module not available yet; using a silent stub', err?.message);
    }
  }
  return { unlock() {}, play: () => 0 };
}

// Wrap services so the test can see what the reader asked for.
const realNarrator = await makeNarrator();
const narrator = {
  get supported() {
    return realNarrator.supported;
  },
  ready: realNarrator.ready,
  hasVoice: () => realNarrator.hasVoice?.() ?? false,
  listVoices: () => realNarrator.listVoices?.() ?? [],
  unlock: () => realNarrator.unlock?.(),
  speakText(text, opts) {
    log.speakText.push(text);
    log.speakOpts.push({ text, rateScale: opts?.rateScale ?? 1 });
    return realNarrator.speakText(text, opts);
  },
  play(plan, opts) {
    log.play.push({ text: plan.lines.map((l) => l.display), rateScale: opts?.rateScale ?? 1, pitchScale: opts?.pitchScale ?? 1 });
    return realNarrator.play(plan, opts);
  },
  stop: () => realNarrator.stop?.(),
  get speaking() {
    return realNarrator.speaking;
  },
  // gesture=1: an engine that won't talk until someone taps (shows "Tap to hear the story").
  get needsGesture() {
    return params.get('gesture') === '1' || (realNarrator.needsGesture ?? false);
  },
};
const realSfx = await makeSfx();
const sfx = {
  unlock: () => realSfx.unlock?.(),
  play(name, opts) {
    log.sfx.push(name);
    log.sfxOpts.push({ name, volume: opts?.volume ?? null });
    return realSfx.play(name, opts);
  },
};

// reading=mic|tone: a grown-up's recorded reading (grandparent mode). The
// clips are real WAV files: a snippet recorded from Chromium's fake
// microphone (--use-fake-device-for-media-stream) through js/audio/recorder.js,
// looped to the length each part should last (mainMs, afterMs). "tone" (or no
// microphone) uses a soft sine tone instead.
//   parts=all | "1:main,2:after"  which parts exist    reader=Grandma Rose    lang=Urdu    label=Read by Nana in Urdu
//   nolength=1: the reader can't find out how long a clip is (as when a phone's recording won't report
//   its length), so it highlights on the plain estimate, which may run past the end of the clip
async function makeReading() {
  const kind = params.get('reading');
  if (!kind) return null;
  const rec = await import('../../../js/audio/recorder.js');
  const rate = 22050;
  let samples = null;
  let source = 'tone';
  if (kind === 'mic') {
    try {
      const { blob } = await rec.recordName({ maxMs: 1600, autoStop: false });
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const buf = await new OAC(1, 1, rate).decodeAudioData(await blob.arrayBuffer());
      samples = buf.getChannelData(0);
      source = 'mic';
    } catch (err) {
      console.info('fake microphone unavailable; using a tone', err?.message ?? err);
    }
  }
  const make = async (ms) => {
    const n = Math.round((ms / 1000) * rate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = samples?.length ? samples[i % samples.length] * 0.5 : Math.sin((i / rate) * 2 * Math.PI * 330) * 0.15;
    return new Blob([rec.encodeWav(out, rate)], { type: 'audio/wav' });
  };
  const spec = params.get('parts') ?? 'all';
  const has = (n, part) => spec === 'all' || spec.split(',').includes(`${n}:${part}`);
  // broken=3:main: that part is a file that isn't audio at all.
  const broken = (params.get('broken') ?? '').split(',').filter(Boolean);
  const ms = { main: Number(params.get('mainMs') ?? 2000), after: Number(params.get('afterMs') ?? 1200) };
  window.__clipMs = [ms.main, ms.after];
  const clips = new Map();
  log.reading = { source };
  return {
    readerName: params.get('reader') ?? 'Grandma Rose',
    language: params.get('lang') ?? undefined,
    label: params.get('label') ?? undefined,
    async getPart(n, part) {
      log.parts.push(`${n}:${part}`);
      const key = `${n}:${part}`;
      if (broken.includes(key)) return new Blob([new TextEncoder().encode('not a recording '.repeat(40))], { type: 'audio/wav' });
      if (!has(n, part)) return null;
      if (!clips.has(key)) clips.set(key, await make(ms[part]));
      return clips.get(key);
    },
  };
}
const reading = await makeReading();
if (params.get('nolength') === '1') {
  // js/reader/clip.js measures clips with an <audio> element, then OfflineAudioContext: take both away.
  window.Audio = undefined;
  window.OfflineAudioContext = undefined;
  window.webkitOfflineAudioContext = undefined;
}

// sibs=Amara,Zak: children reading together.
const sibs = (params.get('sibs') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const who = sibs.length > 1 ? togetherPerson(sibs.map((display) => ({ display }))) : person(params.get('name') ?? 'Ava', params.get('say') ?? undefined);
window.__reader = await mountReader(document.getElementById('app'), {
  book,
  bookId,
  baseUrl,
  person: who,
  pronunciation: { useRecording: false, recordingId: null },
  reading,
  bedtime: params.get('bedtime') === '1',
  settings,
  narrator,
  sfx,
  startPage: Number(params.get('page') ?? 1),
  onPageChange: (n) => log.pages.push(n),
  onExit: () => {
    log.exit++;
    document.body.dataset.exited = '1';
  },
  onMagic: (n) => log.magic.push(n),
  // letters=1: the app offers the first-letter game at the end.
  onLetters: params.get('letters') === '1' ? () => void log.letters++ : undefined,
  requireTap: params.has('gate') ? params.get('gate') === '1' : undefined,
});
window.__ready = true;
