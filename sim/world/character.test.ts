import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { xpToNextLevel } from '../progression.ts';
import { refundCost } from '../progression.ts';
import { grantXp } from './character.ts';
import { stepWorld } from './step.ts';
import type { Command, World, WorldEvent } from './types.ts';

const content: Content = loadContent();

function chartWorld(): World {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  world.player.skillPoints = 5;
  for (const node of ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock']) stepWorld(world, [{ type: 'allocate', node }], 1 / 60);
  return world;
}

function send(world: World, command: Command): WorldEvent[] {
  return stepWorld(world, [command], 1 / 60);
}

void test('every level brings the points the chart asks for', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  const before: number = world.player.skillPoints;
  grantXp(world, xpToNextLevel(content.player.xp, world.player.level));
  assert.equal(world.player.skillPoints - before, content.chart.pointsPerLevel);
  assert.ok(content.chart.pointsPerLevel >= 2);
});

void test('a place at the edge of what was taken is given back for gold and its point returns', (): void => {
  const world: World = chartWorld();
  assert.deepEqual(world.player.allocated, ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock']);
  const life: number = world.player.stats.maxLife;
  world.player.gold = 1000;
  send(world, { type: 'refund', node: 'stone_1' });
  assert.equal(world.player.allocated.length, 4);
  send(world, { type: 'refund', node: 'bedrock' });
  assert.deepEqual(world.player.allocated, ['stone_thunderclap', 'tempered_body', 'stone_1']);
  assert.equal(world.player.skillPoints, 2);
  assert.equal(world.player.gold, 1000 - refundCost(content, world.player.level, 1));
  assert.ok(world.player.stats.maxLife < life);
});

void test('a full respec returns every point and costs gold for each, and without the gold nothing changes', (): void => {
  const world: World = chartWorld();
  world.player.gold = 0;
  const refused: WorldEvent[] = send(world, { type: 'respec' });
  assert.ok(refused.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_gold'));
  assert.equal(world.player.allocated.length, 4);
  world.player.gold = refundCost(content, world.player.level, 4);
  send(world, { type: 'respec' });
  assert.deepEqual(world.player.allocated, []);
  assert.equal(world.player.skillPoints, 5);
  assert.equal(world.player.gold, 0);
});
