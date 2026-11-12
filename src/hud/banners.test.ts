import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerHoldMs } from './banners.ts';

void test('a banner with others waiting behind it holds for a shorter time, and an act banner always holds long', (): void => {
  assert.ok(bannerHoldMs('quest', 2) < bannerHoldMs('quest', 0));
  assert.equal(bannerHoldMs('act', 3), bannerHoldMs('act', 0));
  assert.ok(bannerHoldMs('act', 0) > bannerHoldMs('zone', 0));
});
