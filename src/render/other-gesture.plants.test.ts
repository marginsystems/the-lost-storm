import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveAct } from '../backend/live-protocol.ts';
import type { ClipTimes, GestureState } from './other-gesture.ts';
import { createGestureState, plantedBy, queueAct, stepGesture } from './other-gesture.ts';
import type { TrackPose } from './other-track.ts';

const DT: number = 1 / 60;
const LENGTHS: Readonly<Record<string, number>> = { Yes: 2.5, Sitting_Enter: 1.3, Sitting_Exit: 1, Sitting_Idle_Loop: 1.67, Sitting_Talking_Loop: 2.93 };
const LOADED: ClipTimes = (clip: string): number | null => LENGTHS[clip] ?? null;
const STILL: TrackPose = { x: 4, z: 5, facing: 1, speed: 0 };
const WALKING: TrackPose = { x: 4, z: 5, facing: 1, speed: 1.4 };

function act(id: string): LiveAct {
  return { id, at: 0 };
}

function run(state: GestureState, seconds: number, pose: TrackPose, from: number = 0): number {
  let now: number = from;
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) {
    now += DT * 1000;
    stepGesture(state, now, DT, pose, pose.speed > 0.2, LOADED);
  }
  return now;
}

void test('standing, nodding and talking plant nothing', (): void => {
  const state: GestureState = createGestureState();
  assert.deepEqual(plantedBy(state), []);
  queueAct(state, 0, act('nod'));
  run(state, 0.5, STILL);
  assert.deepEqual(plantedBy(state), []);
});

void test('seated, he plants what the seated posture names, through the sitting down, the talking and the getting up', (): void => {
  const state: GestureState = createGestureState();
  queueAct(state, 0, act('sit'));
  let now: number = run(state, 0.5, STILL);
  assert.ok(plantedBy(state).includes('driftwood_staff'));
  queueAct(state, now, act('sit_talk'));
  now = run(state, 1, STILL, now);
  assert.ok(plantedBy(state).includes('driftwood_staff'));
  now = run(state, 0.3, WALKING, now);
  assert.equal(state.phase.kind, 'rising');
  assert.ok(plantedBy(state).includes('driftwood_staff'));
  run(state, 2, WALKING, now);
  assert.equal(state.phase.kind, 'still');
  assert.deepEqual(plantedBy(state), []);
});
