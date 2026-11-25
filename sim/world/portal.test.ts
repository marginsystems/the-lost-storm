import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import { tradeProblems } from '../content/parse-trade.ts';
import type { Content, ItemBaseDef } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { isWalkable } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import { countOf, withCount } from '../stacks.ts';
import type { SaveData } from '../save.ts';
import { parseSaveText, readSave, toSave } from '../save.ts';
import { createWorld } from './create.ts';
import { respawnPlayer } from './death.ts';
import { PORTAL, goThrough, homeSpot, portalEndHere, portalEnds, stepChannel, useItem } from './portal.ts';
import { PORTAL_KEEP } from './portal-keep.ts';
import type { PortalEnd, PortalState } from './portal-types.ts';
import { stepWorld } from './step.ts';
import { findExit, travelThrough } from './zones.ts';
import { goodItem, handleTrade, meetNpc } from './trade.ts';
import type { ItemInstance, MonsterState, NpcState, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const WILD: string = 'under_hall';
const PORTAL_BASE: string = 'folded_hour';

function portalBase(): ItemBaseDef {
  return must(content.itemBases.get(PORTAL_BASE), PORTAL_BASE);
}

function giveTear(world: World, uid: number = 9000): number {
  const item: ItemInstance = must(generateItem(content, createRng(uid), uid, 1, PORTAL_BASE, content.rarities[0]?.id ?? null), 'portal item');
  const index: number = world.player.inventory.indexOf(null);
  world.player.inventory[index] = item;
  return index;
}

function channelOut(world: World): void {
  const left: number = (portalBase().use?.channel ?? 0) + DT;
  for (let time: number = 0; time <= left && world.player.intent.type === 'portal_channel'; time += DT) {
    const intent = world.player.intent;
    stepChannel(world, intent, DT);
  }
}

function openHere(world: World): PortalState {
  useItem(world, giveTear(world));
  assert.equal(world.player.intent.type, 'portal_channel');
  channelOut(world);
  return must(world.portal, 'portal');
}

function wild(seed: number = 7): World {
  return worldIn(content, WILD, seed);
}

function living(world: World): MonsterState[] {
  return world.monsters.filter((monster: MonsterState): boolean => monster.alive);
}

function stages(events: readonly WorldEvent[]): string[] {
  return events.flatMap((event: WorldEvent): string[] => (event.type === 'portal' ? [event.stage] : []));
}

function through(world: World): void {
  goThrough(world, must(portalEndHere(world), 'portal end'));
}

function reload(world: World): World {
  const save: SaveData = must(readSave(content, JSON.parse(JSON.stringify(toSave(world)))), 'save');
  return createWorld(content, { seed: 3, save });
}

void test('the trader always sells the portal good for its data price, it never drops and he never buys it back', (): void => {
  assert.deepEqual(tradeProblems(content), []);
  const good = must(content.trade.goods[0], 'good');
  assert.equal(good.base, PORTAL_BASE);
  assert.equal(portalBase().dropWeight, 0);
  const world: World = worldIn(content, content.world.town, 2);
  const vendor: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.service === 'vendor'), 'vendor');
  for (const talk of vendor.def.talks) if (talk.once) world.heard.push(talk.id);
  world.player.pos = { x: vendor.pos.x + 1, z: vendor.pos.z };
  meetNpc(world, vendor);
  world.player.gold = good.price - 1;
  handleTrade(world, { type: 'buy_good', index: 0 });
  assert.equal(world.player.inventory.filter((item: ItemInstance | null): boolean => item?.base === PORTAL_BASE).length, 0);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_gold'));
  world.player.gold = good.price + 5;
  handleTrade(world, { type: 'buy_good', index: 0 });
  const index: number = world.player.inventory.findIndex((item: ItemInstance | null): boolean => item?.base === PORTAL_BASE);
  assert.ok(index >= 0);
  assert.equal(world.player.gold, 5);
  handleTrade(world, { type: 'sell', inventoryIndex: index });
  assert.equal(world.player.inventory[index]?.base, PORTAL_BASE);
  assert.equal(world.player.gold, 5);
});

function atTrader(): World {
  const world: World = worldIn(content, content.world.town, 2);
  const vendor: NpcState = must(world.npcs.find((npc: NpcState): boolean => npc.def.service === 'vendor'), 'vendor');
  for (const talk of vendor.def.talks) if (talk.once) world.heard.push(talk.id);
  world.player.pos = { x: vendor.pos.x + 1, z: vendor.pos.z };
  meetNpc(world, vendor);
  return world;
}

function threadCounts(world: World): number[] {
  return world.player.inventory.flatMap((item: ItemInstance | null): number[] => (item?.base === PORTAL_BASE ? [countOf(item)] : []));
}

void test('threads bought one per click gather in one bag slot, and the twenty-first starts a new stack', (): void => {
  const world: World = atTrader();
  const good = must(content.trade.goods[0], 'good');
  const size: number = portalBase().stack;
  world.player.gold = good.price * (size + 1);
  for (let bought: number = 0; bought < size; bought += 1) handleTrade(world, { type: 'buy_good', index: 0 });
  assert.deepEqual(threadCounts(world), [size]);
  handleTrade(world, { type: 'buy_good', index: 0 });
  assert.deepEqual(threadCounts(world), [size, 1]);
  assert.equal(world.player.gold, 0);
});

void test('a full bag with a thread stack that has room still buys a thread, and refuses once the stack is full', (): void => {
  const world: World = atTrader();
  const good = must(content.trade.goods[0], 'good');
  const size: number = portalBase().stack;
  world.player.inventory = world.player.inventory.map((_: ItemInstance | null, index: number): ItemInstance => must(generateItem(content, createRng(700 + index), 700 + index, 1, 'rusted_blade', 'common'), 'blade'));
  world.player.inventory[0] = withCount(must(goodItem(content, 0), 'thread'), size - 1);
  world.player.gold = good.price * 2;
  handleTrade(world, { type: 'buy_good', index: 0 });
  assert.deepEqual(threadCounts(world), [size]);
  assert.equal(world.player.gold, good.price);
  world.events = [];
  handleTrade(world, { type: 'buy_good', index: 0 });
  assert.deepEqual(threadCounts(world), [size]);
  assert.equal(world.player.gold, good.price);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'inventory_full'));
});

void test('a stack of threads is never bought back, and the trader sells them as before', (): void => {
  const world: World = atTrader();
  world.player.inventory[0] = withCount(must(goodItem(content, 0), 'thread'), 6);
  world.player.gold = 10;
  handleTrade(world, { type: 'sell', inventoryIndex: 0 });
  assert.equal(countOf(must(world.player.inventory[0], 'kept')), 6);
  assert.equal(world.player.gold, 10);
});

void test('opening a way uses one thread from the stack, and the last one empties the slot', (): void => {
  const world: World = wild();
  const index: number = giveTear(world);
  world.player.inventory[index] = withCount(must(world.player.inventory[index], 'thread'), 2);
  useItem(world, index);
  channelOut(world);
  assert.notEqual(world.portal, null);
  assert.equal(countOf(must(world.player.inventory[index], 'left')), 1);
  useItem(world, index);
  channelOut(world);
  assert.notEqual(world.portal, null);
  assert.equal(world.player.inventory[index], null);
});

void test('a stack of threads survives a save and a reload with its count', (): void => {
  const world: World = wild();
  const index: number = giveTear(world);
  world.player.inventory[index] = withCount(must(world.player.inventory[index], 'thread'), 13);
  assert.equal(countOf(must(reload(world).player.inventory[index], 'thread')), 13);
});

void test('the portal good is never rolled as a drop, and leaving it out changes no roll', (): void => {
  const without: Content = { ...content, itemBases: new Map([...content.itemBases].filter(([id]: [string, ItemBaseDef]): boolean => id !== PORTAL_BASE)) };
  for (let seed: number = 1; seed <= 400; seed += 1) {
    for (const level of [1, 6, 10, 14, 20]) {
      const rolled: ItemInstance | null = generateItem(content, createRng(seed), seed, level, null, null);
      assert.notEqual(rolled?.base, PORTAL_BASE);
      assert.deepEqual(rolled, generateItem(without, createRng(seed), seed, level, null, null));
    }
  }
});

void test('both portal ends stand on open ground: the Hideout end and where the hero arrives beside it', (): void => {
  const world: World = worldIn(content, content.world.town, 1);
  const spot = homeSpot(world.zone);
  assert.ok(isWalkable(world.grid, spot.x, spot.z));
  assert.ok(isWalkable(world.grid, spot.x, spot.z + PORTAL.arriveOffset));
});

void test('using the good channels, then opens a portal where the hero stands and spends the good', (): void => {
  const world: World = wild();
  const at = { ...world.player.pos };
  const portal: PortalState = openHere(world);
  assert.equal(portal.zone, WILD);
  assert.deepEqual(portal.pos, at);
  assert.equal(world.player.inventory.some((item: ItemInstance | null): boolean => item?.base === PORTAL_BASE), false);
  assert.deepEqual(stages(world.events), ['channel', 'opened']);
  assert.deepEqual(portalEnds(world).map((end: PortalEnd): string => end.kind), ['out']);
});

void test('a hit during the channel breaks it and keeps the good', (): void => {
  const world: World = wild();
  useItem(world, giveTear(world));
  world.player.life -= 1;
  channelOut(world);
  assert.equal(world.portal, null);
  assert.ok(world.player.inventory.some((item: ItemInstance | null): boolean => item?.base === PORTAL_BASE));
  assert.deepEqual(stages(world.events), ['channel', 'broken']);
});

void test('no portal opens in the Hideout or while a boss is roused', (): void => {
  const town: World = worldIn(content, content.world.town, 1);
  useItem(town, giveTear(town));
  assert.equal(town.player.intent.type, 'idle');
  assert.ok(town.events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'portal_town'));
  const gate: World = worldIn(content, 'keepers_gate', 1);
  const boss: MonsterState = must(gate.monsters.find((monster: MonsterState): boolean => monster.def.boss !== null), 'boss');
  boss.aggro = true;
  useItem(gate, giveTear(gate));
  assert.equal(gate.player.intent.type, 'idle');
  assert.ok(gate.events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'portal_boss'));
});

void test('the portal leads to the Hideout, and the Hideout end returns the hero once to the exact spot with the zone as it was left', (): void => {
  const world: World = wild();
  const portal: PortalState = openHere(world);
  const [first, second, ...rest] = living(world);
  must(first, 'first').alive = false;
  must(second, 'second').life = 3;
  const left: number[] = rest.map((monster: MonsterState): number => monster.id).toSorted((a: number, b: number): number => a - b);
  through(world);
  assert.equal(world.zone.id, content.world.town);
  assert.deepEqual(portalEnds(world).map((end: PortalEnd): string => end.kind), ['home']);
  world.events = [];
  through(world);
  assert.equal(world.zone.id, WILD);
  assert.deepEqual(world.player.pos, portal.pos);
  assert.equal(world.portal, null);
  assert.deepEqual(stages(world.events), ['entered', 'arrived', 'closed']);
  const back: MonsterState[] = living(world);
  assert.equal(back.length, rest.length + 1);
  assert.equal(must(back.find((monster: MonsterState): boolean => monster.id === second?.id), 'wounded').life, 3);
  assert.deepEqual(back.filter((monster: MonsterState): boolean => monster.id !== second?.id).map((monster: MonsterState): number => monster.id).toSorted((a: number, b: number): number => a - b), left);
  assert.equal(back.some((monster: MonsterState): boolean => monster.id === first?.id), false);
});

void test('leaving the portal zone by an exit keeps it too, and coming back by that exit finds it as it was', (): void => {
  const world: World = wild();
  openHere(world);
  const [first, ...rest] = living(world);
  must(first, 'first').alive = false;
  world.cachesOpened.push(0);
  travelThrough(world, must(findExit(world.zone, 'lair'), 'lair exit'));
  assert.notEqual(world.zone.id, WILD);
  travelThrough(world, must(findExit(world.zone, 'under'), 'under exit'));
  assert.equal(world.zone.id, WILD);
  assert.deepEqual(world.cachesOpened, [0]);
  assert.equal(living(world).length, rest.length);
  assert.equal(living(world).some((monster: MonsterState): boolean => monster.id === first?.id), false);
  assert.notEqual(world.portal, null);
});

void test('the Hideout end is reached by a deliberate click on it, never by walking past', (): void => {
  const world: World = wild();
  openHere(world);
  through(world);
  const end: PortalEnd = must(portalEndHere(world), 'home end');
  stepWorld(world, [{ type: 'move', held: false, dest: { x: end.pos.x, z: end.pos.z } }], DT);
  for (let step: number = 0; step < 600; step += 1) stepWorld(world, [], DT);
  assert.equal(world.zone.id, content.world.town);
  stepWorld(world, [{ type: 'enter_portal' }], DT);
  for (let step: number = 0; step < 600 && world.zone.id !== WILD; step += 1) stepWorld(world, [], DT);
  assert.equal(world.zone.id, WILD);
});

void test('opening a second portal replaces the first and drops what the first kept', (): void => {
  const world: World = wild();
  openHere(world);
  world.player.pos = { x: world.player.pos.x + 0.5, z: world.player.pos.z };
  const second: PortalState = openHere(world);
  assert.deepEqual(stages(world.events).filter((stage: string): boolean => stage === 'closed').length, 1);
  assert.equal(second.kept, null);
  assert.equal(must(world.portal, 'portal').pos.x, second.pos.x);
});

void test('a reload in the Hideout keeps the portal and the zone it waits on', (): void => {
  const world: World = wild();
  const portal: PortalState = openHere(world);
  const [first] = living(world);
  must(first, 'first').alive = false;
  const alive: number = living(world).length;
  through(world);
  const loaded: World = reload(world);
  assert.equal(loaded.zone.id, content.world.town);
  through(loaded);
  assert.equal(loaded.zone.id, WILD);
  assert.deepEqual(loaded.player.pos, portal.pos);
  assert.equal(living(loaded).length, alive);
});

void test('a reload in the portal zone keeps that zone as it was too', (): void => {
  const world: World = wild();
  openHere(world);
  const [first] = living(world);
  must(first, 'first').alive = false;
  const alive: number = living(world).length;
  const loaded: World = reload(world);
  assert.equal(loaded.zone.id, WILD);
  assert.equal(living(loaded).length, alive);
  assert.notEqual(loaded.portal, null);
});

void test('a death that sends the hero to the Hideout keeps the portal and the zone', (): void => {
  const world: World = wild();
  const portal: PortalState = openHere(world);
  const alive: number = living(world).length;
  world.player.life = 0;
  world.player.alive = false;
  world.death = { killer: 'The storm', skill: 'Storm', elapsed: 60, xpLost: 0 };
  respawnPlayer(world, 'town');
  assert.equal(world.zone.id, content.world.town);
  through(world);
  assert.equal(world.zone.id, WILD);
  assert.deepEqual(world.player.pos, portal.pos);
  assert.equal(living(world).length, alive);
});

void test('an old save without a portal loads unchanged, and a broken portal entry is dropped', (): void => {
  const world: World = wild();
  const plain: Record<string, unknown> = { ...toSave(world) };
  delete plain['portal'];
  assert.equal(must(readSave(content, plain), 'old save').portal, null);
  assert.equal(must(readSave(content, { ...plain, portal: { zone: 'nowhere', x: 1, z: 1, reach: 1 } }), 'bad zone').portal, null);
  assert.equal(must(readSave(content, { ...plain, portal: { zone: content.world.town, x: 1, z: 1, reach: 1 } }), 'town zone').portal, null);
  assert.equal(must(readSave(content, { ...plain, portal: { zone: WILD, x: 'a', z: 1, reach: 1 } }), 'bad spot').portal, null);
  const partly = must(must(readSave(content, { ...plain, portal: { zone: WILD, x: 1, z: 2, reach: 1.5, kept: { packs: [0, 999, 'x'], monsters: [{ monster: 'ghost_of_nothing', group: 1, level: 1, x: 0, z: 0, life: 4 }, { monster: 'rat', group: 1, level: 3, x: 1, z: 1, life: 5 }], ground: [{ x: 1, z: 1, content: { kind: 'gold', amount: -2 } }] } } }), 'partly bad').portal, 'partly bad portal');
  assert.deepEqual(partly.kept?.packs, [0]);
  assert.equal(partly.kept.monsters.length, 1);
  assert.equal(partly.kept.ground.length, 0);
  assert.equal(parseSaveText(content, JSON.stringify(plain))?.portal ?? null, null);
});

void test('a full Hourfall Caves kept in the save stays small and capped', (): void => {
  const world: World = wild();
  openHere(world);
  through(world);
  const kept: string = JSON.stringify(toSave(world).portal);
  assert.ok(living(wild()).length <= PORTAL_KEEP.monsters);
  assert.ok(kept.length < 36_000, `kept zone is ${kept.length} bytes`);
});

void test('the trader shows each good as one steady item of its base', (): void => {
  const shown: ItemInstance = must(goodItem(content, 0), 'shown good');
  assert.equal(shown.base, PORTAL_BASE);
  assert.deepEqual(goodItem(content, 0), shown);
  assert.equal(goodItem(content, content.trade.goods.length), null);
});
