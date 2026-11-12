import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import { createWorld } from './create.ts';
import { attacksHeld } from './glitch-hold.ts';
import type { World } from './types.ts';

void test('attacks are held exactly until the glitch hold runs out', (): void => {
  const world: World = createWorld(loadContent(), { seed: 1, save: null });
  assert.equal(attacksHeld(world), false);
  world.glitch.holdUntil = world.time + 1;
  assert.equal(attacksHeld(world), true);
  world.time += 1;
  assert.equal(attacksHeld(world), false);
});
