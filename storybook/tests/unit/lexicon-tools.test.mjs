import test from 'node:test';
import assert from 'node:assert/strict';
import { coarse, similarity, stressIndex, distance } from '../../tools/check-lexicon.mjs';

test('coarse IPA ignores dialect-level detail', () => {
  assert.equal(coarse('ʃɪˈvɔːn'), coarse('ʃɪvˈɔn'));
  assert.equal(coarse('ˈaɪlə'), coarse('ˈaɪlʌ'));
  assert.equal(coarse('ˈmæθjuː'), coarse('ˈmaθjuː'));
  assert.equal(coarse('ɹ'), coarse('r'));
});

test('similarity and distance', () => {
  assert.equal(distance('abc', 'abc'), 0);
  assert.equal(distance('abc', 'abd'), 1);
  assert.equal(similarity('niːv', 'nˈiːv'), 1);
  assert.ok(similarity('niːv', 'naɪəm') < 0.5);
});

test('stressIndex finds the stressed vowel group', () => {
  assert.equal(stressIndex('ʃɪˈvɔːn'), 1);
  assert.equal(stressIndex('ˈaɪlə'), 0);
  assert.equal(stressIndex('niːv'), -1);
  assert.equal(stressIndex('ʃi vˈɔːn'), 1);
});
