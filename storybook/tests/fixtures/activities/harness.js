// Letter-trace harness: mounts the activity with a person, the real narrator
// and sfx (or logging stubs), and records what it asked for on window.__log.

const params = new URLSearchParams(location.search);
if (params.get("test") === "1") globalThis.SB_TEST = { forceSilent: true, timeScale: Number(params.get("scale") ?? 0.05), ...(params.has("idle") ? { idleMs: Number(params.get("idle")) } : {}) };

const log = (window.__log = { speak: [], sfx: [], done: [], skip: [], stops: 0 });
const lt = await import('../../../js/activities/letter-trace.js');
const { person, togetherPerson } = await import('../../../js/core/personalise.js');
window.__lt = lt;

function sleep(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });
}

async function makeNarrator() {
  if (params.get('stub') !== '1') {
    try {
      const m = await import('../../../js/narrator/narrator.js');
      return m.createNarrator({ getSettings: () => ({ rate: 0.9, pitch: 1.05 }), getRecording: async () => null });
    } catch (err) {
      console.info('narrator unavailable; using a stub', err?.message);
    }
  }
  const scale = globalThis.SB_TEST?.timeScale ?? 1;
  return {
    speaking: false,
    unlock() {},
    stop() {},
    async speakText(text, { signal } = {}) {
      await sleep(text.split(/\s+/).length * 300 * scale, signal);
      return signal?.aborted ? 'stopped' : 'done';
    },
  };
}

async function makeSfx() {
  if (params.get('stub') !== '1') {
    try {
      const m = await import('../../../js/audio/sfx.js');
      return m.createSfx({ enabled: () => true });
    } catch (err) {
      console.info('sfx unavailable; using a stub', err?.message);
    }
  }
  return { unlock() {}, play: () => 0 };
}

const realNarrator = await makeNarrator();
const realSfx = await makeSfx();
const narrator = {
  get speaking() {
    return realNarrator.speaking;
  },
  unlock: () => realNarrator.unlock?.(),
  stop: () => {
    log.stops += 1;
    return realNarrator.stop?.();
  },
  speakText: (text, o) => {
    log.speak.push(text);
    return realNarrator.speakText(text, o);
  },
};
const sfx = {
  unlock: () => realSfx.unlock?.(),
  play: (name, o) => {
    log.sfx.push(name);
    return realSfx.play(name, o);
  },
};

function makePerson() {
  const sibs = params.get('sibs');
  if (sibs) return togetherPerson(sibs.split(',').map((display) => ({ display: display.trim() })));
  return person(params.get('name') ?? 'Ava', params.get('say') ?? undefined);
}

const app = document.getElementById('app');
window.__mount = (overrides = {}) => {
  document.body.removeAttribute('data-finished');
  const reduced = params.get('reduced');
  window.__api = lt.mountLetterTrace(app, {
    person: makePerson(),
    narrator,
    sfx,
    bedtime: params.get('bedtime') === '1',
    reducedMotion: reduced === '1' ? true : reduced === '0' ? false : undefined,
    lang: params.get('lang') ?? '',
    random: params.has('seed') ? lt.seededRandom(Number(params.get('seed'))) : undefined,
    onDone: (result) => {
      log.done.push(result);
      window.__api?.destroy();
      document.body.dataset.finished = '';
      app.dataset.finishedText = 'Done!';
    },
    onSkip: (result) => {
      log.skip.push(result);
      window.__api?.destroy();
      document.body.dataset.finished = '';
      app.dataset.finishedText = 'Skipped';
    },
    ...overrides,
  });
  return window.__api;
};
if (params.get('auto') !== '0') window.__mount();
