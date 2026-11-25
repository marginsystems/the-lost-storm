import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import { familyPieces } from './content/power-rules.ts';
import type { AffixDef, Content, ItemBaseDef } from './content/types.ts';
import { isUnidentified, revealed, veiled } from './identify.ts';
import { baseOf, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import type { Rng } from './rng.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const ACT_TWO: { readonly firstLevel: number; readonly topLevel: number; readonly families: readonly string[] } = { firstLevel: 31, topLevel: 50, families: ['unbroken_wheel', 'hillfall', 'tumbler', 'fencewright'] };
const ROLLS: number = 3000;

function rolled(seed: number, level: number, rarity: string | null): ItemInstance[] {
  const rng: Rng = createRng(seed);
  return Array.from({ length: ROLLS }, (_: unknown, index: number): ItemInstance => must(generateItem(content, rng, index, level, null, rarity), 'item'));
}

function familyOf(item: ItemInstance): string | null {
  return baseOf(content, item)?.power?.family ?? null;
}

function lateLines(): readonly AffixDef[] {
  return [...content.affixes.values()].filter((affix: AffixDef): boolean => affix.minLevel > 1);
}

void test('the stronger lines of the second act wait for their level, then turn up', (): void => {
  const late: readonly AffixDef[] = lateLines();
  assert.ok(late.length >= 6);
  for (const affix of late) assert.equal(affix.minLevel, ACT_TWO.firstLevel, affix.id);
  const lateIds: ReadonlySet<string> = new Set<string>(late.map((affix: AffixDef): string => affix.id));
  const before: ItemInstance[] = rolled(1, ACT_TWO.firstLevel - 1, 'rare');
  assert.deepEqual(before.flatMap((item: ItemInstance): string[] => item.affixes.map((line): string => line.affix)).filter((id: string): boolean => lateIds.has(id)), []);
  const after: ReadonlySet<string> = new Set<string>(rolled(2, ACT_TWO.topLevel, 'rare').flatMap((item: ItemInstance): string[] => item.affixes.map((line): string => line.affix)));
  for (const id of lateIds) assert.ok(after.has(id), `${id} rolls at level ${ACT_TWO.topLevel}`);
});

void test('a stronger line rolls from a higher floor than the line it stands beside', (): void => {
  for (const affix of lateLines()) {
    const early: AffixDef | undefined = [...content.affixes.values()].find((other: AffixDef): boolean => other.minLevel === 1 && other.stat === affix.stat && other.op === affix.op);
    assert.ok(early !== undefined, affix.id);
    assert.ok(affix.min > early.min && affix.max > early.max, `${affix.id} against ${early.id}`);
  }
});

void test('each build of the second act has a Legendary family of two pieces, a weapon among them, that drops only in the second act', (): void => {
  for (const family of ACT_TWO.families) {
    const pieces: readonly ItemBaseDef[] = familyPieces(content, family);
    assert.equal(pieces.length, 2, family);
    assert.ok(pieces.some((base: ItemBaseDef): boolean => base.slot === 'weapon'), family);
    for (const base of pieces) assert.ok(base.minLevel >= ACT_TWO.firstLevel && base.dropWeight > 0, base.id);
  }
  const families: ReadonlySet<string> = new Set<string>(ACT_TWO.families);
  const early: readonly (string | null)[] = rolled(3, ACT_TWO.firstLevel - 1, 'stormtouched').map(familyOf);
  assert.ok(!early.some((family: string | null): boolean => family !== null && families.has(family)));
  const late: ReadonlySet<string | null> = new Set<string | null>(rolled(4, ACT_TWO.topLevel, 'stormtouched').map(familyOf));
  for (const family of ACT_TWO.families) assert.ok(late.has(family), `${family} drops at level ${ACT_TWO.topLevel}`);
});

void test('a Legendary of the second act drops unidentified and comes back with its power and every line it rolled', (): void => {
  for (const family of ACT_TWO.families) {
    for (const base of familyPieces(content, family)) {
      const item: ItemInstance = must(generateItem(content, createRng(base.id.length), 7, ACT_TWO.topLevel, base.id, 'stormtouched'), base.id);
      const hidden: ItemInstance = veiled(content, item);
      assert.ok(isUnidentified(hidden), base.id);
      assert.deepEqual(revealed(hidden), item);
      assert.equal(baseOf(content, revealed(hidden))?.power?.family, family);
    }
  }
});
