import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneExit } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { createWorld } from './create.ts';
import { shoreDepth } from './shore.ts';
import { stepWorld } from './step.ts';
import type { Command, GroundItem, WakeState, World } from './types.ts';
import { travelThrough } from './zones.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;

const RETURN = {
  idle: 3,
  walkLimit: 20,
  lead: 6,
  armLimit: 60,
} as const;

function zoneId(world: World): string {
  return world.zone.id;
}

function exitOf(world: World, id: string): ZoneExit {
  return must(world.zone.exits.find((exit: ZoneExit): boolean => exit.id === id), `exit ${id}`);
}

function armedOnShore(): World {
  const world: World = createWorld(content, { seed: 5, save: null, opening: true });
  const wake: WakeState = must(world.wake, 'wake');
  for (let step: number = 0; step < Math.ceil((wake.lie + wake.rise) / DT) + 1; step += 1) stepWorld(world, [], DT);
  world.flags['first_choice'] = 'took_journal';
  world.flags['opening'] = 'read';
  stepWorld(world, [], DT);
  const heading: Vec2 = { x: world.heading.x, z: world.heading.z };
  let seconds: number = 0;
  while (world.player.equipped.weapon === null && seconds < RETURN.armLimit) {
    const blade: GroundItem | undefined = world.ground.find((ground: GroundItem): boolean => ground.find === 'blade');
    const dest: Vec2 = blade === undefined ? { x: world.player.pos.x + heading.x * RETURN.lead, z: world.player.pos.z + heading.z * RETURN.lead } : blade.pos;
    stepWorld(world, [{ type: 'move', held: true, dest }], DT);
    seconds += DT;
  }
  return world;
}

function backFromTheHall(): World {
  const world: World = armedOnShore();
  travelThrough(world, exitOf(world, 'into_the_hall'));
  assert.equal(world.zone.id, 'hall_of_time');
  travelThrough(world, exitOf(world, 'mist'));
  assert.equal(world.zone.id, 'between');
  return world;
}

void test('coming back from the Hall he stands on the black shore with his blade, and does not wake again', (): void => {
  const world: World = backFromTheHall();
  assert.equal(world.wake, null);
  assert.equal(world.player.equipped.weapon?.base, 'rusted_blade');
  assert.equal(shoreDepth(world), 1);
  const exit: ZoneExit = exitOf(world, 'into_the_hall');
  const facing: Vec2 = { x: Math.sin(world.player.facing), z: Math.cos(world.player.facing) };
  assert.ok(distance(world.player.pos, exit) > exit.radius);
  assert.ok((exit.x - world.player.pos.x) * facing.x + (exit.z - world.player.pos.z) * facing.z < 0);
});

void test('back on the shore he can stand still without being pulled into the Hall, and the light behind him leads back in', (): void => {
  const world: World = backFromTheHall();
  for (let step: number = 0; step < Math.round(RETURN.idle / DT); step += 1) stepWorld(world, [], DT);
  assert.equal(world.zone.id, 'between');
  const exit: ZoneExit = exitOf(world, 'into_the_hall');
  const toward = (): Command => ({ type: 'move', held: true, dest: { x: exit.x, z: exit.z } });
  let seconds: number = 0;
  while (zoneId(world) === 'between' && seconds < RETURN.walkLimit) {
    stepWorld(world, [toward()], DT);
    seconds += DT;
  }
  assert.equal(zoneId(world), 'hall_of_time');
});

void test('a new hero still wakes in the mist the first time', (): void => {
  const world: World = createWorld(content, { seed: 5, save: null, opening: true });
  assert.notEqual(world.wake, null);
  assert.equal(world.shore, null);
});
