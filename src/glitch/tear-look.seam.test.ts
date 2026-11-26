import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TearLook } from './tear-look.ts';
import { CALM_LOOK, seamTear } from './tear-look.ts';

void test('the seam starts calm, tears before it whitens, and ends in full white', (): void => {
  assert.deepEqual(seamTear(false, 0), { ...CALM_LOOK, density: seamTear(false, 0).density });
  const middle: TearLook = seamTear(false, 0.5);
  assert.ok(middle.tear > 0 && middle.split > 0);
  assert.equal(middle.white, 0);
  const end: TearLook = seamTear(false, 1);
  assert.equal(end.white, 1);
  assert.ok(end.split > middle.split);
});

void test('the seam grows a little every step, with no jump from one frame to the next', (): void => {
  const steps: number = 120;
  let last: TearLook = seamTear(false, 0);
  for (let step: number = 1; step <= steps; step += 1) {
    const next: TearLook = seamTear(false, step / steps);
    assert.ok(next.white - last.white < 0.05);
    assert.ok(next.tear - last.tear < 0.05);
    assert.ok(next.white >= last.white && next.split >= last.split);
    last = next;
  }
});

void test('a gentle seam only whitens', (): void => {
  const gentle: TearLook = seamTear(true, 0.8);
  assert.equal(gentle.tear, 0);
  assert.equal(gentle.split, 0);
  assert.equal(gentle.banded, false);
  assert.ok(gentle.white > 0);
  assert.equal(seamTear(true, 1).white, 1);
});
