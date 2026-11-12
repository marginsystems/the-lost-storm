import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countLine, loadCountLines, readCountLines } from './count-lines.ts';

void test('the shipped count lines read, and the line names how many others there are', (): void => {
  const lines = loadCountLines();
  assert.equal(countLine(lines, 0), lines.none);
  assert.equal(countLine(lines, 1), lines.one);
  assert.equal(countLine(lines, 12), lines.many.replace('{others}', '12'));
  assert.ok(!countLine(lines, 12).includes('{others}'));
});

void test('count lines without every line or without the count slot are refused', (): void => {
  assert.equal(readCountLines({ none: 'a', one: 'b' }), null);
  assert.equal(readCountLines({ none: 'a', one: 'b', many: 'many others' }), null);
  assert.equal(readCountLines({ none: '', one: 'b', many: '{others}' }), null);
  assert.equal(readCountLines('lines'), null);
  assert.deepEqual(readCountLines({ none: 'a', one: 'b', many: '{others} c' }), { none: 'a', one: 'b', many: '{others} c' });
});
