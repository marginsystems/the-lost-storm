import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, TalkDef } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { stepWorld } from './step.ts';
import type { Station } from './trade.ts';
import { buyPrice, itemValue, meetNpc, openStation, sellPrice, stationAt, stationNear, stationReach } from './trade.ts';
import type { ItemInstance, NpcState, TradeAction, VendorStock, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';

const shipped: Content = loadContent();
const content: Content = { ...shipped, world: { ...shipped.world, start: shipped.world.town } };
const DT: number = 1 / 60;
const town: string = content.world.town;

function made(base: string, rarity: string, level: number, uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, level, base, rarity), base);
}

function vendorIn(world: World): NpcState {
  return must(
    world.npcs.find((npc: NpcState): boolean => npc.def.service === 'vendor'),
    'vendor',
  );
}

function stashIn(world: World): Station {
  const stations: Station[] = world.zone.props.flatMap((_: unknown, index: number): Station[] => {
    const station: Station | null = stationAt(world, index);
    return station?.service === 'stash' ? [station] : [];
  });
  return must(stations[0], 'stash');
}

function hearNews(world: World, npc: NpcState): void {
  for (const talk of npc.def.talks) if (talk.once) world.heard.push(talk.id);
}

function standBy(world: World, x: number, z: number): void {
  world.player.pos = { x: x + 1, z };
  world.player.path = [];
}

function atVendor(seed: number): World {
  const world: World = worldIn(content, town, seed);
  const npc: NpcState = vendorIn(world);
  hearNews(world, npc);
  standBy(world, npc.pos.x, npc.pos.z);
  meetNpc(world, npc);
  world.events = [];
  return world;
}

function atStash(seed: number): World {
  const world: World = worldIn(content, town, seed);
  const station: Station = stashIn(world);
  standBy(world, station.placed.x, station.placed.z);
  openStation(world, station);
  return world;
}

function trade(world: World, action: TradeAction): WorldEvent[] {
  return stepWorld(world, [{ type: 'trade', action }], DT);
}

function stockOf(world: World): VendorStock {
  return must(world.vendors[vendorIn(world).def.id], 'stock');
}

function notices(events: readonly WorldEvent[]): string[] {
  return events.flatMap((event: WorldEvent): string[] => (event.type === 'notice' ? [event.reason] : []));
}

function fillInventory(world: World): void {
  world.player.inventory = world.player.inventory.map((_: ItemInstance | null, index: number): ItemInstance => made('rusted_blade', 'common', 1, 500 + index));
}

void test('a price grows with item level, rarity and affixes, and a sale pays a fixed share of it', (): void => {
  const common: ItemInstance = made('stormsteel_sword', 'common', 1, 1);
  const deeper: ItemInstance = { ...common, level: 10 };
  const rare: ItemInstance = made('stormsteel_sword', 'rare', 1, 2);
  assert.ok(itemValue(content, deeper) > itemValue(content, common));
  assert.ok(itemValue(content, rare) > itemValue(content, common));
  assert.ok(itemValue(content, { ...rare, affixes: [] }) < itemValue(content, rare));
  assert.equal(buyPrice(content, rare), itemValue(content, rare));
  assert.equal(sellPrice(content, rare), Math.floor(itemValue(content, rare) * content.trade.price.sellRatio));
  assert.ok(sellPrice(content, common) >= 1 && sellPrice(content, common) < buyPrice(content, common));
  for (const rarity of content.rarities) assert.ok((content.trade.price.rarity[rarity.id] ?? 0) > 0, rarity.id);
});

void test('walking up to the vendor opens its stall with a full stock at the hero level, after any news is told', (): void => {
  const world: World = worldIn(content, town, 4);
  world.player.level = 7;
  const npc: NpcState = vendorIn(world);
  const news: TalkDef | undefined = npc.def.talks.find((talk: TalkDef): boolean => talk.once);
  stepWorld(world, [{ type: 'talk', npcId: npc.id }], DT);
  for (let step: number = 0; step < 600 && world.dialogue === null && world.service === null; step += 1) stepWorld(world, [], DT);
  if (news !== undefined) {
    assert.equal(world.dialogue?.talk.id, news.id);
    assert.equal(world.service, null);
    for (let line: number = 0; line < news.lines.length; line += 1) stepWorld(world, [{ type: 'advance' }], DT);
  }
  const events: WorldEvent[] = [...stepWorld(world, [{ type: 'talk', npcId: npc.id }], DT)];
  for (let step: number = 0; step < 600 && world.service === null; step += 1) events.push(...stepWorld(world, [], DT));
  assert.equal(world.service?.kind, 'vendor');
  assert.equal(world.dialogue, null);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'bark' && event.speaker === npc.def.id));
  const stock: VendorStock = stockOf(world);
  assert.equal(stock.stock.length, content.trade.stockSize);
  assert.ok(stock.stock.every((item: ItemInstance | null): boolean => item !== null && item.level === 7));
  const offered: Set<string> = new Set<string>(content.trade.stockRarities.map((entry): string => entry.rarity));
  assert.ok(stock.stock.every((item: ItemInstance | null): boolean => item !== null && offered.has(item.rarity)));
});

void test('buying takes the price in gold and puts the item in the first free slot', (): void => {
  const world: World = atVendor(5);
  const item: ItemInstance = must(stockOf(world).stock[2], 'stock item');
  const price: number = buyPrice(content, item);
  world.player.gold = price + 3;
  const free: number = world.player.inventory.indexOf(null);
  const events: WorldEvent[] = trade(world, { type: 'buy', index: 2 });
  assert.equal(world.player.gold, 3);
  assert.deepEqual(world.player.inventory[free], item);
  assert.equal(stockOf(world).stock[2], null);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'character_changed'));
  trade(world, { type: 'buy', index: 2 });
  assert.equal(world.player.gold, 3);
});

void test('a purchase is refused with a notice when gold or space is short, and nothing changes', (): void => {
  const poor: World = atVendor(6);
  const item: ItemInstance = must(stockOf(poor).stock[0], 'stock item');
  poor.player.gold = buyPrice(content, item) - 1;
  const before: (ItemInstance | null)[] = [...poor.player.inventory];
  assert.deepEqual(notices(trade(poor, { type: 'buy', index: 0 })), ['no_gold']);
  assert.equal(poor.player.gold, buyPrice(content, item) - 1);
  assert.deepEqual(poor.player.inventory, before);
  assert.deepEqual(stockOf(poor).stock[0], item);

  const full: World = atVendor(7);
  fillInventory(full);
  full.player.gold = 1e6;
  assert.deepEqual(notices(trade(full, { type: 'buy', index: 0 })), ['inventory_full']);
  assert.equal(full.player.gold, 1e6);
  assert.notEqual(stockOf(full).stock[0], null);
});

void test('selling pays the sale price, and the last few sales wait in the buy-back row at the same price', (): void => {
  const world: World = atVendor(8);
  const items: ItemInstance[] = Array.from({ length: content.trade.buybackSize + 2 }, (_: unknown, index: number): ItemInstance => made('stormsteel_sword', 'magic', 2, 100 + index));
  items.forEach((item: ItemInstance, index: number): void => {
    world.player.inventory[index] = item;
  });
  world.player.gold = 0;
  const first: ItemInstance = must(items[0], 'first');
  trade(world, { type: 'sell', inventoryIndex: 0 });
  assert.equal(world.player.gold, sellPrice(content, first));
  assert.equal(world.player.inventory[0], null);
  assert.deepEqual(stockOf(world).buyback, [first]);
  for (let index: number = 1; index < items.length; index += 1) trade(world, { type: 'sell', inventoryIndex: index });
  const buyback: ItemInstance[] = stockOf(world).buyback;
  assert.equal(buyback.length, content.trade.buybackSize);
  assert.deepEqual(buyback[0], items.at(-1));
  assert.ok(!buyback.includes(first));

  const gold: number = world.player.gold;
  const wanted: ItemInstance = must(buyback[1], 'buyback item');
  trade(world, { type: 'buy_back', index: 1 });
  assert.equal(world.player.gold, gold - sellPrice(content, wanted));
  assert.ok(world.player.inventory.some((item: ItemInstance | null): boolean => item?.uid === wanted.uid));
  assert.ok(!stockOf(world).buyback.includes(wanted));
  world.player.gold = 0;
  assert.deepEqual(notices(trade(world, { type: 'buy_back', index: 0 })), ['no_gold']);
  assert.equal(stockOf(world).buyback.length, content.trade.buybackSize - 1);
});

void test('trade orders do nothing unless the matching service is open', (): void => {
  const world: World = worldIn(content, town, 9);
  const item: ItemInstance = made('stormsteel_sword', 'rare', 3, 300);
  world.player.inventory[0] = item;
  world.player.gold = 5;
  trade(world, { type: 'sell', inventoryIndex: 0 });
  trade(world, { type: 'stash', inventoryIndex: 0 });
  assert.deepEqual(world.player.inventory[0], item);
  assert.equal(world.player.gold, 5);
  const vendor: World = atVendor(10);
  vendor.player.inventory[0] = item;
  trade(vendor, { type: 'stash', inventoryIndex: 0 });
  assert.deepEqual(vendor.player.inventory[0], item);
  assert.ok(vendor.stash.every((slot: ItemInstance | null): boolean => slot === null));
  const stash: World = atStash(11);
  stash.player.inventory[0] = item;
  stash.player.gold = 5;
  trade(stash, { type: 'sell', inventoryIndex: 0 });
  assert.deepEqual(stash.player.inventory[0], item);
  assert.equal(stash.player.gold, 5);
});

void test('walking away or closing ends the service, and the stall restocks after a trip out of town', (): void => {
  const world: World = atVendor(12);
  const before: number[] = stockOf(world).stock.map((item: ItemInstance | null): number => item?.uid ?? 0);
  trade(world, { type: 'close' });
  assert.equal(world.service, null);
  meetNpc(world, vendorIn(world));
  assert.deepEqual(
    stockOf(world).stock.map((item: ItemInstance | null): number => item?.uid ?? 0),
    before,
  );
  world.player.pos = { x: world.player.pos.x + content.trade.reach * 3, z: world.player.pos.z };
  stepWorld(world, [], DT);
  assert.equal(world.service, null);

  const away: string = must(
    [...content.zones.keys()].find((id: string): boolean => id !== town),
    'other zone',
  );
  enterZone(world, zoneOf(content, away), { type: 'start' });
  stepWorld(world, [], DT);
  enterZone(world, zoneOf(content, town), { type: 'start' });
  stepWorld(world, [], DT);
  const npc: NpcState = vendorIn(world);
  standBy(world, npc.pos.x, npc.pos.z);
  meetNpc(world, npc);
  const after: number[] = stockOf(world).stock.map((item: ItemInstance | null): number => item?.uid ?? 0);
  assert.equal(after.length, before.length);
  assert.ok(after.every((uid: number): boolean => !before.includes(uid)));
});

void test('clicking the stash chest walks the hero to it and opens the stash', (): void => {
  const world: World = worldIn(content, town, 13);
  const station: Station = stashIn(world);
  assert.equal(stationNear(world, station.placed)?.index, station.index);
  assert.equal(world.stash.length, content.trade.stashSize);
  assert.ok(content.trade.stashSize >= content.player.inventorySize * 3);
  stepWorld(world, [{ type: 'use', prop: station.index }], DT);
  for (let step: number = 0; step < 900 && world.service === null; step += 1) stepWorld(world, [], DT);
  assert.equal(world.service?.kind, 'stash');
  assert.ok(Math.hypot(world.player.pos.x - station.placed.x, world.player.pos.z - station.placed.z) <= stationReach(world, station));
});

void test('items move between the inventory and the stash, and a full side refuses with a notice', (): void => {
  const world: World = atStash(14);
  const item: ItemInstance = made('stormsteel_sword', 'rare', 3, 400);
  world.player.inventory[4] = item;
  trade(world, { type: 'stash', inventoryIndex: 4 });
  assert.equal(world.player.inventory[4], null);
  assert.deepEqual(world.stash[0], item);
  fillInventory(world);
  assert.deepEqual(notices(trade(world, { type: 'unstash', index: 0 })), ['inventory_full']);
  assert.deepEqual(world.stash[0], item);
  world.player.inventory[2] = null;
  trade(world, { type: 'unstash', index: 0 });
  assert.deepEqual(world.player.inventory[2], item);
  assert.equal(world.stash[0], null);
  world.stash = world.stash.map((_: ItemInstance | null, index: number): ItemInstance => made('rusted_blade', 'common', 1, 900 + index));
  assert.deepEqual(notices(trade(world, { type: 'stash', inventoryIndex: 2 })), ['stash_full']);
  assert.deepEqual(world.player.inventory[2], item);
});
