import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { stepWorld } from './step.ts';
import type { Command, World } from './types.ts';
import { shiftWorld } from './void.ts';
import { acceptsCommand, beginVoid, wakeProgress } from './wake.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const voidZone: ZoneDef = must([...content.zones.values()].find((zone: ZoneDef): boolean => zone.kind === 'void'), 'void zone');

function run(world: World, seconds: number, commands: () => readonly Command[] = (): readonly Command[] => []): void {
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) stepWorld(world, commands(), DT);
}

function wakeSeconds(zone: ZoneDef): number {
  const wake = must(zone.void?.wake, 'wake');
  return wake.lie + wake.rise;
}

void test('a hero who arrives in a void lies down and ignores orders until he is up', (): void => {
  const world: World = worldIn(content, voidZone.id, 3);
  assert.notEqual(world.wake, null);
  const start = { ...world.player.pos };
  const away: Command = { type: 'move', held: false, dest: { x: start.x + 10, z: start.z } };
  run(world, wakeSeconds(voidZone) * 0.9, (): readonly Command[] => [away]);
  assert.equal(distance(world.player.pos, start), 0);
  run(world, wakeSeconds(voidZone) * 0.2);
  assert.equal(world.wake, null);
  run(world, 0.5, (): readonly Command[] => [away]);
  assert.ok(distance(world.player.pos, start) > 1);
});

void test('the wake rises from lying to standing over its rise time', (): void => {
  const wake = { elapsed: 0, lie: 2, rise: 4 };
  assert.equal(wakeProgress(wake), 0);
  assert.equal(wakeProgress({ ...wake, elapsed: 2 }), 0);
  assert.equal(wakeProgress({ ...wake, elapsed: 4 }), 0.5);
  assert.equal(wakeProgress({ ...wake, elapsed: 9 }), 1);
});

void test('a zone that is not a void starts the hero on his feet', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 3);
  beginVoid(world);
  assert.equal(world.wake, null);
});

void test('nothing can be cast in a void, but walking works', (): void => {
  const world: World = worldIn(content, voidZone.id, 3);
  world.wake = null;
  assert.equal(acceptsCommand(world, { type: 'skill', slot: 0, aim: { x: 1, z: 0 }, targetId: null }), false);
  assert.equal(acceptsCommand(world, { type: 'move', held: false, dest: { x: 1, z: 0 } }), true);
  const town: World = worldIn(content, 'hall_of_time', 3);
  assert.equal(acceptsCommand(town, { type: 'skill', slot: 0, aim: { x: 1, z: 0 }, targetId: null }), true);
});

void test('a skill queued before the hero arrives in a void is dropped on arrival', (): void => {
  const world: World = worldIn(content, voidZone.id, 3);
  world.player.queued = { type: 'skill', slot: 0, aim: { x: 1, z: 0 }, targetId: null };
  beginVoid(world);
  assert.equal(world.player.queued, null);
});

void test('walking one way forever never reaches an edge: the void recentres and keeps the walk going', (): void => {
  const world: World = worldIn(content, voidZone.id, 5);
  world.wake = null;
  const span: number = must(voidZone.void, 'void').span;
  const home = voidZone.playerStart;
  let walked: number = 0;
  let last = { ...world.player.pos };
  let lastShift = { ...world.shift };
  for (let step: number = 0; step < Math.round(60 / DT); step += 1) {
    stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x + 20, z: world.player.pos.z - 6 } }], DT);
    const shiftedBy = { x: world.shift.x - lastShift.x, z: world.shift.z - lastShift.z };
    walked += distance(world.player.pos, { x: last.x + shiftedBy.x, z: last.z + shiftedBy.z });
    last = { ...world.player.pos };
    lastShift = { ...world.shift };
    assert.ok(Math.abs(world.player.pos.x - home.x) <= span / 2 + 1);
    assert.ok(Math.abs(world.player.pos.z - home.z) <= span / 2 + 1);
  }
  assert.ok(walked > content.player.baseStats.moveSpeed * 50, `walked ${walked}`);
  assert.ok(Math.abs(world.shift.x) > span);
});

void test('a shift moves the hero, his path, his order and what lies on the ground together', (): void => {
  const world: World = worldIn(content, zoneOf(content, voidZone.id).id, 5);
  world.player.intent = { type: 'move', dest: { x: 90, z: 80 } };
  world.player.path = [{ x: 85, z: 80 }];
  world.ground = [{ id: 99, pos: { x: 82, z: 82 }, from: { x: 81, z: 81 }, content: { kind: 'gold', amount: 1 }, age: 0, kept: false, find: null }];
  const before = { ...world.player.pos };
  shiftWorld(world, { x: -10, z: 4 });
  assert.deepEqual(world.player.pos, { x: before.x - 10, z: before.z + 4 });
  assert.deepEqual(world.player.intent, { type: 'move', dest: { x: 80, z: 84 } });
  assert.deepEqual(world.player.path, [{ x: 75, z: 84 }]);
  assert.deepEqual(must(world.ground[0], 'ground').pos, { x: 72, z: 86 });
  assert.deepEqual(world.shift, { x: -10, z: 4 });
});

void test('a held key let go while the hero wakes is still released, and a new void forgets held keys', (): void => {
  const world: World = worldIn(content, voidZone.id, 3);
  assert.notEqual(world.wake, null);
  assert.equal(acceptsCommand(world, { type: 'hold', slot: 1, down: true }), false);
  assert.equal(acceptsCommand(world, { type: 'hold', slot: 1, down: false }), true);
  world.player.held = [1];
  beginVoid(world);
  assert.deepEqual(world.player.held, []);
});
