import type { Content, ItemBaseDef, MonsterDef, NpcDef, WearableDef, WearRegion, ZoneDef } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import type { Equipment } from './world/types.ts';

export function wornWearables(content: Content, clothes: readonly string[], equipped: Equipment | null): string[] {
  const worn: Map<WearRegion, string> = new Map<WearRegion, string>();
  const put = (id: string): void => {
    const def: WearableDef | undefined = content.wearables.get(id);
    if (def !== undefined) worn.set(def.region, id);
  };
  for (const id of clothes) put(id);
  if (equipped !== null) {
    for (const slot of ITEM_SLOTS) {
      const item = equipped[slot];
      const base: ItemBaseDef | undefined = item === null ? undefined : content.itemBases.get(item.base);
      if (base !== undefined) for (const id of base.wear) put(id);
    }
  }
  return [...worn.values()];
}

export function hiddenBodyParts(content: Content, wearableIds: readonly string[]): string[] {
  const hidden: Set<string> = new Set<string>();
  for (const id of wearableIds) {
    for (const part of content.wearables.get(id)?.hides ?? []) hidden.add(part);
  }
  return [...hidden];
}

export interface CharacterNeeds {
  readonly rigs: ReadonlySet<string>;
  readonly wearables: ReadonlySet<string>;
}

export function zoneCharacterNeeds(content: Content, zone: ZoneDef, equipped: Equipment | null): CharacterNeeds {
  const rigs: Set<string> = new Set<string>([content.player.rig]);
  const wearables: Set<string> = new Set<string>(wornWearables(content, content.player.wear, equipped));
  const add = (rig: string, wear: readonly string[]): void => {
    rigs.add(rig);
    for (const id of wornWearables(content, wear, null)) wearables.add(id);
  };
  for (const placed of zone.npcs) {
    const npc: NpcDef | undefined = content.npcs.get(placed.npc);
    if (npc !== undefined) add(npc.rig, npc.wear);
  }
  for (const pack of zone.packs) {
    for (const member of pack.members) {
      const monster: MonsterDef | undefined = content.monsters.get(member.monster);
      if (monster !== undefined) add(monster.rig, monster.wear);
    }
  }
  return { rigs, wearables };
}
