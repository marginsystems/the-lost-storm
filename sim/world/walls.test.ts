import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { placeArea } from './areas.ts';
import { offenceOf } from './combat.ts';
import { stepWorld } from './step.ts';
import { crossesWall } from './walls.ts';
import type { AreaState, MonsterState, World } from './types.ts';

const DT: number = 1 / 60;
const SEGMENT: SkillDef = must(ARENA_CONTENT.skills.get('firewall_segment'), 'firewall segment');
const LINE_Z: number = ARENA_CENTRE.z + 3;
const EAST: Vec2 = { x: 1, z: 0 };

function drawLine(world: World, from: number, to: number): AreaState[] {
  const laid: AreaState[] = [];
  for (let x: number = from; x < to; x += 0.8) laid.push(must(placeArea(world, offenceOf(world.player), SEGMENT, { x, z: LINE_Z }, EAST, 0.8), 'segment'));
  return laid;
}

function chaser(world: World): MonsterState {
  const monster: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 7 });
  monster.life = 1e6;
  monster.maxLife = 1e6;
  return monster;
}

function run(world: World, seconds: number): void {
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) stepWorld(world, [], DT);
}

void test('a step across a wall segment crosses it, a step along it or past its end does not', (): void => {
  const world: World = arena(1);
  const wall: AreaState = must(placeArea(world, offenceOf(world.player), SEGMENT, { x: 10, z: 10 }, EAST, 0.8), 'segment');
  assert.ok(crossesWall(wall, { x: 10.4, z: 10.3 }, { x: 10.4, z: 9.7 }, 0.3));
  assert.ok(!crossesWall(wall, { x: 10.1, z: 10.3 }, { x: 10.6, z: 10.3 }, 0.3));
  assert.ok(!crossesWall(wall, { x: 12, z: 10.3 }, { x: 12, z: 9.7 }, 0.3));
});

void test('a monster chasing the hero stays on its own side of a burning wall', (): void => {
  const world: World = arena(1);
  const monster: MonsterState = chaser(world);
  drawLine(world, ARENA_CENTRE.x - 6, ARENA_CENTRE.x + 6);
  run(world, 3);
  assert.ok(monster.pos.z > LINE_Z, `the monster stood at ${monster.pos.z.toFixed(2)}, past the wall at ${LINE_Z}`);
});

void test('without the wall the same monster walks through that line to the hero', (): void => {
  const world: World = arena(1);
  const monster: MonsterState = chaser(world);
  run(world, 3);
  assert.ok(monster.pos.z < LINE_Z);
});

void test('the hero walks through their own wall', (): void => {
  const world: World = arena(1);
  drawLine(world, ARENA_CENTRE.x - 6, ARENA_CENTRE.x + 6);
  stepWorld(world, [{ type: 'move', held: false, dest: { x: ARENA_CENTRE.x, z: LINE_Z + 3 } }], DT);
  run(world, 3);
  assert.ok(world.player.pos.z > LINE_Z);
});
