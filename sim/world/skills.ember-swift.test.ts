import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, run, shapeArena, SHAPE_DT } from '../../test/shape-support.ts';
import { isWalkable } from '../nav/grid.ts';
import { stepWorld } from './step.ts';
import type { Command, World } from './types.ts';

const FLIGHT = 0;
const ATTACK = 1;
const ROLL = 2;
const away = offset(40, 0);
const cast = (slot: number): Command => ({ type: 'skill', slot, aim: away, targetId: null });

function takeOff(world: World): void {
  stepWorld(world, [{ type: 'hold', slot: FLIGHT, down: true }, cast(FLIGHT)], SHAPE_DT);
  assert.equal(world.player.action?.skill.id, 'ember_swift');
}

void test('flight steers at travel speed, ignores attacks and roll presses, and release accepts a fresh attack immediately', (): void => {
  const world: World = shapeArena(['ember_swift', 'flashover', 'dodge_roll']);
  const start = { ...world.player.pos };
  const target = dummy(world, offset(0, 2));
  takeOff(world);
  const events = run(world, 0.3, [cast(ATTACK), cast(ROLL)]);
  assert.ok(world.player.pos.x - start.x > world.player.stats.moveSpeed * 0.3 * 1.5);
  assert.equal(world.player.buffered.skill, null);
  assert.equal(world.player.buffered.dodge, null);
  assert.equal(world.projectiles.length, 0);
  assert.ok(events.every((event): boolean => event.type !== 'hero_step' && event.type !== 'skill_impact'));
  assert.equal(target.life, target.maxLife);
  const turned = { ...world.player.pos };
  run(world, 0.2, [{ type: 'steer', aim: { x: turned.x, z: turned.z + 8 } }]);
  assert.ok(world.player.pos.z > turned.z + 1);
  const landed = stepWorld(world, [{ type: 'hold', slot: FLIGHT, down: false }, { type: 'skill', slot: ATTACK, aim: { x: turned.x, z: turned.z + 8 }, targetId: null }], SHAPE_DT);
  assert.ok(landed.some((event): boolean => event.type === 'skill_start' && event.skill.id === 'flashover'));
  assert.ok((world.player.cooldowns['ember_swift'] ?? 0) > 0);
});

void test('flight respects terrain, lands at the hold limit and stays landed until pressed again', (): void => {
  const world: World = shapeArena(['ember_swift']);
  const player = world.player;
  player.stats = { ...player.stats, moveSpeed: 16 };
  takeOff(world);
  for (let i: number = 0; i < Math.ceil(1.4 / SHAPE_DT); i += 1) {
    stepWorld(world, [], SHAPE_DT);
    assert.ok(isWalkable(world.grid, player.pos.x, player.pos.z));
  }
  assert.equal(player.action, null);
  const landed = { ...player.pos };
  run(world, 0.3);
  assert.deepEqual(player.pos, landed);
  assert.ok(player.pos.x < away.x);
});

void test('a flight released before roll recovery never takes off or spends mana', (): void => {
  const world: World = shapeArena(['ember_swift', 'flashover', 'dodge_roll']);
  stepWorld(world, [cast(ROLL)], SHAPE_DT);
  stepWorld(world, [{ type: 'hold', slot: FLIGHT, down: true }, cast(FLIGHT)], SHAPE_DT);
  const events = run(world, 1, [{ type: 'hold', slot: FLIGHT, down: false }]);
  assert.ok(events.every((event): boolean => event.type !== 'skill_start' || event.skill.id !== 'ember_swift'));
  assert.equal(world.player.cooldowns['ember_swift'] ?? 0, 0);
});
