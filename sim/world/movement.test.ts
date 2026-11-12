import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import type { Steering, SteerStep } from './movement.ts';
import { alignedSpeed, followPath, separateActors, steerAlong, steerHeading, turnToward } from './movement.ts';
import type { MonsterState, World } from './types.ts';
import { spawnPacks } from './monsters.ts';
import { roadWorld, roadZone } from '../../test/road-support.ts';

void test('turnToward turns by at most the step and takes the short way round', (): void => {
  assert.equal(turnToward(0, 0.1, 0.5), 0.1);
  assert.equal(turnToward(0, 2, 0.5), 0.5);
  assert.equal(turnToward(3, -3, 0.1), 3.1);
  assert.equal(turnToward(-3, 3, 0.1), -3.1);
});

void test('followPath spends the whole step across waypoints and faces the next one', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
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
  const world: World = roadWorld(roadZone({ tiles: ['wwww www', 'wwww www', 'wwww www', 'wwww www'] }));
  const player = world.player;
  const path: Vec2[] = [{ x: 20, z: 14 }];
  player.pos = { x: 20.6, z: 14 };
  const moved: number = followPath(world.grid, player, path, 0.2, 0.1);
  assert.equal(moved, 0);
});

void test('separating a crowd never pushes anyone into a wall', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  world.zone = { ...world.zone, packs: [{ x: 2, z: 22, members: [{ monster: 'mended', count: 6, mods: [] }], when: [] }] };
  spawnPacks(world);
  for (const monster of world.monsters) monster.pos = { x: 1.1, z: 22 };
  world.player.pos = { x: 1.1, z: 22.2 };
  for (let pass: number = 0; pass < 10; pass += 1) separateActors(world);
  for (const monster of world.monsters) assert.ok(isWalkable(world.grid, monster.pos.x, monster.pos.z), `monster at ${monster.pos.x},${monster.pos.z}`);
  const first: MonsterState = must(world.monsters[0], 'first');
  assert.ok(first.pos.z !== 22 || first.pos.x !== 1.1);
});

void test('slow ground cuts the distance a step covers by its pace', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwssss', 'wwwwssss', 'wwwwssss', 'wwwwssss'] }));
  const player = world.player;
  player.pos = { x: 4, z: 8 };
  assert.ok(Math.abs(followPath(world.grid, player, [{ x: 12, z: 8 }], 1, Math.PI) - 1) < 1e-9);
  player.pos = { x: 20, z: 8 };
  assert.ok(Math.abs(followPath(world.grid, player, [{ x: 28, z: 8 }], 1, Math.PI) - 0.5) < 1e-9);
});

const STEER: Steering = { maxTurnRate: 16, minTurnRate: 2, turnGain: 24, fullSpeedAngle: 0.35, sharpAngle: 0.9, sharpSpeed: 0, passRadius: 0.45, settleRadius: 0.3 };

void test('steerHeading eases into a new heading: capped while far, slowing as it closes, landing exactly', (): void => {
  const dt: number = 1 / 60;
  assert.ok(Math.abs(steerHeading(0, Math.PI / 2, dt, STEER) - STEER.maxTurnRate * dt) < 1e-9);
  assert.ok(Math.abs(steerHeading(0, 0.2, dt, STEER) - STEER.turnGain * 0.2 * dt) < 1e-9);
  assert.equal(steerHeading(0, 0.01, dt, STEER), 0.01);
  assert.ok(steerHeading(3, -3, dt, STEER) > 3);
  let facing: number = 0;
  let lastTurn: number = Infinity;
  for (let step: number = 0; step < 30; step += 1) {
    const next: number = steerHeading(facing, 1, dt, STEER);
    assert.ok(next - facing <= lastTurn + 1e-12);
    lastTurn = next - facing;
    facing = next;
  }
  assert.equal(facing, 1);
});

void test('alignedSpeed keeps full speed through gentle turns and eases to a stop for a turn behind', (): void => {
  assert.equal(alignedSpeed(0, STEER), 1);
  assert.equal(alignedSpeed(-STEER.fullSpeedAngle, STEER), 1);
  assert.equal(alignedSpeed(Math.PI, STEER), STEER.sharpSpeed);
  let last: number = 1;
  for (let angle: number = 0; angle <= Math.PI; angle += 0.05) {
    const speed: number = alignedSpeed(angle, STEER);
    assert.ok(speed <= last + 1e-12);
    last = speed;
  }
});

void test('steerAlong moves the way the hero faces, so a turn bends the walk instead of sliding the body', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 16 };
  player.facing = 0;
  const path: Vec2[] = [{ x: 17, z: 22 }];
  const dt: number = 1 / 60;
  const step: SteerStep = steerAlong(world.grid, player, path, 0.1, dt, STEER);
  assert.ok(player.facing > 0 && player.facing < Math.atan2(1, 6));
  assert.ok(Math.abs(Math.atan2(player.pos.x - 16, player.pos.z - 16) - player.facing) < 1e-9);
  assert.ok(Math.abs(step.moved - step.tried) < 1e-9);
});

void test('steerAlong turns on the spot toward a point behind, and still counts as trying to go there', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 8 };
  player.facing = 0;
  const path: Vec2[] = [{ x: 16, z: 2 }];
  const step: SteerStep = steerAlong(world.grid, player, path, 0.1, 1 / 60, STEER);
  assert.deepEqual(player.pos, { x: 16, z: 8 });
  assert.equal(step.tried, 0);
  assert.ok(player.facing !== 0);
  assert.equal(path.length, 1);
});

void test('steerAlong settles onto the last point without whipping round at the end', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 8 };
  player.facing = 0.3;
  const path: Vec2[] = [{ x: 16.02, z: 8.2 }];
  steerAlong(world.grid, player, path, 0.5, 1 / 60, STEER);
  assert.equal(player.facing, 0.3);
  assert.deepEqual(player.pos, { x: 16.02, z: 8.2 });
  assert.equal(path.length, 0);
});

void test('steerAlong drops a waypoint it has nearly reached and steers for the next', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  const player = world.player;
  player.pos = { x: 16, z: 8 };
  player.facing = 0;
  const path: Vec2[] = [{ x: 16, z: 8.3 }, { x: 16, z: 14 }];
  steerAlong(world.grid, player, path, 0.1, 1 / 60, STEER);
  assert.equal(path.length, 1);
  assert.ok(Math.abs(player.pos.z - 8.1) < 1e-9);
});
