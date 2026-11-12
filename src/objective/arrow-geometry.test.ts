import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArrowPlacement } from './arrow-geometry.ts';
import { arrowPlacement } from './arrow-geometry.ts';

void test('a target inside the inset screen needs no arrow', (): void => {
  assert.equal(arrowPlacement({ x: 500, y: 300 }, 1000, 600, 40), null);
});

void test('a target far to the right pins the arrow to the right edge pointing right', (): void => {
  const placed: ArrowPlacement | null = arrowPlacement({ x: 3000, y: 300 }, 1000, 600, 40);
  assert.ok(placed !== null);
  assert.equal(placed.x, 960);
  assert.equal(placed.y, 300);
  assert.equal(placed.angle, 0);
});

void test('a target above and to the left pins to the top edge on the diagonal', (): void => {
  const placed: ArrowPlacement | null = arrowPlacement({ x: -500, y: -1300 }, 1000, 600, 40);
  assert.ok(placed !== null);
  assert.equal(placed.y, 40);
  assert.ok(placed.x > 40 && placed.x < 500);
  assert.ok(placed.angle < -Math.PI / 2);
});
