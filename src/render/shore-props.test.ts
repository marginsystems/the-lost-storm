import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BufferAttribute, InterleavedBufferAttribute } from 'three';
import { pathAlpha, pathGeometry, SHORE_PATH } from './shore-props.ts';

void test('the worn path is solid down its middle, fades to nothing at its sides and both ends', (): void => {
  assert.equal(pathAlpha(0, 20, 58), 0);
  assert.equal(pathAlpha(1, 20, 58), 0);
  assert.equal(pathAlpha(0.5, 20, 58), SHORE_PATH.strength);
  assert.equal(pathAlpha(0.5, 0, 58), 0);
  assert.equal(pathAlpha(0.5, 58, 58), 0);
});

void test('the worn path lies flat on the ground, starts just past the line and runs its length ashore', (): void => {
  const geometry = pathGeometry({ surface: 'crag_ground', width: 2.6, length: 58, sway: 1.4 });
  const positions: BufferAttribute | InterleavedBufferAttribute = geometry.getAttribute('position');
  let least: number = Infinity;
  let most: number = -Infinity;
  for (let index: number = 0; index < positions.count; index += 1) {
    assert.equal(positions.getY(index), 0);
    least = Math.min(least, positions.getZ(index));
    most = Math.max(most, positions.getZ(index));
  }
  assert.equal(least, SHORE_PATH.start);
  assert.equal(most, SHORE_PATH.start + 58);
  const up = geometry.getAttribute('normal');
  assert.ok(up.getY(0) > 0.99);
  geometry.dispose();
});
