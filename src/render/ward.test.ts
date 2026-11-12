import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { WARD, WARD_RING_FRAGMENT, WARD_RING_VERTEX, WARD_SHIMMER_FRAGMENT, WARD_SHIMMER_VERTEX, wardStrength } from './ward.ts';

void test('the ward shaders never take pow of an unclamped value or smoothstep with reversed edges', (): void => {
  for (const source of [WARD_RING_VERTEX, WARD_RING_FRAGMENT, WARD_SHIMMER_VERTEX, WARD_SHIMMER_FRAGMENT]) assert.deepEqual(unsafeGlsl(source), []);
});

void test('the ward fades as the protection runs out and is gone when the spring settles at zero', (): void => {
  const full: number = wardStrength(1, 3, 3, 0);
  const late: number = wardStrength(1, 0.3, 3, 0);
  assert.ok(late < full);
  assert.ok(late >= WARD.fadeFloor * (1 - WARD.pulseDepth) - 1e-9);
  assert.equal(wardStrength(0, 3, 3, 0), 0);
  assert.equal(wardStrength(-0.1, 3, 3, 0), 0);
});
