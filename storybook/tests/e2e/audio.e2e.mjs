// Browser test for the speech & sound layer (js/narrator, js/audio,
// js/core/env.js) and the app shell's self-hosted fonts, in headless Chromium.
//
//   node tests/e2e/audio.e2e.mjs            # PORT defaults to 8105
//   PORT=8201 SHOTS=/tmp/shots node tests/e2e/audio.e2e.mjs
//
// Headless Chromium has no speech voices, so part A runs the narrator in
// silent timed mode (?test=1). Part B injects a fake speechSynthesis with a
// realistic Edge voice list that fires word-boundary events, to exercise
// voice ranking, online-voice consent, boundary-driven highlighting, voice
// switching and the parent's recording played inside the story. Part C has
// only online voices (consent needed: silent until the grown-up agrees).
// A fake microphone (--use-fake-device-for-media-stream) exercises recording
// and joining recordings into one WAV (part A). Part D checks environment
// detection; part E the self-hosted fonts in the real app.
// The http-server runs in its own process group and is always killed.
// Exits non-zero on any failure.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 8105);
const SHOTS = process.env.SHOTS ?? '';
const ROOT = new URL('../../', import.meta.url).pathname;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE = `${BASE}/tests/fixtures/audio.html`;
const BOOK = 'tiffin-football';

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => import('playwright'));

// ---- tiny harness ----------------------------------------------------------------
const failures = [];
let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err?.message ?? err}`);
    console.log(`  ✖ ${name}\n      ${String(err?.message ?? err).split('\n').join('\n      ')}`);
  }
}
function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

const GROUPS = process.platform !== 'win32';
/** http-server in its own process group, so stopping it also stops anything npx started. */
function startServer() {
  const local = '/opt/node22/lib/node_modules/http-server/bin/http-server';
  const [cmd, args] = existsSync(local)
    ? [process.execPath, [local, ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s']]
    : ['npx', ['--yes', 'http-server', ROOT, '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '-s']];
  const proc = spawn(cmd, args, { stdio: 'ignore', detached: GROUPS });
  const stop = () => {
    try {
      if (GROUPS) process.kill(-proc.pid, 'SIGTERM');
      else proc.kill();
    } catch {
      /* already gone */
    }
  };
  process.once('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      stop();
      process.exit(130);
    });
  }
  return { proc, stop };
}
async function waitForServer(url, ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`server did not start on ${url}`);
}

/** Collect console errors and page errors, ignoring web fonts the sandbox can't fetch. */
function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(url) || /fonts\.(googleapis|gstatic)\.com/.test(m.text())) return;
    if (/Failed to load resource/.test(m.text()) && !url) return; // font retries with no URL attached
    errors.push(`console: ${m.text()} ${url}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function noHorizontalScroll(page) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  check(sw <= w, `page scrolls sideways (${sw} > ${w})`);
}

// Voice lists as real browsers report them: [name, lang, localService, default].
const EDGE_VOICES = [
  ['Microsoft David - English (United States)', 'en-US', true, true],
  ['Microsoft Hazel - English (United Kingdom)', 'en-GB', true],
  ['Microsoft Aria Online (Natural) - English (United States)', 'en-US'],
  ['Microsoft Maisie Online (Natural) - English (United Kingdom)', 'en-GB'],
  ['Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB'],
  ['Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB'],
  ['Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB'],
  ['Microsoft Emily Online (Natural) - English (Ireland)', 'en-IE'],
  ['Microsoft Katja Online (Natural) - German (Germany)', 'de-DE'],
];
// Chromium on Linux with no speech-dispatcher voices: only Google's network voices.
const ONLINE_ONLY_VOICES = [
  ['Google US English', 'en-US'],
  ['Google UK English Female', 'en-GB'],
  ['Google UK English Male', 'en-GB'],
  ['Google Deutsch', 'de-DE'],
];

// A fake speech engine: the given voice list, word boundaries, and a log of what was said.
const FAKE_SPEECH = (list) => {
  const voices = list.map(([name, lang, local = false, def = false]) => ({ name, lang, voiceURI: name, localService: local, default: def }));
  window.__spoken = [];
  class Utterance extends EventTarget {
    constructor(text = '') {
      super();
      Object.assign(this, { text, voice: null, lang: '', rate: 1, pitch: 1, volume: 1 });
    }
  }
  const timers = [];
  let current = null;
  const queue = [];
  const fire = (u, type, extra = {}) => {
    const e = Object.assign(new Event(type), extra);
    u[`on${type}`]?.(e);
    u.dispatchEvent(e);
  };
  const synth = Object.assign(new EventTarget(), {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: () => voices,
    speak(u) {
      window.__spoken.push({ text: u.text, voice: u.voice?.name ?? null, local: u.voice ? u.voice.localService : null, rate: u.rate, pitch: u.pitch, lang: u.lang, volume: u.volume });
      queue.push(u);
      synth.pending = Boolean(current);
      if (!current) next();
    },
    cancel() {
      timers.splice(0).forEach(clearTimeout);
      const u = current;
      current = null;
      queue.length = 0;
      synth.speaking = synth.pending = false;
      if (u) setTimeout(() => fire(u, 'error', { error: 'interrupted' }), 0);
    },
    pause() {},
    resume() {},
  });
  function next() {
    const u = queue.shift();
    current = u ?? null;
    synth.speaking = Boolean(u);
    synth.pending = queue.length > 0;
    if (!u) return;
    const wordMs = 110 / (u.rate || 1);
    const words = [...u.text.matchAll(/\S+/g)];
    const at = (ms, fn) => timers.push(setTimeout(() => current === u && fn(), ms));
    at(25, () => fire(u, 'start'));
    words.forEach((m, i) => at(25 + i * wordMs, () => fire(u, 'boundary', { name: 'word', charIndex: m.index })));
    at(25 + Math.max(1, words.length) * wordMs, () => {
      fire(u, 'end');
      next();
    });
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
};

// ---- run -------------------------------------------------------------------------
const server = startServer();
let browser;
try {
  await waitForServer(FIXTURE);
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  // ===== A. Silent timed mode (as in all app tests), phone portrait =====
  console.log('A. silent timed mode, fake microphone');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
    const errors = watchErrors(page);
    await page.goto(`${FIXTURE}?test=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-lab-ready]', { timeout: 8000 });

    await step('voices are discovered within ~1.5 s, even with none', async () => {
      const readyMs = await page.evaluate(() => audioLab.readyMs);
      check(readyMs >= 1300 && readyMs < 2200, `narrator.ready took ${readyMs} ms (should give up at ~1.5 s)`);
      await page.waitForSelector('[data-testid=no-voices]');
      const mode = await page.evaluate(() => [audioLab.narrator.hasVoice(), audioLab.narrator.mode, audioLab.narrator.supported]);
      check(mode[0] === false && mode[1] === 'silent', `expected silent mode, got ${mode}`);
    });

    await step('silent narration highlights every word of the page in order and resolves "done"', async () => {
      await page.click('[data-testid=lab-play]');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 15000 });
      const r = await page.evaluate(() => {
        const run = audioLab.runs.at(-1);
        const total = document.querySelectorAll('#page-text .word').length;
        return { result: run.result, units: run.units, total };
      });
      check(r.result === 'done', `result ${r.result}`);
      check(r.units.length === r.total, `lit ${r.units.length} of ${r.total} words`);
      for (let i = 1; i < r.units.length; i++) {
        const [l0, u0] = r.units[i - 1];
        const [l1, u1] = r.units[i];
        check(l1 > l0 || (l1 === l0 && u1 === u0 + 1), `out of order at ${i}: ${r.units[i - 1]} -> ${r.units[i]}`);
      }
    });

    await step('stop mid-page resolves "stopped" and no more words light up', async () => {
      await page.evaluate(() => (globalThis.SB_TEST.timeScale = 0.4));
      await page.click('[data-testid=lab-play]');
      await page.waitForFunction(() => audioLab.runs.at(-1).units.length >= 3);
      await page.click('[data-testid=lab-stop]');
      await page.waitForSelector('[data-testid=read-card][data-state=stopped]', { timeout: 3000 });
      const n = await page.evaluate(() => audioLab.runs.at(-1).units.length);
      await page.waitForTimeout(800);
      const n2 = await page.evaluate(() => audioLab.runs.at(-1).units.length);
      check(n === n2, `words kept lighting up after stop (${n} -> ${n2})`);
      await page.evaluate(() => (globalThis.SB_TEST.timeScale = 0.05));
    });

    await step('the whole real book narrates with the name woven in (silent mode)', async () => {
      const r = await page.evaluate(async () => {
        const { narrator, planLines, person, book } = audioLab;
        const who = person('Siobhan', 'Shi vawn');
        const out = [];
        for (const p of book.pages) {
          const lines = [...(p.text ?? []), p.prompt, ...(p.after ?? [])].filter((l) => l && l.trim());
          const plan = planLines(lines, who);
          const seen = new Set();
          const result = await narrator.play(plan, { onUnit: (l, u) => seen.add(`${l}:${u}`), rateScale: p.voice?.rate ?? 1 });
          const total = plan.lines.reduce((n, l) => n + l.units.length, 0);
          const names = plan.lines.flatMap((l) => l.units.filter((u) => u.isName)).length;
          out.push({ n: p.n, result, seen: seen.size, total, names });
        }
        return out;
      });
      check(r.length >= 2, 'book has pages');
      for (const p of r) check(p.result === 'done' && p.seen === p.total, `page ${p.n}: ${p.result}, ${p.seen}/${p.total}`);
      check(r.reduce((n, p) => n + p.names, 0) >= 5, 'the name appears across the book');
    });

    await step('every sound effect plays from a tap (AudioContext running)', async () => {
      for (const name of ['whistle', 'kick', 'cheer', 'pop', 'boing', 'clap', 'ding', 'swoosh', 'drum', 'sparkle', 'click']) {
        await page.click(`[data-testid=sfx-${name}]`);
        await page.waitForTimeout(80);
      }
      const log = await page.evaluate(() => audioLab.sfxLog);
      check(log.length === 11, `${log.length} taps logged`);
      const bad = log.filter((e) => !(e.ms > 0) || e.state !== 'running');
      check(bad.length <= 1, `sounds that did not play: ${JSON.stringify(bad)}`); // the overlap cap may drop one
    });

    await step('turning sound effects off is respected', async () => {
      await page.click('#sfx-on');
      await page.click('[data-testid=sfx-ding]');
      const last = await page.evaluate(() => audioLab.sfxLog.at(-1));
      check(last.ms === 0, `played while off: ${JSON.stringify(last)}`);
      await page.click('#sfx-on');
    });

    await step('sound effects are gentle: every peak between -30 and -3 dBFS and audible', async () => {
      await page.click('[data-testid=sfx-measure]');
      await page.waitForFunction(() => audioLab.levels.length === 11, null, { timeout: 20000 });
      const levels = await page.evaluate(() => audioLab.levels);
      for (const l of levels) {
        check(l, 'offline render failed');
        const db = 20 * Math.log10(l.peak);
        check(db > -30 && db < -3, `${l.name} peaks at ${db.toFixed(1)} dBFS`);
        check(l.rms > 0.003, `${l.name} is nearly silent (rms ${l.rms})`);
        check(l.durationMs >= 60 && l.durationMs <= 2000, `${l.name} lasts ${l.durationMs} ms`);
      }
    });

    await step('recording with the (fake) microphone gives a trimmed 16-bit mono WAV and a live level meter', async () => {
      await page.click('[data-testid=lab-record]');
      await page.waitForFunction(() => audioLab.recording || audioLab.recordError, null, { timeout: 12000 });
      const r = await page.evaluate(async () => {
        const blob = audioLab.recordingBlob();
        const head = blob ? new Uint8Array(await blob.slice(0, 44).arrayBuffer()) : null;
        const dv = head ? new DataView(head.buffer) : null;
        return {
          error: audioLab.recordError ?? null,
          rec: audioLab.recording,
          riff: head ? String.fromCharCode(...head.slice(0, 4)) + String.fromCharCode(...head.slice(8, 12)) : '',
          channels: dv?.getUint16(22, true),
          bits: dv?.getUint16(34, true),
          maxLevel: Math.max(0, ...(audioLab.recordLevels ?? [])),
          levels: (audioLab.recordLevels ?? []).length,
        };
      });
      check(!r.error, `recording failed: ${r.error}`);
      check(r.rec.type === 'audio/wav' && r.rec.processed, `not processed to WAV: ${JSON.stringify(r.rec)}`);
      check(r.riff === 'RIFFWAVE' && r.channels === 1 && r.bits === 16, `bad WAV header ${JSON.stringify(r)}`);
      check(r.rec.durationMs > 100 && r.rec.durationMs < 4100, `duration ${r.rec.durationMs}`);
      check(r.levels > 5 && r.maxLevel > 0.2, `level meter ${r.levels} readings, max ${r.maxLevel}`);
      const mic = await page.evaluate(() => navigator.mediaDevices.enumerateDevices().then((d) => d.length));
      check(mic >= 1, 'no devices listed');
    });

    await step('processing trims silence to ~80 ms either side and normalises to about -1 dBFS (real decoder)', async () => {
      const r = await page.evaluate(async () => {
        const rec = await import('/js/audio/recorder.js');
        const sr = 48000;
        const s = new Float32Array(sr * 2); // 0.6 s silence, 0.5 s quiet tone, 0.9 s silence
        for (let i = Math.round(sr * 0.6); i < Math.round(sr * 1.1); i++) s[i] = 0.1 * Math.sin((2 * Math.PI * 330 * i) / sr);
        const out = await rec.processRecording(new Blob([rec.encodeWav(s, sr)], { type: 'audio/wav' }));
        const buf = await new OfflineAudioContext(1, 1, sr).decodeAudioData(await out.blob.arrayBuffer());
        const d = buf.getChannelData(0);
        let peak = 0;
        for (const x of d) peak = Math.max(peak, Math.abs(x));
        let silentCode = null;
        try {
          await rec.processRecording(new Blob([rec.encodeWav(new Float32Array(sr), sr)], { type: 'audio/wav' }));
        } catch (err) {
          silentCode = err.code;
        }
        return { ms: out.durationMs, processed: out.processed, type: out.blob.type, peakDb: 20 * Math.log10(peak), silentCode };
      });
      check(r.processed && r.type === 'audio/wav', JSON.stringify(r));
      check(r.ms >= 640 && r.ms <= 700, `trimmed to ${r.ms} ms (expected ~660)`);
      check(r.peakDb > -1.6 && r.peakDb < -0.4, `peak ${r.peakDb.toFixed(2)} dBFS`);
      check(r.silentCode === 'silent', `silence gave ${r.silentCode}`);
    });

    await step('the recording plays back', async () => {
      await page.click('[data-testid=rec-play]');
      await page.waitForFunction(() => audioLab.playedBack !== undefined, null, { timeout: 8000 });
      check(await page.evaluate(() => audioLab.playedBack === true), 'playBlob failed');
    });

    await step('two recordings from the (fake) microphone join into one 22.05 kHz mono WAV with a pause and a soft chime', async () => {
      const r = await page.evaluate(async () => {
        const rec = await import('/js/audio/recorder.js');
        const mix = await import('/js/audio/mix.js');
        const a = await rec.recordName({ maxMs: 1600, autoStop: false });
        const b = await rec.recordName({ maxMs: 1200, autoStop: false });
        const progress = [];
        const t0 = performance.now();
        const out = await mix.concatToWav([a.blob, { silenceMs: 600 }, { chime: true }, { silenceMs: 600 }, b.blob], { onProgress: (f) => progress.push(f) });
        const mixMs = performance.now() - t0;
        window.__mixed = out;
        const dur = async (blob) => (await new OfflineAudioContext(1, 1, 22050).decodeAudioData(await blob.arrayBuffer())).duration;
        const head = new DataView(await out.slice(0, 44).arrayBuffer());
        const buf = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(await out.arrayBuffer());
        const d = buf.getChannelData(0);
        const da = await dur(a.blob);
        const db = await dur(b.blob);
        const seg = (from, to) => d.slice(Math.round(from * 22050), Math.round(to * 22050));
        const peak = (x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        return {
          types: [a.blob.type, b.blob.type, out.type],
          riff: String.fromCharCode(...new Uint8Array(head.buffer, 0, 4)) + String.fromCharCode(...new Uint8Array(head.buffer, 8, 4)),
          channels: head.getUint16(22, true),
          rate: head.getUint32(24, true),
          bits: head.getUint16(34, true),
          size: out.size,
          da, db, total: buf.duration, mixMs, progress,
          clipAPeak: peak(seg(0, da)),
          gapPeak: peak(seg(da + 0.02, da + 0.58)),
          chimePeak: peak(seg(da + 0.6, da + 2.0)),
          gap2Peak: peak(seg(da + 2.02, da + 2.58)),
          clipBPeak: peak(seg(da + 2.6, da + 2.6 + db)),
        };
      });
      check(r.types.every((t) => t === 'audio/wav'), `types ${r.types}`);
      check(r.riff === 'RIFFWAVE' && r.channels === 1 && r.rate === 22050 && r.bits === 16, `header ${JSON.stringify(r)}`);
      check(r.da > 0.1 && r.db > 0.1, `recordings too short: ${r.da}, ${r.db}`);
      const expected = r.da + 0.6 + 1.4 + 0.6 + r.db;
      check(Math.abs(r.total - expected) < 0.02, `joined file is ${r.total.toFixed(3)} s, expected ${expected.toFixed(3)} s`);
      check(Math.abs(r.size - (44 + Math.round(r.total * 22050) * 2)) <= 8, `size ${r.size}`);
      check(r.clipAPeak > 0.5 && r.clipBPeak > 0.5, `recordings too quiet: ${r.clipAPeak}, ${r.clipBPeak}`);
      check(r.gapPeak === 0 && r.gap2Peak === 0, `pauses not silent: ${r.gapPeak}, ${r.gap2Peak}`);
      check(r.chimePeak > 0.2 && r.chimePeak < 0.35, `chime should be soft (~-10 dBFS), peak ${r.chimePeak}`);
      check(r.progress.length === 5 && r.progress.at(-1) === 1, `progress ${r.progress}`);
      console.log(`      (${r.da.toFixed(2)} s + 0.6 s + chime 1.4 s + 0.6 s + ${r.db.toFixed(2)} s = ${r.total.toFixed(2)} s, ${Math.round(r.size / 1024)} KB, joined in ${Math.round(r.mixMs)} ms)`);
    });

    await step('the joined file plays back from start to finish', async () => {
      const r = await page.evaluate(async () => {
        const rec = await import('/js/audio/recorder.js');
        const t0 = performance.now();
        await rec.playBlob(window.__mixed);
        const buf = await new OfflineAudioContext(1, 1, 22050).decodeAudioData(await window.__mixed.arrayBuffer());
        return { ms: performance.now() - t0, dur: buf.duration };
      });
      check(r.ms > r.dur * 1000 - 400 && r.ms < r.dur * 1000 + 1500, `played for ${Math.round(r.ms)} ms, file is ${Math.round(r.dur * 1000)} ms`);
    });

    await step('shareOrDownload saves the WAV as a download where the browser can\'t share files (desktop Chromium)', async () => {
      const [download, result] = await Promise.all([
        page.waitForEvent('download', { timeout: 8000 }),
        page.evaluate(async () => {
          const mix = await import('/js/audio/mix.js');
          return mix.shareOrDownload(window.__mixed, 'Goal, Siobhan! – read by Grandma.wav', { title: 'Goal, Siobhan!' });
        }),
      ]);
      check(result === 'downloaded', `result ${result}`);
      check(download.suggestedFilename() === 'Goal, Siobhan! - read by Grandma.wav', `filename ${download.suggestedFilename()}`);
      const { readFileSync } = await import('node:fs');
      const bytes = readFileSync(await download.path());
      const size = await page.evaluate(() => window.__mixed.size);
      check(bytes.length === size && bytes.subarray(0, 4).toString() === 'RIFF', `downloaded ${bytes.length} bytes, expected ${size}`);
    });

    await step('speech recognition fails soft (headless has no speech service) and never throws', async () => {
      const supported = await page.evaluate(() => !document.querySelector('[data-testid=lab-listen]').disabled);
      if (supported) {
        await page.click('[data-testid=lab-listen]');
        await page.waitForFunction(() => audioLab.heard !== null, null, { timeout: 12000 });
        const heard = await page.evaluate(() => audioLab.heard);
        check(Array.isArray(heard.names), 'names is not an array');
        const status = await page.textContent('[data-testid=hear-status]');
        check(status.trim().length > 0, 'no status shown to the parent');
      }
      const note = await page.textContent('#privacy');
      check(/speech service/.test(note), 'privacy note missing');
    });

    for (const [w, hgt] of [
      [390, 844],
      [844, 390],
      [1024, 768],
    ]) {
      await step(`layout at ${w}×${hgt}: no sideways scroll`, async () => {
        await page.setViewportSize({ width: w, height: hgt });
        await page.waitForTimeout(150);
        await noHorizontalScroll(page);
        await shot(page, `audio-silent-${w}x${hgt}`);
      });
    }

    await step('no console errors or uncaught exceptions (silent mode)', async () => {
      const labErrors = await page.evaluate(() => audioLab.errors);
      check(errors.length === 0 && labErrors.length === 0, [...errors, ...labErrors].join('\n'));
    });
    await page.close();
  }

  // ===== B. A (fake) real speech engine: Edge's voices with word boundaries =====
  console.log('B. speech engine with voices and word boundaries');
  {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, ignoreHTTPSErrors: true });
    await page.addInitScript(FAKE_SPEECH, EDGE_VOICES);
    const errors = watchErrors(page);
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-lab-ready]', { timeout: 8000 });
    await step('with voices present, discovery is immediate', async () => {
      const readyMs = await page.evaluate(() => audioLab.readyMs);
      check(readyMs < 300, `narrator.ready took ${readyMs} ms`);
    });

    await step('voices are ranked: Sonia (UK, natural) first, English only; without consent the on-device Hazel is in use', async () => {
      const voices = await page.$$eval('[data-testid=voice]', (els) => els.map((e) => ({ uri: e.dataset.uri, inUse: e.classList.contains('in-use'), text: e.textContent })));
      check(voices.length === 8, `${voices.length} voices listed (German should be hidden)`);
      check(/Sonia/.test(voices[0].uri) && !voices[0].inUse, `first: ${voices[0].uri} (in use: ${voices[0].inUse})`);
      check(/Libby/.test(voices[1].uri) && /Ryan/.test(voices[2].uri), `then ${voices[1].uri}, ${voices[2].uri}`);
      check(!voices.some((v) => /Katja/.test(v.uri)), 'non-English voice listed');
      const inUse = voices.filter((v) => v.inUse).map((v) => v.uri);
      check(inUse.length === 1 && /Hazel/.test(inUse[0]), `in use: ${inUse}`);
      const r = await page.evaluate(() => ({ mode: audioLab.narrator.mode, status: audioLab.narrator.voiceStatus(), list: audioLab.narrator.listVoices() }));
      check(r.mode === 'speech', `mode ${r.mode}`);
      check(JSON.stringify(r.status) === JSON.stringify({ local: 2, online: 6, usingOnline: false, needsConsent: false }), `voiceStatus ${JSON.stringify(r.status)}`);
      check(r.list.every((v) => v.online === /Online/.test(v.name)), 'online flags wrong');
    });

    await step('consent off (the default): the story is read by Hazel on this device; nothing goes to an online voice', async () => {
      await page.click('[data-testid=lab-play]');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 20000 });
      const r = await page.evaluate(() => ({ run: audioLab.runs.at(-1), total: document.querySelectorAll('#page-text .word').length, spoken: window.__spoken }));
      check(r.run.result === 'done' && r.run.units.length === r.total, `lit ${r.run.units.length}/${r.total}`);
      check(r.spoken.length >= 5, `${r.spoken.length} utterances`);
      check(r.spoken.every((u) => u.local === true), `sent to an online voice: ${[...new Set(r.spoken.filter((u) => u.local !== true).map((u) => u.voice))]}`);
      check(r.spoken.filter((u) => u.volume > 0).every((u) => /Hazel/.test(u.voice)), 'not Hazel');
    });

    await step('with the grown-up\'s consent, Sonia (online, natural) reads; word boundaries drive the highlight; name said as "Shi vawn"', async () => {
      await page.evaluate(() => {
        audioLab.settings.allowOnlineVoices = true;
        window.__spoken = [];
      });
      const status = await page.evaluate(() => audioLab.narrator.voiceStatus());
      check(status.usingOnline === true && status.needsConsent === false, `voiceStatus ${JSON.stringify(status)}`);
      await page.click('[data-testid=lab-play]');
      await page.waitForTimeout(700);
      await shot(page, 'audio-speech-reading-1024x768');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 20000 });
      const r = await page.evaluate(() => ({
        run: audioLab.runs.at(-1),
        total: document.querySelectorAll('#page-text .word').length,
        spoken: window.__spoken,
      }));
      check(r.run.result === 'done' && r.run.units.length === r.total, `lit ${r.run.units.length}/${r.total}, ${r.run.result}`);
      const story = r.spoken.filter((s) => s.volume > 0);
      check(story.length >= 5, `${story.length} utterances`);
      check(story.every((s) => /Sonia/.test(s.voice) && s.lang === 'en-GB'), `voices used: ${[...new Set(story.map((s) => s.voice))]}`);
      check(story.some((s) => /Shi vawn/.test(s.text)) && !story.some((s) => /Siobhan/.test(s.text)), 'name not spoken as its pronunciation');
      check(story.every((s) => Math.abs(s.rate - 0.9) < 1e-9 && Math.abs(s.pitch - 1.05) < 1e-9), 'rate/pitch not from settings');
      // Boundary-driven: words light ~110 ms apart (the fake voice's pace), far faster than the estimate (~300-500 ms).
      const gaps = r.run.units.slice(1).map((u, i) => u[2] - r.run.units[i][2]).filter((g) => g < 250);
      check(gaps.length >= r.total / 2, `highlight did not follow boundary timing (${gaps.length} quick steps)`);
    });

    await step('choosing another voice is used for the next reading', async () => {
      await page.click('[data-testid=voice][data-uri*="Ryan"] >> text=Use');
      await page.evaluate(() => (window.__spoken = []));
      await page.selectOption('[data-testid=lab-page]', { index: 0 });
      await page.click('[data-testid=lab-play]');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 20000 });
      const voices = await page.evaluate(() => [...new Set(window.__spoken.filter((s) => s.volume > 0).map((s) => s.voice))]);
      check(voices.length === 1 && /Ryan/.test(voices[0]), `voices: ${voices}`);
    });

    await step('withdrawing consent goes straight back to the on-device voice, even with an online voice chosen', async () => {
      await page.evaluate(() => {
        audioLab.settings.allowOnlineVoices = false;
        window.__spoken = [];
      });
      await page.click('[data-testid=lab-play]');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 20000 });
      const spoken = await page.evaluate(() => window.__spoken);
      check(spoken.length > 0 && spoken.every((u) => u.local === true && /Hazel/.test(u.voice)), `voices: ${[...new Set(spoken.map((u) => u.voice))]}`);
      const cur = await page.evaluate(() => audioLab.narrator.currentVoice());
      check(/Hazel/.test(cur.name) && cur.online === false, `current ${cur.name}`);
      await page.evaluate(() => (audioLab.settings.allowOnlineVoices = true));
    });

    await step('tap a word to hear it', async () => {
      await page.evaluate(() => (window.__spoken = []));
      await page.click('#page-text .word.is-name');
      await page.waitForFunction(() => window.__spoken.some((s) => s.volume > 0));
      const said = await page.evaluate(() => window.__spoken.filter((s) => s.volume > 0).map((s) => s.text));
      check(said.length === 1 && /Shi vawn/.test(said[0]), `said ${said}`);
    });

    await step('with a recording, the parent\'s voice replaces the name inside the story', async () => {
      await page.click('[data-testid=lab-record]');
      await page.waitForFunction(() => audioLab.recording || audioLab.recordError, null, { timeout: 12000 });
      check(await page.evaluate(() => Boolean(audioLab.recording)), 'recording failed');
      await page.check('[data-testid=lab-use-recording]');
      await page.selectOption('[data-testid=lab-page]', '4');
      await page.evaluate(() => (window.__spoken = []));
      await page.click('[data-testid=lab-play]');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 30000 });
      const r = await page.evaluate(() => ({ spoken: window.__spoken.filter((s) => s.volume > 0).map((s) => s.text), log: document.querySelector('#log').textContent, run: audioLab.runs.at(-1) }));
      check(!r.spoken.some((t) => /Shi vawn|Siobhan/.test(t)), `voice still said the name: ${r.spoken.join(' | ')}`);
      check(/recording for the name/.test(r.log), 'no clip played');
      check(r.run.result === 'done', r.run.result);
    });

    await step('layout with a full voice list: no sideways scroll on a phone', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      await noHorizontalScroll(page);
      await shot(page, 'audio-speech-390x844');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(150);
      await noHorizontalScroll(page);
      await shot(page, 'audio-speech-844x390');
    });

    await step('no console errors or uncaught exceptions (speech mode)', async () => {
      const labErrors = await page.evaluate(() => audioLab.errors);
      check(errors.length === 0 && labErrors.length === 0, [...errors, ...labErrors].join('\n'));
    });
    await page.close();
  }

  // ===== C. Only online voices (Chromium on Linux): consent needed =====
  console.log('C. only online voices: silent until the grown-up agrees');
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(FAKE_SPEECH, ONLINE_ONLY_VOICES);
    const errors = watchErrors(page);
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-lab-ready]', { timeout: 8000 });

    await step('no on-device English voice and no consent: silent timed mode, needsConsent, online voices still listed', async () => {
      const r = await page.evaluate(() => ({ mode: audioLab.narrator.mode, hasVoice: audioLab.narrator.hasVoice(), current: audioLab.narrator.currentVoice(), status: audioLab.narrator.voiceStatus(), list: audioLab.narrator.listVoices() }));
      check(r.mode === 'silent' && r.hasVoice === false && r.current === null, JSON.stringify(r));
      check(JSON.stringify(r.status) === JSON.stringify({ local: 0, online: 3, usingOnline: false, needsConsent: true }), `voiceStatus ${JSON.stringify(r.status)}`);
      check(r.list.length === 3 && r.list.every((v) => v.online), 'online voices not listed for settings');
      const tags = await page.$$eval('[data-testid=voice] .tag', (els) => els.map((e) => e.textContent));
      check(tags.filter((t) => t === 'Online').length === 3, `tags ${tags}`);
    });

    await step('the story still highlights every word, and not one utterance (not even the tap unlock) reaches an online voice', async () => {
      await page.click('[data-testid=lab-play]');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 20000 });
      await page.click('#page-text .word.is-name'); // tap-a-word
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => ({ run: audioLab.runs.at(-1), total: document.querySelectorAll('#page-text .word').length, spoken: window.__spoken }));
      check(r.run.result === 'done' && r.run.units.length === r.total, `lit ${r.run.units.length}/${r.total}`);
      check(r.spoken.length === 0, `spoke ${r.spoken.length}: ${JSON.stringify(r.spoken.slice(0, 3))}`);
      await shot(page, 'audio-online-only-390x844');
    });

    await step('once the grown-up agrees, the Google UK voice reads', async () => {
      await page.evaluate(() => (audioLab.settings.allowOnlineVoices = true));
      const status = await page.evaluate(() => audioLab.narrator.voiceStatus());
      check(status.needsConsent === false && status.usingOnline === true, JSON.stringify(status));
      await page.click('[data-testid=lab-play]');
      await page.waitForSelector('[data-testid=read-card][data-state=done]', { timeout: 20000 });
      const voices = await page.evaluate(() => [...new Set(window.__spoken.filter((s) => s.volume > 0).map((s) => s.voice))]);
      check(voices.length === 1 && voices[0] === 'Google UK English Female', `voices ${voices}`);
    });

    await step('no console errors (online-only voices)', async () => {
      const labErrors = await page.evaluate(() => audioLab.errors);
      check(errors.length === 0 && labErrors.length === 0, [...errors, ...labErrors].join('\n'));
    });
    await page.close();
  }

  // ===== D. Environment detection in a real browser =====
  console.log('D. environment detection');
  {
    const envIn = async (contextOpts) => {
      const context = await browser.newContext(contextOpts);
      const page = await context.newPage();
      await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
      const env = await page.evaluate(async () => (await import('/js/core/env.js')).detectEnvironment());
      await context.close();
      return env;
    };
    await step('desktop Chromium: speech, recognition and camera available, not an in-app browser, no hint', async () => {
      const e = await envIn({});
      check(e.speech && e.recognition && e.camera && e.inAppBrowser === null && e.os === 'other' && e.openInBrowserHint === null, JSON.stringify(e));
    });
    await step('inside Instagram on Android (a WebView): no speech, and the grown-up is told how to get out', async () => {
      const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 348.0.0.40.109 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; en_GB; 640107219)';
      const e = await envIn({ userAgent: ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      check(e.inAppBrowser === 'instagram' && e.os === 'android' && !e.speech && !e.camera && !e.recognition, JSON.stringify(e));
      check(e.openInBrowserHint === 'This page opened inside Instagram, which can’t read the story aloud. Tap ⋮ and choose ‘Open in browser’.', e.openInBrowserHint);
    });
    await step('inside Facebook on an iPhone: speech works, but mic and camera are off and the hint says so', async () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/475.0.0.34.109;FBBV/640307432;FBDV/iPhone14,7;FBMD/iPhone;FBSN/iOS;FBSV/17.5.1;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5]';
      const e = await envIn({ userAgent: ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      check(e.inAppBrowser === 'facebook' && e.os === 'ios' && e.speech && !e.camera, JSON.stringify(e));
      check(/may forget your child’s name/.test(e.openInBrowserHint), e.openInBrowserHint);
    });
  }

  // ===== E. The app's self-hosted fonts =====
  console.log('E. self-hosted fonts in the app');
  {
    const PROFILE = { id: 'child_fonts', display: 'Siobhan', key: 'siobhan', pronunciation: { say: 'Shi vawn', ipa: '', respell: '', label: 'Irish', source: 'dictionary', useRecording: false, recordingId: null }, createdAt: 1, updatedAt: 1 };
    const openApp = async (viewport, profile = PROFILE) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
      const page = await context.newPage();
      const external = [];
      const fontFiles = [];
      const errors = [];
      page.on('request', (req) => {
        const u = new URL(req.url());
        if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(req.url());
      });
      page.on('response', (res) => {
        if (/\/fonts\//.test(res.url())) fontFiles.push(`${res.status()} ${new URL(res.url()).pathname}`);
      });
      page.on('console', (m) => m.type() === 'error' && errors.push(`${m.text()} ${m.location()?.url ?? ''}`));
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort());
      await page.addInitScript((state) => localStorage.setItem('starring.v1', JSON.stringify(state)), { profiles: [profile], activeProfileId: profile.id, settings: {}, lastBook: BOOK });
      return { context, page, external, fontFiles, errors };
    };
    /** The fonts Chromium actually drew a node's text with (DevTools protocol). */
    const renderedFonts = async (page, selector) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) return [];
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      await cdp.detach();
      return fonts.map((f) => `${f.familyName}${f.isCustomFont ? '*' : ''}`);
    };

    let app;
    await step('index.html loads Andika and Fredoka from this site: no request leaves the page\'s own server', async () => {
      app = await openApp({ width: 390, height: 844 });
      const { page } = app;
      await page.goto(`${BASE}/?test=1#/b/${BOOK}`, { waitUntil: 'load' });
      await page.waitForSelector('html.is-booted', { timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      const links = await page.$$eval('link', (ls) => ls.map((l) => `${l.rel} ${l.getAttribute('href')}`));
      check(!links.some((l) => /googleapis|gstatic/.test(l)), `Google Fonts still linked: ${links.filter((l) => /google/.test(l))}`);
      check(links.includes('stylesheet css/fonts.css'), 'css/fonts.css not linked');
      const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family.replace(/["']/g, '')} ${f.weight}`));
      check(loaded.includes('Andika 400') && loaded.some((f) => f.startsWith('Fredoka')), `loaded faces: ${loaded}`);
      check(app.external.length === 0, `external requests: ${app.external}`);
      check(app.fontFiles.length >= 2 && app.fontFiles.every((f) => f.startsWith('200 ')), `font files: ${app.fontFiles}`);
      const heading = await renderedFonts(page, 'h1');
      check(/^Fredoka\b.*\*$/.test(heading[0] ?? ''), `landing heading drawn with ${heading}`);
    });

    await step('in the reader, the words are drawn in Andika and the name in the picture in Fredoka', async () => {
      const { page } = app;
      await page.goto(`${BASE}/?test=1#/b/${BOOK}/read/1`, { waitUntil: 'load' });
      await page.waitForSelector('[data-testid=page-text] .sb-word', { timeout: 10000 });
      await page.waitForFunction(() => document.querySelector('[data-testid=scene] .sb-name')?.textContent.trim().length > 0, null, { timeout: 10000 });
      await page.waitForTimeout(1500); // the name writes itself in
      await page.evaluate(() => document.fonts.ready);
      const text = await renderedFonts(page, '[data-testid=page-text] .sb-word');
      const name = await renderedFonts(page, '[data-testid=page-text] .sb-word.is-name');
      const art = await renderedFonts(page, '[data-testid=scene] .sb-name');
      check(text[0] === 'Andika*', `reading text drawn with ${text}`);
      check(name[0] === 'Andika*', `name in the text drawn with ${name}`);
      check(/^Fredoka\b.*\*$/.test(art[0] ?? ''), `name in the picture drawn with ${art}`);
      console.log(`      (text: ${text.join(', ')}; name: ${name.join(', ')}; picture: ${art.join(', ')})`);
      for (const [w, hgt] of [
        [390, 844],
        [844, 390],
        [1024, 768],
      ]) {
        await page.setViewportSize({ width: w, height: hgt });
        await page.waitForTimeout(400);
        await noHorizontalScroll(page);
        await shot(page, `fonts-reader-${w}x${hgt}`);
      }
      check(app.external.length === 0, `external requests: ${app.external}`);
      check(app.errors.length === 0, app.errors.join('\n'));
      await app.context.close();
    });

    await step('a name with Latin Extended letters (Łucja) pulls in that subset and stays in Andika/Fredoka', async () => {
      const lucja = { ...PROFILE, id: 'child_lucja', display: 'Łucja', key: 'lucja', pronunciation: { ...PROFILE.pronunciation, say: 'Wootsya', label: 'Polish' } };
      const a = await openApp({ width: 390, height: 844 }, lucja);
      await a.page.goto(`${BASE}/?test=1#/b/${BOOK}/read/1`, { waitUntil: 'load' });
      await a.page.waitForSelector('[data-testid=page-text] .sb-word.is-name', { timeout: 10000 });
      await a.page.waitForTimeout(1500);
      await a.page.evaluate(() => document.fonts.ready);
      const name = await renderedFonts(a.page, '[data-testid=page-text] .sb-word.is-name');
      const art = await renderedFonts(a.page, '[data-testid=scene] .sb-name');
      check(name.length === 1 && name[0] === 'Andika*', `name drawn with ${name}`);
      check(art.length === 1 && /^Fredoka\b.*\*$/.test(art[0]), `picture name drawn with ${art}`);
      check(a.fontFiles.some((f) => /latin-ext/.test(f)), `latin-ext not fetched: ${a.fontFiles}`);
      await shot(a.page, 'fonts-reader-lucja-390x844');
      check(a.errors.length === 0, a.errors.join('\n'));
      await a.context.close();
    });

    await step('the service worker precaches the fonts (and every precache file exists)', async () => {
      const a = await openApp({ width: 390, height: 844 });
      await a.page.goto(`${BASE}/?sw=1#/b/${BOOK}`, { waitUntil: 'load' });
      const r = await a.page.evaluate(async () => {
        const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 8000))]);
        if (!reg) return { error: 'service worker never became ready' };
        const src = await (await fetch('sw.js')).text();
        const list = JSON.parse(src.match(/const PRECACHE = (\[[^\]]*\])/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
        const status = await Promise.all(list.map(async (u) => [u, (await fetch(u, { cache: 'no-store' })).status]));
        const keys = await caches.keys();
        const cache = await caches.open(keys.find((k) => k.startsWith('tiffin-')));
        const cached = (await cache.keys()).map((q) => new URL(q.url).pathname);
        return { list, missing: status.filter(([, st]) => st !== 200), keys, cached };
      });
      check(!r.error, r.error);
      check(r.missing.length === 0, `precache files missing: ${JSON.stringify(r.missing)}`);
      for (const f of ['/css/fonts.css', '/fonts/andika-latin-400-normal.woff2', '/fonts/andika-latin-700-normal.woff2', '/fonts/fredoka-latin-wght-normal.woff2']) {
        check(r.cached.includes(f), `${f} not precached (cache ${r.keys}: ${r.cached.length} files)`);
      }
      check(a.external.length === 0, `external requests: ${a.external}`);
      await a.context.close();
    });
  }
} catch (err) {
  failures.push(`harness: ${err?.stack ?? err}`);
} finally {
  await browser?.close().catch(() => {});
  server.stop();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.map((f) => `- ${f}`).join('\n'));
  process.exitCode = 1;
}
