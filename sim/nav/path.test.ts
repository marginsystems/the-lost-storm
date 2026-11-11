import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { buildNavGrid, isWalkable, lineWalkable } from './grid.ts';
import type { NavGrid } from './grid.ts';
import { findPath } from './path.ts';

const content: Content = loadContent();
const grid: NavGrid = buildNavGrid(content.arena, content.props, content.player.radius);

function follow(from: Vec2, path: readonly Vec2[]): number {
  let length: number = 0;
  let anchor: Vec2 = from;
  for (const point of path) {
    assert.ok(lineWalkable(grid, anchor, point), `segment to ${point.x},${point.z}`);
    length += Math.hypot(point.x - anchor.x, point.z - anchor.z);
    anchor = point;
  }
  return length;
}

void test('a clear line gives a single-step path', (): void => {
  const goal: Vec2 = { x: 28, z: 20 };
  assert.deepEqual(findPath(grid, { x: 28, z: 37 }, goal), [goal]);
});

void test('findPath goes around a pillar', (): void => {
  const from: Vec2 = { x: 16, z: 14 };
  const goal: Vec2 = { x: 24, z: 14 };
  assert.ok(!lineWalkable(grid, from, goal));
  const path: Vec2[] = findPath(grid, from, goal);
  assert.ok(path.length > 1);
  const length: number = follow(from, path);
  assert.deepEqual(must(path.at(-1), 'goal'), goal);
  assert.ok(length > 8);
  assert.ok(length < 14);
});

void test('an unwalkable destination snaps to a nearby walkable point', (): void => {
  const from: Vec2 = { x: 28, z: 22 };
  const path: Vec2[] = findPath(grid, from, { x: 20, z: 14 });
  assert.ok(path.length > 0);
  const end: Vec2 = must(path.at(-1), 'end');
  assert.ok(isWalkable(grid, end.x, end.z));
  assert.ok(Math.hypot(end.x - 20, end.z - 14) <= 4);
  follow(from, path);
});

void test('a destination far outside the arena gives no path', (): void => {
  assert.deepEqual(findPath(grid, { x: 28, z: 22 }, { x: -80, z: -80 }), []);
});

void test('paths exist between distant corners of the arena', (): void => {
  const from: Vec2 = { x: 7, z: 23 };
  const goal: Vec2 = { x: 49, z: 25 };
  const path: Vec2[] = findPath(grid, from, goal);
  assert.deepEqual(must(path.at(-1), 'goal'), goal);
  follow(from, path);
});
