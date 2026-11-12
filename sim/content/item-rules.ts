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

export function itemProblems(content: Content): string[] {
  const problems: string[] = [];
  for (const base of content.itemBases.values()) {
    for (const mod of base.implicit) {
      if (!ITEM_STAT_SET.has(mod.stat) && !BASE_DAMAGE.has(mod.stat)) problems.push(`item ${base.id} has ${mod.stat}, which is not one of the item stats`);
    }
  }
  for (const affix of content.affixes.values()) {
    if (affix.min > affix.max) problems.push(`line ${affix.id} rolls from ${affix.min} down to ${affix.max}`);
  }
  for (const base of content.itemBases.values()) {
    if (base.ground.model === 'held' && (base.visual === null || !content.attachments.has(base.visual))) problems.push(`item ${base.id} lies on the ground as its held model but has no attachment`);
    if (base.ground.model === 'worn' && !base.wear.some((id: string): boolean => content.wearables.has(id))) problems.push(`item ${base.id} lies on the ground as its worn model but has no wearable`);
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

export function groundGenerics(content: Content): readonly string[] {
  return [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot !== null && (base.ground.model === 'bundle' || base.ground.model === 'pouch')).map((base: ItemBaseDef): string => base.id);
}
