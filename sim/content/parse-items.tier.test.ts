import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affix } from './parse-items.ts';
import { ContentError } from './read.ts';

const honed = { id: 'odd_honed', label: 'Odd', slots: ['weapon'], stat: 'damagePercent', op: 'add', min: 0.05, max: 0.1, perLevel: 0.03 };

void test('a line that names no level rolls from the first level', (): void => {
  assert.equal(affix(honed, 'honed').minLevel, 1);
});

void test('a line may wait for a level of its own, and that level must be above zero', (): void => {
  assert.equal(affix({ ...honed, minLevel: 31 }, 'late').minLevel, 31);
  assert.throws(() => affix({ ...honed, minLevel: 0 }, 'zero'), ContentError);
  assert.throws(() => affix({ ...honed, minLevel: 'soon' }, 'word'), ContentError);
});
