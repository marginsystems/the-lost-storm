import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { PoolOptions } from '../../sim/rl/pool.ts';
import { legalPool, readPoolOptions } from './session.ts';

void test('hello reads the share of duels that start in a corner and a checked pool keeps it', (): void => {
  const options: PoolOptions = readPoolOptions({ seed: 3, envs: 4, duels: 1, corners: 0.4 });
  assert.equal(options.corners, 0.4);
  assert.equal(legalPool(loadContent(), options).corners, 0.4);
});

void test('a hello with no corner share leaves it out, and one above one is refused', (): void => {
  assert.ok(!('corners' in readPoolOptions({ seed: 3, envs: 4, duels: 1 })));
  assert.throws((): PoolOptions => readPoolOptions({ seed: 3, envs: 4, duels: 1, corners: 1.5 }), /corners/);
});
