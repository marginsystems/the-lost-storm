import type { AffixDef, ItemBaseDef, RarityDef } from './item-types.ts';
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

export function handedBases(content: Content): ReadonlySet<string> {
  const handed: Set<string> = new Set<string>(content.player.startingItems);
  for (const zone of content.zones.values()) {
    for (const met of zone.void?.encounters ?? []) if (met.find.type === 'item') handed.add(met.find.item);
  }
  return handed;
}

function handedProblems(content: Content): string[] {
  const problems: string[] = [];
  for (const id of handedBases(content)) {
    if ((content.itemBases.get(id)?.dropWeight ?? 0) > 0) problems.push(`item ${id} is handed to the player, so it cannot also drop at random`);
  }
  const rarity: RarityDef | undefined = content.rarities.find((candidate: RarityDef): boolean => candidate.id === content.player.firstDrop.rarity);
  if (rarity === undefined) problems.push(`the first drop names unknown rarity ${content.player.firstDrop.rarity}`);
  else if (rarity.powers) problems.push(`the first drop names ${rarity.id}, which only powered bases carry`);
  return problems;
}

export function itemProblems(content: Content): string[] {
  const problems: string[] = basesWithoutLook(content).map((id: string): string => `item ${id} has no look: give it a wear or a visual`);
  problems.push(...handedProblems(content));
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
