import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTranscripts, hearName, isRecognitionSupported, PRIVACY_NOTE } from '../../js/audio/recognise.js';

test('cleanTranscripts: single words first, title case, no duplicates, max 5', () => {
  assert.deepEqual(cleanTranscripts(['neve', 'Niamh', 'Neve.', 'knee of', 'neave', 'Neeve!', 'niav']), ['Neve', 'Niamh', 'Neave', 'Neeve', 'Niav']);
  assert.deepEqual(cleanTranscripts(['shiv on', 'Siobhan', 'chevonne']), ['Siobhan', 'Chevonne', 'Shiv On']);
  assert.deepEqual(cleanTranscripts([{ transcript: ' Ava ', confidence: 0.9 }, { transcript: 'aver', confidence: 0 }]), ['Ava', 'Aver']);
});

test('cleanTranscripts strips punctuation, numbers and the words people say around a name', () => {
  assert.deepEqual(cleanTranscripts(['Her name is Siobhan.', "it's Aoife", 'um, Zoë!', 'my name is 2 Pac']), ['Siobhan', 'Aoife', 'Zoë', 'Pac']);
  assert.deepEqual(cleanTranscripts(['the', 'um', '...', '', null, 42]), []);
});

test('cleanTranscripts keeps apostrophes and hyphens in names and title-cases them properly', () => {
  assert.deepEqual(cleanTranscripts(["o'neill", 'MARY-KATE', "ta'liyah", 'McKenzie', "d’arcy"]), ["O'Neill", 'Mary-Kate', "Ta'liyah", 'McKenzie', "D'Arcy"]);
});

test('cleanTranscripts drops long sentences (not a name) and respects max', () => {
  assert.deepEqual(cleanTranscripts(['I think it sounds like this']), []);
  assert.deepEqual(cleanTranscripts(['a1', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus'], { max: 3 }), ['Bo', 'Cy', 'Di']);
});

test('the privacy note tells the parent their audio may go to a speech service', () => {
  assert.match(PRIVACY_NOTE, /speech service/);
  assert.match(PRIVACY_NOTE, /Google or Apple/);
  assert.match(PRIVACY_NOTE, /don't keep it/);
});

// ---- hearName with a fake recogniser ----------------------------------------

function fakeRecognition(script) {
  const instances = [];
  class FakeRec {
    constructor() {
      instances.push(this);
      this.started = false;
      this.aborted = false;
      this.stopped = false;
    }
    start() {
      this.started = true;
      script(this);
    }
    stop() {
      this.stopped = true;
    }
    abort() {
      this.aborted = true;
    }
  }
  return { FakeRec, instances };
}

const result = (alts, isFinal = true) => Object.assign(alts.map((transcript, i) => ({ transcript, confidence: i ? 0 : 0.8 })), { isFinal });

async function withRecognition(FakeRec, fn) {
  globalThis.webkitSpeechRecognition = FakeRec;
  try {
    return await fn();
  } finally {
    delete globalThis.webkitSpeechRecognition;
  }
}

test('hearName configures the recogniser and returns every alternative, cleaned', async () => {
  const { FakeRec, instances } = fakeRecognition((r) => {
    setTimeout(() => r.onstart?.(), 1);
    setTimeout(() => r.onresult?.({ resultIndex: 0, results: [result(['Neve', 'knee of', 'Neave', 'Niamh'])] }), 5);
  });
  let started = false;
  const names = await withRecognition(FakeRec, () => hearName({ onStart: () => (started = true) }));
  assert.deepEqual(names, ['Neve', 'Neave', 'Niamh', 'Knee Of']);
  const r = instances[0];
  assert.equal(r.lang, 'en-GB');
  assert.equal(r.maxAlternatives, 5);
  assert.equal(r.interimResults, false);
  assert.equal(r.continuous, false);
  assert.equal(started, true);
  assert.equal(r.aborted, true, 'recogniser shut down afterwards');
});

test('hearName returns [] on errors, no speech and refusal, and reports why', async () => {
  for (const error of ['not-allowed', 'no-speech', 'network', 'service-not-allowed', 'audio-capture']) {
    const { FakeRec } = fakeRecognition((r) => setTimeout(() => r.onerror?.({ error }), 2));
    const codes = [];
    const names = await withRecognition(FakeRec, () => hearName({ onError: (c) => codes.push(c) }));
    assert.deepEqual(names, []);
    assert.deepEqual(codes, [error]);
  }
  const { FakeRec } = fakeRecognition((r) => setTimeout(() => r.onend?.(), 2));
  const codes = [];
  assert.deepEqual(await withRecognition(FakeRec, () => hearName({ onError: (c) => codes.push(c) })), []);
  assert.deepEqual(codes, ['no-speech']);
});

test('hearName times out (asking politely first) and keeps a late result', async () => {
  const { FakeRec, instances } = fakeRecognition(() => {});
  const t0 = Date.now();
  assert.deepEqual(await withRecognition(FakeRec, () => hearName({ timeoutMs: 50 })), []);
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(instances[0].stopped, true);

  const late = fakeRecognition((r) => {
    r.stop = () => setTimeout(() => r.onresult?.({ resultIndex: 0, results: [result(['Ava'])] }), 5);
  });
  assert.deepEqual(await withRecognition(late.FakeRec, () => hearName({ timeoutMs: 30 })), ['Ava']);
});

test('hearName uses interim results if the browser never marks one final (older Safari)', async () => {
  const { FakeRec } = fakeRecognition((r) => {
    setTimeout(() => r.onresult?.({ resultIndex: 0, results: [result(['Aoife', 'Eefa'], false)] }), 2);
    setTimeout(() => r.onend?.(), 6);
  });
  assert.deepEqual(await withRecognition(FakeRec, () => hearName()), ['Aoife', 'Eefa']);
});

test('hearName stops at once when aborted, and never throws', async () => {
  const { FakeRec, instances } = fakeRecognition(() => {});
  const ac = new AbortController();
  const p = withRecognition(FakeRec, () => hearName({ signal: ac.signal, timeoutMs: 10000 }));
  ac.abort();
  assert.deepEqual(await p, []);
  assert.equal(instances[0].aborted, true);

  const throws = fakeRecognition(() => {
    throw new Error('InvalidStateError');
  });
  assert.deepEqual(await withRecognition(throws.FakeRec, () => hearName()), []);
  class Broken {
    constructor() {
      throw new Error('nope');
    }
  }
  assert.deepEqual(await withRecognition(Broken, () => hearName()), []);
});

test('isRecognitionSupported / unsupported browsers resolve []', async () => {
  assert.equal(isRecognitionSupported(), false);
  assert.deepEqual(await hearName(), []);
  globalThis.SpeechRecognition = function () {};
  assert.equal(isRecognitionSupported(), true);
  delete globalThis.SpeechRecognition;
});
