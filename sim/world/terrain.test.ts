import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneDrift, ZoneTrigger } from '../content/road-types.ts';
import { isWalkable } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { roadWorld, roadZone } from '../../test/road-support.ts';
import { stepWorld } from './step.ts';
import type { World, WorldEvent } from './types.ts';

const BRIDGE: ZoneDrift = { id: 'bridge', column: 3, row: 0, columns: 2, rows: 4, period: 10, open: 0.5, offset: 0, fade: 1 };

void test('a drifting patch is walkable while open and closes the way while drifted off', (): void => {
  const world: World = roadWorld(roadZone({ drifts: [BRIDGE] }));
  world.time = 0;
  stepWorld(world, [], 0.01);
  assert.equal(isWalkable(world.grid, 14, 8), true);
  assert.ok(findPath(world.grid, { x: 2, z: 8 }, { x: 30, z: 8 }).length > 0);
  world.time = 6;
  stepWorld(world, [], 0.01);
  assert.equal(isWalkable(world.grid, 14, 8), false);
  assert.equal(findPath(world.grid, { x: 2, z: 8 }, { x: 30, z: 8 }).length, 0);
  world.time = 11;
  stepWorld(world, [], 0.01);
  assert.equal(isWalkable(world.grid, 14, 8), true);
});

void test('a hero standing on a patch as it drifts off is set down on firm ground beside it', (): void => {
  const world: World = roadWorld(roadZone({ drifts: [BRIDGE] }));
  world.time = 4.9;
  stepWorld(world, [], 0.01);
  world.player.pos = { x: 14, z: 8 };
  world.time = 5.1;
  stepWorld(world, [], 0.01);
  assert.equal(isWalkable(world.grid, world.player.pos.x, world.player.pos.z), true);
  assert.ok(Math.abs(world.player.pos.x - 14) < 5);
});

const MARK: ZoneTrigger = { id: 'mark', x: 20, z: 8, radius: 2, when: [], sets: { seen_mark: 'yes' } };

void test('walking into a trigger sets its flags once and reports it', (): void => {
  const world: World = roadWorld(roadZone({ triggers: [MARK] }));
  world.player.pos = { x: 20.5, z: 8 };
  const first: WorldEvent[] = stepWorld(world, [], 0.01);
  assert.equal(world.flags['seen_mark'], 'yes');
  assert.ok(first.some((event: WorldEvent): boolean => event.type === 'triggered' && event.trigger === 'mark'));
  const again: WorldEvent[] = stepWorld(world, [], 0.01);
  assert.equal(again.some((event: WorldEvent): boolean => event.type === 'triggered'), false);
});

void test('a trigger waits for its conditions', (): void => {
  const world: World = roadWorld(roadZone({ triggers: [{ ...MARK, when: [{ type: 'flag', flag: 'ready', is: null, not: false }] }] }));
  world.player.pos = { x: 20, z: 8 };
  stepWorld(world, [], 0.01);
  assert.equal(world.flags['seen_mark'], undefined);
  world.flags['ready'] = 'now';
  stepWorld(world, [], 0.01);
  assert.equal(world.flags['seen_mark'], 'yes');
});

void test('a hero in the middle of a wide patch as it goes is still set down on firm ground', (): void => {
  const tiles: readonly string[] = Array.from({ length: 12 }, (): string => 'w'.repeat(14));
  const wide: ZoneDrift = { id: 'wide', column: 2, row: 0, columns: 10, rows: 12, period: 10, open: 0.5, offset: 0, fade: 1 };
  const world: World = roadWorld(roadZone({ tiles, drifts: [wide], playerStart: { x: 2, z: 2 } }));
  world.time = 4.9;
  stepWorld(world, [], 0.01);
  world.player.pos = { x: 28, z: 24 };
  world.time = 5.1;
  stepWorld(world, [], 0.01);
  assert.equal(isWalkable(world.grid, world.player.pos.x, world.player.pos.z), true);
});
