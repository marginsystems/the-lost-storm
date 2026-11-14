import assert from 'node:assert/strict';
import { test } from 'node:test';
import { condition } from './parse-conditions.ts';
import { ContentError } from './read.ts';

void test('a level condition reads its level and its not, and refuses a level of zero or none', (): void => {
  assert.deepEqual(condition({ type: 'level', atLeast: 8 }, 'gate'), { type: 'level', atLeast: 8, not: false });
  assert.deepEqual(condition({ type: 'level', atLeast: 3, not: true }, 'gate'), { type: 'level', atLeast: 3, not: true });
  assert.throws((): unknown => condition({ type: 'level', atLeast: 0 }, 'gate'), ContentError);
  assert.throws((): unknown => condition({ type: 'level' }, 'gate'), ContentError);
});
