import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import { zoneLevelText } from './caption.ts';

const content: Content = loadContent();

void test('a wild zone shows the level of what fights there, which follows the hero in the Hall', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 1);
  world.player.level = 1;
  assert.equal(zoneLevelText(world), 'Level 1');
  world.player.level = 9;
  assert.equal(zoneLevelText(world), 'Level 9');
});

void test('a town shows no level', (): void => {
  assert.equal(zoneLevelText(worldIn(content, 'hideout', 1)), null);
});
