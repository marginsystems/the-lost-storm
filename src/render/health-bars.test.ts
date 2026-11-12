import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barWanted } from './health-bars.ts';

void test('a bar shows only for a living monster that has lost life', (): void => {
  assert.equal(barWanted({ alive: true, life: 10, maxLife: 10 }), false);
  assert.equal(barWanted({ alive: true, life: 9, maxLife: 10 }), true);
  assert.equal(barWanted({ alive: false, life: 0, maxLife: 10 }), false);
});
