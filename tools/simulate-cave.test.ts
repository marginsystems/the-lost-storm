import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT, OUTPOST_ZONE } from '../test/road-support.ts';
import { must } from '../test/support.ts';
import type { Vec2 } from '../sim/math.ts';
import { distance } from '../sim/math.ts';
import { cellIndex, isWalkable } from '../sim/nav/grid.ts';
import { createWorld } from '../sim/world/create.ts';
import type { MonsterState, World } from '../sim/world/types.ts';
import { enterZone } from '../sim/world/zones.ts';
import { dressHero, farthestPoint, modsNear, routeBack, walkDistances, walkFrom } from './simulate-cave.ts';
import { POLICIES } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';

function outpost(): World {
  const world: World = createWorld(OUTPOST_CONTENT, { seed: 1, save: null });
  enterZone(world, OUTPOST_ZONE, { type: 'start' });
  return world;
}

void test('walking distances start at zero under the hero and grow one cell at a time', (): void => {
  const world: World = outpost();
  const field: Int32Array = walkDistances(world.grid, world.player.pos);
  assert.equal(walkFrom(world.grid, field, world.player.pos), 0);
  const far: Vec2 = farthestPoint(world.grid, field);
  const steps: number = walkFrom(world.grid, field, far);
  assert.ok(steps > 0);
  assert.ok(field.every((value: number): boolean => value <= steps));
  assert.equal(field[cellIndex(world.grid, far.x, far.z)], steps);
});

void test('a route back runs over walkable cells from the hero to the point, in legs no longer than asked', (): void => {
  const world: World = outpost();
  const field: Int32Array = walkDistances(world.grid, world.player.pos);
  const far: Vec2 = farthestPoint(world.grid, field);
  const legs: Vec2[] = routeBack(world.grid, field, far, 3);
  const last: Vec2 = must(legs[legs.length - 1], 'last leg');
  assert.ok(distance(last, far) < world.grid.cellSize);
  assert.ok(legs.every((leg: Vec2): boolean => isWalkable(world.grid, leg.x, leg.z)));
  for (let index: number = 1; index < legs.length; index += 1) {
    const from: Vec2 = must(legs[index - 1], 'leg');
    const to: Vec2 = must(legs[index], 'leg');
    assert.ok(Math.abs(walkFrom(world.grid, field, to) - walkFrom(world.grid, field, from)) <= 3);
  }
});

void test('a dressed hero wears gear of the level in every slot and starts at full life', (): void => {
  const world: World = createWorld(CONTENT, { seed: 1, save: null });
  world.player.level = 14;
  const before: number = world.player.maxLife;
  dressHero(world, must(POLICIES.builds.get('storm'), 'storm'), 2);
  for (const slot of ['weapon', 'head', 'chest', 'hands', 'legs', 'feet'] as const) assert.notEqual(world.player.equipped[slot], null, slot);
  assert.ok(world.player.maxLife > before);
  assert.equal(world.player.life, world.player.maxLife);
});

void test('a dressed hero given an arm holds a weapon of that arm, and an unknown arm is refused', (): void => {
  for (const arm of [['staff'], ['crossbow'], ['greatsword', 'blunt']]) {
    const world: World = createWorld(CONTENT, { seed: 1, save: null });
    world.player.level = 20;
    dressHero(world, must(POLICIES.builds.get('tank'), 'tank'), 3, arm);
    const weapon: string = must(world.player.equipped.weapon, 'weapon').base;
    assert.ok(arm.includes(CONTENT.itemBases.get(weapon)?.weaponKind ?? ''), `${arm.join('/')} got ${weapon}`);
  }
  assert.throws((): void => dressHero(createWorld(CONTENT, { seed: 1, save: null }), must(POLICIES.builds.get('tank'), 'tank'), 3, ['spear']), /no weapon kind spear/);
});

void test('a death names every modifier carried by the monsters near it once, in order', (): void => {
  const world: World = createWorld(CONTENT, { seed: 1, save: null });
  enterZone(world, must(CONTENT.zones.get('under_hall_2'), 'the second cave'), { type: 'start' });
  const first: MonsterState = must(world.monsters[0], 'a monster in the second cave');
  const carrying = (mods: readonly string[]): MonsterState => ({ ...first, def: { ...first.def, mods } });
  assert.deepEqual(modsNear([carrying(['swift', 'brutal']), carrying(['brutal', 'mending']), carrying([])]), ['brutal', 'mending', 'swift']);
  assert.deepEqual(modsNear([carrying([])]), []);
});
