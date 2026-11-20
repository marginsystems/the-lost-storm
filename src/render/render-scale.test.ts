import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameSample, RenderScale } from './render-scale.ts';
import { createRenderScale, RENDER_SCALE, scaleSteps } from './render-scale.ts';

const SMOOTH: FrameSample = { intervalMs: 16.7, workMs: 5, gpuQueued: 1 };
const GPU_BOUND: FrameSample = { intervalMs: 33.3, workMs: 5, gpuQueued: 1 };
const CPU_BOUND: FrameSample = { intervalMs: 33.3, workMs: 28, gpuQueued: 1 };

function feed(scale: RenderScale, sample: FrameSample, count: number): number {
  let changes: number = 0;
  for (let index: number = 0; index < count; index += 1) if (scale.observe(sample)) changes += 1;
  return changes;
}

function untilChange(scale: RenderScale, sample: FrameSample, most: number): number {
  for (let index: number = 1; index <= most; index += 1) if (scale.observe(sample)) return index;
  return -1;
}

void test('the steps never take the scene below one pixel per CSS pixel, so a display at ratio 1 is never scaled', (): void => {
  assert.deepEqual(scaleSteps(1.5), [1, 0.875, 0.75, 0.6875]);
  assert.deepEqual(scaleSteps(1.25), [1, 0.875]);
  assert.deepEqual(scaleSteps(1), [1]);
  assert.deepEqual(scaleSteps(2), [1, 0.875, 0.75, 0.6875]);
  for (const ratio of [1.5, 1.25, 1, 2]) for (const step of scaleSteps(ratio)) assert.ok(step === 1 || ratio * step >= RENDER_SCALE.floorRatio);
});

void test('a game that holds the frame rate keeps full resolution', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  assert.equal(feed(scale, SMOOTH, 2000), 0);
  assert.equal(scale.scale, 1);
});

void test('frames missed while the main thread is idle lower the scale one step within one window', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  assert.equal(untilChange(scale, GPU_BOUND, RENDER_SCALE.window * 2), RENDER_SCALE.window);
  assert.equal(scale.scale, 0.875);
});

void test('frames missed because the main thread is busy never lower the scale, since fewer pixels would not help', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  assert.equal(feed(scale, CPU_BOUND, 2000), 0);
  assert.equal(scale.scale, 1);
});

void test('a lasting GPU overload steps down to the floor and stops there', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  assert.equal(feed(scale, GPU_BOUND, 2000), RENDER_SCALE.steps.length - 1);
  assert.equal(scale.scale, 0.6875);
});

void test('a single long frame, a hidden tab or a stall over the limit is not taken as GPU load', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  for (let round: number = 0; round < 50; round += 1) {
    feed(scale, SMOOTH, RENDER_SCALE.window - 1);
    feed(scale, GPU_BOUND, 1);
    feed(scale, { intervalMs: 4000, workMs: 1, gpuQueued: 1 }, 1);
  }
  assert.equal(scale.scale, 1);
});

void test('once the frames are smooth again the scale climbs back one step at a time', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  feed(scale, GPU_BOUND, 2000);
  const waited: number = untilChange(scale, SMOOTH, RENDER_SCALE.raiseAfter * 3);
  assert.ok(waited > 0 && waited <= RENDER_SCALE.raiseAfter * 2, `raised after ${waited} frames`);
  assert.equal(scale.scale, 0.75);
  feed(scale, SMOOTH, 5000);
  assert.equal(scale.scale, 1);
});

void test('a raise that brings the misses straight back waits twice as long before the next raise', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  feed(scale, GPU_BOUND, RENDER_SCALE.window);
  assert.equal(scale.scale, 0.875);
  assert.equal(untilChange(scale, SMOOTH, RENDER_SCALE.raiseAfter * 2), RENDER_SCALE.settle + RENDER_SCALE.raiseAfter);
  assert.equal(scale.scale, 1);
  assert.equal(untilChange(scale, GPU_BOUND, RENDER_SCALE.window * 2), RENDER_SCALE.settle + RENDER_SCALE.window);
  assert.equal(scale.scale, 0.875);
  assert.equal(untilChange(scale, SMOOTH, RENDER_SCALE.raiseAfter * 4), RENDER_SCALE.settle + RENDER_SCALE.raiseAfter * RENDER_SCALE.backoff);
});

void test('the wait between raises never grows past its ceiling', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  for (let round: number = 0; round < 12; round += 1) {
    feed(scale, GPU_BOUND, RENDER_SCALE.settle + RENDER_SCALE.window);
    untilChange(scale, SMOOTH, RENDER_SCALE.raiseMost * 2);
  }
  feed(scale, GPU_BOUND, RENDER_SCALE.settle + RENDER_SCALE.window);
  assert.equal(scale.scale, 0.875);
  assert.equal(untilChange(scale, SMOOTH, RENDER_SCALE.raiseMost * 2), RENDER_SCALE.settle + RENDER_SCALE.raiseMost);
});

void test('a new pixel ratio starts again from full resolution, and says so only when the scale moved', (): void => {
  const scale: RenderScale = createRenderScale(1.5);
  assert.equal(scale.fit(1.5), false);
  feed(scale, GPU_BOUND, RENDER_SCALE.window);
  assert.equal(scale.scale, 0.875);
  assert.equal(scale.fit(2), true);
  assert.equal(scale.scale, 1);
  assert.equal(scale.fit(1), false);
  assert.equal(feed(scale, GPU_BOUND, 2000), 0);
  assert.equal(scale.scale, 1);
});
