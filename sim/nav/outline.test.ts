import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReadonlyVec2 } from '../math.ts';
import { convexHull, outlineGap, simplifyOutline } from './outline.ts';

const circle: ReadonlyVec2[] = Array.from({ length: 64 }, (_: unknown, index: number): ReadonlyVec2 => ({ x: Math.cos((index / 64) * Math.PI * 2), z: Math.sin((index / 64) * Math.PI * 2) }));

void test('the hull keeps only the outer corners of a scatter of points', (): void => {
  const hull: ReadonlyVec2[] = convexHull([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }, { x: 1, z: 1 }, { x: 0.5, z: 1.5 }]);
  assert.equal(hull.length, 4);
  assert.ok(!hull.some((point: ReadonlyVec2): boolean => point.x === 1 && point.z === 1));
});

void test('a simplified outline has at most the asked corners and still covers every point of the hull', (): void => {
  const hull: ReadonlyVec2[] = convexHull(circle);
  const simple: ReadonlyVec2[] = simplifyOutline(hull, 10);
  assert.ok(simple.length <= 10);
  for (const point of hull) assert.ok(outlineGap(simple, point.x, point.z) <= 1e-9);
  for (const point of simple) assert.ok(Math.hypot(point.x, point.z) < 1.3);
});

void test('the gap is negative inside, zero on the edge and the true distance outside', (): void => {
  const square: ReadonlyVec2[] = convexHull([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }]);
  assert.ok(Math.abs(outlineGap(square, 1, 1) + 1) < 1e-9);
  assert.ok(Math.abs(outlineGap(square, 2, 1)) < 1e-9);
  assert.ok(Math.abs(outlineGap(square, 5, 6) - 5) < 1e-9);
});
