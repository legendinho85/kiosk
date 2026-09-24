// Reader harness: mounts js/reader/reader.js with a book, a person and the
// real narrator/sfx when they exist (stubs otherwise). Everything the reader
// asks of its services is logged on window.__log for the e2e test.

const params = new URLSearchParams(location.search);
if (params.get('test') === '1') {
  globalThis.SB_TEST = { forceSilent: true, timeScale: Number(params.get('scale') ?? 0.05) };
  if (params.has('idle')) globalThis.SB_TEST.idleMs = Number(params.get('idle'));
}

const log = (window.__log = { speakText: [], play: [], sfx: [], pages: [], exit: 0, magic: [] });

const { mountReader, createSilentNarrator } = await import('../../../js/reader/reader.js');
const { validateBook, loadBook, bookUrl } = await import('../../../js/core/book.js');
const { person } = await import('../../../js/core/personalise.js');

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
  get needsGesture() {
    return realNarrator.needsGesture ?? false;
  },
};
const realSfx = await makeSfx();
const sfx = {
  unlock: () => realSfx.unlock?.(),
  play(name, opts) {
    log.sfx.push(name);
    return realSfx.play(name, opts);
  },
};

const who = person(params.get('name') ?? 'Ava', params.get('say') ?? undefined);
window.__reader = await mountReader(document.getElementById('app'), {
  book,
  bookId,
  baseUrl,
  person: who,
  pronunciation: { useRecording: false, recordingId: null },
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
  requireTap: params.has('gate') ? params.get('gate') === '1' : undefined,
});
window.__ready = true;
