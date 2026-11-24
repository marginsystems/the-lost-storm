import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameSample, RenderScale } from './render-scale.ts';
import { createRenderScale, frameBudgetMs, RENDER_SCALE } from './render-scale.ts';

const PACED: FrameSample = { intervalMs: 33.3, workMs: 5, gpuQueued: 1 };
const PACED_MISSED: FrameSample = { intervalMs: 66.7, workMs: 5, gpuQueued: 1 };

function feed(scale: RenderScale, sample: FrameSample, count: number): number {
  let changes: number = 0;
  for (let index: number = 0; index < count; index += 1) if (scale.observe(sample)) changes += 1;
  return changes;
}

void test('the frame budget follows a capped rate and never drops below a 60 Hz frame', (): void => {
  assert.equal(frameBudgetMs(null), RENDER_SCALE.budgetMs);
  assert.equal(frameBudgetMs(30), 1000 / 30);
  assert.equal(frameBudgetMs(120), RENDER_SCALE.budgetMs);
});

void test('a game paced to 30 frames a second keeps full resolution while it holds that pace', (): void => {
  const scale: RenderScale = createRenderScale(1.25, 30);
  assert.equal(feed(scale, PACED, 2000), 0);
  assert.equal(scale.scale, 1);
});

void test('a paced game that misses its own pace on the GPU still lowers the scale', (): void => {
  const scale: RenderScale = createRenderScale(1.25, 30);
  assert.equal(feed(scale, PACED_MISSED, RENDER_SCALE.window), 1);
  assert.equal(scale.scale, 0.875);
});

void test('pacing an unpaced scale moves its budget', (): void => {
  const scale: RenderScale = createRenderScale(1.25);
  scale.pace(30);
  assert.equal(feed(scale, PACED, 2000), 0);
  scale.pace(null);
  assert.equal(feed(scale, PACED, RENDER_SCALE.settle + RENDER_SCALE.window), 1);
});
