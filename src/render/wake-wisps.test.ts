import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../../sim/rng.ts';
import type { WakeStage } from '../../sim/world/wake.ts';
import { WAKE_SHOT } from '../opening/wake-shot.ts';
import type { Wisp, WispSoftness } from './wake-wisps.ts';
import { WAKE_WISPS, lensDistance, wispKeep, wispLayout, wispPush, wispsAwayFromLens, wispState } from './wake-wisps.ts';

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

void test('the wisps keep their layout at the start of the wake however long the page has been open', (): void => {
  for (const wisp of WISPS) {
    const start = wispState(wisp, stage(0, 0), 0);
    assert.ok(Math.abs(Math.atan2(start.x, start.z) - Math.atan2(Math.sin(wisp.angle), Math.cos(wisp.angle))) < 1e-9);
  }
});

void test('a wisp over him thins only part way while he lies and clears off him smoothly as he rises', (): void => {
  assert.equal(wispKeep(WAKE_WISPS.soft.desktop, stage(0, 0)), WAKE_WISPS.soft.desktop.keep);
  assert.equal(wispKeep(WAKE_WISPS.soft.desktop, stage(1, 1)), 0);
  let before: number = wispKeep(WAKE_WISPS.soft.desktop, stage(1, 0));
  for (let front: number = 0.01; front <= 1; front += 0.01) {
    const now: number = wispKeep(WAKE_WISPS.soft.desktop, stage(1, front));
    assert.ok(now <= before + 1e-9);
    assert.ok(before - now < 0.02);
    before = now;
  }
});

void test('the phone wisps have softer edges and fade out sooner near the lens than the desktop ones', (): void => {
  const desk: WispSoftness = WAKE_WISPS.soft.desktop;
  const phone: WispSoftness = WAKE_WISPS.soft.mobile;
  assert.ok(phone.edge[1] - phone.edge[0] > desk.edge[1] - desk.edge[0]);
  assert.ok(phone.eye[0] > desk.eye[0] && phone.eye[1] > desk.eye[1]);
  assert.ok(phone.outer > desk.outer);
  assert.ok(phone.keep < desk.keep);
});

void test('the phone tier drops the wisps nearest the lens and keeps the rest in order', (): void => {
  const laid: Wisp[] = wispLayout(WAKE_WISPS.counts.mobile, createRng(WAKE_WISPS.seed));
  const kept: Wisp[] = wispsAwayFromLens(laid, WAKE_WISPS.soft.mobile.drop);
  assert.equal(kept.length, laid.length - WAKE_WISPS.soft.mobile.drop);
  const dropped: Wisp[] = laid.filter((wisp: Wisp): boolean => !kept.includes(wisp));
  for (const gone of dropped) for (const wisp of kept) assert.ok(lensDistance(gone) <= lensDistance(wisp));
  assert.deepEqual(wispsAwayFromLens(laid, WAKE_WISPS.soft.desktop.drop), laid);
});
