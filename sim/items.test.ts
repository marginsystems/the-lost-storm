import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
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
  const weighted: string[] = content.rarities.filter((rarity: RarityDef): boolean => rarity.weight > 0).map((rarity: RarityDef): string => rarity.id);
  assert.deepEqual([...seen].filter((id: string): boolean => id !== 'unique').toSorted(), weighted.toSorted());
  assert.equal(weighted.length, 4);
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
  const high: Set<string> = new Set<string>(rolls(4, 10).map((item: ItemInstance): string => item.base));
  for (const id of high) {
    const base: ItemBaseDef = must(content.itemBases.get(id), id);
    assert.ok(base.minLevel <= 10 && base.maxLevel >= 10, id);
  }
  const open: number = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.dropWeight > 0 && base.minLevel <= 10 && base.maxLevel >= 10).length;
  assert.equal([...high].filter((id: string): boolean => must(content.itemBases.get(id), id).uniqueWeight === 0).length, open);
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
  assert.deepEqual(itemMods(content, common).map((mod) => mod.value), [3, 6, 0.03]);
  assert.deepEqual(itemMods(content, levelled).map((mod) => mod.value), [4, 8, 0.04]);
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
    ['5–9 Damage', '+10% Attack Speed', '+3% Critical Strike Chance', '+5% Critical Strike Chance'],
  );
  assert.deepEqual(
    lines.map((line: ItemLine): string => line.source),
    ['implicit', 'implicit', 'implicit', 'affix'],
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
    if (found.slot === 'weapon' || found.slot === 'offhand') assert.deepEqual(found.wear, [], found.id);
    else assert.equal(found.visual, null, found.id);
  }
});

function implicitOf(base: ItemBaseDef, stat: StatId): number {
  return base.implicit.filter((mod: StatMod): boolean => mod.stat === stat).reduce((sum: number, mod: StatMod): number => sum + mod.value, 0);
}

function armourBases(slot: ItemSlot, material: ArmourMaterial): ItemBaseDef[] {
  return [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === slot && base.material === material && base.uniqueWeight === 0);
}

function overlaps(first: ItemBaseDef, second: ItemBaseDef): boolean {
  return first.minLevel <= second.maxLevel && second.minLevel <= first.maxLevel;
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
      for (const lighter of light.filter((base: ItemBaseDef): boolean => base.uniqueWeight === 0)) {
        for (const heavier of heavy.filter((base: ItemBaseDef): boolean => base.uniqueWeight === 0 && overlaps(base, lighter))) {
          assert.ok(implicitOf(heavier, 'armour') > implicitOf(lighter, 'armour'), `${slot}: ${heavier.id} against ${lighter.id}`);
          compared += 1;
        }
      }
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
  for (const base of [...content.itemBases.values()].filter((entry: ItemBaseDef): boolean => entry.uniqueWeight === 0)) {
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
        assert.ok(base.slot === 'weapon' || base.slot === 'charm' || base.slot === 'offhand' || base.slot === 'ring' || base.slot === 'amulet' || base.book !== null, base.id);
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
  const weapons: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon' && base.uniqueWeight === 0);
  assert.ok(weapons.length >= 4);
  assert.ok(new Set<string>(weapons.map(bonusStats)).size >= 5);
  const hits: number[] = weapons.map((base: ItemBaseDef): number => (implicitOf(base, 'damageMin') + implicitOf(base, 'damageMax')) / 2);
  assert.equal(new Set<number>(hits).size, weapons.length);
  for (const base of weapons) {
    assert.ok(implicitOf(base, 'damageMax') > implicitOf(base, 'damageMin'), base.id);
    assert.ok(bonusStats(base).length > 0, `${base.id} has a bonus besides damage`);
  }
});

const POWER_WEIGHTS: Readonly<Record<StatId, number>> = {
  maxLife: 1,
  maxMana: 0.5,
  lifeRegen: 12,
  manaRegen: 6,
  damageMin: 8,
  damageMax: 8,
  damagePercent: 150,
  attackSpeed: 200,
  critChance: 300,
  critMultiplier: 80,
  moveSpeed: 250,
  armour: 1.5,
  goldFind: 30,
  itemFind: 40,
  lightningDamage: 120,
  thunderDamage: 120,
  meleeDamage: 120,
  flaskCharges: 40,
  dodgeCooldown: -80,
  lifeOnKill: 8,
  manaOnKill: 4,
  skillRepeat: 250,
};

function power(item: ItemInstance): number {
  return itemMods(content, item).reduce((sum: number, mod: StatMod): number => sum + mod.value * POWER_WEIGHTS[mod.stat], 0);
}

function averagePower(seed: number, level: number, count: number): number {
  const rng: Rng = createRng(seed);
  let total: number = 0;
  for (let index: number = 0; index < count; index += 1) total += power(must(generateItem(content, rng, index, level, null, null), 'item'));
  return total / count;
}

const BANDS: readonly (readonly [number, number])[] = [[1, 4], [5, 9], [10, 14], [15, 19], [20, 30]];

void test('rarity rates hold in every level band', (): void => {
  const weights: RarityDef[] = content.rarities.filter((rarity: RarityDef): boolean => rarity.weight > 0);
  const total: number = weights.reduce((sum: number, rarity: RarityDef): number => sum + rarity.weight, 0);
  for (const [low, high] of BANDS) {
    const counts: Map<string, number> = new Map<string, number>();
    const rng: Rng = createRng(low);
    const count: number = 6000;
    for (let index: number = 0; index < count; index += 1) {
      const item: ItemInstance = must(generateItem(content, rng, index, rng.int(low, high), null, null), 'item');
      counts.set(item.rarity, (counts.get(item.rarity) ?? 0) + 1);
    }
    for (const rarity of weights) {
      const expected: number = rarity.weight / total;
      const seen: number = (counts.get(rarity.id) ?? 0) / count;
      assert.ok(Math.abs(seen - expected) < Math.max(0.012, expected * 0.3), `${rarity.id} in ${low}-${high}: ${seen} against ${expected}`);
    }
    const uniques: number = (counts.get('unique') ?? 0) / count;
    assert.ok(uniques < 0.03, `uniques in ${low}-${high}: ${uniques}`);
  }
});

void test('average item power rises smoothly with the level it drops at', (): void => {
  const levels: number[] = Array.from({ length: 30 }, (_: unknown, index: number): number => index + 1);
  const averages: number[] = levels.map((level: number): number => averagePower(level, level, 3000));
  for (let index: number = 1; index < averages.length; index += 1) {
    const before: number = must(averages[index - 1], 'before');
    const after: number = must(averages[index], 'after');
    assert.ok(after > before * 0.93, `level ${index + 1} dropped from ${before} to ${after}`);
    assert.ok(after < before * 1.35, `level ${index + 1} jumped from ${before} to ${after}`);
  }
  for (let index: number = 5; index < averages.length; index += 1) assert.ok(must(averages[index], 'later') > must(averages[index - 5], 'earlier'), `level ${index + 1}`);
  assert.ok(must(averages[29], 'last') > must(averages[0], 'first') * 4);
});

void test('no affix is dead: each one rolls on some drop at a level inside its window', (): void => {
  const seen: Set<string> = new Set<string>();
  const rng: Rng = createRng(77);
  for (let level: number = 1; level <= 30; level += 1) {
    for (let index: number = 0; index < 2500; index += 1) {
      const item: ItemInstance = must(generateItem(content, rng, index, level, null, index % 2 === 0 ? 'stormtouched' : 'rare'), 'item');
      for (const rolled of item.affixes) {
        const affix: AffixDef = affixOf(rolled.affix);
        assert.ok(affix.minLevel <= level, `${affix.id} rolled at ${level}`);
        seen.add(rolled.affix);
      }
    }
  }
  for (const affix of content.affixes.values()) assert.ok(seen.has(affix.id), `${affix.id} never rolled`);
});

void test('rares roll a sensible mix: no repeated family, no lopsided groups or positions', (): void => {
  const rng: Rng = createRng(5);
  const groups: Set<string> = new Set<string>();
  for (let index: number = 0; index < 6000; index += 1) {
    const rarity: string = index % 2 === 0 ? 'rare' : 'stormtouched';
    const item: ItemInstance = must(generateItem(content, rng, index, 1 + (index % 30), null, rarity), 'item');
    const defs: AffixDef[] = item.affixes.map((rolled): AffixDef => affixOf(rolled.affix));
    assert.equal(new Set<string>(defs.map((affix: AffixDef): string => affix.family)).size, defs.length);
    const limit: number = rarityOf(content, item).maxPerGroup;
    for (const group of ['offence', 'defence', 'utility']) assert.ok(defs.filter((affix: AffixDef): boolean => affix.group === group).length <= limit, `${group} on ${item.base}`);
    for (const position of ['prefix', 'suffix']) assert.ok(defs.filter((affix: AffixDef): boolean => affix.position === position).length <= content.itemScaling.maxPerPosition);
    for (const affix of defs) groups.add(affix.group);
    if (defs.length >= 2) assert.ok(defs.some((affix: AffixDef): boolean => affix.position === 'prefix') && defs.some((affix: AffixDef): boolean => affix.position === 'suffix'));
  }
  assert.equal(groups.size, 3);
});

void test('every unique drops on its own, fixed, with no rolled affixes', (): void => {
  const uniques: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.uniqueWeight > 0);
  assert.ok(uniques.length >= 12 && uniques.length <= 15);
  for (const base of uniques) {
    assert.equal(base.dropWeight, 0, base.id);
    assert.ok(base.flavour !== null && base.flavour.length > 0, base.id);
    const low: ItemInstance = must(generateItem(content, createRng(1), 1, 30, base.id, null), base.id);
    const high: ItemInstance = must(generateItem(content, createRng(1), 1, 30, base.id, null), base.id);
    assert.equal(low.rarity, 'unique');
    assert.equal(low.affixes.length, 0);
    assert.deepEqual(itemMods(content, low), itemMods(content, high));
    const early: ItemInstance = must(generateItem(content, createRng(1), 1, base.minLevel, base.id, null), base.id);
    assert.deepEqual(itemMods(content, early), itemMods(content, low), base.id);
  }
  const rng: Rng = createRng(11);
  const dropped: Set<string> = new Set<string>();
  for (let index: number = 0; index < 40000; index += 1) {
    const item: ItemInstance = must(generateItem(content, rng, index, 25, null, null, 0), 'item');
    if (item.rarity === 'unique') dropped.add(item.base);
  }
  assert.equal(dropped.size, uniques.length);
});

function uncommonRate(find: number): number {
  const rolled: Rng = createRng(8);
  let better: number = 0;
  for (let index: number = 0; index < 8000; index += 1) if (must(generateItem(content, rolled, index, 10, null, null, find), 'item').rarity !== 'common') better += 1;
  return better / 8000;
}

void test('uniques only drop from their minimum level and item find raises the rarity rate', (): void => {
  const rng: Rng = createRng(3);
  for (let index: number = 0; index < 20000; index += 1) {
    const item: ItemInstance = must(generateItem(content, rng, index, 4, null, null), 'item');
    if (item.rarity === 'unique') assert.ok(must(content.itemBases.get(item.base), item.base).minLevel <= 4);
  }
  assert.ok(uncommonRate(1) > uncommonRate(0) * 1.3);
});
