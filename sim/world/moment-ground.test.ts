import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable } from '../nav/grid.ts';
import { must } from '../../test/support.ts';
import { createWorld } from './create.ts';
import { momentBlockers } from './moment-ground.ts';
import { clearMoments, forceStrike } from './moments.ts';
import { stepWorld } from './step.ts';
import type { MomentState, World } from './types.ts';
import { enterZone } from './zones.ts';

const GROUND = { step: 1 / 30, offset: 20, settle: 2 } as const;

function hallWorld(): { readonly world: World; readonly content: Content } {
  const content: Content = loadContent();
  const world: World = createWorld(content, { seed: 4, save: null });
  enterZone(world, must(content.zones.get('hall_of_time'), 'hall'), { type: 'start' });
  world.monsters = [];
  world.player.invulnerable = 1e9;
  return { world, content };
}

function settle(world: World): void {
  for (let elapsed: number = 0; elapsed < GROUND.settle; elapsed += GROUND.step) stepWorld(world, [], GROUND.step);
}

void test('a struck moment raises its props as colliders the hero cannot stand in, and lowers them when it is gone', (): void => {
  const { world } = hallWorld();
  const at: Vec2 = { x: world.player.pos.x + GROUND.offset, z: world.player.pos.z };
  assert.ok(isWalkable(world.grid, at.x, at.z));
  const moment: MomentState = must(forceStrike(world, at, 'first_fire'), 'a strike');
  assert.equal(moment.blocks, null);
  settle(world);
  assert.ok(momentBlockers(world, moment).length > 0);
  assert.notEqual(moment.blocks, null);
  assert.equal(isWalkable(world.grid, at.x, at.z), false);
  clearMoments(world);
  assert.equal(isWalkable(world.grid, at.x, at.z), true);
});

void test('a hero standing where a prop rises is moved to the nearest open ground', (): void => {
  const { world } = hallWorld();
  const at: Vec2 = { x: world.player.pos.x + GROUND.offset, z: world.player.pos.z };
  forceStrike(world, at, 'first_fire');
  world.player.pos = { x: at.x, z: at.z };
  world.player.path = [];
  settle(world);
  assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z));
  assert.ok(distance(world.player.pos, at) > 0);
});
