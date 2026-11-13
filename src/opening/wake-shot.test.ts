import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneWake } from '../../sim/content/story-types.ts';
import { wakeLength } from '../../sim/world/wake.ts';
import type { WakeFrame } from './wake-shot.ts';
import { lidsClosed, pullStart, smootherstep, WAKE_SHOT, wakeBlur, wakeFrame } from './wake-shot.ts';

const PLAN: ZoneWake = { still: 2, stir: 1.2, rise: 3.8, front: 0.18, settle: 3, hurry: 1.2 };
const STEP: number = 1 / 60;

void test('the shot opens close and low on him, softened at the edges, with no pull yet', (): void => {
  const first: WakeFrame = wakeFrame(PLAN, 0);
  assert.equal(first.shot.blend, 0);
  assert.equal(first.shot.pose.distance, WAKE_SHOT.start.distance);
  assert.equal(first.shot.pose.pitchDegrees, WAKE_SHOT.start.pitchDegrees);
  assert.equal(first.soft, WAKE_SHOT.soft);
});

void test('it breathes in while he lies there and holds close through the push-up before pulling back', (): void => {
  const from: number = pullStart(PLAN);
  assert.ok(from > PLAN.still + PLAN.stir);
  assert.ok(from < PLAN.still + PLAN.stir + PLAN.rise / 2);
  assert.equal(wakeFrame(PLAN, from).shot.blend, 0);
  assert.ok(wakeFrame(PLAN, from).shot.pose.distance < WAKE_SHOT.start.distance);
  assert.ok(wakeFrame(PLAN, from + 1).shot.blend > 0);
});

void test('it arrives on the play camera exactly as he is handed control, at rest', (): void => {
  const end: number = wakeLength(PLAN);
  const last: WakeFrame = wakeFrame(PLAN, end);
  assert.equal(last.shot.blend, 1);
  assert.equal(Math.abs(last.shot.swayX), 0);
  assert.equal(Math.abs(last.shot.swayY), 0);
  assert.equal(Math.abs(last.soft), 0);
  assert.ok(1 - wakeFrame(PLAN, end - STEP).shot.blend < 1e-5);
});

void test('no frame of the move jumps: blend and distance change a little each frame, and the pull never reverses', (): void => {
  const end: number = wakeLength(PLAN);
  let before: WakeFrame = wakeFrame(PLAN, 0);
  const limit: number = 2 * STEP;
  for (let elapsed: number = STEP; elapsed <= end + STEP; elapsed += STEP) {
    const now: WakeFrame = wakeFrame(PLAN, elapsed);
    assert.ok(now.shot.blend >= before.shot.blend);
    assert.ok(now.shot.blend - before.shot.blend < limit);
    assert.ok(Math.abs(now.shot.pose.distance - before.shot.pose.distance) < limit);
    assert.ok(Math.abs(now.shot.swayX - before.shot.swayX) < limit);
    before = now;
  }
});

void test('smootherstep is flat at both ends', (): void => {
  assert.equal(smootherstep(-1), 0);
  assert.equal(smootherstep(0), 0);
  assert.equal(smootherstep(0.5), 0.5);
  assert.equal(smootherstep(1), 1);
  assert.ok(smootherstep(0.01) < 1e-4);
  assert.ok(1 - smootherstep(0.99) < 1e-4);
});

void test('his eyes open on the world: shut at first, a first look, a blink, then fully open before he stirs much', (): void => {
  assert.equal(lidsClosed(PLAN, 0), 1);
  const firstLook: number = lidsClosed(PLAN, PLAN.still * 0.42);
  const blink: number = lidsClosed(PLAN, PLAN.still * 0.6);
  assert.ok(firstLook < 0.7, 'the first look opens the lids');
  assert.ok(blink > firstLook + 0.2, 'the blink closes them again');
  assert.equal(lidsClosed(PLAN, PLAN.still * 1.1), 0);
  assert.equal(lidsClosed(PLAN, wakeLength(PLAN)), 0);
  assert.equal(wakeFrame(PLAN, 0).lids, 1);
});

void test('the lids and the focus never jump between two frames', (): void => {
  let lids: number = lidsClosed(PLAN, 0);
  let blur: number = wakeBlur(PLAN, 0);
  for (let elapsed: number = STEP; elapsed <= PLAN.still * 2; elapsed += STEP) {
    const nextLids: number = lidsClosed(PLAN, elapsed);
    const nextBlur: number = wakeBlur(PLAN, elapsed);
    assert.ok(Math.abs(nextLids - lids) < 0.06, `lids jump at ${elapsed}`);
    assert.ok(Math.abs(nextBlur - blur) < 0.03, `focus jumps at ${elapsed}`);
    lids = nextLids;
    blur = nextBlur;
  }
});

void test('the world starts out of focus and is sharp soon after his eyes are open', (): void => {
  assert.equal(wakeFrame(PLAN, 0).blur, WAKE_SHOT.blurPixels);
  assert.ok(wakeBlur(PLAN, PLAN.still) > 0);
  assert.equal(wakeBlur(PLAN, PLAN.still * 1.6), 0);
  assert.equal(wakeFrame(PLAN, wakeLength(PLAN)).blur, 0);
});

void test('a wake with no still time has no blink and no blur', (): void => {
  const hurried: ZoneWake = { ...PLAN, still: 0 };
  assert.equal(lidsClosed(hurried, 0), 0);
  assert.equal(wakeBlur(hurried, 0), 0);
});
