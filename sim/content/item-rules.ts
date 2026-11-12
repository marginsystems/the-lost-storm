import type { AffixDef, ItemBaseDef } from './item-types.ts';
import { ITEM_STATS } from './item-types.ts';
import type { Content, ItemSlot, StatId } from './types.ts';
import { ITEM_SLOTS } from './types.ts';

const BASE_DAMAGE: ReadonlySet<StatId> = new Set<StatId>(['damageMin', 'damageMax']);
const ITEM_STAT_SET: ReadonlySet<StatId> = new Set<StatId>(ITEM_STATS);

export function linesFor(content: Content, slot: ItemSlot): readonly AffixDef[] {
  return [...content.affixes.values()].filter((affix: AffixDef): boolean => affix.slots.includes(slot));
}

function distinctStats(lines: readonly AffixDef[]): number {
  return new Set<StatId>(lines.map((line: AffixDef): StatId => line.stat)).size;
}

const WORN_LOOK_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>(['head', 'chest', 'hands', 'legs', 'feet']);

export function basesWithoutLook(content: Content): string[] {
  return [...content.itemBases.values()]
    .filter((base: ItemBaseDef): boolean => {
      if (base.slot === null) return false;
      if (base.slot === 'weapon') return base.visual === null;
      return WORN_LOOK_SLOTS.has(base.slot) && base.wear.length === 0;
    })
    .map((base: ItemBaseDef): string => base.id);
}

export function itemProblems(content: Content): string[] {
  const problems: string[] = basesWithoutLook(content).map((id: string): string => `item ${id} has no look: give it a wear or a visual`);
  for (const base of content.itemBases.values()) {
    for (const id of base.wear) {
      const region: string | undefined = content.wearables.get(id)?.region;
      if (region !== undefined && region !== base.slot) problems.push(`item ${base.id} in slot ${base.slot ?? 'none'} wears ${id}, which covers ${region}`);
    }
  }
  for (const base of content.itemBases.values()) {
    for (const mod of base.implicit) {
      if (!ITEM_STAT_SET.has(mod.stat) && !BASE_DAMAGE.has(mod.stat)) problems.push(`item ${base.id} has ${mod.stat}, which is not one of the item stats`);
    }
  }
  for (const affix of content.affixes.values()) {
    if (affix.min > affix.max) problems.push(`line ${affix.id} rolls from ${affix.min} down to ${affix.max}`);
  }
  const dropped: readonly ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.dropWeight > 0 && base.slot !== null);
  for (const slot of ITEM_SLOTS) {
    if (!dropped.some((base: ItemBaseDef): boolean => base.slot === slot)) continue;
    const available: number = distinctStats(linesFor(content, slot));
    for (const rarity of content.rarities) {
      if (rarity.affixMin > rarity.affixMax) problems.push(`rarity ${rarity.id} wants at least ${rarity.affixMin} lines but at most ${rarity.affixMax}`);
      if (rarity.affixMax > available) problems.push(`rarity ${rarity.id} wants ${rarity.affixMax} lines but a ${slot} can roll only ${available}`);
    }
  }
  return problems;
}
