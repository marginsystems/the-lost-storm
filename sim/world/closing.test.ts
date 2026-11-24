import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, DuelClosing } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { worldIn, zoneOf } from '../../test/support.ts';
import type { ClosingState } from './closing.ts';
import { closingRadius, keepInsideClosing, openClosing } from './closing.ts';
import { stepWorld } from './step.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

const CONTENT: Content = loadContent();
const RULES: DuelClosing = { after: 10, over: 20, margin: 4, to: 3 };

void test('the edge opens around the middle of the two heroes with room past both', (): void => {
  const closing: ClosingState = openClosing(RULES, { x: 0, z: 0 }, { x: 10, z: 0 }, 5);
  assert.deepEqual(closing.centre, { x: 5, z: 0 });
  assert.equal(closing.from, 9);
  assert.equal(closing.startsAt, 15);
  assert.equal(closing.closesAt, 35);
});

void test('the edge holds, then closes steadily to its last radius and stays there', (): void => {
  const closing: ClosingState = openClosing(RULES, { x: 0, z: 0 }, { x: 10, z: 0 }, 0);
  assert.equal(closingRadius(closing, 5), 9);
  assert.equal(closingRadius(closing, 20), 6);
  assert.equal(closingRadius(closing, 30), 3);
  assert.equal(closingRadius(closing, 90), 3);
});

void test('two heroes standing apart are drawn together as the edge closes', (): void => {
  const world: World = worldIn(CONTENT, 'proving_ground', 7);
  world.closing = openClosing(RULES, world.player.pos, { x: world.player.pos.x + 10, z: world.player.pos.z }, world.time);
  const centre = world.closing.centre;
  world.time = world.closing.closesAt;
  keepInsideClosing(world);
  const gap: number = Math.hypot(world.player.pos.x - centre.x, world.player.pos.z - centre.z);
  assert.ok(gap <= RULES.to - world.player.radius + 1e-9, `the hero stands ${gap} from the middle`);
});

void test('a world with no closing edge leaves its heroes where they stand', (): void => {
  const world: World = worldIn(CONTENT, 'proving_ground', 7);
  const before = { ...world.player.pos };
  for (let tick: number = 0; tick < 30; tick += 1) stepWorld(world, [], 1 / 30);
  assert.equal(world.closing, null);
  assert.deepEqual(world.player.pos, before);
});

function besideWall(world: World): Vec2 {
  for (let x: number = 0; x < world.grid.columns * world.grid.cellSize; x += 0.5) {
    for (let z: number = 0; z < world.grid.rows * world.grid.cellSize; z += 0.5) {
      if (isWalkable(world.grid, x, z) && !isWalkable(world.grid, x + 1.5, z)) return { x, z };
    }
  }
  throw new Error('no wall in the proving ground');
}

void test('the edge never carries a hero through a wall', (): void => {
  const world: World = worldIn(CONTENT, 'proving_ground', 7);
  const centre: Vec2 = besideWall(world);
  world.closing = { centre, from: RULES.to, to: RULES.to, startsAt: world.time, closesAt: world.time };
  let held: number = 0;
  for (let turn: number = 0; turn < 32; turn += 1) {
    const angle: number = (turn / 32) * Math.PI * 2;
    const start: Vec2 = { x: centre.x + Math.cos(angle) * 8, z: centre.z + Math.sin(angle) * 8 };
    if (!isWalkable(world.grid, start.x, start.z)) continue;
    world.player.pos.x = start.x;
    world.player.pos.z = start.z;
    keepInsideClosing(world);
    assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z), `the hero was carried into a wall at turn ${turn}`);
    if (Math.hypot(world.player.pos.x - centre.x, world.player.pos.z - centre.z) <= RULES.to) held += 1;
  }
  assert.ok(held > 0, 'no hero in the open was drawn in');
});

void test('leaving the zone takes the edge away with it', (): void => {
  const world: World = worldIn(CONTENT, 'proving_ground', 7);
  world.closing = openClosing(RULES, world.player.pos, { x: world.player.pos.x + 10, z: world.player.pos.z }, world.time);
  enterZone(world, zoneOf(CONTENT, 'hideout'), world.respawn);
  assert.equal(world.closing, null);
});
