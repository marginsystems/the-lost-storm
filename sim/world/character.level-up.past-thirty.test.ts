import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { xpToNextLevel } from '../progression.ts';
import { grantXp, refreshPlayer } from './character.ts';
import type { World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const OLD_CAP: number = 30;

function atOldCap(): World {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  world.player.level = OLD_CAP;
  world.player.xp = 0;
  refreshPlayer(world);
  world.events.length = 0;
  return world;
}

void test('the level cap sits above the old one so a character can keep climbing', (): void => {
  assert.ok(content.player.xp.maxLevel > OLD_CAP);
});

void test('a level gained past the old cap gives skill points, life, and a level up event', (): void => {
  const world: World = atOldCap();
  const lifeBefore: number = world.player.maxLife;
  const pointsBefore: number = world.player.skillPoints;
  grantXp(world, xpToNextLevel(content.player.xp, OLD_CAP));
  assert.equal(world.player.level, OLD_CAP + 1);
  assert.equal(world.player.skillPoints, pointsBefore + content.chart.pointsPerLevel);
  assert.ok(world.player.maxLife > lifeBefore);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'level_up' && event.level === OLD_CAP + 1));
});

void test('experience stops at the new cap and no level is gained beyond it', (): void => {
  const world: World = atOldCap();
  grantXp(world, 1e15);
  assert.equal(world.player.level, content.player.xp.maxLevel);
  const before: number = world.player.skillPoints;
  grantXp(world, 1e15);
  assert.equal(world.player.level, content.player.xp.maxLevel);
  assert.equal(world.player.skillPoints, before);
});
