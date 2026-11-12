import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countLine, loadMarkVocabulary, markText, readMarkVocabulary } from './words.ts';

void test('the shipped vocabulary reads, and every word id is a plain id', (): void => {
  const vocabulary = loadMarkVocabulary();
  assert.ok(vocabulary.lists.length >= 2);
  const ids: string[] = vocabulary.lists.flatMap((list) => list.words.map((word) => word.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('do_not'));
});

void test('a mark reads as its words in order, and an unknown word hides the whole mark', (): void => {
  const vocabulary = loadMarkVocabulary();
  assert.equal(markText(vocabulary, ['do_not', 'the_light']), 'do not the light');
  assert.equal(markText(vocabulary, ['do_not', 'something_else']), null);
  assert.equal(markText(vocabulary, []), null);
});

void test('the count line comes from data and names the number', (): void => {
  const { count } = loadMarkVocabulary().copy;
  assert.equal(countLine(count, 0), count.none);
  assert.equal(countLine(count, 1), count.one);
  assert.ok(countLine(count, 41).includes('41'));
});

void test('a vocabulary with a bad word or no count slot is refused', (): void => {
  const copy = { open: 'a', leave: 'b', close: 'c', left: 'd', count: { none: 'n', one: 'o', many: '{count} m' } };
  assert.ok(readMarkVocabulary({ lists: [{ id: 'say', words: [{ id: 'do_not', text: 'do not' }] }], copy }) !== null);
  assert.equal(readMarkVocabulary({ lists: [{ id: 'say', words: [{ id: 'Do Not', text: 'do not' }] }], copy }), null);
  assert.equal(readMarkVocabulary({ lists: [{ id: 'say', words: [] }], copy }), null);
  assert.equal(readMarkVocabulary({ lists: [{ id: 'say', words: [{ id: 'do_not', text: 'do not' }] }], copy: { ...copy, count: { ...copy.count, many: 'many' } } }), null);
});
