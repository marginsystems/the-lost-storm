import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../sim/rng.ts';
import type { WakeStage } from '../../sim/world/wake.ts';
import { WAKE_SHOT } from '../opening/wake-shot.ts';
import type { Wisp } from './wake-wisps.ts';
import { WAKE_WISPS, wispLayout, wispPush, wispState } from './wake-wisps.ts';

function stage(stir: number, front: number): WakeStage {
  return { phase: front > 0 ? 'rise' : 'stir', stir, rise: front, front, settle: 0, through: 0.3 };
}

const WISPS: Wisp[] = wispLayout(WAKE_WISPS.counts.desktop, createRng(WAKE_WISPS.seed));

void test('half the wisps lie between the wake camera and him, the rest all round', (): void => {
  const yaw: number = (WAKE_SHOT.start.yawDegrees * Math.PI) / 180;
  const facing: number = WISPS.filter((wisp: Wisp): boolean => Math.cos(wisp.angle - yaw) > Math.cos(WAKE_WISPS.facingSpread) - 1e-9 && wisp.radius <= WAKE_WISPS.near.max).length;
  assert.ok(facing >= Math.round(WISPS.length * WAKE_WISPS.facingShare));
  assert.deepEqual(wispLayout(4, createRng(WAKE_WISPS.seed)), wispLayout(4, createRng(WAKE_WISPS.seed)));
});

void test('the front pushes every wisp outward and away while it fades, with no jump', (): void => {
  for (const wisp of WISPS) {
    let before = wispState(wisp, stage(1, 0), 2);
    for (let front: number = 0.01; front <= 1; front += 0.01) {
      const now = wispState(wisp, stage(1, front), 2);
      assert.ok(Math.hypot(now.x, now.z) >= Math.hypot(before.x, before.z) - 1e-9);
      assert.ok(now.alpha <= before.alpha + 1e-9);
      assert.ok(Math.abs(now.alpha - before.alpha) < 0.05);
      assert.ok(Math.hypot(now.x - before.x, now.z - before.z) < 0.4);
      before = now;
    }
    assert.equal(before.alpha, 0);
  }
});

void test('the wisps lie visible round him before he rises and are gone outside the wake', (): void => {
  for (const wisp of WISPS) {
    assert.ok(wispState(wisp, stage(0, 0), 0).alpha > 0);
    assert.equal(wispState(wisp, null, 0).alpha, 0);
  }
  assert.equal(wispPush(0), 0);
  assert.equal(wispPush(1), 1);
});
