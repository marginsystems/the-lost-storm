import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cssPixels, sameBox } from './image.ts';

void test('a measured pseudo-element size reads as pixels, and anything unusable reads as nothing to paint', (): void => {
  assert.equal(cssPixels('345.6px'), 345.6);
  assert.equal(cssPixels('auto'), 0);
  assert.equal(cssPixels(''), 0);
  assert.equal(cssPixels('-4px'), 0);
});

void test('the image is painted again only when its pixel box changes', (): void => {
  assert.equal(sameBox(null, { width: 10, height: 10 }), false);
  assert.equal(sameBox({ width: 10, height: 10 }, { width: 10, height: 10 }), true);
  assert.equal(sameBox({ width: 10, height: 10 }, { width: 11, height: 10 }), false);
});
