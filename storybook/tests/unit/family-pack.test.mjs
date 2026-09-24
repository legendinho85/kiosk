// Family packs (js/family/pack.js): building, reading untrusted files and
// importing them into the app state.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPack, readPack, importPack, packFilename, cleanText, sniffAudio, decodeBase64, encodeBase64, base64Size,
  baseMime, isAllowedAudio, asciiSlug, partBlobId, PackError, PACK_LIMITS, PACK_FORMAT, PACK_VERSION,
} from '../../js/family/pack.js';
import { loadState, activeReadingFor, readingsFor, activeProfile } from '../../js/core/storage.js';

const BOOKS = [{ id: 'tiffin-football', title: 'Goal, {name}!', subtitle: 'A Tiffin & Me football story' }, { id: 'tiffin-digger', title: 'Beep beep, {name}!' }];

/** A tiny but real WAV file (16-bit mono, `n` samples of a tone). */
function wav(n = 400, seed = 1) {
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true);
  v.setUint32(28, 44100, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(8000 * Math.sin((i * seed) / 5)), true);
  return new Blob([buf], { type: 'audio/wav' });
}

function memBlobs() {
  const map = new Map();
  return {
    map,
    async put(id, b) {
      map.set(id, b);
    },
    async get(id) {
      return map.get(id) ?? null;
    },
    async delete(id) {
      map.delete(id);
    },
  };
}

const jsonFile = (obj, name = 'x.starring.json') => new File([typeof obj === 'string' ? obj : JSON.stringify(obj)], name, { type: 'application/json' });
const b64 = async (blob) => encodeBase64(new Uint8Array(await blob.arrayBuffer()));
async function rejects(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.ok(err instanceof PackError, `expected a PackError, got ${err}`);
    assert.equal(err.code, code);
    assert.ok(err.message.length > 20, 'a parent-friendly message');
    return true;
  });
}
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

// ---- Round trips ---------------------------------------------------------------------

test('a reading pack round-trips: build -> read -> import', async () => {
  const p1 = wav(300, 1);
  const p2 = wav(500, 2);
  const p2after = wav(200, 3);
  const file = await buildPack({ kind: 'reading', bookId: 'tiffin-football', readerName: '  Grandma   Rose ', createdAt: 1790000000000, parts: { 1: { main: p1 }, 2: { main: p2, after: p2after }, 3: { main: null, after: null } }, child: { display: 'Ava' } });
  assert.equal(file.type, 'application/json');
  const raw = JSON.parse(await file.text());
  assert.equal(raw.format, PACK_FORMAT);
  assert.equal(raw.version, PACK_VERSION);
  assert.equal(raw.readerName, 'Grandma Rose', 'tidied');
  assert.deepEqual(Object.keys(raw.parts), ['1', '2'], 'empty pages are left out');
  assert.equal(raw.parts['1'].after, null);
  assert.equal(raw.parts['2'].main.mime, 'audio/wav');

  const parsed = await readPack(file, { books: BOOKS });
  assert.equal(parsed.kind, 'reading');
  assert.equal(parsed.bookId, 'tiffin-football');
  assert.equal(parsed.book.title, 'Goal, {name}!');
  assert.equal(parsed.readerName, 'Grandma Rose');
  assert.equal(parsed.createdAt, 1790000000000);
  assert.equal(parsed.pageCount, 2);
  assert.equal(parsed.partCount, 3);
  assert.equal(parsed.child.display, 'Ava', 'who it was recorded for');
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(await bytesOf(parsed.parts['2'].after), await bytesOf(p2after), 'audio bytes survive exactly');
  assert.equal(parsed.parts['1'].main.type, 'audio/wav');

  const store = memBlobs();
  const { state, summary } = await importPack(loadState(), parsed, store);
  assert.equal(summary.kind, 'reading');
  assert.equal(summary.readerName, 'Grandma Rose');
  assert.equal(summary.pages, 2);
  assert.equal(summary.parts, 3);
  assert.equal(summary.replaced, false);
  const active = activeReadingFor(state, 'tiffin-football');
  assert.ok(active, 'the reading is the one played for the book');
  assert.equal(active.id, summary.readingId);
  assert.equal(active.readerName, 'Grandma Rose');
  assert.equal(active.parts['2'].after, partBlobId(active.id, '2', 'after'));
  assert.equal(active.parts['1'].after, null);
  assert.equal(store.map.size, 3);
  assert.deepEqual(await bytesOf(await store.get(active.parts['1'].main)), await bytesOf(p1));
  assert.equal(state.profiles.length, 0, 'a reading pack never adds a child');

  // Opening the same file again replaces it instead of adding a twin.
  const again = await importPack(state, await readPack(file, { books: BOOKS }), store);
  assert.equal(again.summary.replaced, true);
  assert.equal(again.summary.readingId, summary.readingId);
  assert.equal(readingsFor(again.state, 'tiffin-football').length, 1);
  assert.equal(store.map.size, 3);
});

test('a gift pack creates the child with the giver’s pronunciation, the message and an included reading', async () => {
  const msg = wav(250, 4);
  const file = await buildPack({
    kind: 'gift',
    bookId: 'tiffin-digger',
    createdAt: 1790000001000,
    readerName: 'Auntie Jo',
    parts: { 1: { main: wav(100, 5) } },
    child: { display: 'Siobhan', pronunciation: { say: 'Shi vawn', respell: 'shih-VAWN', ipa: 'ʃɪˈvɔːn', label: 'Irish' } },
    message: { from: 'Auntie Jo', text: 'Happy birthday!\n\n\n\nLove you lots.', audio: msg },
  });
  const parsed = await readPack(file, { books: BOOKS });
  assert.equal(parsed.kind, 'gift');
  assert.equal(parsed.child.display, 'Siobhan');
  assert.equal(parsed.child.key, 'siobhan');
  assert.deepEqual(parsed.child.pronunciation, { say: 'Shi vawn', ipa: 'ʃɪˈvɔːn', respell: 'shih-VAWN', label: 'Irish', source: 'gift', useRecording: false, recordingId: null });
  assert.equal(parsed.message.text, 'Happy birthday!\n\nLove you lots.', 'blank lines tidied');
  assert.ok(parsed.message.audio);
  assert.equal(packFilename(parsed), 'tiffin-digger-Siobhan.starring.json');

  const store = memBlobs();
  const { state, summary } = await importPack(loadState(), parsed, store);
  const child = activeProfile(state);
  assert.equal(child.display, 'Siobhan');
  assert.equal(child.pronunciation.say, 'Shi vawn');
  assert.equal(child.gift.from, 'Auntie Jo');
  assert.equal(child.gift.text, 'Happy birthday!\n\nLove you lots.');
  assert.deepEqual(await bytesOf(await store.get(child.gift.recordingId)), await bytesOf(msg));
  assert.equal(summary.newChild, true);
  assert.equal(summary.childName, 'Siobhan');
  assert.equal(summary.giftFrom, 'Auntie Jo');
  assert.equal(activeReadingFor(state, 'tiffin-digger')?.readerName, 'Auntie Jo', 'the included reading is used');
});

test('a gift for a child already on the phone keeps the parent’s pronunciation and replaces the old message', async () => {
  const store = memBlobs();
  let state = { ...loadState(), profiles: [{ id: 'child_1', display: 'Ava', key: 'ava', pronunciation: { say: 'Ah-va', source: 'custom' }, gift: { from: 'Old', text: 'x', recordingId: 'gift_old', createdAt: 1 } }], activeProfileId: null };
  await store.put('gift_old', wav(10));
  const file = await buildPack({ kind: 'gift', bookId: 'tiffin-football', child: { display: 'ava', pronunciation: { say: 'Ay-va' } }, message: { from: 'Nana', text: 'Hello!' } });
  const out = await importPack(state, await readPack(file, { books: BOOKS }), store);
  state = out.state;
  assert.equal(state.profiles.length, 1, 'no twin');
  assert.equal(state.activeProfileId, 'child_1');
  assert.equal(state.profiles[0].pronunciation.say, 'Ah-va', 'the parent’s choice wins');
  assert.equal(state.profiles[0].gift.from, 'Nana');
  assert.equal(state.profiles[0].gift.recordingId, null, 'no spoken message this time');
  assert.equal(store.map.has('gift_old'), false, 'the old spoken message is deleted');
  assert.equal(out.summary.keptPronunciation, true);
});

test('nicknames travel with a gift: display for the stories, fullName kept', async () => {
  const file = await buildPack({ kind: 'gift', bookId: 'tiffin-football', child: { display: 'Max', fullName: 'Maximilian', pronunciation: { say: 'Max' } }, message: { from: 'Grandpa', text: '' } });
  const parsed = await readPack(file, { books: BOOKS });
  assert.equal(parsed.child.display, 'Max');
  assert.equal(parsed.child.fullName, 'Maximilian');
  const { state } = await importPack(loadState(), parsed, memBlobs());
  assert.equal(activeProfile(state).fullName, 'Maximilian');
});

// ---- Wrong or damaged files ----------------------------------------------------------

test('files that are not packs are refused with friendly messages', async () => {
  await rejects(readPack(null, { books: BOOKS }), 'not-a-file');
  await rejects(readPack('hello', { books: BOOKS }), 'not-a-file');
  await rejects(readPack(new File([], 'empty.json'), { books: BOOKS }), 'empty');
  await rejects(readPack(jsonFile('{"format": "starring-pack", '), { books: BOOKS }), 'not-a-pack');
  await rejects(readPack(jsonFile('<html><script>alert(1)</script></html>', 'evil.json'), { books: BOOKS }), 'not-a-pack');
  await rejects(readPack(jsonFile([1, 2, 3]), { books: BOOKS }), 'not-a-pack');
  await rejects(readPack(jsonFile({ format: 'something-else', version: 1, kind: 'reading', bookId: 'tiffin-football' }), { books: BOOKS }), 'not-a-pack');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: '1', kind: 'reading', bookId: 'tiffin-football' }), { books: BOOKS }), 'not-a-pack');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: 0, kind: 'reading', bookId: 'tiffin-football' }), { books: BOOKS }), 'not-a-pack');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: 2, kind: 'reading', bookId: 'tiffin-football' }), { books: BOOKS }), 'newer-version');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: 1, kind: 'video', bookId: 'tiffin-football' }), { books: BOOKS }), 'bad-kind');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: 1, kind: 'reading', bookId: 'no-such-book' }), { books: BOOKS }), 'unknown-book');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: 1, kind: 'reading', bookId: '../../etc/passwd' }), { books: BOOKS }), 'unknown-book');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: 1, kind: 'reading', bookId: 'tiffin-football' }), { books: BOOKS }), 'no-audio');
  await rejects(readPack(jsonFile({ format: PACK_FORMAT, version: 1, kind: 'reading', bookId: 'tiffin-football' }), { books: async () => { throw new Error('offline'); } }), 'no-books');
});

test('oversize files are refused before they are read', async () => {
  let read = false;
  const huge = { size: PACK_LIMITS.fileBytes + 1, type: 'application/json', arrayBuffer: async () => ((read = true), new ArrayBuffer(0)), text: async () => ((read = true), '') };
  await rejects(readPack(huge, { books: BOOKS }), 'too-big');
  assert.equal(read, false, 'never loaded into memory');
});

test('building refuses what could never be opened', async () => {
  await rejects(buildPack({ kind: 'reading', bookId: 'tiffin-football', parts: {} }), 'nothing-to-send');
  await rejects(buildPack({ kind: 'reading', bookId: 'Tiffin Football!', parts: { 1: { main: wav() } } }), 'unknown-book');
  await rejects(buildPack({ kind: 'mixtape', bookId: 'tiffin-football' }), 'bad-kind');
  await rejects(buildPack({ kind: 'gift', bookId: 'tiffin-football', message: { from: 'Jo', text: 'Hi' } }), 'bad-child');
  const big = { size: PACK_LIMITS.partBytes + 1, type: 'audio/wav', arrayBuffer: async () => new ArrayBuffer(8) };
  await rejects(buildPack({ kind: 'reading', bookId: 'tiffin-football', parts: { 1: { main: big } } }), 'too-big');
});

test('a gift with an unusable child name is refused', async () => {
  const base = { format: PACK_FORMAT, version: 1, kind: 'gift', bookId: 'tiffin-football', message: { from: 'Jo', text: 'Hi' } };
  await rejects(readPack(jsonFile({ ...base, child: { display: '<img src=x onerror=alert(1)>' } }), { books: BOOKS }), 'bad-child');
  await rejects(readPack(jsonFile({ ...base, child: { display: 'x'.repeat(200) } }), { books: BOOKS }), 'bad-child');
  await rejects(readPack(jsonFile({ ...base }), { books: BOOKS }), 'bad-child');
  await rejects(readPack(jsonFile({ ...base, child: 'Ava' }), { books: BOOKS }), 'bad-child');
});

test('bad recordings are dropped (with a note) and never kept', async () => {
  const good = await b64(wav(120));
  const html = btoa('<html><body onload=alert(1)>hi</body></html>');
  const pack = {
    format: PACK_FORMAT,
    version: 1,
    kind: 'reading',
    bookId: 'tiffin-football',
    readerName: 'Nana',
    parts: {
      1: { main: { mime: 'audio/wav', data: good }, after: { mime: 'text/html', data: html } },
      2: { main: { mime: 'audio/wav', data: html } }, // says WAV, is HTML
      3: { main: { mime: 'audio/wav', data: 'not base64 at all!' } },
      4: { main: { mime: 'audio/wav', data: good.slice(0, -1) } }, // broken padding
      5: { main: { mime: 'image/svg+xml', data: good } },
      6: { main: 'just a string' },
      7: { main: { mime: 'audio/webm;codecs=opus', data: good } }, // a WAV claiming to be webm
      0: { main: { mime: 'audio/wav', data: good } },
      '01': { main: { mime: 'audio/wav', data: good } },
      999: { main: { mime: 'audio/wav', data: good } },
      __proto__: { main: { mime: 'audio/wav', data: good } },
      constructor: { main: { mime: 'audio/wav', data: good } },
      'x-1': { main: { mime: 'audio/wav', data: good } },
    },
  };
  // JSON.stringify drops the __proto__ literal, so write that key by hand.
  const text = JSON.stringify(pack).replace('"parts":{', `"parts":{"__proto__":{"main":{"mime":"audio/wav","data":"${good}"}},`);
  const parsed = await readPack(jsonFile(text), { books: BOOKS });
  assert.deepEqual(Object.keys(parsed.parts), ['1'], 'only page 1’s real WAV survives');
  assert.equal(parsed.parts['1'].after, null);
  assert.equal(parsed.partCount, 1);
  assert.ok(parsed.warnings.length >= 9, parsed.warnings.join('; '));
  assert.equal(Object.getPrototypeOf(parsed.parts), Object.prototype, 'no prototype pollution');
  assert.equal({}.main, undefined);
});

test('text from a pack is cleaned and capped, and stays plain text', async () => {
  const pack = {
    format: PACK_FORMAT,
    version: 1,
    kind: 'gift',
    bookId: 'tiffin-football',
    createdAt: 'yesterday',
    readerName: 'R'.repeat(500),
    language: 42,
    child: { display: 'ava', fullName: 'ava', pronunciation: { say: '!!!', respell: { evil: true }, ipa: 'x'.repeat(500) } },
    message: { from: 'Jo‮\u0000 <b>Smith</b>', text: `<script>alert("hi")</script>\u0007 ${'long '.repeat(200)}`, audio: { mime: 'audio/wav', data: '' } },
  };
  const parsed = await readPack(jsonFile(pack), { books: BOOKS });
  assert.equal(parsed.readerName.length, PACK_LIMITS.readerName);
  assert.equal(parsed.language, '');
  assert.equal(parsed.child.display, 'Ava', 'normalised like a typed name');
  assert.equal(parsed.child.fullName, null, 'same as the display name: not kept');
  assert.equal(parsed.child.pronunciation.say, 'Ava', 'a say with no letters falls back to the name');
  assert.equal(parsed.child.pronunciation.respell, '');
  assert.equal(parsed.child.pronunciation.ipa, '', 'IPA from a file is not trusted: it is only rebuilt from a visible respelling');
  assert.equal(parsed.message.from, 'Jo <b>Smith</b>', 'no control or direction-override characters; markup is just text');
  assert.ok(parsed.message.text.startsWith('<script>alert("hi")</script> long'), 'kept as text, never as HTML');
  assert.ok(Array.from(parsed.message.text).length <= PACK_LIMITS.message);
  assert.equal(parsed.message.audio, null, 'an empty recording is dropped');
  assert.ok(Math.abs(parsed.createdAt - Date.now()) < 5000, 'a bad date becomes now');
});

test('audio budget: one pack can’t smuggle more than the limit', async () => {
  // Fake an enormous part cheaply: the size check happens before decoding.
  const hugeB64 = 'A'.repeat(Math.ceil((PACK_LIMITS.partBytes + 10) / 3) * 4);
  const pack = { format: PACK_FORMAT, version: 1, kind: 'reading', bookId: 'tiffin-football', parts: { 1: { main: { mime: 'audio/wav', data: hugeB64 } }, 2: { main: { mime: 'audio/wav', data: await b64(wav(50)) } } } };
  const parsed = await readPack(jsonFile(pack), { books: BOOKS });
  assert.deepEqual(Object.keys(parsed.parts), ['2']);
  assert.match(parsed.warnings.join(' '), /too long/);
});

// ---- Helpers ---------------------------------------------------------------------------

test('helpers: text cleaning, MIME types, base64, sniffing, filenames', async () => {
  assert.equal(cleanText('  a\tb\u0000c  ', 10), 'a bc');
  assert.equal(cleanText('line one\r\n\r\n\r\nline two', 100, { multiline: true }), 'line one\n\nline two');
  assert.equal(cleanText('one\ntwo', 100), 'one two', 'single line by default');
  assert.equal(cleanText({ toString: () => 'x' }, 10), '');
  assert.equal(cleanText('😀😀😀', 2), '😀😀', 'caps count characters, not UTF-16 units');
  assert.equal(baseMime(' Audio/WEBM; codecs=opus'), 'audio/webm');
  assert.ok(isAllowedAudio('audio/mp4;codecs=mp4a.40.2'));
  assert.ok(!isAllowedAudio('text/html'));
  assert.ok(!isAllowedAudio('audio/svg+xml'));
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253]);
  assert.deepEqual(decodeBase64(encodeBase64(bytes)), bytes);
  assert.deepEqual(decodeBase64('AAEC\n+vv8/Q=='), bytes, 'line-wrapped base64 is fine');
  assert.equal(decodeBase64('AAEC+vv8/Q='), null, 'bad length');
  assert.equal(decodeBase64('AA=C'), null, 'padding in the middle');
  assert.equal(decodeBase64('data:audio/wav;base64,AAAA'), null);
  assert.equal(decodeBase64(''), null);
  assert.equal(base64Size(encodeBase64(bytes)), bytes.length);
  assert.equal(sniffAudio(await bytesOf(wav())), 'wav');
  assert.equal(sniffAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0])), 'webm');
  assert.equal(sniffAudio(new TextEncoder().encode('OggS\0\0\0\0\0\0\0\0')), 'ogg');
  assert.equal(sniffAudio(new TextEncoder().encode('\0\0\0\x18ftypM4A \0\0')), 'mp4');
  assert.equal(sniffAudio(new TextEncoder().encode('ID3\x04\0\0\0\0\0\0\0\0')), 'mp3');
  assert.equal(sniffAudio(new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0, 0, 0, 0, 0])), 'aac');
  assert.equal(sniffAudio(new TextEncoder().encode('<svg onload=x>')), null);
  assert.equal(asciiSlug('Grandma Rosé ❤️'), 'Grandma-Rose');
  assert.equal(asciiSlug('😀'), 'family');
  assert.equal(packFilename({ kind: 'reading', bookId: 'tiffin-football', readerName: 'Grandma Rose' }), 'tiffin-football-Grandma-Rose.starring.json');
  assert.equal(packFilename({ kind: 'gift', bookId: 'tiffin-football', child: { display: 'Zoë' } }), 'tiffin-football-Zoe.starring.json');
  assert.equal(packFilename({ kind: 'reading', bookId: 'tiffin-football' }), 'tiffin-football-family.starring.json');
});

test('gift pronunciations cannot smuggle arbitrary words into the story', async () => {
  const { giftPronunciation } = await import('../../js/family/pack.js');
  // A respelling wins: what the parent sees is what is said.
  assert.deepEqual(giftPronunciation({ say: 'Stinky Pants', respell: 'AY-vuh' }, 'Ava'), { say: 'Ayva', ipa: 'ˈeɪvə', respell: 'AY-vuh' });
  // A plain sounds-like spelling is kept if it looks like a name.
  assert.equal(giftPronunciation({ say: 'Neeve' }, 'Niamh').say, 'Neeve');
  assert.equal(giftPronunciation({ say: 'Shi vawn' }, 'Siobhan').say, 'Shi vawn');
  // Sentences, punctuation and long text fall back to the displayed name.
  for (const bad of ['you are a silly billy, ha ha', 'Bad! Word.', 'one two three four', '<b>x</b>', '']) {
    assert.equal(giftPronunciation({ say: bad }, 'Ava').say, 'Ava', bad);
  }
});
