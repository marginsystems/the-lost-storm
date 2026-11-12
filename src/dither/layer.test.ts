import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceBox, DITHER_LAYER, paintRatio } from './layer.ts';

void test('the backdrop paints at the screen pixel ratio, capped so a dense phone screen is not painted at full size', (): void => {
  assert.equal(paintRatio(1, 2), 1);
  assert.equal(paintRatio(2, 2), 2);
  assert.equal(paintRatio(3, 3), DITHER_LAYER.maxRatio);
  assert.equal(paintRatio(Number.NaN, 2), 1);
  assert.equal(paintRatio(0, 2), 1);
});

void test('a soft moving layer paints at page pixels even on a dense screen', (): void => {
  assert.equal(paintRatio(2, 1), 1);
  assert.deepEqual(deviceBox(950, 1050, 2, 1), { width: 950, height: 1050 });
});

void test('the painted box is the element size times the ratio, rounded to whole pixels', (): void => {
  assert.deepEqual(deviceBox(950, 1050, 2, 2), { width: 1900, height: 2100 });
  assert.deepEqual(deviceBox(100.4, 50.6, 1, 2), { width: 100, height: 51 });
});
