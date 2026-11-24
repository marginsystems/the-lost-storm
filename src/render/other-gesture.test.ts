import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveAct } from '../backend/live-protocol.ts';
import type { ClipTimes, GestureCue, GestureState } from './other-gesture.ts';
import { createGestureState, GESTURE, gestureNeeds, placeAct, queueAct, shownPose, stepGesture } from './other-gesture.ts';
import type { TrackPose } from './other-track.ts';

const DT: number = 1 / 60;

const LENGTHS: Readonly<Record<string, number>> = { Yes: 2.5, Sitting_Enter: 1.3, Sitting_Exit: 1, Sitting_Idle_Loop: 1.67, Sitting_Talking_Loop: 2.93, Idle_Talking_Loop: 2.93 };

const LOADED: ClipTimes = (clip: string): number | null => LENGTHS[clip] ?? null;

const NOTHING: ClipTimes = (): number | null => null;

const NO_EXIT: ClipTimes = (clip: string): number | null => (clip === 'Sitting_Exit' ? null : LOADED(clip));

const STILL: TrackPose = { x: 4, z: 5, facing: 1, speed: 0 };

function act(id: string, at: number = 0): LiveAct {
  return { id, at };
}

function cueOf(state: GestureState): Omit<GestureCue, 'serial'> {
  return { once: state.cue.once, hold: state.cue.hold };
}

function run(state: GestureState, seconds: number, pose: TrackPose = STILL, clips: ClipTimes = LOADED, from: number = 0): number {
  let now: number = from;
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) {
    now += DT * 1000;
    stepGesture(state, now, DT, pose, pose.speed > 0.2, clips);
  }
  return now;
}

void test('a nod plays once and the body is back to standing when it ends', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 0, act('nod'));
  run(state, DT);
  assert.deepEqual(cueOf(state), { once: 'Yes', hold: null });
  assert.equal(state.phase.kind, 'once');
  run(state, 2.5 - GESTURE.blend + DT * 2);
  assert.equal(state.phase.kind, 'still');
});

void test('the same act with the same stamp starts once, and a new stamp starts it again', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 0, act('nod', 1));
  run(state, DT);
  const serial: number = state.cue.serial;
  queueAct(state, 0, act('nod', 1));
  run(state, DT);
  assert.equal(state.cue.serial, serial);
  queueAct(state, 0, act('nod', 2));
  run(state, DT);
  assert.equal(state.cue.serial, serial + 1);
});

void test('an act waits for the shared timeline, so it lands with the moves it came with', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 500, act('nod'));
  stepGesture(state, 499, DT, STILL, false, LOADED);
  assert.equal(state.cue.once, null);
  stepGesture(state, 500, DT, STILL, false, LOADED);
  assert.equal(state.cue.once, 'Yes');
});

void test('sitting enters, talks while seated without standing, and stands through the exit', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 0, act('sit'));
  let now: number = run(state, DT);
  assert.deepEqual(cueOf(state), { once: 'Sitting_Enter', hold: 'Sitting_Idle_Loop' });
  queueAct(state, now, act('sit_talk'));
  now = run(state, DT, STILL, LOADED, now);
  assert.deepEqual(cueOf(state), { once: null, hold: 'Sitting_Talking_Loop' });
  queueAct(state, now, null);
  now = run(state, DT, STILL, LOADED, now);
  assert.deepEqual(cueOf(state), { once: 'Sitting_Exit', hold: null });
  assert.equal(state.phase.kind, 'rising');
  run(state, 1, STILL, LOADED, now);
  assert.equal(state.phase.kind, 'still');
});

void test('a seated body that starts walking stands up in place first, then eases onto its track without a jump', (): void => {
  const state: GestureState = createGestureState();
  placeAct(state, act('sit'));
  assert.deepEqual(cueOf(state), { once: null, hold: 'Sitting_Idle_Loop' });
  let x: number = STILL.x;
  let shown: TrackPose = shownPose(state, STILL, DT);
  let now: number = 0;
  let largest: number = 0;
  for (let frame: number = 0; frame < 150; frame += 1) {
    x += 3 * DT;
    now += DT * 1000;
    const pose: TrackPose = { ...STILL, x, speed: 3 };
    stepGesture(state, now, DT, pose, true, LOADED);
    const next: TrackPose = shownPose(state, pose, DT);
    if (frame === 0) assert.deepEqual(cueOf(state), { once: 'Sitting_Exit', hold: null });
    if (frame < 30) assert.equal(next.x, STILL.x);
    largest = Math.max(largest, Math.abs(next.x - shown.x));
    shown = next;
  }
  assert.equal(shown.x, x);
  assert.ok(largest < 0.3, `the body moved ${largest} m in one frame`);
  queueAct(state, now, act('sit'));
  run(state, DT, { ...STILL, x }, LOADED, now);
  assert.equal(state.cue.hold, null);
});

void test('walking cancels a held loop, and the loop does not come back until the act changes', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 0, act('talk', 1));
  let now: number = run(state, DT);
  assert.deepEqual(cueOf(state), { once: null, hold: 'Idle_Talking_Loop' });
  now = run(state, 0.5, { ...STILL, speed: 3 }, LOADED, now);
  assert.deepEqual(cueOf(state), { once: null, hold: null });
  queueAct(state, now, act('talk', 1));
  now = run(state, 0.5, STILL, LOADED, now);
  assert.equal(state.cue.hold, null);
  queueAct(state, now, act('talk', 2));
  run(state, DT, STILL, LOADED, now);
  assert.equal(state.cue.hold, 'Idle_Talking_Loop');
});

void test('a nod asked of a seated body waits for it to stand', (): void => {
  const state: GestureState = createGestureState();
  placeAct(state, act('sit'));
  queueAct(state, 0, act('nod'));
  let now: number = run(state, DT);
  assert.deepEqual(cueOf(state), { once: 'Sitting_Exit', hold: null });
  now = run(state, 1 - GESTURE.blend + DT * 2, STILL, LOADED, now);
  assert.deepEqual(cueOf(state), { once: 'Yes', hold: null });
  assert.ok(now > 0);
});

void test('one already in a gesture on arrival shows a held one at once and never replays a one-shot', (): void => {
  const state: GestureState = createGestureState();
  placeAct(state, act('nod'));
  assert.deepEqual(cueOf(state), { once: null, hold: null });
  queueAct(state, 0, act('nod'));
  run(state, DT);
  assert.equal(state.cue.once, null);
  placeAct(state, act('arms_folded'));
  assert.equal(state.phase.kind, 'hold');
  const serial: number = state.cue.serial;
  placeAct(state, act('arms_folded'));
  assert.equal(state.cue.serial, serial);
});

void test('an act waits for its clips, and a one-shot that waited too long is let go', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 0, act('nod'));
  assert.ok(gestureNeeds(state));
  stepGesture(state, 100, DT, STILL, false, NOTHING);
  assert.equal(state.cue.once, null);
  stepGesture(state, 200, DT, STILL, false, LOADED);
  assert.equal(state.cue.once, 'Yes');
  const late: GestureState = createGestureState();
  queueAct(late, 0, act('nod'));
  stepGesture(late, GESTURE.staleMs + 1, DT, STILL, false, NOTHING);
  stepGesture(late, GESTURE.staleMs + 2, DT, STILL, false, LOADED);
  assert.equal(late.cue.once, null);
});

void test('a body that stood up before its exit clip arrived never plays that exit later', (): void => {
  const state: GestureState = createGestureState();
  placeAct(state, act('sit'));
  run(state, 0.2, { ...STILL, speed: 3 }, NO_EXIT);
  assert.equal(state.phase.kind, 'still');
  assert.deepEqual(cueOf(state), { once: null, hold: null });
});

void test('a held loop or a posture whose clips arrive late is still shown once they arrive', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 0, act('talk'));
  stepGesture(state, GESTURE.staleMs + 1, DT, STILL, false, NOTHING);
  assert.deepEqual(cueOf(state), { once: null, hold: 'Idle_Talking_Loop' });
  const seated: GestureState = createGestureState();
  queueAct(seated, 0, act('sit'));
  stepGesture(seated, GESTURE.staleMs + 1, DT, STILL, false, NOTHING);
  assert.deepEqual(cueOf(seated), { once: 'Sitting_Enter', hold: 'Sitting_Idle_Loop' });
});
