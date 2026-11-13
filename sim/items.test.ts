import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import { heroWears } from './content/item-rules.ts';
import type { AffixDef, ArmourMaterial, Content, ItemBaseDef, ItemSlot, RarityDef, StatId, StatMod } from './content/types.ts';
import { ARMOUR_MATERIALS, ITEM_SLOTS } from './content/types.ts';
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

void test('every rarity with a drop weight turns up over many rolls', (): void => {
  const seen: Set<string> = new Set<string>(rolls(2, 5).map((item: ItemInstance): string => item.rarity));
  const dropping: string[] = content.rarities.filter((rarity: RarityDef): boolean => rarity.weight > 0).map((rarity: RarityDef): string => rarity.id);
  assert.deepEqual([...seen].toSorted(), dropping.toSorted());
  assert.ok(seen.size >= 3);
});

void test('an item never rolls the same stat twice and only affixes valid for its slot', (): void => {
  for (const item of rolls(3, 8)) {
    const stats: string[] = item.affixes.map((rolled): string => affixOf(rolled.affix).stat);
    assert.equal(new Set<string>(stats).size, stats.length);
    const slot = must(slotOf(content, item), 'slot');
    for (const rolled of item.affixes) assert.ok(affixOf(rolled.affix).slots.includes(slot));
  }
});

function withoutPowers(items: readonly ItemInstance[]): ItemInstance[] {
  return items.filter((item: ItemInstance): boolean => must(content.itemBases.get(item.base), item.base).power === null);
}

void test('bases respect their minimum level', (): void => {
  const low: Set<string> = new Set<string>(rolls(4, 1).map((item: ItemInstance): string => item.base));
  for (const id of low) assert.equal(must(content.itemBases.get(id), id).minLevel, 1);
  assert.ok(!low.has('squall_plate'));
  const high: Set<string> = new Set<string>(withoutPowers(rolls(4, 6)).map((item: ItemInstance): string => item.base));
  assert.equal(high.size, [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.dropWeight > 0 && base.power === null).length);
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

void test('line values stay within their range, scaled only by item level', (): void => {
  for (const item of rolls(5, 1)) {
    for (const rolled of item.affixes) {
      const affix: AffixDef = affixOf(rolled.affix);
      const scale: number = 1 + affix.perLevel * (item.level - 1);
      assert.ok(rolled.value >= affix.min * scale - 0.5 && rolled.value <= affix.max * scale + 0.5, `${affix.id} ${rolled.value}`);
    }
  }
});

void test('each rarity rolls its number of lines, and never the same stat twice', (): void => {
  for (const item of rolls(7, 8)) {
    const rarity = rarityOf(content, item);
    assert.ok(item.affixes.length >= rarity.affixMin && item.affixes.length <= rarity.affixMax, `${item.rarity} has ${item.affixes.length}`);
    const stats: string[] = item.affixes.map((rolled): string => affixOf(rolled.affix).stat);
    assert.equal(new Set<string>(stats).size, stats.length);
  }
  const legendary: ItemInstance = must(generateItem(content, createRng(3), 1, 10, 'squall_plate', 'stormtouched'), 'legendary');
  assert.equal(legendary.affixes.length, 3);
});

void test('item level scales the implicit modifiers and rarity does not', (): void => {
  const common: ItemInstance = must(generateItem(content, createRng(1), 1, 1, 'rusted_blade', 'common'), 'common');
  const levelled: ItemInstance = must(generateItem(content, createRng(1), 1, 3, 'rusted_blade', 'common'), 'levelled');
  assert.deepEqual(itemMods(content, common).map((mod) => mod.value), [3, 6, 0.03]);
  assert.deepEqual(itemMods(content, levelled).map((mod) => mod.value), [4, 8, 0.04]);
  assert.deepEqual(itemMods(content, { ...common, rarity: 'rare' }).map((mod) => mod.value), [3, 6, 0.03]);
  assert.equal(baseOf(content, common)?.slot, 'weapon');
  assert.equal(baseOf(content, { ...common, base: 'gone' }), null);
  assert.equal(rarityOf(content, { ...common, rarity: 'gone' }).id, 'unknown');
});

void test('the item name takes one word from its first line in the fixed order', (): void => {
  const plain: ItemInstance = { uid: 1, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null };
  assert.equal(itemName(content, plain), 'Rusted Blade');
  const one: ItemInstance = { ...plain, rarity: 'magic', affixes: [{ affix: 'brimming', value: 9 }] };
  assert.equal(itemName(content, one), 'Brimming Rusted Blade');
  const two: ItemInstance = { ...plain, rarity: 'magic', affixes: [{ affix: 'brimming', value: 9 }, { affix: 'quick', value: 0.06 }] };
  assert.equal(itemName(content, two), 'Quick Rusted Blade');
  assert.equal(itemName(content, { ...plain, base: 'gone' }), 'gone');
});

void test('item lines put the damage range first, then every stat in the fixed order', (): void => {
  const item: ItemInstance = { uid: 1, base: 'stormsteel_sword', rarity: 'rare', level: 1, affixes: [{ affix: 'brimming', value: 8 }, { affix: 'keen', value: 0.03 }, { affix: 'honed', value: 0.07 }], ledger: null };
  const lines: ItemLine[] = itemLines(content, item);
  assert.deepEqual(
    lines.map((line: ItemLine): string => line.text),
    ['5–9 Damage', '+10% Attack Speed', '+3% Critical Strike Chance', '+7% Damage', '+3% Critical Strike Chance', '+8 Maximum Mana'],
  );
  assert.deepEqual(
    lines.map((line: ItemLine): string => line.source),
    ['implicit', 'implicit', 'implicit', 'affix', 'affix', 'affix'],
  );
});

function heroCanFill(slot: ItemSlot): boolean {
  return [...content.itemBases.values()].some((base: ItemBaseDef): boolean => base.slot === slot && base.power === null && heroWears(content, base));
}

void test('every slot the hero can wear something in drops, and the head drops nothing plain while its only models are hoods', (): void => {
  assert.deepEqual(Object.keys(emptyEquipment()).toSorted(), [...ITEM_SLOTS].toSorted());
  const dropped: Set<ItemSlot> = new Set<ItemSlot>(withoutPowers(rolls(6, 6)).map((item: ItemInstance): ItemSlot => must(slotOf(content, item), 'slot')));
  for (const slot of ITEM_SLOTS) assert.equal(dropped.has(slot), heroCanFill(slot), `${slot} drops`);
  assert.ok(!dropped.has('head'));
});

void test('a held weapon shows a model and never wears clothes, and armour is the reverse', (): void => {
  for (const base of content.itemBases.values()) {
    const found: ItemBaseDef = base;
    if (found.slot === 'weapon') assert.deepEqual(found.wear, [], found.id);
    else assert.equal(found.visual, null, found.id);
  }
});

function implicitOf(base: ItemBaseDef, stat: StatId): number {
  return base.implicit.filter((mod: StatMod): boolean => mod.stat === stat).reduce((sum: number, mod: StatMod): number => sum + mod.value, 0);
}

function armourBases(slot: ItemSlot, material: ArmourMaterial): ItemBaseDef[] {
  return [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === slot && base.material === material && base.power === null && base.dropWeight > 0);
}

function tiers(slot: ItemSlot): [ItemBaseDef[], ItemBaseDef[]][] {
  const pairs: [ItemBaseDef[], ItemBaseDef[]][] = [];
  ARMOUR_MATERIALS.forEach((lighter: ArmourMaterial, index: number): void => {
    for (const heavier of ARMOUR_MATERIALS.slice(index + 1)) {
      const light: ItemBaseDef[] = armourBases(slot, lighter);
      const heavy: ItemBaseDef[] = armourBases(slot, heavier);
      if (light.length > 0 && heavy.length > 0) pairs.push([light, heavy]);
    }
  });
  return pairs;
}

void test('in every slot a heavier material gives more armour than a lighter one', (): void => {
  let compared: number = 0;
  for (const slot of ITEM_SLOTS) {
    for (const [light, heavy] of tiers(slot)) {
      const most: number = Math.max(...light.map((base: ItemBaseDef): number => implicitOf(base, 'armour')));
      const least: number = Math.min(...heavy.map((base: ItemBaseDef): number => implicitOf(base, 'armour')));
      assert.ok(least > most, `${slot}: ${heavy[0]?.material ?? ''} ${least} against ${light[0]?.material ?? ''} ${most}`);
      compared += 1;
    }
  }
  assert.ok(compared >= 6);
  const chest: ArmourMaterial[] = ARMOUR_MATERIALS.filter((material: ArmourMaterial): boolean => armourBases('chest', material).length > 0);
  assert.deepEqual(chest, [...ARMOUR_MATERIALS]);
});

void test('heavier materials turn up later and less often', (): void => {
  for (const slot of ITEM_SLOTS) {
    for (const [light, heavy] of tiers(slot)) {
      const firstLight: number = Math.min(...light.map((base: ItemBaseDef): number => base.minLevel));
      const firstHeavy: number = Math.min(...heavy.map((base: ItemBaseDef): number => base.minLevel));
      assert.ok(firstHeavy > firstLight, `${slot} level`);
      const commonLight: number = Math.max(...light.map((base: ItemBaseDef): number => base.dropWeight));
      const commonHeavy: number = Math.max(...heavy.map((base: ItemBaseDef): number => base.dropWeight));
      assert.ok(commonHeavy < commonLight, `${slot} weight`);
    }
  }
});

void test('each material has its own trade-off', (): void => {
  for (const base of content.itemBases.values()) {
    const slows: boolean = implicitOf(base, 'moveSpeed') < 0 || implicitOf(base, 'attackSpeed') < 0;
    switch (base.material) {
      case 'cloth':
        assert.ok(implicitOf(base, 'maxMana') > 0, `${base.id} gives mana`);
        assert.ok(!slows, base.id);
        break;
      case 'leather':
        assert.ok(!slows, base.id);
        break;
      case 'mail':
      case 'plate':
        assert.ok(slows, `${base.id} slows its wearer`);
        assert.ok(implicitOf(base, 'maxLife') > 0, `${base.id} gives life`);
        break;
      case null:
        assert.ok(base.slot === 'weapon' || base.slot === 'charm' || base.book !== null, base.id);
        break;
    }
  }
});

function bonusStats(base: ItemBaseDef): string {
  return base.implicit
    .filter((mod: StatMod): boolean => mod.stat !== 'damageMin' && mod.stat !== 'damageMax')
    .map((mod: StatMod): string => mod.stat)
    .toSorted()
    .join('+');
}

void test('no two weapons hit the same way', (): void => {
  const weapons: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon' && base.power === null);
  assert.ok(weapons.length >= 4);
  assert.equal(new Set<string>(weapons.map(bonusStats)).size, weapons.length);
  const hits: number[] = weapons.map((base: ItemBaseDef): number => (implicitOf(base, 'damageMin') + implicitOf(base, 'damageMax')) / 2);
  assert.equal(new Set<number>(hits).size, weapons.length);
  for (const base of weapons) {
    assert.ok(implicitOf(base, 'damageMax') > implicitOf(base, 'damageMin'), base.id);
    assert.ok(bonusStats(base).length > 0, `${base.id} has a bonus besides damage`);
  }
});

void test('the Legendary rarity rolls only bases with a power, and no other rarity ever does', (): void => {
  const generous: Content = { ...content, rarities: content.rarities.map((rarity: RarityDef): RarityDef => (rarity.powers ? { ...rarity, weight: 40 } : rarity)) };
  const rng: Rng = createRng(11);
  let powered: number = 0;
  for (let uid: number = 0; uid < 400; uid += 1) {
    const made: ItemInstance = must(generateItem(generous, rng, uid, 6, null, null), 'roll');
    const base: ItemBaseDef = must(generous.itemBases.get(made.base), made.base);
    assert.equal(base.power !== null, made.rarity === 'stormtouched', made.base);
    if (base.power !== null) powered += 1;
  }
  assert.ok(powered > 40);
});

void test('a Legendary turns up at random, but rarely', (): void => {
  const found: number = rolls(12, 6).filter((item: ItemInstance): boolean => rarityOf(content, item).powers).length;
  assert.ok(found > 0);
  assert.ok(found / ROLLS < 0.03, `${found} Legendaries in ${ROLLS}`);
});

void test('a Legendary roll with no powered base in reach comes out as the top plain rarity', (): void => {
  const out: Content = {
    ...content,
    itemBases: new Map<string, ItemBaseDef>([...content.itemBases].map(([id, base]: [string, ItemBaseDef]): [string, ItemBaseDef] => [id, base.power === null ? base : { ...base, minLevel: 99 }])),
  };
  const made: ItemInstance = must(generateItem(out, createRng(4), 1, 5, null, 'stormtouched'), 'roll');
  assert.equal(made.rarity, 'rare');
  assert.equal(must(out.itemBases.get(made.base), made.base).power, null);
});

void test('a Legendary keeps its own name whatever lines it rolled', (): void => {
  const mill: ItemInstance = { uid: 1, base: 'the_millwheel', rarity: 'stormtouched', level: 9, affixes: [{ affix: 'honed', value: 0.2 }], ledger: null };
  assert.equal(itemName(content, mill), 'The Millwheel');
});
