import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import { sellPrice } from '../../sim/world/trade.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import { inventoryCommand, inventoryHint, picksForSale } from './trade-actions.ts';

const content: Content = loadContent();

void test('an inventory click equips or drops when nothing is open, sells at a vendor and stores at a stash', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  const item: ItemInstance = must(generateItem(content, createRng(3), 3, 2, 'stormsteel_sword', 'magic'), 'item');
  assert.deepEqual(inventoryCommand(world, 4, 'click'), { type: 'equip', inventoryIndex: 4 });
  assert.deepEqual(inventoryCommand(world, 4, 'ctrl'), { type: 'equip', inventoryIndex: 4 });
  assert.deepEqual(inventoryCommand(world, 4, 'right'), { type: 'drop', inventoryIndex: 4 });
  assert.equal(inventoryHint(world, item, false), 'Click to equip · Right click to drop');
  assert.equal(inventoryHint(world, item, true), 'Tap to equip');
  world.service = { kind: 'vendor', owner: 'any', anchor: { x: 0, z: 0 } };
  for (const click of ['click', 'ctrl', 'right'] as const) assert.deepEqual(inventoryCommand(world, 1, click), { type: 'trade', action: { type: 'sell', inventoryIndex: 1 } });
  assert.ok(inventoryHint(world, item, false).includes(String(sellPrice(content, item))));
  world.service = { kind: 'stash', owner: 'any', anchor: { x: 0, z: 0 } };
  for (const click of ['click', 'ctrl', 'right'] as const) assert.deepEqual(inventoryCommand(world, 2, click), { type: 'trade', action: { type: 'stash', inventoryIndex: 2 } });
  assert.equal(inventoryHint(world, item, false), 'Click to stash');
});

void test('a story item is never dropped or sold from the bag, though it can be stashed', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  world.player.inventory[0] = { uid: 5100, base: 'worn_journal', rarity: 'common', level: 1, affixes: [], ledger: null };
  assert.equal(inventoryCommand(world, 0, 'right'), null);
  world.service = { kind: 'vendor', owner: 'any', anchor: { x: 0, z: 0 } };
  for (const click of ['click', 'ctrl', 'right'] as const) assert.equal(inventoryCommand(world, 0, click), null);
  world.service = { kind: 'stash', owner: 'any', anchor: { x: 0, z: 0 } };
  assert.deepEqual(inventoryCommand(world, 0, 'right'), { type: 'trade', action: { type: 'stash', inventoryIndex: 0 } });
});

void test('at the auctioneer a bag click picks the item to sell instead of sending a command', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  const item: ItemInstance = { ...must(generateItem(content, createRng(4), 4, 2, 'stormsteel_sword', 'magic'), 'item'), ledger: 'itm_AAAAAAAAAAAAAAAAAAAAAA' };
  assert.equal(picksForSale(world), false);
  world.service = { kind: 'auction', owner: 'any', anchor: { x: 0, z: 0 } };
  assert.equal(picksForSale(world), true);
  for (const click of ['click', 'ctrl', 'right'] as const) assert.equal(inventoryCommand(world, 1, click), null);
  assert.equal(inventoryHint(world, item, false), 'Click to pick to sell');
  assert.equal(inventoryHint(world, { ...item, ledger: null }, false), '');
});
