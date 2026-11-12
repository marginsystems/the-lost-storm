import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { DOME_FRAGMENT, DOME_VERTEX, FLOOR_FRAGMENT, FLOOR_VERTEX } from './moment-shaders.ts';

void test('the bubble shaders never take pow of an unclamped value or smoothstep with reversed edges, so bloom never spreads a NaN', (): void => {
  for (const source of [DOME_VERTEX, DOME_FRAGMENT, FLOOR_VERTEX, FLOOR_FRAGMENT]) assert.deepEqual(unsafeGlsl(source), []);
});

void test('the checker catches the shapes that turned the screen black', (): void => {
  assert.equal(unsafeGlsl('float facing = 1.0 - abs(d);\nfloat rim = pow(facing, 3.4);').length, 1);
  assert.equal(unsafeGlsl('float pool = smoothstep(1.0, 0.55, d);').length, 1);
});
