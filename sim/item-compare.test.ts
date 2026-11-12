import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { compareItems } from './item-compare.ts';
import type { StatDifference } from './item-compare.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();

function roll(uid: number, level: number, base: string, rarity: string): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, level, base, rarity), 'item');
}

function firstBase(slot: string): string {
  return must([...content.itemBases.values()].find((base): boolean => base.slot === slot), slot).id;
}

void test('an item compared with nothing equipped is all gain', (): void => {
  const item: ItemInstance = roll(1, 10, firstBase('chest'), 'rare');
  const differences: StatDifference[] = compareItems(content, item, null);
  assert.ok(differences.length > 0);
  assert.ok(differences.every((difference: StatDifference): boolean => difference.better));
});

void test('an item compared with itself differs in nothing', (): void => {
  const item: ItemInstance = roll(2, 10, firstBase('head'), 'magic');
  assert.deepEqual(compareItems(content, item, item), []);
});

void test('a higher level copy of a base is better and the reverse is worse by the same amount', (): void => {
  const base: string = firstBase('chest');
  const low: ItemInstance = roll(3, 1, base, 'common');
  const high: ItemInstance = roll(3, 20, base, 'common');
  const up: StatDifference[] = compareItems(content, high, low);
  const down: StatDifference[] = compareItems(content, low, high);
  assert.ok(up.length > 0);
  assert.ok(up.every((difference: StatDifference): boolean => difference.better));
  assert.ok(down.every((difference: StatDifference): boolean => !difference.better));
  assert.deepEqual(
    up.map((difference: StatDifference): number => difference.delta),
    down.map((difference: StatDifference): number => -difference.delta),
  );
});

void test('a stat only the equipped item has shows as a loss', (): void => {
  const bare: ItemInstance = { ...roll(4, 10, firstBase('weapon'), 'common'), affixes: [] };
  const rolled: ItemInstance = roll(5, 10, firstBase('weapon'), 'rare');
  const losses: StatDifference[] = compareItems(content, bare, rolled);
  assert.ok(losses.some((difference: StatDifference): boolean => !difference.better && difference.text.startsWith('-')));
});
