import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Condition } from '../content/types.ts';
import { holds } from './conditions.ts';
import { createWorld } from './create.ts';
import type { World } from './types.ts';

void test('a level condition holds from its level up, and its not holds below it', (): void => {
  const world: World = createWorld(loadContent(), { seed: 1, save: null });
  const reached: Condition = { type: 'level', atLeast: 8, not: false };
  const below: Condition = { ...reached, not: true };
  world.player.level = 7;
  assert.equal(holds(world, reached), false);
  assert.equal(holds(world, below), true);
  world.player.level = 8;
  assert.equal(holds(world, reached), true);
  assert.equal(holds(world, below), false);
  world.player.level = 15;
  assert.equal(holds(world, reached), true);
});
