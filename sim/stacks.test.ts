import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import { itemProblems } from './content/item-rules.ts';
import type { Content, ItemBaseDef } from './content/types.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import type { ItemList } from './stacks.ts';
import { countOf, fits, moveStack, placeIn, readCount, restack, roomFor, stackSize, stacksWith, takeOne, withCount } from './stacks.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const THREAD: string = 'folded_hour';
const SIZE: number = must(content.itemBases.get(THREAD), THREAD).stack;

function thread(uid: number, count: number = 1): ItemInstance {
  return withCount(must(generateItem(content, createRng(uid), uid, 1, THREAD, 'common'), THREAD), count);
}

function blade(uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, 1, 'rusted_blade', 'common'), 'blade');
}

function counts(list: ItemList): (number | null)[] {
  return list.map((item: ItemInstance | null): number | null => (item === null ? null : countOf(item)));
}

void test('the Return Thread stacks to twenty, read from its data, and every other item stays single', (): void => {
  assert.equal(SIZE, 20);
  assert.equal(stackSize(content, thread(1)), 20);
  for (const base of content.itemBases.values()) if (base.id !== THREAD) assert.equal(base.stack, 1, base.id);
  assert.equal(stackSize(content, blade(2)), 1);
});

void test('only items alike in base, rarity, lines and ledger stack, so gear never does', (): void => {
  assert.equal(stacksWith(content, thread(1), thread(2)), true);
  assert.equal(stacksWith(content, blade(1), blade(2)), false);
  assert.equal(stacksWith(content, thread(1), { ...thread(2), ledger: 'itm_abcdefghijklmnopqrstuv' }), false);
  assert.equal(stacksWith(content, thread(1), { ...thread(2), rarity: 'magic' }), false);
});

void test('a single item carries no count field, and a count of one strips it', (): void => {
  assert.equal('count' in thread(1), false);
  assert.equal('count' in withCount(thread(1, 5), 1), false);
  assert.equal(countOf(thread(1, 5)), 5);
});

void test('an item tops up stacks with room first, then takes the first free slot', (): void => {
  const list: ItemList = [blade(1), thread(2, SIZE), null, thread(3, 4), null];
  assert.equal(placeIn(content, list, thread(4)), null);
  assert.deepEqual(counts(list), [1, SIZE, null, 5, null]);
  assert.equal(list[3]?.uid, 3);
  const full: ItemList = [blade(1), thread(2, SIZE)];
  assert.equal(fits(content, full, thread(4)), false);
  const left: ItemInstance = must(placeIn(content, full, thread(4)), 'left');
  assert.equal(countOf(left), 1);
});

void test('a full bag with a stack that has room still takes a thread', (): void => {
  const list: ItemList = [blade(1), thread(2, 19)];
  assert.equal(roomFor(content, list, thread(3)), 1);
  assert.equal(fits(content, list, thread(3)), true);
  assert.equal(placeIn(content, list, thread(3)), null);
  assert.deepEqual(counts(list), [1, SIZE]);
});

void test('a stack past twenty spills into a new stack', (): void => {
  const list: ItemList = [thread(1, 18), null, null];
  assert.equal(placeIn(content, list, thread(2, 5)), null);
  assert.deepEqual(counts(list), [SIZE, 3, null]);
  assert.equal(list[1]?.uid, 2);
});

void test('taking one lowers the count, and the last one empties the slot', (): void => {
  const list: ItemList = [thread(1, 2)];
  assert.equal(countOf(must(takeOne(content, list, 0), 'one')), 1);
  assert.deepEqual(counts(list), [1]);
  takeOne(content, list, 0);
  assert.deepEqual(list, [null]);
  assert.equal(takeOne(content, list, 0), null);
});

void test('a whole stack moves to another list, merging up to twenty and leaving the rest behind', (): void => {
  const bag: ItemList = [thread(1, 8), blade(2)];
  const stash: ItemList = [thread(3, 15), blade(4)];
  assert.equal(moveStack(content, bag, 0, stash), true);
  assert.deepEqual(counts(stash), [SIZE, 1]);
  assert.deepEqual(counts(bag), [3, 1]);
  assert.equal(moveStack(content, bag, 0, stash), false);
  assert.deepEqual(counts(bag), [3, 1]);
  const roomy: ItemList = [null];
  assert.equal(moveStack(content, bag, 0, roomy), true);
  assert.deepEqual(counts(roomy), [3]);
  assert.equal(bag[0], null);
});

void test('separate threads from an old save merge into stacks, keeping the first slot and spilling past twenty', (): void => {
  const list: ItemList = [blade(1), thread(2), null, ...Array.from({ length: 21 }, (_: unknown, index: number): ItemInstance => thread(10 + index))];
  restack(content, list);
  assert.deepEqual(counts(list.slice(0, 3)), [1, SIZE, null]);
  assert.deepEqual(counts(list.filter((item: ItemInstance | null): boolean => item !== null && item.base === THREAD)), [SIZE, 2]);
  assert.equal(list.filter((item: ItemInstance | null): boolean => item !== null).length, 3);
});

void test('a saved count that is missing, zero, negative, fractional, not a number or above the stack size is made whole', (): void => {
  const one: ItemInstance = thread(1);
  assert.equal(countOf(readCount(content, one, undefined)), 1);
  assert.equal(countOf(readCount(content, one, 0)), 1);
  assert.equal(countOf(readCount(content, one, -4)), 1);
  assert.equal(countOf(readCount(content, one, 6.7)), 6);
  assert.equal(countOf(readCount(content, one, '9')), 1);
  assert.equal(countOf(readCount(content, one, Number.NaN)), 1);
  assert.equal(countOf(readCount(content, one, 500)), SIZE);
  assert.equal(countOf(readCount(content, blade(2), 7)), 1);
});

void test('a stacking item that could be worn, rolled or read is a content problem', (): void => {
  const sword: ItemBaseDef = must(content.itemBases.get('rusted_blade'), 'blade');
  const stacked: Content = { ...content, itemBases: new Map([...content.itemBases, ['rusted_blade', { ...sword, stack: 5 }]]) };
  assert.ok(itemProblems(stacked).some((problem: string): boolean => problem.includes('rusted_blade stacks')));
  assert.equal(itemProblems(content).some((problem: string): boolean => problem.includes('stacks')), false);
});

void test('a single take comes from the smallest stack of that item, whichever stack was clicked', (): void => {
  const list: ItemList = [thread(1, SIZE), blade(2), thread(3, 5)];
  assert.equal(must(takeOne(content, list, 0), 'one').uid, 3);
  assert.deepEqual(counts(list), [SIZE, 1, 4]);
  const single: ItemList = [thread(1, SIZE), thread(2, 1)];
  takeOne(content, single, 0);
  assert.deepEqual(counts(single), [SIZE, null]);
});

void test('a take that leaves two stacks that fit in one merges them at once', (): void => {
  const list: ItemList = [thread(1, 12), null, thread(2, 9)];
  takeOne(content, list, 2);
  assert.deepEqual(counts(list), [SIZE, null, null]);
  const split: ItemList = [thread(1, SIZE), thread(2, SIZE), thread(3, 1)];
  takeOne(content, split, 0);
  assert.deepEqual(counts(split), [SIZE, SIZE, null]);
});

void test('a move that leaves two part stacks behind merges them at once', (): void => {
  const bag: ItemList = [thread(1, 8), thread(2, 6)];
  const stash: ItemList = [thread(3, 15), blade(4)];
  assert.equal(moveStack(content, bag, 0, stash), true);
  assert.deepEqual(counts(stash), [SIZE, 1]);
  assert.deepEqual(counts(bag), [9, null]);
});

void test('reading or recounting an unidentified item keeps it unidentified', (): void => {
  const hidden: ItemInstance = { ...must(generateItem(content, createRng(77), 77, 9, 'gale_charm', 'rare'), 'rare'), unidentified: true };
  assert.equal(withCount(hidden, 1).unidentified, true);
  assert.equal(readCount(content, hidden, undefined).unidentified, true);
  const known: ItemInstance = must(generateItem(content, createRng(78), 78, 9, 'gale_charm', 'rare'), 'rare');
  assert.equal('unidentified' in withCount(known, 1), false);
});
