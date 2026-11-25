import assert from 'node:assert/strict';
import { test } from 'node:test';
import { damageTo, dummy, offset, run, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { placeArea } from './areas.ts';
import { offenceOf } from './combat.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const LINE_Z: number = 3;
const EAST: Vec2 = { x: 1, z: 0 };

function wall(world: World): void {
  for (let x: number = -4; x < 4; x += 0.8) must(placeArea(world, offenceOf(world.player), shapeSkill('firewall_segment'), offset(x, LINE_Z), EAST, 0.8), 'segment');
}

function slamsOn(events: readonly WorldEvent[], targetId: number): number {
  return events.filter((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === targetId && event.skill.id === 'firewall_slam' && !event.burn).length;
}

void test('a monster thrown into the wall stops at it and is slammed once', (): void => {
  const world: World = shapeArena([]);
  wall(world);
  const thrown: MonsterState = dummy(world, offset(0, LINE_Z + 1));
  thrown.knock.z = -14;
  const events: WorldEvent[] = run(world, 0.5);
  assert.ok(thrown.pos.z > offset(0, LINE_Z).z, `the monster ended at ${thrown.pos.z.toFixed(2)}, past the wall`);
  assert.equal(slamsOn(events, thrown.id), 1);
});

void test('a monster walking into the wall is held but not slammed', (): void => {
  const world: World = shapeArena([]);
  wall(world);
  const walker: MonsterState = dummy(world, offset(0, LINE_Z + 0.6));
  world.player.pos.x = offset(0, -2).x;
  world.player.pos.z = offset(0, -2).z;
  walker.aggro = true;
  const events: WorldEvent[] = run(world, 2);
  assert.ok(walker.pos.z > offset(0, LINE_Z).z);
  assert.equal(slamsOn(events, walker.id), 0);
});

void test('Bellows at the middle of a boxed pack throws it into the walls around it', (): void => {
  const world: World = shapeArena(['bellows']);
  wall(world);
  const caught: MonsterState = dummy(world, offset(0, LINE_Z + 1.2));
  const events: WorldEvent[] = run(world, 0.8, [{ type: 'skill', slot: 0, aim: offset(0, LINE_Z + 2.2), targetId: null }]);
  assert.ok(damageTo(events, caught.id).length > 0);
  assert.ok(caught.pos.z > offset(0, LINE_Z).z);
});
