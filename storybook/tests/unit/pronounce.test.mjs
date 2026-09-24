import test from 'node:test';
import assert from 'node:assert/strict';
import { respellToIpa, respellToSay, looksLikeRespelling, parseRespelling } from '../../js/pronounce/respell.js';
import { suggestFromRules, applyRule, RULES } from '../../js/pronounce/rules.js';
import { buildIndex, lookupVariants } from '../../js/pronounce/lexicon.js';
import { getCandidates, customCandidate, toPronunciation } from '../../js/pronounce/index.js';

test('respellToIpa follows the house key', () => {
  const cases = {
    'shih-VAWN': 'ʃɪˈvɔːn',
    'EYE-luh': 'ˈaɪlə',
    NEEV: 'niːv',
    'DAV-idh': 'ˈdævɪð',
    TYGE: 'taɪɡ',
    'KEE-vuh': 'ˈkiːvə',
    'an-DRAY-uh': 'ænˈdreɪə',
    'uh-SHEEN': 'əˈʃiːn',
    'MAIR-ee': 'ˈmɛəriː',
    'PET-er': 'ˈpɛtə',
    'ER-ik': 'ˈɛrɪk',
    'HLEW': 'ɬjuː',
    'YEL-uh': 'ˈjɛlə',
    'MY-luh': 'ˈmaɪlə',
    'LOKH': 'lɒx',
    'ZHAHN': 'ʒɑːn',
  };
  for (const [r, ipa] of Object.entries(cases)) assert.equal(respellToIpa(r), ipa, r);
});

test('respellToIpa handles several words', () => {
  assert.equal(respellToIpa('MAIR-ee KAYT'), 'ˈmɛəriː keɪt');
});

test('respellToSay builds text a plain TTS voice reads with the right stress', () => {
  assert.equal(respellToSay('shih-VAWN'), 'Shi vawn');
  assert.equal(respellToSay('EYE-luh'), 'Eyela');
  assert.equal(respellToSay('uh-SHEEN'), 'A sheen');
  assert.equal(respellToSay('an-DRAY-uh'), 'An draya');
  assert.equal(respellToSay('DAV-idh'), 'Davith');
  assert.equal(respellToSay('HLEW'), 'Thlew');
  assert.equal(respellToSay('loo-CHEE-uh'), 'Loo cheeya');
});

test('looksLikeRespelling distinguishes respellings from spellings', () => {
  assert.equal(looksLikeRespelling('shih-VAWN'), true);
  assert.equal(looksLikeRespelling('Shivawn'), false);
  assert.equal(looksLikeRespelling('SHIVAWN'), false);
  assert.equal(looksLikeRespelling('shi VAWN'), true);
  assert.equal(looksLikeRespelling(''), false);
});

test('parseRespelling reports junk characters', () => {
  assert.ok(parseRespelling('sh!h-VAWN').errors.length > 0);
  assert.equal(parseRespelling('shih-VAWN').errors.length, 0);
});

test('rules suggest plausible alternatives for unknown names', () => {
  const first = (n) => suggestFromRules(n)[0]?.say;
  const all = (n) => suggestFromRules(n, { max: 5 }).map((s) => s.say);
  const expected = {
    Aoife: 'Eefa', Caoimhe: 'Keeva', Niamh: 'Neev', Saoirse: 'Seersha', Tadhg: 'Tyge', 'Seán': 'Shawn', 'Róisín': 'Rohsheen',
    Siobhan: 'Shivan', Sadhbh: 'Sive', Dafydd: 'Davith', Llinos: 'Thlinos', Huw: 'Hew', 'José': 'Hosay', Jaime: 'Hymay',
    Giulia: 'Julia', Chiara: 'Kiara', 'Françoise': 'Franswahz', Margaux: 'Margoh', Szymon: 'Shimon', 'Łucja': 'Wootsya',
    Wojciech: 'Voitsheh', Xiao: 'Shiow', Zhen: 'Jen', Qing: 'Ching', Isla: 'Eyela', Chloe: 'Kloe',
  };
  for (const [name, say] of Object.entries(expected)) assert.equal(first(name), say, name);
  assert.deepEqual(all('Leah'), ['Leea', 'Laya']);
  assert.deepEqual(all('Leila'), ['Layla', 'Leela', 'Lyla']);
  assert.deepEqual(all('Xavier'), ['Havier', 'Zavier']);
  // Only one language style per name: no French reading of José, no Welsh reading of Guillermo.
  assert.deepEqual(all('José'), ['Hosay']);
  assert.equal(suggestFromRules('Guillermo')[0].rule, 'es');
  // Plain English names get no noise.
  for (const n of ['Jake', 'Jordan', 'Anna', 'Mia', 'Oliver', 'Kai', 'Ivy', 'Zofia', 'Haoran', 'Bob']) assert.deepEqual(suggestFromRules(n), [], n);
  // Double-barrelled names are handled part by part.
  assert.equal(first('Mary-Niamh'), 'Mary neev');
  for (const n of ['Isla', 'Leah', 'Siobhan', 'Aoife', 'Dafydd', 'Xiao', 'Jaime', 'Leila', 'Charlotte']) {
    const s = suggestFromRules(n, { max: 2 });
    assert.ok(s.length <= 2);
    assert.equal(new Set(s.map((x) => x.say.toLowerCase())).size, s.length);
    assert.ok(!s.some((x) => x.say.toLowerCase() === n.toLowerCase()));
  }
});

test('every rule only returns letters, spaces and hyphens', () => {
  for (const rule of RULES) {
    for (const n of ['siobhan', 'dafydd', 'josé', 'giulia', 'françois', 'wojciech', 'xiao', 'isla', 'chloe']) {
      const out = applyRule(rule, n);
      if (out) assert.match(out, /^[a-z\- ]+$/, `${rule.id} on ${n} -> ${out}`);
    }
  }
});

const LEX = {
  entries: [
    { name: 'Niamh', spellings: ['Neve', 'Neamh'], origin: 'Irish', variants: [{ ipa: 'niːv', respell: 'NEEV', say: 'Neeve', label: 'Irish' }] },
    { name: 'Isla', spellings: [], origin: 'Scottish', variants: [
      { ipa: 'ˈaɪlə', respell: 'EYE-luh', say: 'Eyela', label: 'Most common in UK' },
      { ipa: 'ˈɪzlə', respell: 'IZ-luh', say: 'Izla', label: 'As spelt' },
    ] },
    { name: 'Mary', spellings: [], origin: 'English', variants: [{ ipa: 'ˈmɛəri', respell: 'MAIR-ee', say: 'Mairee', label: 'English' }] },
    { name: 'Oisín', spellings: ['Oisin'], origin: 'Irish', variants: [{ ipa: 'ʊˈʃiːn', respell: 'uh-SHEEN', say: 'A sheen', label: 'Irish' }] },
    { name: 'Broken', variants: [] },
  ],
};

test('lexicon lookup matches spellings, accents and case', () => {
  const index = buildIndex(LEX);
  assert.equal(lookupVariants(index, 'neve')[0].say, 'Neeve');
  assert.equal(lookupVariants(index, 'OISIN')[0].say, 'A sheen');
  assert.equal(lookupVariants(index, 'Oisín')[0].say, 'A sheen');
  assert.equal(lookupVariants(index, 'Broken').length, 0);
  assert.equal(lookupVariants(index, 'Zed').length, 0);
});

test('lexicon combines parts of double names', () => {
  const index = buildIndex(LEX);
  const v = lookupVariants(index, 'Mary-Niamh');
  assert.equal(v[0].say, 'Mairee Neeve');
  assert.equal(v[0].ipa, 'ˈmɛəri niːv');
  const partial = lookupVariants(index, 'Isla Rose');
  assert.equal(partial.length, 2);
  assert.equal(partial[0].say, 'Eyela Rose');
  assert.equal(partial[0].ipa, '');
  assert.deepEqual(lookupVariants(index, 'Zed Bob'), []);
});

test('getCandidates puts dictionary first, then as-written, and dedupes', () => {
  const index = buildIndex(LEX);
  const c = getCandidates(index, 'Isla');
  assert.deepEqual(c.map((x) => x.source), ['dictionary', 'dictionary', 'as-written']);
  assert.equal(c[0].say, 'Eyela');
  const unknown = getCandidates(index, 'Leah');
  assert.equal(unknown[0].source, 'as-written');
  assert.ok(unknown.slice(1).every((x) => x.source === 'suggestion'));
  assert.ok(unknown.length <= 4);
  const ids = new Set(unknown.map((x) => x.id));
  assert.equal(ids.size, unknown.length);
  // Dictionary say equal to the name -> no duplicate "as written".
  const same = getCandidates(buildIndex({ entries: [{ name: 'Ava', variants: [{ ipa: 'ˈeɪvə', respell: 'AY-vuh', say: 'Ava', label: 'English' }] }] }), 'Ava');
  assert.equal(same.length, 1);
  // Works without a dictionary at all.
  assert.equal(getCandidates(null, 'Bob')[0].say, 'Bob');
});

test('customCandidate converts respellings and keeps plain spellings', () => {
  const r = customCandidate('shih-VAWN');
  assert.equal(r.say, 'Shi vawn');
  assert.equal(r.ipa, 'ʃɪˈvɔːn');
  const s = customCandidate('  Shivawn ');
  assert.equal(s.say, 'Shivawn');
  assert.equal(s.ipa, '');
  assert.equal(customCandidate('   '), null);
  assert.equal(customCandidate('NEEV').say, 'Neev', 'capitals would be spelled out by some voices');
  assert.equal(customCandidate('MARY KATE').say, 'Mary Kate');
  assert.equal(customCandidate('Neeve', 'heard').label, 'What we heard');
  const p = toPronunciation(r);
  assert.deepEqual(Object.keys(p).sort(), ['ipa', 'label', 'recordingId', 'respell', 'say', 'source', 'useRecording']);
});
