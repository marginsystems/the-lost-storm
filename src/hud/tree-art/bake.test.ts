import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artSource, cssImage, greyPixels } from './bake.ts';

void test('the source of a painted place comes back out of its css image, and goes back in unchanged', (): void => {
  const source: string = 'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2064%2064%22%3E%3C%2Fsvg%3E';
  assert.equal(artSource(cssImage(source)), source);
  assert.equal(artSource('none'), null);
});

void test('grey pixels keep their light and their alpha and lose their colour', (): void => {
  const pixels: Uint8ClampedArray = new Uint8ClampedArray([255, 0, 0, 200, 0, 255, 0, 255, 255, 255, 255, 0]);
  greyPixels(pixels);
  assert.deepEqual([...pixels], [54, 54, 54, 200, 182, 182, 182, 255, 255, 255, 255, 0]);
});
