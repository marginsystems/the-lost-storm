import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { chooseGait, GAIT } from './gait.ts';

const GAITS = [{ groundSpeed: 1.2 }, { groundSpeed: 7 }] as const;

void test('a body picks the gait whose pace fits its speed, plays it at the matching rate, and stands still below a crawl', (): void => {
  assert.equal(chooseGait(GAITS, 1, GAIT.minSpeed / 2, 0), null);
  assert.equal(chooseGait([], 1, 3, 0), null);
  assert.deepEqual(chooseGait(GAITS, 1, 1.2, -1), { index: 0, rate: 1 });
  const run = must(chooseGait(GAITS, 1.2, 8.4, -1), 'run');
  assert.equal(run.index, 1);
  assert.ok(Math.abs(run.rate - 1) < 1e-9);
});

void test('a body keeps the gait it holds until the other fits clearly better, so it does not flicker between them', (): void => {
  const crossing: number = Math.exp((Math.log(7) + GAIT.hurryCost * Math.log(1.2)) / (1 + GAIT.hurryCost));
  assert.equal(must(chooseGait(GAITS, 1, crossing * 1.05, 0), 'held walk').index, 0);
  assert.equal(must(chooseGait(GAITS, 1, crossing * 0.95, 1), 'held jog').index, 1);
  assert.equal(must(chooseGait(GAITS, 1, 1.5, 1), 'slow').index, 0);
  assert.equal(must(chooseGait(GAITS, 1, 6, 0), 'fast').index, 1);
});
