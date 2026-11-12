import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cast, damageTo, dummy, offset, run, shapeArena } from '../../test/shape-support.ts';
import { distance } from '../math.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

type Chain = Extract<WorldEvent, { readonly type: 'chain' }>;

void test('a chain strikes the enemy nearest the aim, then jumps to the next nearest, each link weaker', (): void => {
  const world: World = shapeArena(['test_fork']);
  const first: MonsterState = dummy(world, offset(4, 0));
  const second: MonsterState = dummy(world, offset(7, 2));
  const third: MonsterState = dummy(world, offset(10, 3));
  const events: WorldEvent[] = [...cast(world, 0, offset(4, 0)), ...run(world, 0.3)];
  assert.deepEqual(damageTo(events, first.id), [10]);
  assert.deepEqual(damageTo(events, second.id), [5]);
  assert.deepEqual(damageTo(events, third.id), [3]);
  const chain: Chain | undefined = events.find((event: WorldEvent): event is Chain => event.type === 'chain');
  assert.equal(chain?.points.length, 4);
});

void test('a chain stops after its jumps and never jumps past its reach', (): void => {
  const world: World = shapeArena(['test_fork']);
  const near: MonsterState = dummy(world, offset(3, 0));
  const far: MonsterState = dummy(world, offset(3, 9));
  const events: WorldEvent[] = [...cast(world, 0, offset(3, 0)), ...run(world, 0.3)];
  assert.equal(damageTo(events, near.id).length, 1);
  assert.equal(damageTo(events, far.id).length, 0);
});

void test('a chain with nothing in range still shows its fizzle toward the aim', (): void => {
  const world: World = shapeArena(['test_fork']);
  const events: WorldEvent[] = [...cast(world, 0, offset(5, 0)), ...run(world, 0.3)];
  const chain: Chain | undefined = events.find((event: WorldEvent): event is Chain => event.type === 'chain');
  assert.equal(chain?.points.length, 2);
});

void test('a beam hits everything along its line and nothing beside it', (): void => {
  const world: World = shapeArena(['test_wire']);
  const inLine: MonsterState = dummy(world, offset(0, 5));
  const further: MonsterState = dummy(world, offset(0, 9));
  const aside: MonsterState = dummy(world, offset(4, 5));
  const events: WorldEvent[] = [...cast(world, 0, offset(0, 6)), ...run(world, 0.3)];
  assert.equal(damageTo(events, inLine.id).length, 1);
  assert.equal(damageTo(events, further.id).length, 1);
  assert.equal(damageTo(events, aside.id).length, 0);
});

void test('a blink moves the caster to the aimed spot, capped at its range, and strikes around the arrival', (): void => {
  const world: World = shapeArena(['test_step']);
  const start = { x: world.player.pos.x, z: world.player.pos.z };
  const waiting: MonsterState = dummy(world, offset(6, 1));
  const events: WorldEvent[] = [...cast(world, 0, offset(20, 0)), ...run(world, 0.3)];
  assert.ok(Math.abs(distance(start, world.player.pos) - 6) < 0.25);
  assert.equal(damageTo(events, waiting.id).length, 1);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'blink'));
});
