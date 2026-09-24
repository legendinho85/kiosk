import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseName, nameKey, possessive, fillTemplate, tokenizeLine, parseTemplate, unknownPlaceholders, unitAtSpokenIndex, person,
} from '../../js/core/personalise.js';

test('normaliseName tidies whitespace, apostrophes and case', () => {
  assert.deepEqual(normaliseName('  siobhan '), { ok: true, display: 'Siobhan', key: 'siobhan' });
  assert.equal(normaliseName('AVA').display, 'Ava');
  assert.equal(normaliseName('anne - marie').display, 'Anne-Marie');
  assert.equal(normaliseName('o’neill').display, "O'Neill");
  assert.equal(normaliseName("d'arcy").display, "D'Arcy");
  assert.equal(normaliseName("ta'liyah").display, "Ta'liyah");
  assert.equal(normaliseName('mary   kate').display, 'Mary Kate');
  assert.equal(normaliseName('St. John').display, 'St. John');
});

test('normaliseName keeps deliberate mixed case and non-Latin scripts', () => {
  assert.equal(normaliseName('DeShawn').display, 'DeShawn');
  assert.equal(normaliseName('McKenzie').display, 'McKenzie');
  assert.equal(normaliseName('Zoë').display, 'Zoë');
  assert.equal(normaliseName('Oisín').key, 'oisin');
  assert.equal(normaliseName('小明').display, '小明');
  assert.equal(normaliseName('محمد').ok, true);
  assert.equal(normaliseName('J').display, 'J');
});

test('normaliseName rejects empty, long and non-letter input', () => {
  assert.deepEqual(normaliseName('   '), { ok: false, error: 'empty' });
  assert.equal(normaliseName('A'.repeat(25)).error, 'too-long');
  assert.equal(normaliseName('Ava2').error, 'invalid-chars');
  assert.equal(normaliseName('Ava 🙂').error, 'invalid-chars');
  assert.equal(normaliseName('<script>').error, 'invalid-chars');
  assert.equal(normaliseName("Ava--Rose").error, 'invalid-chars');
  assert.equal(normaliseName("-Ava").error, 'invalid-chars');
});

test('nameKey folds accents and special letters', () => {
  assert.equal(nameKey('Łucja'), 'lucja');
  assert.equal(nameKey('Søren'), 'soren');
  assert.equal(nameKey("D'Arcy"), 'darcy');
  assert.equal(nameKey('Anne Marie'), 'anne-marie');
  assert.equal(nameKey('Anne-Marie'), 'anne-marie');
});

test('possessive uses UK house style', () => {
  assert.equal(possessive('Ava'), "Ava's");
  assert.equal(possessive('James'), "James's");
});

test('fillTemplate handles every placeholder', () => {
  const p = person('Niamh', 'Neeve');
  assert.equal(fillTemplate("Go, {name}! {name's} turn. {NAME} {Name}", p), "Go, Niamh! Niamh's turn. NIAMH Niamh");
  assert.equal(fillTemplate('{say:Hooray|Hoo ray}!', p), 'Hooray!');
});

test('tokenizeLine keeps display and spoken offsets aligned', () => {
  const p = person('Niamh', 'Neeve');
  const line = tokenizeLine('Pickle passes to {name}. {name\'s} turn!', p);
  assert.equal(line.display, "Pickle passes to Niamh. Niamh's turn!");
  assert.equal(line.spoken, "Pickle passes to Neeve. Neeve's turn!");
  const names = line.units.filter((u) => u.isName);
  assert.deepEqual(names.map((u) => [u.text, u.say, u.nameForm]), [['Niamh.', 'Neeve.', 'plain'], ["Niamh's", "Neeve's", 'poss']]);
  for (const u of line.units) {
    assert.equal(line.display.slice(u.dStart, u.dEnd), u.text);
    assert.equal(line.spoken.slice(u.sStart, u.sEnd), u.say);
  }
});

test('tokenizeLine keeps multi-word names as one unit and de-shouts capitals for speech', () => {
  const line = tokenizeLine('GOAL for {name}!', person('Mary Kate'));
  assert.deepEqual(line.units.map((u) => u.text), ['GOAL', 'for', 'Mary Kate!']);
  assert.equal(line.units[0].say, 'Goal');
  assert.equal(line.units[2].isName, true);
  const shirt = tokenizeLine('{NAME}', person('Ava'));
  assert.equal(shirt.units[0].text, 'AVA');
  assert.equal(shirt.units[0].say, 'Ava');
});

test('tokenizeLine marks punctuation-only units as non-words', () => {
  const line = tokenizeLine('Kick — kick!', person('Ava'));
  assert.deepEqual(line.units.map((u) => u.isWord), [true, false, true]);
});

test('unitAtSpokenIndex maps boundary offsets to units', () => {
  const line = tokenizeLine('Pass to {name} now', person('Siobhan', 'Shi vawn'));
  const idx = line.spoken.indexOf('vawn');
  assert.equal(line.units[unitAtSpokenIndex(line.units, idx)].isName, true);
  assert.equal(unitAtSpokenIndex(line.units, 0), 0);
  assert.equal(line.units[unitAtSpokenIndex(line.units, line.spoken.length - 1)].text, 'now');
});

test('parseTemplate and unknownPlaceholders', () => {
  assert.deepEqual(parseTemplate('Hi {name}!').map((c) => c.kind), ['text', 'name', 'text']);
  assert.deepEqual(unknownPlaceholders('Hi {nmae} and {name} {NAME}'), ['{nmae}']);
});

test('siblings: joined names, plural choices and art form', async () => {
  const { joinNames, togetherPerson } = await import('../../js/core/personalise.js');
  assert.equal(joinNames(['Amara']), 'Amara');
  assert.equal(joinNames(['Amara', 'Zak']), 'Amara and Zak');
  assert.equal(joinNames(['Amara', 'Zak', 'Li']), 'Amara, Zak and Li');
  const two = togetherPerson([{ display: 'Amara' }, { display: 'Niamh', say: 'Neeve' }]);
  assert.deepEqual(two, { display: 'Amara and Niamh', say: 'Amara and Neeve', count: 2, art: 'Amara & Niamh' });
  const line = "Where {is|are} {name's} {shirt|shirts}?";
  assert.equal(fillTemplate(line, two), "Where are Amara and Niamh's shirts?");
  assert.equal(fillTemplate(line, person('Ava')), "Where is Ava's shirt?");
  const t = tokenizeLine(line, two);
  assert.equal(t.spoken, "Where are Amara and Neeve's shirts?");
  assert.deepEqual(t.units.map((u) => u.isName), [false, false, true, false]);
  assert.deepEqual(unknownPlaceholders(line), []);
  assert.deepEqual(togetherPerson([{ display: 'Ava' }]), { display: 'Ava', say: 'Ava' });
  assert.equal(togetherPerson([1, 2, 3, 4].map((i) => ({ display: `K${'a'.repeat(i)}` }))).count, 3);
});
