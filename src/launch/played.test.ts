import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addPlayed, readPlayed } from './played.ts';

void test('played time is read as whole seconds or starts at zero', (): void => {
  assert.equal(readPlayed(null), 0);
  assert.equal(readPlayed('125'), 125);
  assert.equal(readPlayed('-3'), 0);
  assert.equal(readPlayed('1e9'), 0);
});

void test('a long pause between frames adds at most a second', (): void => {
  assert.equal(addPlayed(10, 0.5), 10.5);
  assert.equal(addPlayed(10, 30), 11);
  assert.equal(addPlayed(10, -1), 10);
  assert.equal(addPlayed(10, Number.NaN), 10);
});
