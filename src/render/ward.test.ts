import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { WARD, WARD_GLOW_FRAGMENT, WARD_GLOW_VERTEX, wardStrength } from './ward.ts';

function pool(d: number): number {
  return Math.exp(-(d * d) / (WARD.spread * WARD.spread));
}

void test('the ward shaders never take pow of an unclamped value or smoothstep with reversed edges', (): void => {
  for (const source of [WARD_GLOW_VERTEX, WARD_GLOW_FRAGMENT]) assert.deepEqual(unsafeGlsl(source), []);
});

void test('the ward is a soft pool of light with no ring band: it is brightest under him and falls off smoothly to nothing', (): void => {
  assert.doesNotMatch(WARD_GLOW_FRAGMENT, /uInner|uOuter|abs\(d -/);
  for (let d: number = 0.05; d <= 1; d += 0.05) assert.ok(pool(d) < pool(d - 0.05));
  assert.ok(pool(0.7) < 0.25);
});

void test('the ward fades with the protection, reaches nothing as it runs out, and is gone when the spring settles at zero', (): void => {
  const full: number = wardStrength(1, 3, 3, 0);
  const half: number = wardStrength(1, 1.5, 3, 0);
  const late: number = wardStrength(1, 0.3, 3, 0);
  assert.ok(half < full);
  assert.ok(late < half);
  assert.equal(wardStrength(1, 0, 3, 0), 0);
  assert.equal(wardStrength(0, 3, 3, 0), 0);
  assert.equal(wardStrength(-0.1, 3, 3, 0), 0);
});
