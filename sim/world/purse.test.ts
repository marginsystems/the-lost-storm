import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { readSave, toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import type { LedgerItem, PurseEntry } from './ledger.ts';
import { applyPurse, findLedger, hasRoom, listable, stripLedger, unverifyLedger } from './purse.ts';
import { stepWorld } from './step.ts';
import type { GroundItem, ItemInstance, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const LEDGER_A: string = 'itm_AAAAAAAAAAAAAAAAAAAAAA';
const LEDGER_B: string = 'itm_BBBBBBBBBBBBBBBBBBBBBB';

function worldAt(seed: number): World {
  const world: World = worldIn(content, content.world.town, seed);
  world.player.inventory = world.player.inventory.map((): ItemInstance | null => null);
  world.stash = world.stash.map((): ItemInstance | null => null);
  world.player.gold = 100;
  world.events = [];
  return world;
}

function rolled(id: string): LedgerItem {
  return { id, base: 'rusted_blade', rarity: 'magic', level: 4, affixes: [] };
}

function held(id: string, uid: number): ItemInstance {
  return { uid, base: 'rusted_blade', rarity: 'magic', level: 4, affixes: [], ledger: id };
}

function entry(id: number, gold: number, item: LedgerItem | null, direction: 'in' | 'out' | null): PurseEntry {
  return { id, kind: direction === 'out' ? 'list' : gold < 0 ? 'buy' : 'collect', gold, item, direction };
}

function bagLedgers(world: World): string[] {
  return world.player.inventory.flatMap((item: ItemInstance | null): string[] => (item?.ledger === undefined || item.ledger === null ? [] : [item.ledger]));
}

void test('a purse entry is applied once, however often it arrives', (): void => {
  const world: World = worldAt(1);
  const buy: PurseEntry = entry(5, -40, rolled(LEDGER_A), 'in');
  assert.equal(applyPurse(world, [buy]), true);
  assert.equal(applyPurse(world, [buy]), false);
  assert.equal(world.player.gold, 60);
  assert.deepEqual(bagLedgers(world), [LEDGER_A]);
  assert.equal(world.purse, 5);
});

void test('entries apply in id order and the cursor ends on the newest', (): void => {
  const world: World = worldAt(2);
  world.player.inventory[0] = held(LEDGER_A, 900);
  applyPurse(world, [entry(8, 0, rolled(LEDGER_A), 'in'), entry(7, 0, rolled(LEDGER_A), 'out')]);
  assert.deepEqual(bagLedgers(world), [LEDGER_A]);
  assert.equal(world.purse, 8);
});

void test('entries at or below the cursor are skipped', (): void => {
  const world: World = worldAt(3);
  world.purse = 10;
  assert.equal(applyPurse(world, [entry(9, 500, null, null), entry(10, 500, null, null)]), false);
  assert.equal(world.player.gold, 100);
  applyPurse(world, [entry(11, 25, null, null)]);
  assert.equal(world.player.gold, 125);
});

void test('gold never falls below zero', (): void => {
  const world: World = worldAt(4);
  applyPurse(world, [entry(1, -250, null, null)]);
  assert.equal(world.player.gold, 0);
  assert.equal(world.purse, 1);
});

void test('an item out is removed by its ledger id wherever it is held', (): void => {
  const world: World = worldAt(5);
  world.stash[3] = held(LEDGER_A, 901);
  world.player.inventory[2] = held(LEDGER_B, 902);
  applyPurse(world, [entry(1, 0, rolled(LEDGER_A), 'out')]);
  assert.equal(world.stash[3], null);
  assert.deepEqual(bagLedgers(world), [LEDGER_B]);
});

void test('an item in that is already held is not given twice', (): void => {
  const world: World = worldAt(6);
  world.stash[0] = held(LEDGER_A, 903);
  applyPurse(world, [entry(1, 0, rolled(LEDGER_A), 'in')]);
  assert.deepEqual(bagLedgers(world), []);
  assert.equal(world.purse, 1);
});

void test('an item in goes to the bags, then the stash, then the ground beside the hero', (): void => {
  const world: World = worldAt(7);
  world.player.inventory = world.player.inventory.map((_: ItemInstance | null, index: number): ItemInstance => held(`itm_bag${String(index).padStart(19, '0')}`, 1000 + index));
  applyPurse(world, [entry(1, 0, rolled(LEDGER_A), 'in')]);
  assert.deepEqual(findLedger(world, LEDGER_A), { place: 'stash', index: 0 });
  world.stash = world.stash.map((item: ItemInstance | null, index: number): ItemInstance => item ?? held(`itm_sta${String(index).padStart(19, '0')}`, 2000 + index));
  assert.equal(hasRoom(world), false);
  applyPurse(world, [entry(2, 0, rolled(LEDGER_B), 'in')]);
  const ground: GroundItem = must(
    world.ground.find((candidate: GroundItem): boolean => candidate.content.kind === 'item' && candidate.content.item.ledger === LEDGER_B),
    'ground',
  );
  assert.equal(ground.kept, true);
  assert.equal(findLedger(world, LEDGER_B), null);
});

void test('an item given by the purse carries its ledger roll and a fresh uid', (): void => {
  const world: World = worldAt(8);
  const uid: number = world.nextItemUid;
  applyPurse(world, [entry(1, 0, { ...rolled(LEDGER_A), affixes: [{ affix: must(content.affixes.keys().next().value, 'affix'), value: 3 }] }, 'in')]);
  const item: ItemInstance = must(world.player.inventory[0], 'item');
  assert.equal(item.uid, uid);
  assert.equal(item.ledger, LEDGER_A);
  assert.equal(item.affixes.length, 1);
  assert.equal(world.nextItemUid, uid + 1);
});

void test('stripped ledger ids leave the bags, the stash, the worn gear, the ground and the vendors', (): void => {
  const world: World = worldAt(9);
  world.player.inventory[1] = held(LEDGER_A, 904);
  world.player.equipped.weapon = held(LEDGER_B, 905);
  world.vendors['test_vendor'] = { stock: [held(LEDGER_A, 920), null], buyback: [held(LEDGER_B, 921), held('itm_CCCCCCCCCCCCCCCCCCCCCC', 922)], stale: false };
  assert.equal(stripLedger(world, [LEDGER_A, LEDGER_B]), true);
  assert.equal(world.player.inventory[1], null);
  assert.equal(world.player.equipped.weapon, null);
  assert.deepEqual(world.vendors['test_vendor'].stock, [null, null]);
  assert.deepEqual(world.vendors['test_vendor'].buyback.map((item: ItemInstance): number => item.uid), [922]);
  assert.equal(stripLedger(world, [LEDGER_A]), false);
});

void test('unverified ledger ids stay where they are with the ledger cleared', (): void => {
  const world: World = worldAt(13);
  world.player.inventory[2] = held(LEDGER_A, 930);
  world.stash[0] = held(LEDGER_B, 931);
  world.player.equipped.weapon = held(LEDGER_A, 932);
  world.vendors['test_vendor'] = { stock: [held(LEDGER_B, 933)], buyback: [held(LEDGER_A, 934)], stale: false };
  world.player.inventory[3] = held('itm_CCCCCCCCCCCCCCCCCCCCCC', 935);
  assert.equal(unverifyLedger(world, [LEDGER_A, LEDGER_B]), true);
  assert.deepEqual(world.player.inventory[2], { ...held(LEDGER_A, 930), ledger: null });
  assert.equal(world.stash[0].ledger, null);
  assert.equal(world.player.equipped.weapon.ledger, null);
  assert.equal(world.player.equipped.weapon.uid, 932);
  assert.equal(world.vendors['test_vendor'].stock[0]?.ledger, null);
  assert.equal(world.vendors['test_vendor'].buyback[0]?.ledger, null);
  assert.equal(world.player.inventory[3].ledger, 'itm_CCCCCCCCCCCCCCCCCCCCCC');
  assert.equal(unverifyLedger(world, [LEDGER_A, LEDGER_B]), false);
});

void test('only a verified item in the bags or the stash may be listed', (): void => {
  const world: World = worldAt(10);
  world.player.inventory[0] = held(LEDGER_A, 906);
  world.player.inventory[1] = { ...held(LEDGER_B, 907), ledger: null };
  assert.deepEqual(listable(world, { place: 'bag', index: 0 }), { kind: 'ok', ledger: LEDGER_A, item: world.player.inventory[0] });
  assert.deepEqual(listable(world, { place: 'bag', index: 1 }), { kind: 'refused', reason: 'unverified' });
  assert.deepEqual(listable(world, { place: 'stash', index: 0 }), { kind: 'refused', reason: 'empty' });
});

void test('the purse command applies entries, strips and clears ledgers, and says the character changed', (): void => {
  const world: World = worldAt(11);
  world.player.inventory[4] = held(LEDGER_B, 908);
  world.player.inventory[5] = held(LEDGER_A, 909);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'purse', entries: [entry(3, 12, null, null)], stripped: [LEDGER_B], unverified: [LEDGER_A] }], DT);
  assert.equal(world.player.gold, 112);
  assert.equal(world.player.inventory[4], null);
  assert.equal(world.player.inventory[5].ledger, null);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'character_changed'));
});

void test('the cursor rides in the save and an older save reads as zero', (): void => {
  const world: World = worldAt(12);
  applyPurse(world, [entry(42, 1, null, null)]);
  const saved: SaveData = toSave(world);
  assert.equal(saved.purse, 42);
  const older: unknown = Object.fromEntries(Object.entries(saved).filter(([key]: [string, unknown]): boolean => key !== 'purse'));
  assert.equal(must(readSave(content, JSON.parse(JSON.stringify(older))), 'older').purse, 0);
  assert.equal(must(readSave(content, JSON.parse(JSON.stringify(saved))), 'saved').purse, 42);
});
