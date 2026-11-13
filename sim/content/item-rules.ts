import type { AffixDef, ItemBaseDef, RarityDef } from './item-types.ts';
import { ITEM_STATS } from './item-types.ts';
import type { ComboStep, Content, ItemSlot, RigClips, SkillDef, StatId } from './types.ts';
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
      return WORN_LOOK_SLOTS.has(base.slot) && base.wear.length === 0 && base.wornModel;
    })
    .map((base: ItemBaseDef): string => base.id);
}

export function heroWears(content: Content, base: ItemBaseDef): boolean {
  return !base.wear.some((id: string): boolean => content.player.neverWears.includes(id));
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
  for (const id of content.player.neverWears) if (!content.wearables.has(id)) problems.push(`the hero never wears ${id}, which is not a wearable`);
  for (const base of content.itemBases.values()) {
    if ((base.dropWeight > 0 || handedBases(content).has(base.id)) && !heroWears(content, base)) problems.push(`item ${base.id} reaches the hero but wears something he never wears`);
  }
  const rarity: RarityDef | undefined = content.rarities.find((candidate: RarityDef): boolean => candidate.id === content.player.firstDrop.rarity);
  if (rarity === undefined) problems.push(`the first drop names unknown rarity ${content.player.firstDrop.rarity}`);
  else if (rarity.powers) problems.push(`the first drop names ${rarity.id}, which only powered bases carry`);
  return problems;
}

function unplayed(content: Content, rig: string, skillId: string, stance: string | null): string[] {
  const clips: RigClips | undefined = content.rigs.get(rig)?.clips;
  const skill: SkillDef | undefined = content.skills.get(skillId);
  if (clips === undefined || skill === undefined) return [];
  const held: RigClips['actions'] = stance === null ? {} : (clips.stances[stance]?.actions ?? {});
  return [skill.animation, ...(skill.combo?.steps ?? []).map((step: ComboStep): string => step.animation)].filter((animation: string): boolean => held[animation] === undefined && clips.actions[animation] === undefined);
}

function variantProblems(content: Content): string[] {
  const problems: string[] = [];
  for (const base of content.itemBases.values()) {
    const stance: string | null = base.visual === null ? null : (content.attachments.get(base.visual)?.stance ?? null);
    for (const variant of base.variants) {
      if (!content.skills.has(variant.skill)) problems.push(`item ${base.id} varies unknown skill ${variant.skill}`);
      if (!content.skills.has(variant.becomes)) problems.push(`item ${base.id} turns ${variant.skill} into unknown skill ${variant.becomes}`);
      if (variant.skill === variant.becomes) problems.push(`item ${base.id} turns ${variant.skill} into itself`);
      for (const hero of content.player.heroes) for (const animation of unplayed(content, hero.rig, variant.becomes, stance)) problems.push(`item ${base.id} turns ${variant.skill} into ${variant.becomes}, but rig ${hero.rig} has no action clip ${animation} for it`);
      for (const node of content.skillTree) for (const further of node.variants) {
        if (further.skill !== variant.becomes) continue;
        for (const hero of content.player.heroes) for (const animation of unplayed(content, hero.rig, further.becomes, stance)) problems.push(`tree node ${node.id} turns ${further.skill} into ${further.becomes} while ${base.id} is held, but rig ${hero.rig} has no action clip ${animation} for it`);
      }
    }
  }
  return problems;
}

export function itemProblems(content: Content): string[] {
  const problems: string[] = basesWithoutLook(content).map((id: string): string => `item ${id} has no look: give it a wear or a visual`);
  problems.push(...handedProblems(content));
  problems.push(...variantProblems(content));
  for (const base of content.itemBases.values()) if (!base.wornModel && base.wear.length > 0) problems.push(`item ${base.id} has no worn model but wears ${base.wear.join(', ')}`);
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
