import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneDuel, ZoneExit } from '../content/types.ts';
import { ITEM_SLOTS } from '../content/types.ts';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { RING, ringContent } from '../../test/rival-support.ts';
import type { Action } from '../rl/contract.ts';
import { NO_ACTION, RL } from '../rl/contract.ts';
import type { RivalDuel, RivalOutcome, RivalPilot } from '../rl/rival.ts';
import { beginRivalDuel, resignRivalDuel, rivalCommands, rivalHeard, rivalOf, startRivalDuel } from '../rl/rival.ts';
import { toSave } from '../save.ts';
import { stepWorld } from './step.ts';
import type { Command, Equipment, ItemInstance, PlayerState, World, WorldEvent } from './types.ts';
import { enterZone, travelThrough } from './zones.ts';

const FRAME: number = 1 / 30;
const LEVEL: number = 20;
const STILL: RivalPilot = (): Action => NO_ACTION;

function standardContent(): Content {
  const content: Content = ringContent(loadContent());
  const ring: ZoneDef = zoneOf(content, RING.id);
  const duel: ZoneDuel = must(ring.duel, 'ring duel');
  return { ...content, zones: new Map<string, ZoneDef>([...content.zones, [RING.id, { ...ring, duel: { ...duel, gear: 'standard' } }]]) };
}

const CONTENT: Content = standardContent();

function owned(world: World, base: string, rarity: string, level: number): ItemInstance {
  const item: ItemInstance = { uid: world.nextItemUid, base, rarity, level, affixes: [], ledger: null };
  world.nextItemUid += 1;
  return item;
}

function geared(seed: number): World {
  const world: World = worldIn(CONTENT, 'hideout', seed);
  stepWorld(world, [{ type: 'bench', hero: { seed, level: LEVEL, weapon: RING.weapon, bar: ['cleave', null, null, null, null, 'dodge_roll'] } }], RL.tick);
  world.player.equipped.head = owned(world, 'norman_helm', 'magic', 7);
  world.player.equipped.feet = owned(world, 'warden_boots', 'rare', 9);
  world.events = [];
  return world;
}

function snapshot(equipped: Equipment): Equipment {
  return { ...equipped };
}

function sameGear(world: World, before: Equipment): void {
  for (const slot of ITEM_SLOTS) assert.equal(world.player.equipped[slot], before[slot], slot);
  assert.deepEqual(world.player.equipped, before);
  assert.equal(world.setAside, null);
}

function enterRing(world: World): RivalDuel {
  enterZone(world, zoneOf(CONTENT, RING.id), { type: 'start' });
  const duel: RivalDuel = must(startRivalDuel(world, 5), 'duel');
  beginRivalDuel(duel, world);
  return duel;
}

function playOut(world: World, duel: RivalDuel, seconds: number): void {
  for (let time: number = 0; time < seconds && world.zone.id === RING.id; time += FRAME) {
    const commands: Command[] = rivalCommands(duel, world, STILL, FRAME);
    const events: WorldEvent[] = stepWorld(world, commands, FRAME);
    rivalHeard(duel, world, events);
  }
}

function fell(hero: PlayerState): void {
  hero.life = 0;
  hero.alive = false;
}

void test('a standard duel sets the hero gear aside and lends them their legendary family and rares at their level, at full life', (): void => {
  const world: World = geared(3);
  const before: Equipment = snapshot(world.player.equipped);
  enterRing(world);
  assert.deepEqual(world.setAside, before);
  const player: PlayerState = world.player;
  assert.equal(player.equipped.weapon?.base, 'the_millwheel');
  for (const slot of ITEM_SLOTS) {
    const item: ItemInstance | null = player.equipped[slot];
    assert.ok(item);
    assert.equal(item.level, LEVEL);
    assert.ok(item.affixes.length > 0);
    assert.ok(!Object.values(before).includes(item));
  }
  assert.equal(player.life, player.maxLife);
});

void test('the standard ring gives the challenger and the rival the same legendary and rare allowances', (): void => {
  const world: World = geared(4);
  const duel: RivalDuel = enterRing(world);
  for (const hero of [world.player, must(rivalOf(duel, world), 'rival')]) {
    const items: (ItemInstance | null)[] = Object.values(hero.equipped);
    assert.equal(items.filter((item: ItemInstance | null): boolean => item?.rarity === 'stormtouched').length, 3);
    assert.equal(items.filter((item: ItemInstance | null): boolean => item?.rarity === 'rare').length, 4);
  }
});

void test('the hero gets their own gear back exactly after a win, a loss and a resignation', (): void => {
  const endings: readonly { readonly outcome: RivalOutcome; readonly settle: (world: World, duel: RivalDuel) => void }[] = [
    { outcome: 'won', settle: (world: World, duel: RivalDuel): void => fell(must(rivalOf(duel, world), 'rival')) },
    { outcome: 'lost', settle: (world: World): void => fell(world.player) },
    { outcome: 'resigned', settle: (world: World, duel: RivalDuel): void => void resignRivalDuel(duel, world) },
  ];
  for (const ending of endings) {
    const world: World = geared(6);
    const before: Equipment = snapshot(world.player.equipped);
    const duel: RivalDuel = enterRing(world);
    world.time = duel.start;
    ending.settle(world, duel);
    playOut(world, duel, 10);
    assert.equal(duel.outcome, ending.outcome);
    assert.equal(world.zone.id, RING.home.zone);
    sameGear(world, before);
    assert.ok(world.player.alive);
    assert.ok(world.player.life > 0 && world.player.life <= world.player.maxLife);
  }
});

void test('the hero gets their own gear back exactly when they leave by the way out', (): void => {
  const world: World = geared(7);
  const before: Equipment = snapshot(world.player.equipped);
  enterRing(world);
  const exit: ZoneExit = must(world.zone.exits[0], 'way out');
  travelThrough(world, exit);
  assert.notEqual(world.zone.id, RING.id);
  sameGear(world, before);
});

void test('worn gear cannot be changed during a standard duel', (): void => {
  const world: World = geared(8);
  enterRing(world);
  const spare: ItemInstance = owned(world, 'warden_gloves', 'magic', 5);
  world.player.inventory[0] = spare;
  const worn: Equipment = snapshot(world.player.equipped);
  const events: WorldEvent[] = [...stepWorld(world, [{ type: 'equip', inventoryIndex: 0 }], FRAME), ...stepWorld(world, [{ type: 'unequip', slot: 'head' }], FRAME)];
  assert.deepEqual(world.player.equipped, worn);
  assert.equal(world.player.inventory[0], spare);
  assert.equal(events.filter((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'duel_gear').length, 2);
});

void test('a save made during a standard duel keeps the hero own gear', (): void => {
  const world: World = geared(9);
  const before: Equipment = snapshot(world.player.equipped);
  enterRing(world);
  assert.deepEqual(toSave(world).equipped, before);
});

void test('a duel that keeps the hero own gear leaves it on', (): void => {
  const content: Content = ringContent(loadContent());
  const world: World = worldIn(content, 'hideout', 10);
  stepWorld(world, [{ type: 'bench', hero: { seed: 10, level: LEVEL, weapon: RING.weapon, bar: ['cleave', null, null, null, null, 'dodge_roll'] } }], RL.tick);
  const before: Equipment = snapshot(world.player.equipped);
  enterZone(world, zoneOf(content, RING.id), { type: 'start' });
  assert.equal(world.setAside, null);
  sameGear(world, before);
});
