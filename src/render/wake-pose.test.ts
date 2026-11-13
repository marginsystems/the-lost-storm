import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneWake } from '../../sim/content/story-types.ts';
import { wakeLength, wakeStage } from '../../sim/world/wake.ts';
import type { WakePose } from './wake-pose.ts';
import { restOffset, restWeight, stirShare, throughKnots, WAKE_POSE, wakePose } from './wake-pose.ts';

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}

const PLAN: ZoneWake = { still: 2, stir: 1.2, rise: 3.8, front: 0.18, settle: 3, hurry: 1.2 };
const STEP: number = 1 / 60;

function at(elapsed: number): WakePose {
  return wakePose(wakeStage(PLAN, elapsed), elapsed);
}

void test('he lies flat and still until the stir, and is fully up with his head forward when control comes', (): void => {
  assert.deepEqual(at(0), { share: 0, standing: false, turn: 0, curl: 0, dip: 0, breath: 0 });
  assert.equal(at(PLAN.still - STEP).share, 0);
  const end: WakePose = at(wakeLength(PLAN));
  assert.equal(end.share, 1);
  assert.equal(end.standing, true);
  assert.ok(Math.abs(end.turn) < 1e-9);
  assert.ok(Math.abs(end.dip) < 1e-9);
});

void test('the stir settles where the rise begins, so the push-up starts without a jump', (): void => {
  assert.equal(stirShare(0), 0);
  assert.equal(stirShare(1), WAKE_POSE.stir.rest);
  const riseAt: number = PLAN.still + PLAN.stir;
  assert.ok(Math.abs(at(riseAt - STEP).share - at(riseAt + STEP).share) < 0.01);
});

void test('the rise pauses at the knee: the clip barely moves through the middle of the rise', (): void => {
  const riseAt: number = PLAN.still + PLAN.stir;
  const knee = WAKE_POSE.rise[1];
  const stand = WAKE_POSE.rise[2];
  const pause: number = at(riseAt + PLAN.rise * stand.at).share - at(riseAt + PLAN.rise * knee.at).share;
  const push: number = at(riseAt + PLAN.rise * knee.at).share - at(riseAt).share;
  assert.ok(pause < push / 4);
});

void test('every frame of the wake moves the body, the head and the hands only a little', (): void => {
  let before: WakePose = at(0);
  for (let elapsed: number = STEP; elapsed <= wakeLength(PLAN); elapsed += STEP) {
    const now: WakePose = at(elapsed);
    assert.ok(now.share >= before.share - 0.004, `share falls at ${elapsed}`);
    assert.ok(Math.abs(now.share - before.share) < 0.02, `share jumps at ${elapsed}`);
    assert.ok(Math.abs(now.turn - before.turn) < 0.06, `turn jumps at ${elapsed}`);
    assert.ok(Math.abs(now.curl - before.curl) < 0.05, `curl jumps at ${elapsed}`);
    assert.ok(Math.abs(now.dip - before.dip) < 0.02, `dip jumps at ${elapsed}`);
    before = now;
  }
});

void test('after standing he looks one way, then the other, then back to the front', (): void => {
  const settleAt: number = PLAN.still + PLAN.stir + PLAN.rise;
  const turns: number[] = [];
  for (let elapsed: number = settleAt; elapsed <= wakeLength(PLAN); elapsed += STEP) turns.push(at(elapsed).turn);
  const left: number = Math.max(...turns);
  const right: number = Math.min(...turns);
  assert.ok(left > 0.99 && right < -0.99);
  assert.ok(turns.indexOf(left) < turns.indexOf(right));
});

void test('knots ease between values and hold the ends', (): void => {
  const knots = [{ at: 0, value: 0 }, { at: 1, value: 2 }];
  assert.equal(throughKnots(knots, -1), 0);
  assert.equal(throughKnots(knots, 0.5), 1);
  assert.equal(throughKnots(knots, 2), 2);
  assert.equal(throughKnots([], 0.5), 0);
});

void test('he breathes while he lies there, and the breath is gone by the time he is halfway up', (): void => {
  const lying: number[] = Array.from({ length: 240 }, (_: unknown, index: number): number => at(index * STEP).breath);
  assert.ok(Math.max(...lying) > WAKE_POSE.breath.amount * 0.9);
  assert.ok(Math.min(...lying) < -WAKE_POSE.breath.amount * 0.9);
  assert.equal(Math.abs(at(PLAN.still + PLAN.stir + PLAN.rise / 2).breath), 0);
  for (let elapsed: number = STEP; elapsed < wakeLength(PLAN); elapsed += STEP) assert.ok(Math.abs(at(elapsed).breath - at(elapsed - STEP).breath) < 0.01);
});

void test('the lying body is set down until its lowest contact rests on the floor, and lifted if it sinks', (): void => {
  near(restOffset([{ y: 0.42, radius: 0.12 }, { y: 0.4, radius: 0.07 }, { y: 0.5, radius: 0.11 }], 0), -0.3);
  near(restOffset([{ y: -0.05, radius: 0.12 }], 0), 0.17);
  assert.equal(restOffset([], 0), 0);
});

void test('the setting-down holds through the push-up and lets go smoothly as he stands', (): void => {
  assert.equal(restWeight(0), 1);
  assert.equal(restWeight(WAKE_POSE.restUntil.from), 1);
  assert.equal(restWeight(1), 0);
  let before: number = 1;
  for (let share: number = 0; share <= 1; share += 0.01) {
    const weight: number = restWeight(share);
    assert.ok(weight <= before + 1e-12 && before - weight < 0.06);
    before = weight;
  }
});
