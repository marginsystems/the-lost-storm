import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHART_RASTER, FRESH_RASTER, stepRaster } from './chart-raster.ts';
import type { RasterState, RasterStep } from './chart-raster.ts';

function settle(from: RasterState, scale: number): RasterState {
  let state: RasterState = from;
  for (let frame: number = 0; frame < CHART_RASTER.releaseFrames + 1; frame += 1) state = stepRaster(state, scale, true).state;
  return state;
}

void test('a fresh board is rastered at the scale it opens at, then held', (): void => {
  let state: RasterState = FRESH_RASTER;
  const holds: boolean[] = [];
  for (let frame: number = 0; frame < CHART_RASTER.releaseFrames + 2; frame += 1) {
    const step: RasterStep = stepRaster(state, 0.9, true);
    state = step.state;
    holds.push(step.hold);
  }
  assert.deepEqual(state, { phase: 'held', scale: 0.9 });
  assert.equal(holds[0], false);
  assert.equal(holds.at(-1), true);
});

void test('a zoom that stays within the growth allowance keeps the raster held', (): void => {
  const held: RasterState = { phase: 'held', scale: 1 };
  for (const scale of [1 / CHART_RASTER.shrink, 0.9, 1, 1.1, CHART_RASTER.growth]) {
    const step: RasterStep = stepRaster(held, scale, false);
    assert.equal(step.hold, true);
    assert.equal(step.state, held);
  }
});

void test('zooming in past the growth allowance releases the raster, and it is held again at the new scale', (): void => {
  const held: RasterState = { phase: 'held', scale: 1 };
  const first: RasterStep = stepRaster(held, 1.5, false);
  assert.equal(first.hold, false);
  assert.equal(settle(first.state, 1.5).phase, 'held');
  assert.deepEqual(settle(first.state, 1.5), { phase: 'held', scale: 1.5 });
});

void test('a view at rest that is even slightly soft gets a crisp raster, one at rest and sharp does not', (): void => {
  const held: RasterState = { phase: 'held', scale: 1 };
  assert.equal(stepRaster(held, 1.1, true).hold, false);
  assert.equal(stepRaster(held, 1.01, true).hold, true);
  assert.equal(stepRaster(held, 1.1, false).hold, true);
});

void test('zooming out trades the raster in as soon as it is more than the shrink allowance too large, moving or at rest', (): void => {
  const held: RasterState = { phase: 'held', scale: 2.6 };
  assert.equal(stepRaster(held, 2.6 / CHART_RASTER.shrink + 0.01, false).hold, true);
  assert.equal(stepRaster(held, 0.6, false).hold, false);
  assert.equal(stepRaster(held, 0.6, true).hold, false);
  assert.equal(stepRaster(held, 2, true).hold, true);
});

void test('zooming from the closest view to the farthest never holds a raster more than the shrink allowance larger than the view', (): void => {
  let state: RasterState = { phase: 'held', scale: 2.6 };
  for (let scale: number = 2.6; scale > 0.1; scale *= 0.97) {
    state = stepRaster(state, scale, false).state;
    if (state.phase === 'held') assert.ok(state.scale <= scale * CHART_RASTER.shrink, `held ${state.scale} at ${scale}`);
  }
});
