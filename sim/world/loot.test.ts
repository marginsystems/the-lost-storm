import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { Content, ItemBaseDef } from '../content/types.ts';
import { generateItem, rarityOf } from '../items.ts';
import { createRng } from '../rng.ts';
import { giveTickets, takeClaims } from './ledger.ts';
import type { ItemSource } from './ledger.ts';
import { firstDropBases, rollDrop } from './loot.ts';
import type { ItemInstance, World } from './types.ts';

const MONSTER: ItemSource = { kind: 'monster', monster: 'unfinished_brute', zone: 'hall_of_time' };

function rank(content: Content, rarity: string): number {
  return content.rarities.findIndex((candidate): boolean => candidate.id === rarity);
}

function fresh(seed: number): World {
  const world: World = arena(seed);
  delete world.flags[world.content.player.firstDrop.flag];
  return world;
}

void test('the first drop of a new character fills an empty slot with a base he does not hold, at magic or better', (): void => {
  for (let seed: number = 1; seed <= 40; seed += 1) {
    const world: World = fresh(seed);
    const candidates: readonly string[] = firstDropBases(world.content, world.player, 1).map((base: ItemBaseDef): string => base.id);
    assert.ok(candidates.length > 0);
    const item: ItemInstance = must(rollDrop(world, 1, null, MONSTER), 'first drop');
    assert.ok(candidates.includes(item.base), item.base);
    const base: ItemBaseDef = must(world.content.itemBases.get(item.base), item.base);
    assert.equal(world.player.equipped[must(base.slot, 'slot')], null);
    assert.ok(rank(world.content, item.rarity) >= rank(world.content, world.content.player.firstDrop.rarity), item.rarity);
    assert.equal(rarityOf(world.content, item).powers, false);
    assert.equal(world.flags[world.content.player.firstDrop.flag], 'yes');
  }
});

void test('the first drop never repeats what the hero wears or carries', (): void => {
  const world: World = fresh(3);
  const held: Set<string> = new Set<string>();
  for (const item of Object.values(world.player.equipped)) if (item !== null) held.add(item.base);
  assert.ok(held.has('rusted_blade'));
  for (const base of firstDropBases(world.content, world.player, 1)) assert.ok(!held.has(base.id), base.id);
});

void test('a first drop asked for at a higher rarity keeps it', (): void => {
  const world: World = fresh(5);
  assert.equal(must(rollDrop(world, 1, 'rare', MONSTER), 'rare drop').rarity, 'rare');
});

void test('after the first drop every roll is the ordinary one, common rarity and filled slots included', (): void => {
  const world: World = fresh(7);
  must(rollDrop(world, 4, null, MONSTER), 'first');
  const later: ItemInstance[] = Array.from({ length: 200 }, (): ItemInstance => must(rollDrop(world, 4, null, MONSTER), 'later'));
  assert.ok(later.some((item: ItemInstance): boolean => item.rarity === 'common'));
  assert.ok(later.some((item: ItemInstance): boolean => world.player.equipped[must(must(world.content.itemBases.get(item.base), item.base).slot, 'slot')] !== null));
  assert.equal(new Set<number>(later.map((item: ItemInstance): number => item.uid)).size, later.length);
});

void test('with every slot filled the first drop falls back to an ordinary roll', (): void => {
  const world: World = fresh(9);
  for (const base of world.content.itemBases.values()) {
    if (base.slot === null || world.player.equipped[base.slot] !== null) continue;
    world.player.equipped[base.slot] = must(generateItem(world.content, createRng(1), 900, 1, base.id, null), base.id);
  }
  assert.deepEqual(firstDropBases(world.content, world.player, 1), []);
  assert.notEqual(rollDrop(world, 1, null, MONSTER), null);
  assert.equal(world.flags[world.content.player.firstDrop.flag], 'yes');
});

void test('the first drop is chosen for the hero and spends no ticket, and a later drop is rolled from a ticket', (): void => {
  const world: World = fresh(5);
  world.ledger.waiting = [];
  giveTickets(world, [{ id: 1, seed: 11 }]);
  must(rollDrop(world, 2, null, MONSTER), 'first');
  assert.deepEqual(world.ledger.tickets, [{ id: 1, seed: 11 }]);
  assert.deepEqual(takeClaims(world), []);
  const later: ItemInstance = must(rollDrop(world, 2, null, MONSTER), 'later');
  assert.deepEqual(world.ledger.tickets, []);
  assert.deepEqual(takeClaims(world), [{ uid: later.uid, ticket: 1, source: MONSTER, level: 2 }]);
});
