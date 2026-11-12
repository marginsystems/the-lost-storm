import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOADING_MARK, markPhase } from './loading-mark.ts';

void test('the wave crosses the whole mark inside one cycle, so every pixel is dark again at the cycle boundary', (): void => {
  let latest: number = 0;
  for (let row: number = 0; row < LOADING_MARK.size; row += 1) {
    for (let column: number = 0; column < LOADING_MARK.size; column += 1) latest = Math.max(latest, markPhase(row, column));
  }
  assert.equal(markPhase(0, 0), 0);
  assert.equal(latest, LOADING_MARK.waveSpread);
  assert.ok(latest + LOADING_MARK.pixelLitFor <= 1);
});

void test('every pixel waits one step per diagonal, the step the stylesheet uses for marks drawn before any script runs', (): void => {
  const step: number = markPhase(0, 1);
  assert.equal(step, 0.05625);
  for (let row: number = 0; row < LOADING_MARK.size; row += 1) {
    for (let column: number = 0; column < LOADING_MARK.size; column += 1) assert.equal(markPhase(row, column), (row + column) * step);
  }
});
