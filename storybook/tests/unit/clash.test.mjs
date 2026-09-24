import test from 'node:test';
import assert from 'node:assert/strict';
import { nameClashes, clashMessage, soundKey, editDistance } from '../../js/core/clash.js';

const CAST = ['Tiffin', 'Goose', 'Frog'];

test('soundKey collapses look-alike spellings', () => {
  assert.equal(soundKey('Tiffany'), soundKey('Tiffani'));
  assert.equal(soundKey('Phoebe').startsWith('f'), true);
  assert.equal(editDistance('kitten', 'sitting'), 3);
});

test('flags names a toddler could confuse with a character', () => {
  assert.deepEqual(nameClashes('Tiffin', CAST), [{ character: 'Tiffin', reason: 'same' }]);
  assert.equal(nameClashes('Tiffany', CAST)[0]?.character, 'Tiffin');
  assert.equal(nameClashes('Tiff', CAST)[0]?.character, 'Tiffin');
  assert.equal(nameClashes('Tiffani', CAST)[0]?.character, 'Tiffin');
  assert.equal(nameClashes('Gus', CAST).length, 0);
  assert.equal(nameClashes('Goos', CAST)[0]?.character, 'Goose');
});

test('leaves ordinary names alone', () => {
  for (const n of ['Ava', 'Siobhan', 'Oliver', 'Muhammad', 'Finn', 'Tia', 'Tim', 'Fred', 'Grace', 'Theo', 'Tilly', 'Timothy']) {
    assert.deepEqual(nameClashes(n, CAST), [], n);
  }
});

test('clashMessage is friendly and empty without clashes', () => {
  assert.match(clashMessage('Tiffany', nameClashes('Tiffany', CAST)), /sounds a bit like Tiffin/);
  assert.match(clashMessage('Tiffin', nameClashes('Tiffin', CAST)), /also the name of Tiffin/);
  assert.equal(clashMessage('Ava', []), '');
});
