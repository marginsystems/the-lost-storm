import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PickColumn, PickRay } from './marker-pick.ts';
import { columnHit, nearestColumn } from './marker-pick.ts';

const down = (x: number, z: number): PickRay => ({ origin: { x, y: 20, z }, direction: { x: 0, y: -1, z: 0 } });
const slant: PickRay = { origin: { x: -10, y: 10, z: 0 }, direction: { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 } };
const arch: PickColumn = { x: 0, y: 0, z: 0, radius: 1.5, height: 4 };

void test('a ray straight down hits a column inside its radius and misses outside', (): void => {
  assert.equal(columnHit(down(1, 0), arch), 16);
  assert.equal(columnHit(down(2, 0), arch), null);
});

void test('a slanted ray hits the upper part of a tall column before it would reach the ground', (): void => {
  const at: number | null = columnHit(slant, arch);
  assert.ok(at !== null);
  const y: number = slant.origin.y + slant.direction.y * at;
  assert.ok(y > 0 && y <= arch.height);
});

void test('a slanted ray passing over the top of a short column misses it', (): void => {
  assert.equal(columnHit(slant, { x: -5, y: 0, z: 0, radius: 1, height: 1 }), null);
});

void test('a column with no radius is never picked', (): void => {
  assert.equal(columnHit(down(0, 0), { ...arch, radius: 0 }), null);
});

void test('the nearest column along the ray wins', (): void => {
  const near: PickColumn = { x: -4, y: 0, z: 0, radius: 1, height: 10 };
  assert.equal(nearestColumn(slant, [['far', arch], ['near', near]]), 'near');
  assert.equal(nearestColumn(down(9, 9), [['far', arch], ['near', near]]), null);
});
