import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { AffixDef, Content, ItemBaseDef, ItemSlot, RarityDef } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { baseOf, emptyEquipment, generateItem, itemLines, itemMods, itemName, rarityOf, slotOf } from './items.ts';
import type { ItemLine } from './items.ts';
import { createRng } from './rng.ts';
import type { Rng } from './rng.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const ROLLS: number = 4000;

function rolls(seed: number, level: number): ItemInstance[] {
  const rng: Rng = createRng(seed);
  return Array.from({ length: ROLLS }, (_: unknown, index: number): ItemInstance => must(generateItem(content, rng, index, level, null, null), 'item'));
}

function affixOf(id: string): AffixDef {
  return must(content.affixes.get(id), id);
}

void test('rarity decides how many affixes an item gets', (): void => {
  for (const item of rolls(1, 5)) {
    const rarity: RarityDef = rarityOf(content, item);
    assert.ok(item.affixes.length >= rarity.affixMin && item.affixes.length <= rarity.affixMax, `${rarity.id} has ${item.affixes.length}`);
  }
});

void test('all four rarities turn up over many rolls', (): void => {
  const seen: Set<string> = new Set<string>(rolls(2, 5).map((item: ItemInstance): string => item.rarity));
  assert.deepEqual([...seen].toSorted(), content.rarities.map((rarity: RarityDef): string => rarity.id).toSorted());
  assert.equal(seen.size, 4);
});

void test('an item never rolls the same stat twice and only affixes valid for its slot', (): void => {
  for (const item of rolls(3, 8)) {
    const stats: string[] = item.affixes.map((rolled): string => affixOf(rolled.affix).stat);
    assert.equal(new Set<string>(stats).size, stats.length);
    const slot = must(slotOf(content, item), 'slot');
    for (const rolled of item.affixes) assert.ok(affixOf(rolled.affix).slots.includes(slot));
  }
});

void test('bases respect their minimum level', (): void => {
  const low: Set<string> = new Set<string>(rolls(4, 1).map((item: ItemInstance): string => item.base));
  for (const id of low) assert.equal(must(content.itemBases.get(id), id).minLevel, 1);
  assert.ok(!low.has('squall_plate'));
  const high: Set<string> = new Set<string>(rolls(4, 5).map((item: ItemInstance): string => item.base));
  assert.equal(high.size, content.itemBases.size);
});

void test('generation is deterministic for a seed and honours forced choices', (): void => {
  assert.deepEqual(rolls(9, 3).slice(0, 50), rolls(9, 3).slice(0, 50));
  const forced: ItemInstance = must(generateItem(content, createRng(1), 12, 4, 'gale_charm', 'rare'), 'forced');
  assert.equal(forced.base, 'gale_charm');
  assert.equal(forced.rarity, 'rare');
  assert.equal(forced.uid, 12);
  assert.equal(forced.level, 4);
  assert.equal(generateItem(content, createRng(1), 1, 1, 'missing_base', null), null);
  assert.equal(generateItem(content, createRng(1), 1, 1, null, 'missing_rarity'), null);
});

void test('affix values stay within their scaled range', (): void => {
  for (const item of rolls(5, 1)) {
    const scale: number = rarityOf(content, item).statScale;
    for (const rolled of item.affixes) {
      const affix: AffixDef = affixOf(rolled.affix);
      assert.ok(rolled.value >= affix.min * scale - 0.5 && rolled.value <= affix.max * scale + 0.5, `${affix.id} ${rolled.value}`);
    }
  }
});

void test('item level and rarity scale the implicit modifiers', (): void => {
  const common: ItemInstance = must(generateItem(content, createRng(1), 1, 1, 'rusted_blade', 'common'), 'common');
  const levelled: ItemInstance = must(generateItem(content, createRng(1), 1, 3, 'rusted_blade', 'common'), 'levelled');
  assert.deepEqual(itemMods(content, common).map((mod) => mod.value), [3, 6]);
  assert.deepEqual(itemMods(content, levelled).map((mod) => mod.value), [4, 8]);
  assert.equal(baseOf(content, common)?.slot, 'weapon');
  assert.equal(baseOf(content, { ...common, base: 'gone' }), null);
  assert.equal(rarityOf(content, { ...common, rarity: 'gone' }).id, 'unknown');
});

void test('the item name carries its prefix and suffix', (): void => {
  const plain: ItemInstance = { uid: 1, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [] };
  assert.equal(itemName(content, plain), 'Rusted Blade');
  const prefixed: ItemInstance = { ...plain, affixes: [{ affix: 'jagged', value: 3 }] };
  assert.equal(itemName(content, prefixed), 'Jagged Rusted Blade');
  const both: ItemInstance = { ...plain, rarity: 'magic', affixes: [{ affix: 'of_haste', value: 0.06 }, { affix: 'jagged', value: 3 }] };
  assert.equal(itemName(content, both), 'Jagged Rusted Blade of Haste');
  assert.equal(itemName(content, { ...plain, base: 'gone' }), 'gone');
});

void test('item lines merge the weapon damage range and list affixes separately', (): void => {
  const item: ItemInstance = { uid: 1, base: 'stormsteel_sword', rarity: 'common', level: 1, affixes: [{ affix: 'of_precision', value: 0.05 }] };
  const lines: ItemLine[] = itemLines(content, item);
  assert.deepEqual(
    lines.map((line: ItemLine): string => line.text),
    ['5–9 Damage', '+10% Attack Speed', '+5% Critical Strike Chance'],
  );
  assert.deepEqual(
    lines.map((line: ItemLine): string => line.source),
    ['implicit', 'implicit', 'affix'],
  );
});

void test('every slot has a base that drops and affixes that can roll on it', (): void => {
  assert.deepEqual(Object.keys(emptyEquipment()).toSorted(), [...ITEM_SLOTS].toSorted());
  const dropped: Set<ItemSlot> = new Set<ItemSlot>(rolls(6, 6).map((item: ItemInstance): ItemSlot => must(slotOf(content, item), 'slot')));
  for (const slot of ITEM_SLOTS) {
    assert.ok(dropped.has(slot), `${slot} drops`);
    const prefixes: AffixDef[] = [...content.affixes.values()].filter((affix: AffixDef): boolean => affix.slots.includes(slot) && affix.position === 'prefix');
    const suffixes: AffixDef[] = [...content.affixes.values()].filter((affix: AffixDef): boolean => affix.slots.includes(slot) && affix.position === 'suffix');
    assert.ok(prefixes.length >= 1 && suffixes.length >= 1, `${slot} affixes`);
  }
});

void test('a held weapon shows a model and never wears clothes, and armour is the reverse', (): void => {
  for (const base of content.itemBases.values()) {
    const found: ItemBaseDef = base;
    if (found.slot === 'weapon') assert.deepEqual(found.wear, [], found.id);
    else assert.equal(found.visual, null, found.id);
  }
});
