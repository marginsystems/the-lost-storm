import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EchoTake, RecorderFrame } from './recorder.ts';
import { createEchoRecorder, RECORDER } from './recorder.ts';

function walk(recorder: ReturnType<typeof createEchoRecorder>, frames: number, at: (index: number) => RecorderFrame): EchoTake | null {
  let take: EchoTake | null = null;
  for (let index: number = 0; index < frames && take === null; index += 1) take = recorder.step(RECORDER.stepSeconds, at(index));
  return take;
}

void test('a walk becomes a take of fixed-step points once it has enough of them', (): void => {
  const recorder = createEchoRecorder();
  const take = walk(recorder, 100, (index: number): RecorderFrame => ({ zone: 'between', pos: { x: 80 + index * 0.9, z: 80 }, facing: 7, shift: { x: 0, z: 0 } }));
  assert.ok(take !== null);
  assert.equal(take.zone, 'between');
  assert.equal(take.points.length, RECORDER.points);
  assert.deepEqual(take.points[0], [80, 80, 0.72]);
  assert.ok(take.points.every((point): boolean => Math.abs(point[2]) <= Math.PI));
});

void test('standing still makes no take, and after a take the recorder rests', (): void => {
  const still = createEchoRecorder();
  assert.equal(walk(still, 200, (): RecorderFrame => ({ zone: 'between', pos: { x: 80, z: 80 }, facing: 0, shift: { x: 0, z: 0 } })), null);
  const moving = createEchoRecorder();
  const first = walk(moving, 100, (index: number): RecorderFrame => ({ zone: 'between', pos: { x: 80 + index, z: 80 }, facing: 0, shift: { x: 0, z: 0 } }));
  assert.ok(first !== null);
  const restFrames: number = Math.floor(RECORDER.restSeconds / RECORDER.stepSeconds) - 1;
  assert.equal(walk(moving, restFrames, (index: number): RecorderFrame => ({ zone: 'between', pos: { x: 80 + index, z: 80 }, facing: 0, shift: { x: 0, z: 0 } })), null);
});

void test('a shift of the mist mid-take is taken out, so the take stays one continuous walk', (): void => {
  const recorder = createEchoRecorder();
  const take = walk(recorder, 100, (index: number): RecorderFrame => {
    const shifted: boolean = index >= 10;
    return { zone: 'between', pos: { x: 80 + index - (shifted ? 24 : 0), z: 80 }, facing: 0, shift: { x: shifted ? -24 : 0, z: 0 } };
  });
  assert.ok(take !== null);
  for (let index: number = 1; index < take.points.length; index += 1) {
    const step: number = Math.abs((take.points[index]?.[0] ?? 0) - (take.points[index - 1]?.[0] ?? 0));
    assert.ok(step <= 1.01, `step ${index} is ${step}`);
  }
});

void test('changing zone starts a new take', (): void => {
  const recorder = createEchoRecorder();
  const take = walk(recorder, 100, (index: number): RecorderFrame => ({ zone: index < 12 ? 'between' : 'stillhold', pos: { x: 10 + index, z: 10 }, facing: 0, shift: { x: 0, z: 0 } }));
  assert.equal(take?.zone, 'stillhold');
});
