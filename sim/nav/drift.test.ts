import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneDrift } from '../content/road-types.ts';
import { driftOpen, driftShown } from './drift.ts';

const DRIFT: ZoneDrift = { id: 'patch', column: 0, row: 0, columns: 1, rows: 1, period: 10, open: 0.6, offset: 2, fade: 1 };

void test('a drift is open for its share of each period, shifted by its offset', (): void => {
  assert.equal(driftOpen(DRIFT, 0), true);
  assert.equal(driftOpen(DRIFT, 3.9), true);
  assert.equal(driftOpen(DRIFT, 4.1), false);
  assert.equal(driftOpen(DRIFT, 7.9), false);
  assert.equal(driftOpen(DRIFT, 8.1), true);
  assert.equal(driftOpen(DRIFT, 24.1), false);
});

void test('a drift fades in after it opens and out before it closes, and is gone while closed', (): void => {
  assert.equal(driftShown(DRIFT, 8), 0);
  assert.ok(Math.abs(driftShown(DRIFT, 8.5) - 0.5) < 1e-9);
  assert.equal(driftShown(DRIFT, 10), 1);
  assert.ok(Math.abs(driftShown(DRIFT, 13.5) - 0.5) < 1e-9);
  assert.equal(driftShown(DRIFT, 15), 0);
  assert.equal(driftShown({ ...DRIFT, fade: 0 }, 9), 1);
});
