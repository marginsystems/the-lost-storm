import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { toSave } from '../save.ts';
import type { SaveData } from '../save.ts';
import { createWorld } from './create.ts';
import { mergeStashes } from './shared-stash.ts';
import type { GroundItem, ItemInstance, World } from './types.ts';

const content: Content = loadContent();

function gear(uid: number, ledger: string | null = null): ItemInstance {
  const base: string | undefined = [...content.itemBases.values()].find((candidate): boolean => candidate.slot !== null)?.id;
  const rarity: string | undefined = content.rarities[0]?.id;
  assert.ok(base !== undefined && rarity !== undefined);
  const item: ItemInstance | null = generateItem(content, createRng(uid), uid, 1, base, rarity);
  assert.ok(item !== null);
  return { ...item, ledger };
}

function uidsOf(items: readonly (ItemInstance | null)[]): readonly (number | null)[] {
  return items.map((item: ItemInstance | null): number | null => item?.uid ?? null);
}

function everyUid(world: World): readonly number[] {
  const save: SaveData = toSave(world);
  const placed: readonly (ItemInstance | null)[] = [...Object.values(save.equipped), ...save.inventory, ...save.stash, ...save.spilled];
  return placed.flatMap((item: ItemInstance | null): number[] => (item === null ? [] : [item.uid]));
}

void test('merging keeps the first stash as it lies, fills its gaps with the others and then runs past its end', (): void => {
  assert.deepEqual(uidsOf(mergeStashes([[gear(1), null, gear(2)], [gear(3), gear(4)], [gear(5)]])), [1, 3, 2, 4, 5]);
});

void test('merging drops a second copy of one ledger item and keeps items with no ledger', (): void => {
  assert.deepEqual(uidsOf(mergeStashes([[gear(1, 'itm_a'), null, null], [gear(2, 'itm_a'), gear(3), gear(4, 'itm_b')]])), [1, 3, 4]);
});

void test('merging nothing is an empty stash', (): void => {
  assert.deepEqual(mergeStashes([]), []);
});

void test('a fresh character is laid the shared stash, each item under a uid no other item in the world uses', (): void => {
  const shared: (ItemInstance | null)[] = [gear(1), null, gear(2)];
  const world: World = createWorld(content, { seed: 3, save: null, stash: shared });
  assert.equal(world.stash.length, content.trade.stashSize);
  assert.deepEqual(world.stash.slice(0, 3).map((item: ItemInstance | null): string | null => item?.base ?? null), [shared[0]?.base ?? null, null, shared[2]?.base ?? null]);
  const uids: readonly number[] = everyUid(world);
  assert.equal(new Set(uids).size, uids.length);
  assert.ok(uids.every((uid: number): boolean => uid < world.nextItemUid));
});

void test('the shared stash replaces the stash a save carries', (): void => {
  const own: SaveData = toSave(createWorld(content, { seed: 4, save: null, stash: [gear(9)] }));
  const world: World = createWorld(content, { seed: 4, save: own, stash: [null, gear(8)] });
  assert.equal(world.stash[0], null);
  assert.equal(world.stash[1]?.base, gear(8).base);
});

void test('with no shared stash the save keeps its own', (): void => {
  const own: SaveData = toSave(createWorld(content, { seed: 5, save: null, stash: [gear(9)] }));
  const world: World = createWorld(content, { seed: 5, save: own, stash: null });
  assert.equal(world.stash[0]?.base, gear(9).base);
});

void test('what does not fit in the stash lies kept beside the character and is saved with it', (): void => {
  const many: ItemInstance[] = Array.from({ length: content.trade.stashSize + 2 }, (_: unknown, index: number): ItemInstance => gear(index + 1, `itm_${String(index).padStart(22, 'x')}`));
  const world: World = createWorld(content, { seed: 6, save: null, stash: many });
  assert.ok(world.stash.every((item: ItemInstance | null): boolean => item !== null));
  const kept: readonly GroundItem[] = world.ground.filter((ground: GroundItem): boolean => ground.kept && ground.content.kind === 'item' && ground.content.item.ledger !== null);
  assert.equal(kept.length, 2);
  const saved: SaveData = toSave(world);
  const ledgers: ReadonlySet<string | null> = new Set([...saved.stash, ...saved.spilled].map((item: ItemInstance | null): string | null => item?.ledger ?? null));
  assert.ok(many.every((item: ItemInstance): boolean => ledgers.has(item.ledger)));
});
