import assert from 'node:assert/strict';
import { test } from 'node:test';
import { armed, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { xpToNextLevel } from '../progression.ts';
import { createRng } from '../rng.ts';
import { refundCost } from '../progression.ts';
import { grantXp, killXp } from './character.ts';
import { stepWorld } from './step.ts';
import type { Command, ItemInstance, World, WorldEvent } from './types.ts';

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

void test('a fourth Legendary stays in the bag with a notice, and the three worn stay on', (): void => {
  const world: World = armed(worldIn(content, 'hall_of_time', 1));
  const roll = (base: string): ItemInstance => {
    const made: ItemInstance | null = generateItem(content, createRng(world.nextItemUid), world.nextItemUid, 5, base, null);
    world.nextItemUid += 1;
    if (made === null) throw new Error(base);
    return made;
  };
  world.player.inventory = world.player.inventory.map((): null => null);
  ['wirethread_gloves', 'lantern_of_second_sounds', 'crown_of_the_struck_hour', 'the_millwheel'].forEach((base: string, index: number): void => {
    world.player.inventory[index] = roll(base);
  });
  for (const index of [0, 1, 2]) send(world, { type: 'equip', inventoryIndex: index });
  const events: WorldEvent[] = send(world, { type: 'equip', inventoryIndex: 3 });
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'legendary_limit'));
  assert.equal(world.player.inventory[3]?.base, 'the_millwheel');
  assert.deepEqual([world.player.equipped.hands?.base, world.player.equipped.charm?.base, world.player.equipped.head?.base], ['wirethread_gloves', 'lantern_of_second_sounds', 'crown_of_the_struck_hour']);
});

void test('a dropped item lies at the hero feet and a pickup puts it back in the bag', (): void => {
  const world: World = armed(worldIn(content, 'hideout', 1));
  world.monsters = [];
  const blade: ItemInstance = { uid: 4100, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null };
  world.player.inventory.fill(null);
  world.player.inventory[0] = blade;
  send(world, { type: 'drop', inventoryIndex: 0 });
  assert.equal(world.player.inventory[0], null);
  const ground = world.ground.find((entry): boolean => entry.content.kind === 'item' && entry.content.item.uid === blade.uid);
  assert.ok(ground !== undefined);
  for (let tick: number = 0; tick < 240 && !world.player.inventory.some((item): boolean => item?.uid === blade.uid); tick += 1) send(world, { type: 'pickup', groundId: ground.id });
  assert.ok(world.player.inventory.some((item): boolean => item?.uid === blade.uid));
});

void test('a story item never leaves the bag by a drop', (): void => {
  const world: World = armed(worldIn(content, 'hideout', 1));
  const journal: ItemInstance = { uid: 4200, base: 'worn_journal', rarity: 'common', level: 1, affixes: [], ledger: null };
  world.player.inventory.fill(null);
  world.player.inventory[2] = journal;
  send(world, { type: 'drop', inventoryIndex: 2 });
  assert.equal(world.player.inventory[2], journal);
  assert.ok(!world.ground.some((entry): boolean => entry.content.kind === 'item' && entry.content.item.uid === journal.uid));
});

void test('a kill pays its xp scaled up by the foe level, and less when the hero is far above the foe', (): void => {
  const world: World = worldIn(content, 'hall_of_time', 1);
  world.player.level = 10;
  const even: number = killXp(world, 20, 10);
  assert.equal(even, Math.round(20 * (1 + content.world.scaling.xpPerLevel * 9)));
  assert.ok(killXp(world, 20, 8) < even);
  world.player.level = 20;
  const far: number = killXp(world, 20, 5);
  assert.ok(far > 0 && far < killXp(world, 20, 18));
});
