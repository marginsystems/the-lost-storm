import assert from 'node:assert/strict';
import { test } from 'node:test';
import { damageTo, dummy, offset, run, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../math.ts';
import { placeArea } from './areas.ts';
import { offenceOf } from './combat.ts';
import { flareAreas } from './flare.ts';
import type { EchoState, MonsterState, World, WorldEvent } from './types.ts';

const EAST: Vec2 = { x: 1, z: 0 };

function segment(world: World, x: number, z: number): void {
  must(placeArea(world, offenceOf(world.player), shapeSkill('firewall_segment'), offset(x, z), EAST, 0.8), 'segment');
}

function bursts(events: readonly WorldEvent[], targetId: number): number {
  return events.filter((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === targetId && event.skill.id === 'flashover_burst' && !event.burn).length;
}

void test('Flashover flares every wall segment, the nearest first', (): void => {
  const world: World = shapeArena([]);
  segment(world, 2, 0);
  segment(world, 8, 0);
  assert.equal(flareAreas(world, offenceOf(world.player), shapeSkill('flashover'), world.player.pos), 2);
  const delays: number[] = world.echoes.map((echo: EchoState): number => echo.timeLeft);
  assert.equal(delays.length, 2);
  assert.ok((delays[0] ?? 0) < (delays[1] ?? 0));
});

void test('Flashover strikes what stands by a wall and nothing far from one', (): void => {
  const world: World = shapeArena(['flashover']);
  segment(world, 6, 0);
  const near: MonsterState = dummy(world, offset(6.4, 0.8));
  const far: MonsterState = dummy(world, offset(-6, 4));
  const events: WorldEvent[] = run(world, 0.8, [{ type: 'skill', slot: 0, aim: offset(6, 0), targetId: null }]);
  assert.equal(bursts(events, near.id), 1);
  assert.equal(damageTo(events, far.id).length, 0);
});

void test('Flashover without a wall sends a piercing flock ahead and spares enemies behind', (): void => {
  const world: World = shapeArena(['flashover']);
  const close: MonsterState = dummy(world, offset(3, 0));
  const far: MonsterState = dummy(world, offset(9, 0));
  const behind: MonsterState = dummy(world, offset(-2, 0));
  const events: WorldEvent[] = run(world, 1.6, [{ type: 'skill', slot: 0, aim: offset(10, 0), targetId: null }]);
  const flock = events.flatMap((event: WorldEvent): Vec2[] => event.type === 'projectile_spawn' ? [event.projectile.direction] : []);
  assert.equal(flock.length, 3);
  assert.equal(new Set(flock.map((heading: Vec2): number => heading.z)).size, 3);
  assert.ok(damageTo(events, close.id).length > 0);
  assert.ok(damageTo(events, far.id).length > 0);
  assert.equal(damageTo(events, behind.id).length, 0);
  assert.equal(bursts(events, close.id), 0);
});
