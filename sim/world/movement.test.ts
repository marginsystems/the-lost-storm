import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { followPath, separateActors, turnToward } from './movement.ts';
import type { MonsterState, World } from './types.ts';
import { spawnPacks } from './monsters.ts';

const content: Content = loadContent();

void test('turnToward turns by at most the step and takes the short way round', (): void => {
  assert.equal(turnToward(0, 0.1, 0.5), 0.1);
  assert.equal(turnToward(0, 2, 0.5), 0.5);
  assert.equal(turnToward(3, -3, 0.1), 3.1);
  assert.equal(turnToward(-3, 3, 0.1), -3.1);
});

void test('followPath spends the whole step across waypoints and faces the next one', (): void => {
  const world: World = worldIn(content, 'drowned_bastion', 1);
  const player = world.player;
  player.pos = { x: 28, z: 22 };
  player.facing = 0;
  const path: Vec2[] = [{ x: 28.2, z: 22 }, { x: 28.2, z: 24 }];
  const moved: number = followPath(world.grid, player, path, 0.5, Math.PI);
  assert.ok(Math.abs(moved - 0.5) < 1e-9);
  assert.equal(path.length, 1);
  assert.ok(Math.abs(player.pos.z - 22.3) < 1e-9);
  assert.ok(Math.abs(player.facing) < 1e-9);
});

void test('followPath reports no progress when the way is blocked', (): void => {
  const world: World = worldIn(content, 'drowned_bastion', 1);
  const player = world.player;
  const path: Vec2[] = [{ x: 20, z: 14 }];
  player.pos = { x: 21.6, z: 14 };
  const moved: number = followPath(world.grid, player, path, 0.2, 0.1);
  assert.equal(moved, 0);
});

void test('separating a crowd never pushes anyone into a wall', (): void => {
  const world: World = worldIn(content, 'drowned_bastion', 2);
  world.monsters = [];
  world.zone = { ...world.zone, packs: [{ x: 2, z: 22, members: [{ monster: 'bone_thrall', count: 6 }], when: [] }] };
  spawnPacks(world);
  for (const monster of world.monsters) monster.pos = { x: 1.1, z: 22 };
  world.player.pos = { x: 1.1, z: 22.2 };
  for (let pass: number = 0; pass < 10; pass += 1) separateActors(world);
  for (const monster of world.monsters) assert.ok(isWalkable(world.grid, monster.pos.x, monster.pos.z), `monster at ${monster.pos.x},${monster.pos.z}`);
  const first: MonsterState = must(world.monsters[0], 'first');
  assert.ok(first.pos.z !== 22 || first.pos.x !== 1.1);
});
