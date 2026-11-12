import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextCalling } from './menu.ts';

void test('the chart button starts calling when a point is gained', (): void => {
  assert.equal(nextCalling(false, 0, 1, false), true);
});

void test('it keeps calling until the chart is opened, then stays quiet', (): void => {
  assert.equal(nextCalling(true, 1, 1, false), true);
  assert.equal(nextCalling(true, 1, 1, true), false);
  assert.equal(nextCalling(false, 1, 1, false), false);
});

void test('a new point after opening calls again, and spending every point stops it', (): void => {
  assert.equal(nextCalling(false, 1, 2, false), true);
  assert.equal(nextCalling(true, 1, 0, false), false);
});
