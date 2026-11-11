import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { parseSaveText, readSave, SAVE_VERSION, toSave } from './save.ts';
import type { SaveData } from './save.ts';
import { createWorld } from './world/create.ts';
import type { ItemInstance, World } from './world/types.ts';

const content: Content = loadContent();

function made(base: string, rarity: string, uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, 3, base, rarity), base);
}

function played(): World {
  const world: World = createWorld(content, { seed: 1, save: null });
  const player = world.player;
  player.level = 4;
  player.xp = 17;
  player.gold = 123;
  player.kills = 9;
  player.skillPoints = 2;
  player.allocated = ['tempered_body', 'heavy_hands'];
  player.inventory[0] = made('drowned_leathers', 'rare', 5);
  player.inventory[3] = made('gale_charm', 'magic', 6);
  player.equipped.weapon = made('stormsteel_sword', 'rare', 7);
  world.surge = 3;
  world.nextItemUid = 40;
  return world;
}

function roundTrip(world: World): SaveData {
  return must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
}

void test('a save survives JSON and rebuilds the same character', (): void => {
  const original: World = played();
  const save: SaveData = roundTrip(original);
  assert.equal(save.version, SAVE_VERSION);
  const restored: World = createWorld(content, { seed: 99, save });
  const player = restored.player;
  assert.equal(player.level, 4);
  assert.equal(player.xp, 17);
  assert.equal(player.gold, 123);
  assert.equal(player.kills, 9);
  assert.equal(player.skillPoints, 2);
  assert.deepEqual(player.allocated, ['tempered_body', 'heavy_hands']);
  assert.deepEqual(player.inventory, original.player.inventory);
  assert.deepEqual(player.equipped, original.player.equipped);
  assert.equal(restored.surge, 3);
  assert.equal(restored.nextItemUid, 40);
  assert.equal(player.inventory.length, content.player.inventorySize);
  assert.equal(player.life, player.maxLife);
  assert.ok(player.stats.maxLife >= 100 + 12 * 3 + 30);
  assert.ok(restored.monsters.every((monster): boolean => monster.level === 3));
});

void test('a restored world does not hand out the starting items again', (): void => {
  const restored: World = createWorld(content, { seed: 1, save: roundTrip(played()) });
  const bases: string[] = restored.player.inventory.flatMap((item: ItemInstance | null): string[] => (item === null ? [] : [item.base]));
  assert.deepEqual(bases.toSorted(), ['drowned_leathers', 'gale_charm']);
});

void test('garbage, the wrong version and wrong shapes are rejected without throwing', (): void => {
  assert.equal(parseSaveText(content, null), null);
  assert.equal(parseSaveText(content, ''), null);
  assert.equal(parseSaveText(content, 'not json {'), null);
  assert.equal(parseSaveText(content, '[]'), null);
  assert.equal(parseSaveText(content, '42'), null);
  assert.equal(readSave(content, { ...toSave(played()), version: SAVE_VERSION + 1 }), null);
  assert.equal(readSave(content, { ...toSave(played()), level: 'high' }), null);
  assert.equal(readSave(content, { ...toSave(played()), gold: -5 }), null);
  assert.equal(readSave(content, { ...toSave(played()), inventory: 'bag' }), null);
});

void test('items with unknown bases, rarities or affixes are dropped or cleaned', (): void => {
  const base: SaveData = toSave(played());
  const ghost: ItemInstance = { uid: 8, base: 'ghost_blade', rarity: 'common', level: 1, affixes: [] };
  const odd: ItemInstance = { uid: 9, base: 'rusted_blade', rarity: 'mythic', level: 1, affixes: [] };
  const mixed: ItemInstance = { uid: 10, base: 'rusted_blade', rarity: 'magic', level: 1, affixes: [{ affix: 'jagged', value: 2 }, { affix: 'made_up', value: 9 }] };
  const misplaced: ItemInstance = made('drowned_leathers', 'common', 11);
  const raw: unknown = JSON.parse(
    JSON.stringify({
      ...base,
      allocated: ['tempered_body', 'ghost_node', 7],
      inventory: [ghost, odd, mixed, 'junk', null],
      equipped: { weapon: misplaced, armour: null, charm: null },
    }),
  );
  const save: SaveData = must(readSave(content, raw), 'save');
  assert.deepEqual(save.allocated, ['tempered_body']);
  assert.equal(save.inventory[0], null);
  assert.equal(save.inventory[1], null);
  assert.deepEqual(must(save.inventory[2], 'mixed').affixes, [{ affix: 'jagged', value: 2 }]);
  assert.equal(save.inventory[3], null);
  assert.equal(save.equipped.weapon, null);
  assert.equal(save.inventory.length, content.player.inventorySize);
  const world: World = createWorld(content, { seed: 1, save });
  assert.equal(world.player.inventory.filter((item: ItemInstance | null): boolean => item !== null).length, 1);
});

void test('a level above the maximum is clamped and fractions are floored', (): void => {
  const save: SaveData = must(readSave(content, { ...toSave(played()), level: 999, surge: 2.9, skillPoints: 1.8 }), 'save');
  assert.equal(save.level, content.player.xp.maxLevel);
  assert.equal(save.surge, 2);
  assert.equal(save.skillPoints, 1);
});
