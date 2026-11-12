import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { shoreDepth } from './shore.ts';
import { stepWorld } from './step.ts';
import type { Command, World } from './types.ts';
import { shiftWorld } from './void.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const between: ZoneDef = must(content.zones.get('between'), 'between');

function awake(): World {
  const world: World = worldIn(content, between.id, 3);
  world.wake = null;
  world.heading = { x: 1, z: 0 };
  return world;
}

function placed(world: World): boolean {
  return world.shore !== null;
}

function walkEast(world: World, seconds: number): void {
  const command = (): Command => ({ type: 'move', held: true, dest: { x: world.player.pos.x + 6, z: world.player.pos.z } });
  for (let step: number = 0; step < Math.round(seconds / DT); step += 1) stepWorld(world, [command()], DT);
}

void test('the shore stays out of reach until the opening is read, then lies ahead', (): void => {
  const world: World = awake();
  stepWorld(world, [], DT);
  assert.equal(placed(world), false);
  world.flags['opening'] = 'read';
  stepWorld(world, [], DT);
  const shore = must(world.shore, 'shore');
  const rules = must(between.void?.shore, 'shore rules');
  assert.ok(Math.abs(shore.at.x - world.player.pos.x - rules.ahead) < 0.5);
  assert.equal(shoreDepth(world), 0);
});

void test('walking onto the shore deepens it, and recentring the world carries the shore along', (): void => {
  const world: World = awake();
  world.flags['opening'] = 'read';
  stepWorld(world, [], DT);
  const rules = must(between.void?.shore, 'shore rules');
  const before: number = shoreDepth(world);
  shiftWorld(world, { x: -30, z: 4 });
  assert.equal(shoreDepth(world), before);
  walkEast(world, (rules.ahead + rules.thin) / world.player.stats.moveSpeed + 1);
  assert.equal(shoreDepth(world), 1);
});
