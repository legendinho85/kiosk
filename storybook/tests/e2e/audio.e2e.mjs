// Browser test for the speech & sound layer (js/narrator, js/audio), using
// the manual test page tests/fixtures/audio.html in headless Chromium.
//
//   node tests/e2e/audio.e2e.mjs            # PORT defaults to 8105
//   PORT=8201 SHOTS=/tmp/shots node tests/e2e/audio.e2e.mjs
//
// Headless Chromium has no speech voices, so part A runs the narrator in
// silent timed mode (?test=1). Part B injects a fake speechSynthesis with a
// realistic Edge voice list that fires word-boundary events, to exercise
// voice ranking, boundary-driven highlighting, voice switching and the
// parent's recording played inside the story. A fake microphone
// (--use-fake-device-for-media-stream) exercises recording.
// Exits non-zero on any failure.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 8105);
const SHOTS = process.env.SHOTS ?? '';
const ROOT = new URL('../../', import.meta.url).pathname;
const BASE = `http://localhost:${PORT}`;
const FIXTURE = `${BASE}/tests/fixtures/audio.html`;

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

function startServer() {
  const local = '/opt/node22/lib/node_modules/http-server/bin/http-server';
  const [cmd, args] = existsSync(local)
    ? [process.execPath, [local, ROOT, '-p', String(PORT), '-c-1', '-s']]
    : ['npx', ['--yes', 'http-server', ROOT, '-p', String(PORT), '-c-1', '-s']];
  return spawn(cmd, args, { stdio: 'ignore' });
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

// A fake speech engine for part B: Edge's voice list, word boundaries, and a log of what was said.
const FAKE_SPEECH = () => {
  const mk = (name, lang, local = false, def = false) => ({ name, lang, voiceURI: name, localService: local, default: def });
  const voices = [
    mk('Microsoft David - English (United States)', 'en-US', true, true),
    mk('Microsoft Hazel - English (United Kingdom)', 'en-GB', true),
    mk('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
    mk('Microsoft Maisie Online (Natural) - English (United Kingdom)', 'en-GB'),
    mk('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB'),
    mk('Microsoft Libby Online (Natural) - English (United Kingdom)', 'en-GB'),
    mk('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB'),
    mk('Microsoft Emily Online (Natural) - English (Ireland)', 'en-IE'),
    mk('Microsoft Katja Online (Natural) - German (Germany)', 'de-DE'),
  ];
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
      window.__spoken.push({ text: u.text, voice: u.voice?.name ?? null, rate: u.rate, pitch: u.pitch, lang: u.lang, volume: u.volume });
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
    await page.addInitScript(FAKE_SPEECH);
    const errors = watchErrors(page);
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body[data-lab-ready]', { timeout: 8000 });
    await step('with voices present, discovery is immediate', async () => {
      const readyMs = await page.evaluate(() => audioLab.readyMs);
      check(readyMs < 300, `narrator.ready took ${readyMs} ms`);
    });

    await step('voices are ranked: Sonia (UK, natural) first, English only, current voice marked', async () => {
      const voices = await page.$$eval('[data-testid=voice]', (els) => els.map((e) => ({ uri: e.dataset.uri, inUse: e.classList.contains('in-use') })));
      check(voices.length === 8, `${voices.length} voices listed (German should be hidden)`);
      check(/Sonia/.test(voices[0].uri) && voices[0].inUse, `first: ${voices[0].uri}`);
      check(/Libby/.test(voices[1].uri) && /Ryan/.test(voices[2].uri), `then ${voices[1].uri}, ${voices[2].uri}`);
      check(!voices.some((v) => /Katja/.test(v.uri)), 'non-English voice listed');
      const mode = await page.evaluate(() => audioLab.narrator.mode);
      check(mode === 'speech', `mode ${mode}`);
    });

    await step('reading uses the voice\'s word boundaries: every word lit, name said as "Shi vawn", UK voice', async () => {
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
} catch (err) {
  failures.push(`harness: ${err?.stack ?? err}`);
} finally {
  await browser?.close().catch(() => {});
  server.kill();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.map((f) => `- ${f}`).join('\n'));
  process.exitCode = 1;
}
