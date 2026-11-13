import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTrack, fadeToward, placeTrack, poseAt, pushSample, TRACK } from './other-track.ts';
import type { Track, TrackPose } from './other-track.ts';

function pose(track: Track, at: number): TrackPose {
  const found: TrackPose | null = poseAt(track, at);
  assert.ok(found !== null);
  return found;
}

void test('between two batches the place is interpolated and the facing follows the walk', (): void => {
  const track: Track = createTrack({ at: 0, x: 0, z: 0, facing: 0 });
  pushSample(track, { at: 200, x: 1, z: 0, facing: 0 });
  const middle: TrackPose = pose(track, 100);
  assert.equal(middle.x, 0.5);
  assert.equal(middle.speed, 5);
  assert.equal(middle.facing, Math.PI / 2);
});

void test('a player who stood still starts walking from where they stood, not with a jump', (): void => {
  const track: Track = createTrack({ at: 0, x: 0, z: 0, facing: 0 });
  pushSample(track, { at: 5000, x: 1, z: 0, facing: 0 });
  assert.equal(pose(track, 5000 - TRACK.delayMs).x, 0);
  assert.equal(pose(track, 5000 - TRACK.batchMs).x, 0);
  assert.equal(pose(track, 5000 - TRACK.batchMs / 2).x, 0.5);
});

void test('past the last batch the player stands at the last place with no speed', (): void => {
  const track: Track = createTrack({ at: 0, x: 0, z: 0, facing: 0 });
  pushSample(track, { at: 200, x: 1, z: 2, facing: 0.5 });
  assert.deepEqual(pose(track, 900), { x: 1, z: 2, facing: 0.5, speed: 0 });
  assert.deepEqual(pose(track, -50), { x: 0, z: 0, facing: 0, speed: 0 });
});

void test('turning on the spot takes the short way round', (): void => {
  const track: Track = createTrack({ at: 0, x: 0, z: 0, facing: 3 });
  pushSample(track, { at: 200, x: 0, z: 0, facing: -3 });
  const turned: number = pose(track, 100).facing;
  assert.ok(Math.abs(Math.abs(turned) - Math.PI) < 0.01, `facing ${turned.toFixed(3)}`);
});

void test('old samples are dropped and out-of-order ones ignored', (): void => {
  const track: Track = createTrack({ at: 0, x: 0, z: 0, facing: 0 });
  for (let at: number = 200; at <= 10_000; at += 200) pushSample(track, { at, x: at / 1000, z: 0, facing: 0 });
  pushSample(track, { at: 100, x: 99, z: 0, facing: 0 });
  assert.ok(track.samples.length <= TRACK.keepMs / TRACK.batchMs + 2);
  assert.ok(track.samples.every((sample: { readonly x: number }): boolean => sample.x !== 99));
  placeTrack(track, { at: 10_000, x: 5, z: 5, facing: 0 });
  assert.equal(track.samples.length, 1);
});

void test('a player fades in over many frames and settles exactly, never in one frame', (): void => {
  const frame: number = 1 / 60;
  let shown: number = 0;
  const steps: number[] = [];
  for (let index: number = 0; index < 120 && shown < 1; index += 1) {
    shown = fadeToward(shown, 1, frame);
    steps.push(shown);
  }
  assert.ok(steps.length > 30, `settled after ${steps.length} frames`);
  assert.ok(steps.every((value: number, index: number): boolean => index === 0 || value - (steps[index - 1] ?? 0) < 0.1));
  assert.equal(shown, 1);
  assert.equal(fadeToward(0.5, 0, 0), 0.5);
});
