import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FrameSample, RenderScale } from './render-scale.ts';
import { createRenderScale, RENDER_SCALE } from './render-scale.ts';

const BACKED_UP: FrameSample = { intervalMs: 33.3, workMs: 18, gpuQueued: RENDER_SCALE.gpuBacklog + 2 };
const BUSY_HERE: FrameSample = { intervalMs: 33.3, workMs: 18, gpuQueued: 1 };

function framesToDrop(scale: RenderScale, sample: FrameSample, most: number): number | null {
  for (let index: number = 1; index <= most; index += 1) if (scale.observe(sample)) return index;
  return null;
}

void test('slow frames with frames queued behind the GPU lower the scale, even when blocked GL calls make the frame look busy', (): void => {
  const scale: RenderScale = createRenderScale(2);
  assert.notEqual(framesToDrop(scale, BACKED_UP, 200), null);
  assert.ok(scale.scale < 1);
});

void test('slow frames that are busy on the main thread with an idle GPU leave the scale alone', (): void => {
  const scale: RenderScale = createRenderScale(2);
  assert.equal(framesToDrop(scale, BUSY_HERE, 400), null);
  assert.equal(scale.scale, 1);
});
