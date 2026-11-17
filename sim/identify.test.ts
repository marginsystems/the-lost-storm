import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, RarityDef } from './content/types.ts';
import type { HeldUnidentified } from './identify.ts';
import { goodFind, heldUnidentified, hiddenAtDrop, identifyCost, isUnidentified, revealCarried, revealed, totalCost, veiled } from './identify.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import type { ItemInstance, World } from './world/types.ts';

const content: Content = loadContent();

function made(rarity: string, level: number, uid: number, base: string | null = 'gale_charm'): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, level, base, rarity), rarity);
}

void test('rare and legendary finds are hidden at the drop; common and magic ones are not', (): void => {
  const hidden: readonly string[] = content.rarities.filter((rarity: RarityDef): boolean => hiddenAtDrop(content, rarity.id)).map((rarity: RarityDef): string => rarity.id);
  assert.deepEqual(hidden, ['rare', 'stormtouched']);
  assert.equal(isUnidentified(veiled(content, made('magic', 5, 1))), false);
  assert.equal(isUnidentified(veiled(content, made('rare', 5, 2))), true);
});

void test('veiling and revealing keep every roll exactly as it was rolled', (): void => {
  const rolled: ItemInstance = made('rare', 9, 3);
  const hidden: ItemInstance = veiled(content, rolled);
  assert.deepEqual(hidden.affixes, rolled.affixes);
  assert.deepEqual(revealed(hidden), rolled);
  assert.equal('unidentified' in revealed(hidden), false);
});

void test('the price grows with item level and is higher for a legendary than for a rare', (): void => {
  const low: number = identifyCost(content, made('rare', 1, 4));
  const high: number = identifyCost(content, made('rare', 20, 5));
  const legendary: number = identifyCost(content, made('stormtouched', 20, 6, null));
  assert.ok(low > 0);
  assert.ok(high > low);
  assert.ok(legendary > high);
  assert.equal(identifyCost(content, made('magic', 20, 7)), 0);
});

void test('the held list covers the bag then the stash, with each price and their sum', (): void => {
  const world: World = worldIn(content, content.world.town, 3);
  world.player.inventory.fill(null);
  world.stash.fill(null);
  world.player.inventory[4] = veiled(content, made('rare', 6, 8));
  world.stash[2] = veiled(content, made('rare', 12, 9));
  world.stash[3] = made('rare', 12, 10);
  const held: readonly HeldUnidentified[] = heldUnidentified(world);
  assert.deepEqual(held.map((entry: HeldUnidentified): readonly [string, number] => [entry.place, entry.index]), [['bag', 4], ['stash', 2]]);
  assert.equal(totalCost(held), identifyCost(content, made('rare', 6, 8)) + identifyCost(content, made('rare', 12, 9)));
});

void test('a find is good when it is legendary or a rare with every line it could have', (): void => {
  const rare: ItemInstance = made('rare', 5, 11);
  const full: number = must(content.rarities.find((rarity: RarityDef): boolean => rarity.id === 'rare'), 'rare').affixMax;
  assert.equal(goodFind(content, rare), rare.affixes.length >= full);
  assert.equal(goodFind(content, made('stormtouched', 5, 12, null)), true);
  assert.equal(goodFind(content, made('magic', 5, 13)), false);
});

void test('revealing what is carried clears the bag and leaves the stash alone', (): void => {
  const world: World = worldIn(content, content.world.town, 4);
  world.player.inventory.fill(null);
  world.stash.fill(null);
  world.player.inventory[0] = veiled(content, made('rare', 6, 14));
  world.stash[0] = veiled(content, made('rare', 6, 15));
  assert.equal(revealCarried(world), true);
  assert.equal(isUnidentified(must(world.player.inventory[0], 'bag')), false);
  assert.equal(isUnidentified(must(world.stash[0], 'stash')), true);
  assert.equal(revealCarried(world), false);
});
