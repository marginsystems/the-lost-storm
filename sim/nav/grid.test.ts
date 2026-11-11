import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { buildNavGrid, cellCenter, cellIndex, isSolid, isWalkable, lineOfSight, lineWalkable, moveWithCollision, nearestWalkable } from './grid.ts';
import type { NavGrid } from './grid.ts';
import { must } from '../../test/support.ts';

const content: Content = loadContent();
const grid: NavGrid = buildNavGrid(content.arena, content.props, content.player.radius);

void test('open floor is walkable and void tiles, the outside and wall margins are not', (): void => {
  assert.ok(isWalkable(grid, 28, 22));
  assert.ok(!isWalkable(grid, 2, 2));
  assert.ok(!isWalkable(grid, -3, 10));
  assert.ok(!isWalkable(grid, 500, 500));
  assert.ok(!isWalkable(grid, 0.4, 22));
  assert.ok(isWalkable(grid, 2, 22));
});

void test('props with a block radius block, and the player start stays free', (): void => {
  assert.ok(!isWalkable(grid, 20, 14));
  assert.ok(isSolid(grid, 20, 14));
  assert.ok(!isWalkable(grid, 20.9, 14));
  assert.ok(isWalkable(grid, 23, 14));
  assert.ok(isSolid(grid, -3, 10));
  assert.ok(!isSolid(grid, 28, 22));
});

void test('cell lookup maps points to cells and back', (): void => {
  assert.equal(cellIndex(grid, -1, 5), -1);
  assert.equal(cellIndex(grid, 5, grid.rows * grid.cellSize + 1), -1);
  const index: number = cellIndex(grid, 28.1, 22.1);
  const centre: Vec2 = cellCenter(grid, index);
  assert.ok(Math.abs(centre.x - 28.1) <= grid.cellSize / 2);
  assert.ok(Math.abs(centre.z - 22.1) <= grid.cellSize / 2);
  assert.equal(cellIndex(grid, centre.x, centre.z), index);
});

void test('lines are blocked by a pillar but not by open floor', (): void => {
  assert.ok(!lineWalkable(grid, { x: 16, z: 14 }, { x: 24, z: 14 }));
  assert.ok(lineWalkable(grid, { x: 16, z: 22 }, { x: 24, z: 22 }));
  assert.ok(!lineOfSight(grid, { x: 16, z: 14 }, { x: 24, z: 14 }));
  assert.ok(lineOfSight(grid, { x: 28, z: 37 }, { x: 28, z: 20 }));
  assert.ok(!lineWalkable(grid, { x: 28, z: 22 }, { x: 28, z: -10 }));
});

void test('nearestWalkable keeps walkable points and snaps others', (): void => {
  const same: Vec2 = must(nearestWalkable(grid, { x: 28, z: 22 }, 4), 'same point');
  assert.deepEqual(same, { x: 28, z: 22 });
  const snapped: Vec2 = must(nearestWalkable(grid, { x: 20, z: 14 }, 4), 'snapped point');
  assert.ok(isWalkable(grid, snapped.x, snapped.z));
  assert.ok(Math.hypot(snapped.x - 20, snapped.z - 14) <= 4);
  assert.equal(nearestWalkable(grid, { x: -50, z: -50 }, 4), null);
});

void test('moveWithCollision moves freely, slides along a wall and never enters one', (): void => {
  const free: Vec2 = { x: 28, z: 22 };
  moveWithCollision(grid, free, 0.5, 0.25);
  assert.deepEqual(free, { x: 28.5, z: 22.25 });

  const sliding: Vec2 = { x: 1.2, z: 22 };
  assert.ok(isWalkable(grid, sliding.x, sliding.z));
  moveWithCollision(grid, sliding, -0.5, 1);
  assert.equal(sliding.x, 1.2);
  assert.equal(sliding.z, 23);

  const pinned: Vec2 = { x: 1.2, z: 22 };
  moveWithCollision(grid, pinned, -2, 0);
  assert.deepEqual(pinned, { x: 1.2, z: 22 });
});
