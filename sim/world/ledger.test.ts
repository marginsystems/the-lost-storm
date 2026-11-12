import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { generateItem, slotOf } from '../items.ts';
import { createRng } from '../rng.ts';
import { readSave, toSave } from '../save.ts';
import { confirmItem, dropTickets, giveTickets, makeItem, takeClaims } from './ledger.ts';
import type { ItemSource, LedgerItem, MintClaim } from './ledger.ts';
import { vendorStock } from './trade.ts';
import type { ItemInstance, World } from './types.ts';

const content: Content = loadContent();
const MONSTER: ItemSource = { kind: 'monster', monster: 'unfinished_brute', zone: 'hall_of_time' };
const ID: string = 'itm_AAAAAAAAAAAAAAAAAAAAAA';

function world(): World {
  return worldIn(content, content.world.start, 7);
}

function minted(item: ItemInstance, id: string = ID): LedgerItem {
  return { id, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes };
}

void test('without a ticket an item is rolled from the world and nothing is claimed', (): void => {
  const one: World = world();
  const two: World = world();
  const item = must(makeItem(one, 3, null, null, MONSTER), 'item');
  assert.deepEqual(item, generateItem(content, two.rng, two.nextItemUid, 3, null, null));
  assert.equal(item.ledger, null);
  assert.deepEqual(takeClaims(one), []);
  assert.equal(one.nextItemUid, two.nextItemUid + 1);
});

void test('with a ticket the item is the roll of its seed, the world roll is untouched, and a claim waits', (): void => {
  const held: World = world();
  const rngBefore: number = held.rng.state();
  giveTickets(held, [{ id: 41, seed: 9001 }, { id: 42, seed: 9002 }]);
  const uid: number = held.nextItemUid;
  const item = must(makeItem(held, 4, null, 'magic', MONSTER), 'item');
  assert.deepEqual(item, generateItem(content, createRng(9001), uid, 4, null, 'magic'));
  assert.equal(held.rng.state(), rngBefore);
  assert.deepEqual(held.ledger.tickets, [{ id: 42, seed: 9002 }]);
  const claims: readonly MintClaim[] = takeClaims(held);
  assert.deepEqual(claims, [{ uid, ticket: 41, source: MONSTER, level: 4 }]);
  assert.deepEqual(takeClaims(held), []);
});

void test('vendor stock rolls from the world and spends no ticket', (): void => {
  const held: World = world();
  giveTickets(held, [{ id: 7, seed: 77 }]);
  vendorStock(held, 'any_vendor');
  assert.deepEqual(held.ledger.tickets, [{ id: 7, seed: 77 }]);
  assert.deepEqual(takeClaims(held), []);
});
void test('tickets already held or already spent are not given twice, and dropping them empties the hand', (): void => {
  const held: World = world();
  giveTickets(held, [{ id: 1, seed: 1 }, { id: 2, seed: 2 }]);
  makeItem(held, 1, null, null, MONSTER);
  giveTickets(held, [{ id: 1, seed: 1 }, { id: 2, seed: 2 }, { id: 3, seed: 3 }]);
  assert.deepEqual(held.ledger.tickets.map((ticket) => ticket.id), [2, 3]);
  dropTickets(held);
  assert.deepEqual(held.ledger.tickets, []);
  giveTickets(held, [{ id: 4, seed: 4 }, { id: 4, seed: 4 }]);
  assert.deepEqual(held.ledger.tickets, [{ id: 4, seed: 4 }]);
});

void test('a confirmed item takes its ledger id wherever it now lies', (): void => {
  const held: World = world();
  const inBag = must(makeItem(held, 1, null, null, MONSTER), 'bag');
  const inStash = must(makeItem(held, 1, null, null, MONSTER), 'stash');
  held.player.inventory[0] = inBag;
  held.stash[0] = inStash;
  assert.ok(confirmItem(held, inBag.uid, minted(inBag)));
  assert.ok(confirmItem(held, inStash.uid, minted(inStash, 'itm_BBBBBBBBBBBBBBBBBBBBBB')));
  assert.equal(must(held.player.inventory[0], 'bag').ledger, ID);
  assert.equal(must(held.stash[0], 'stash').ledger, 'itm_BBBBBBBBBBBBBBBBBBBBBB');
  assert.equal(confirmItem(held, 99_999, minted(inBag)), false);
  assert.equal(confirmItem(held, inBag.uid, minted(inBag, 'itm_short')), false);
});

void test('a minted item that differs from the local roll leaves the local item as it is, unverified', (): void => {
  const held: World = world();
  const worn = must(Object.values(held.player.equipped).find((item: ItemInstance | null): boolean => item !== null), 'worn item');
  const slot = must(slotOf(content, worn), 'slot');
  const stronger = must(generateItem(content, createRng(5), worn.uid, 20, worn.base, 'rare'), 'stronger');
  const stats = held.player.stats;
  assert.equal(confirmItem(held, worn.uid, minted(stronger)), false);
  assert.deepEqual(held.player.equipped[slot], worn);
  assert.equal(held.player.stats, stats);
  assert.ok(confirmItem(held, worn.uid, minted(worn)));
  assert.deepEqual(held.player.equipped[slot], { ...worn, ledger: ID });
});
void test('a confirmed item on the ground or in a vendor stock takes its id', (): void => {
  const held: World = world();
  const lying = must(makeItem(held, 1, null, null, MONSTER), 'ground');
  held.ground.push({ id: 900, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content: { kind: 'item', item: lying }, find: null, age: 0, kept: false });
  assert.ok(confirmItem(held, lying.uid, minted(lying)));
  const ground = must(held.ground.find((entry) => entry.id === 900), 'ground');
  assert.equal(ground.content.kind === 'item' ? ground.content.item.ledger : null, ID);
  const stock = vendorStock(held, 'any_vendor');
  const sold = must(stock.stock.find((item: ItemInstance | null): boolean => item !== null), 'stock item');
  assert.ok(confirmItem(held, sold.uid, minted(sold)));
  assert.equal(stock.stock.find((item: ItemInstance | null): boolean => item?.uid === sold.uid)?.ledger, ID);
});

void test('a save keeps a ledger id and reads a malformed one as unverified', (): void => {
  const held: World = world();
  const item = must(makeItem(held, 1, null, null, MONSTER), 'item');
  held.player.inventory[0] = { ...item, ledger: ID };
  held.player.inventory[1] = { ...item, uid: item.uid + 100, ledger: 'forged' };
  const read = must(readSave(content, JSON.parse(JSON.stringify(toSave(held)))), 'save');
  assert.equal(read.inventory[0]?.ledger, ID);
  assert.equal(read.inventory[1]?.ledger, null);
});

void test('a saved item whose lines are rolled again is no longer the minted item and loses its ledger id', (): void => {
  const held: World = world();
  const item = must(makeItem(held, 1, null, 'magic', MONSTER), 'item');
  held.player.inventory[0] = { ...item, affixes: [...item.affixes, { affix: 'made_up', value: 1 }], ledger: ID };
  const read = must(readSave(content, JSON.parse(JSON.stringify(toSave(held)))), 'save');
  assert.equal(read.inventory[0]?.ledger, null);
});
