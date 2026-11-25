import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box } from './bag-drag.ts';
import { BAG_DRAG, placeUnder } from './bag-drag.ts';

const ROW: readonly Box[] = [
  { left: 0, top: 0, right: 44, bottom: 44 },
  { left: 48, top: 0, right: 92, bottom: 44 },
  { left: 96, top: 0, right: 140, bottom: 44 },
];

void test('letting go over a bag place picks that place', (): void => {
  assert.equal(placeUnder(ROW, 20, 20), 0);
  assert.equal(placeUnder(ROW, 70, 10), 1);
  assert.equal(placeUnder(ROW, 140, 44), 2);
});

void test('letting go in the gap between two places picks the nearer one', (): void => {
  assert.equal(placeUnder(ROW, 45, 20), 0);
  assert.equal(placeUnder(ROW, 47, 20), 1);
});

void test('letting go well clear of every place picks none', (): void => {
  assert.equal(placeUnder(ROW, 70, 44 + BAG_DRAG.reach + 1), -1);
  assert.equal(placeUnder(ROW, -BAG_DRAG.reach - 1, 20), -1);
  assert.equal(placeUnder([], 10, 10), -1);
});
