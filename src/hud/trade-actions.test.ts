import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import { sellPrice } from '../../sim/world/trade.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import { bagAction, inventoryHint, offeredItem, picksForSale, SALE_WORDS, saleCommand, saleEmptyText } from './trade-actions.ts';

const content: Content = loadContent();
const CLICKS = ['click', 'ctrl', 'right'] as const;

function sword(uid: number): ItemInstance {
  return { ...must(generateItem(content, createRng(uid), uid, 2, 'stormsteel_sword', 'magic'), 'item'), uid };
}

function holding(items: Readonly<Record<number, ItemInstance>>): World {
  const world: World = worldIn(content, content.world.start, 2);
  for (const [index, item] of Object.entries(items)) world.player.inventory[Number(index)] = item;
  return world;
}

function atVendor(world: World): World {
  world.service = { kind: 'vendor', owner: 'any', anchor: { x: 0, z: 0 } };
  return world;
}

void test('a bag click equips whether or not the trader is open, and never sells', (): void => {
  const item: ItemInstance = sword(4001);
  const world: World = holding({ 4: item });
  assert.deepEqual(bagAction(world, 4, 'click'), { kind: 'send', command: { type: 'equip', inventoryIndex: 4 } });
  assert.deepEqual(bagAction(world, 4, 'ctrl'), { kind: 'send', command: { type: 'equip', inventoryIndex: 4 } });
  assert.deepEqual(bagAction(world, 4, 'right'), { kind: 'send', command: { type: 'drop', inventoryIndex: 4 } });
  assert.equal(inventoryHint(world, item, false), 'Click to equip · Right click to drop');
  assert.equal(inventoryHint(world, item, true), 'Tap to equip');
  atVendor(world);
  assert.deepEqual(bagAction(world, 4, 'click'), { kind: 'send', command: { type: 'equip', inventoryIndex: 4 } });
  assert.deepEqual(bagAction(world, 4, 'ctrl'), { kind: 'send', command: { type: 'equip', inventoryIndex: 4 } });
  for (const click of CLICKS) {
    const action = bagAction(world, 4, click);
    assert.ok(action.kind !== 'send' || action.command.type !== 'trade', click);
  }
});

void test('at the trader a right click offers the item and shows its price before any sale', (): void => {
  const item: ItemInstance = sword(4002);
  const world: World = atVendor(holding({ 1: item }));
  assert.deepEqual(bagAction(world, 1, 'right'), { kind: 'offer', uid: 4002 });
  const price: number = sellPrice(content, item);
  assert.equal(inventoryHint(world, item, false), `Click to equip · Right click to offer for ${price} gold`);
  assert.equal(SALE_WORDS.button(price), `Sell · ${price} gold`);
  assert.equal(saleEmptyText(false), 'Right click to offer an item from your bag');
  assert.equal(saleEmptyText(true), 'Hold an item in your bag to offer it');
});

void test('the sell button sells the offered item wherever it sits, and nothing once it has left the bag', (): void => {
  const item: ItemInstance = sword(4003);
  const world: World = atVendor(holding({ 5: item }));
  assert.deepEqual(saleCommand(world, 4003), { type: 'trade', action: { type: 'sell', inventoryIndex: 5 } });
  assert.equal(offeredItem(world, 4003), item);
  assert.equal(saleCommand(world, null), null);
  world.player.inventory[5] = null;
  world.player.inventory[2] = item;
  assert.deepEqual(saleCommand(world, 4003), { type: 'trade', action: { type: 'sell', inventoryIndex: 2 } });
  world.player.inventory[2] = null;
  world.player.equipped.weapon = item;
  assert.equal(offeredItem(world, 4003), null);
  assert.equal(saleCommand(world, 4003), null);
  world.player.inventory[2] = item;
  world.service = null;
  assert.equal(saleCommand(world, 4003), null);
});

void test('a story item is never dropped, offered or sold from the bag, though it can be stashed', (): void => {
  const journal: ItemInstance = { uid: 5100, base: 'worn_journal', rarity: 'common', level: 1, affixes: [], ledger: null };
  const world: World = holding({ 0: journal });
  assert.deepEqual(bagAction(world, 0, 'right'), { kind: 'deny' });
  atVendor(world);
  assert.deepEqual(bagAction(world, 0, 'right'), { kind: 'deny' });
  assert.equal(saleCommand(world, 5100), null);
  world.service = { kind: 'stash', owner: 'any', anchor: { x: 0, z: 0 } };
  assert.deepEqual(bagAction(world, 0, 'right'), { kind: 'send', command: { type: 'trade', action: { type: 'stash', inventoryIndex: 0 } } });
});

void test('at the stash every bag click stores the item', (): void => {
  const item: ItemInstance = sword(4004);
  const world: World = holding({ 2: item });
  world.service = { kind: 'stash', owner: 'any', anchor: { x: 0, z: 0 } };
  for (const click of CLICKS) assert.deepEqual(bagAction(world, 2, click), { kind: 'send', command: { type: 'trade', action: { type: 'stash', inventoryIndex: 2 } } });
  assert.equal(inventoryHint(world, item, false), 'Click to stash');
});

void test('at the auctioneer a bag click picks the item to sell instead of sending a command', (): void => {
  const item: ItemInstance = { ...sword(4005), ledger: 'itm_AAAAAAAAAAAAAAAAAAAAAA' };
  const world: World = holding({ 1: item });
  assert.equal(picksForSale(world), false);
  world.service = { kind: 'auction', owner: 'any', anchor: { x: 0, z: 0 } };
  assert.equal(picksForSale(world), true);
  assert.deepEqual(bagAction(world, 1, 'click'), { kind: 'pick' });
  assert.deepEqual(bagAction(world, 1, 'ctrl'), { kind: 'pick' });
  assert.deepEqual(bagAction(world, 1, 'right'), { kind: 'deny' });
  assert.equal(inventoryHint(world, item, false), 'Click to pick to sell');
  assert.equal(inventoryHint(world, { ...item, ledger: null }, false), '');
});
