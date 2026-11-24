import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { PoolOptions } from '../../sim/rl/pool.ts';
import { arenaSeats } from '../../sim/rl/pool.ts';
import { legalPool, readPoolOptions } from './session.ts';

void test('hello reads how many gathers each worker plays', (): void => {
  const options: PoolOptions = readPoolOptions({ seed: 3, envs: 8, roams: 1, gathers: 4 });
  assert.equal(options.gathers, 4);
  assert.equal(arenaSeats(options), 3);
});

void test('a hello without gathers leaves them out', (): void => {
  assert.ok(!('gathers' in readPoolOptions({ seed: 3, envs: 8, gathers: 0 })));
});

void test('a checked pool keeps its gathers', (): void => {
  assert.equal(legalPool(loadContent(), readPoolOptions({ seed: 3, envs: 8, gathers: 2 })).gathers, 2);
});

void test('hello refuses a gather count that is not a number of zero or more', (): void => {
  assert.throws((): PoolOptions => readPoolOptions({ seed: 3, envs: 8, gathers: -2 }), /gathers/);
});
