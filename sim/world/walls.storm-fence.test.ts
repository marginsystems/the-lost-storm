import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, run, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { SkillTrail } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { placeArea } from './areas.ts';
import { offenceOf } from './combat.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const LINE_Z: number = 3;
const EAST: Vec2 = { x: 1, z: 0 };
const SEGMENT: SkillDef = shapeSkill('storm_fence_segment');

function fence(world: World): void {
  for (let x: number = -4; x < 4; x += 0.8) must(placeArea(world, offenceOf(world.player), SEGMENT, offset(x, LINE_Z), EAST, 0.8), 'segment');
}

function slamsOn(events: readonly WorldEvent[], targetId: number): number {
  return events.filter((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === targetId && event.skill.id === 'storm_fence_slam').length;
}

void test('Storm Fence is a held drag that lays a blocking lane standing a shorter time than a Firewall', (): void => {
  const drawn: SkillDef = shapeSkill('storm_fence');
  const firewall: SkillDef = shapeSkill('firewall_segment');
  assert.equal(drawn.press?.type, 'channel');
  const trail: SkillTrail = must(drawn.trail ?? undefined, 'trail');
  assert.equal(trail.skill, SEGMENT.id);
  assert.equal(trail.from, 'aim');
  assert.ok(SEGMENT.delivery.type === 'area' && SEGMENT.delivery.length > 0 && SEGMENT.delivery.blocks);
  assert.ok(firewall.delivery.type === 'area' && SEGMENT.delivery.duration < firewall.delivery.duration);
});

void test('a monster thrown into a Storm Fence stops at it and is slammed once', (): void => {
  const world: World = shapeArena([]);
  fence(world);
  const thrown: MonsterState = dummy(world, offset(0, LINE_Z + 1));
  thrown.knock.z = -14;
  const events: WorldEvent[] = run(world, 0.5);
  assert.ok(thrown.pos.z > offset(0, LINE_Z).z, `the monster ended at ${thrown.pos.z.toFixed(2)}, past the fence`);
  assert.equal(slamsOn(events, thrown.id), 1);
});

void test('a Storm Fence goes out on its own, and the way is open again', (): void => {
  const world: World = shapeArena([]);
  fence(world);
  assert.ok(SEGMENT.delivery.type === 'area');
  run(world, SEGMENT.delivery.duration + 0.2);
  assert.equal(world.areas.filter((area): boolean => area.skill.id === SEGMENT.id && area.timeLeft > 0).length, 0);
});

void test('with The Pen, an enemy a fence kills lets a Forkline leap on from where it fell', (): void => {
  const world: World = shapeArena([]);
  world.player.allocated = ['squall_line_the_pen'];
  fence(world);
  const caught: MonsterState = dummy(world, offset(0, LINE_Z + 0.2));
  const beside: MonsterState = dummy(world, offset(2, LINE_Z + 2.5));
  caught.life = 1;
  const events: WorldEvent[] = run(world, 0.6);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'death' && event.actorId === caught.id), 'the fence kills it');
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === beside.id && event.skill.id === 'forkline'), 'a Forkline leaps on to the next enemy');
});
