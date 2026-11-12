import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cast, damageTo, dummy, offset, run, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { timeScaleOf } from './areas.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

void test('a lingering area pulses on everything inside it for its whole duration, then ends', (): void => {
  const world: World = shapeArena(['test_squall']);
  const inside: MonsterState = dummy(world, offset(5, 0));
  const outside: MonsterState = dummy(world, offset(5, 8));
  const events: WorldEvent[] = [...cast(world, 0, offset(5, 0)), ...run(world, 1.5)];
  assert.equal(damageTo(events, inside.id).length, 4);
  assert.equal(damageTo(events, outside.id).length, 0);
  assert.equal(world.areas.length, 0);
  assert.deepEqual(events.flatMap((event: WorldEvent): string[] => (event.type === 'area' ? [event.stage] : [])), ['start', 'pulse', 'pulse', 'pulse', 'pulse', 'end']);
});

void test('a pulling area drags enemies toward its centre and strikes once at the end', (): void => {
  const world: World = shapeArena(['test_draught']);
  const left: MonsterState = dummy(world, offset(1, 0));
  const right: MonsterState = dummy(world, offset(9, 0));
  const before: number = distance(left.pos, right.pos);
  const events: WorldEvent[] = [...cast(world, 0, offset(5, 0)), ...run(world, 0.8)];
  assert.ok(distance(left.pos, right.pos) < before * 0.5);
  assert.equal(damageTo(events, left.id).length, 1);
  assert.equal(damageTo(events, right.id).length, 1);
});

void test('a pull moves a monster only as far as its knockback poise lets it, so one immune to knockback stays put', (): void => {
  const world: World = shapeArena(['test_draught']);
  const placed: MonsterState = dummy(world, offset(1, 0));
  const steady: MonsterState = { ...placed, def: { ...placed.def, poise: { ...placed.def.poise, knockback: 0 } } };
  world.monsters = world.monsters.map((monster: MonsterState): MonsterState => (monster === placed ? steady : monster));
  const before: Vec2 = { ...steady.pos };
  cast(world, 0, offset(5, 0));
  run(world, 0.8);
  assert.ok(distance(steady.pos, before) < 1e-6);
});

void test('a slowing area around the caster slows enemies inside it and never the caster', (): void => {
  const world: World = shapeArena(['test_hush']);
  const near: MonsterState = dummy(world, offset(4, 0));
  const far: MonsterState = dummy(world, offset(0, 12));
  cast(world, 0, offset(1, 0));
  run(world, 0.15);
  assert.equal(timeScaleOf(world, near), 0.25);
  assert.equal(timeScaleOf(world, far), 1);
  assert.equal(timeScaleOf(world, world.player), 1);
});

void test('a area anchored to its caster follows the caster', (): void => {
  const world: World = shapeArena(['test_hush']);
  cast(world, 0, offset(1, 0));
  run(world, 0.15);
  world.player.pos = offset(3, 3);
  run(world, 0.05);
  const area = world.areas[0];
  assert.ok(area !== undefined && distance(area.pos, world.player.pos) < 0.01);
});

void test('a slowed enemy winds up its attack more slowly', (): void => {
  const world: World = shapeArena(['test_hush']);
  const brute: MonsterState = dummy(world, offset(2, 0));
  brute.cooldowns['test_grab'] = 0;
  brute.aggro = true;
  cast(world, 0, offset(1, 0));
  run(world, 0.15);
  for (let step: number = 0; step < 120 && brute.action === null; step += 1) run(world, 1 / 60);
  const action = brute.action;
  assert.ok(action !== null);
  const left: number = action.timeLeft;
  run(world, 0.2);
  assert.ok(brute.action === null || left - brute.action.timeLeft < 0.1);
});
