import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, run, shapeArena, shapeSkill } from '../../test/shape-support.ts';
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

void test('a monster the wall has been burning is still thrown into it by Bellows', (): void => {
  const world: World = shapeArena(['bellows']);
  wall(world);
  const boxed: MonsterState = dummy(world, offset(0, LINE_Z + 0.9));
  run(world, 1.6);
  const events: WorldEvent[] = run(world, 0.8, [{ type: 'skill', slot: 0, aim: offset(0, LINE_Z + 2.2), targetId: null }]);
  assert.equal(slamsOn(events, boxed.id), 1);
  assert.ok(boxed.pos.z > offset(0, LINE_Z).z);
});
