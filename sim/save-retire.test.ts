import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { parseSaveText, toSave } from './save.ts';
import type { SaveData } from './save.ts';
import { heroCanWear, retireUnworn } from './save-retire.ts';
import { sellPrice } from './world/trade.ts';
import type { ItemInstance, World } from './world/types.ts';

const content: Content = loadContent();

function made(base: string, uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, 4, base, 'magic'), base);
}

function hooded(): World {
  const world: World = worldIn(content, content.world.town, 3);
  world.player.equipped.head = made('penitent_cowl', 900);
  world.player.inventory[0] = made('wayfarer_hood', 901);
  world.player.inventory[1] = made('stormsteel_sword', 902);
  world.stash[0] = made('crown_of_the_struck_hour', 903);
  world.player.inventory[2] = made('wayfarer_hood', 904);
  return world;
}

void test('a hood the hero wears or carries leaves the save and pays back its sell price, and the Crown with no worn model stays', (): void => {
  const world: World = hooded();
  const owed: number = [world.player.equipped.head, world.player.inventory[0], world.player.inventory[2]].reduce(
    (sum: number, item: ItemInstance | null | undefined): number => sum + sellPrice(content, must(item, 'hood')),
    0,
  );
  const before: number = world.player.gold;
  const save: SaveData = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  assert.equal(save.equipped.head, null);
  assert.equal(save.inventory[0], null);
  assert.equal(must(save.inventory[1], 'sword').base, 'stormsteel_sword');
  assert.equal(must(save.stash[0], 'crown').base, 'crown_of_the_struck_hour');
  assert.equal(save.inventory[2], null);
  assert.equal(save.gold, before + owed);
  for (const item of [...save.inventory, ...save.stash, ...Object.values(save.equipped)]) if (item !== null) assert.ok(heroCanWear(content, item), item.base);
});

void test('a hood on a trader shelf or in buyback is taken off and the shelf is rolled again', (): void => {
  const save: SaveData = must(parseSaveText(content, JSON.stringify(toSave(worldIn(content, content.world.town, 4)))), 'save');
  const shelved: SaveData = {
    ...save,
    vendors: { trader: { stock: [made('wayfarer_hood', 910), made('stormsteel_sword', 911)], buyback: [made('penitent_cowl', 912)], stale: false } },
  };
  const out: SaveData = retireUnworn(content, shelved);
  const trader = must(out.vendors['trader'], 'trader');
  assert.equal(trader.stock[0], null);
  assert.equal(must(trader.stock[1], 'sword').base, 'stormsteel_sword');
  assert.deepEqual(trader.buyback, []);
  assert.equal(trader.stale, true);
  assert.equal(out.gold, save.gold);
});

void test('a save with nothing the hero cannot wear comes back unchanged', (): void => {
  const save: SaveData = must(parseSaveText(content, JSON.stringify(toSave(worldIn(content, content.world.town, 5)))), 'save');
  assert.deepEqual(retireUnworn(content, save), save);
});
