import type { Content, ItemBaseDef, ItemSlot, MonsterDef, NpcDef, WearableDef, WearRegion, ZoneDef } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { heroRig } from './hero.ts';

export interface WornBase {
  readonly base: string;
}

export type WornBases = Readonly<Record<ItemSlot, WornBase | null>>;

export function wornBasesOf(worn: Readonly<Record<string, string>>): WornBases {
  const pick = (slot: ItemSlot): WornBase | null => {
    const base: string | undefined = worn[slot];
    return base === undefined ? null : { base };
  };
  return { weapon: pick('weapon'), head: pick('head'), chest: pick('chest'), hands: pick('hands'), legs: pick('legs'), feet: pick('feet'), charm: pick('charm') };
}

export interface Look {
  readonly wearables: readonly string[];
  readonly hidden: readonly string[];
  readonly held: readonly string[];
}

export const WEAR_FRAME: string = '{frame}';

export function frameOf(content: Content, rig: string): string {
  return content.rigs.get(rig)?.frame ?? '';
}

export function wearKey(frame: string, id: string): string {
  return `${frame}/${id}`;
}

export function wearModel(def: WearableDef, frame: string): string {
  return def.model.replaceAll(WEAR_FRAME, frame);
}

export function wearFrames(content: Content): string[] {
  return [...new Set<string>([...content.rigs.values()].map((rig): string => rig.frame))].filter((frame: string): boolean => frame !== '');
}

export function baseLayerOf(content: Content, rig: string): readonly string[] {
  const body: string | undefined = content.rigs.get(rig)?.url;
  return body === undefined ? [] : (content.baseLayers.get(body) ?? []);
}

export function wornWearables(content: Content, rig: string, clothes: readonly string[], equipped: WornBases | null): string[] {
  const worn: Map<WearRegion, string> = new Map<WearRegion, string>();
  const put = (id: string): void => {
    const def: WearableDef | undefined = content.wearables.get(id);
    if (def !== undefined) worn.set(def.region, id);
  };
  for (const id of baseLayerOf(content, rig)) put(id);
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

export function heroBase(content: Content, rig: string): readonly string[] {
  return content.rigs.get(rig)?.base ?? [];
}

export function lookOf(content: Content, rig: string, base: readonly string[], equipped: WornBases | null): Look {
  const wearables: string[] = wornWearables(content, rig, base, equipped);
  return { wearables, hidden: hiddenBodyParts(content, wearables), held: heldGear(content, equipped) };
}

export interface CharacterNeeds {
  readonly rigs: ReadonlySet<string>;
  readonly wearables: ReadonlySet<string>;
  readonly attachments: ReadonlySet<string>;
}

export function heldGear(content: Content, equipped: WornBases | null): string[] {
  const weapon = equipped?.weapon ?? null;
  const held: string | null = weapon === null ? content.player.unarmedVisual : (content.itemBases.get(weapon.base)?.visual ?? content.player.unarmedVisual);
  return held === null ? [...content.player.gear] : [...content.player.gear, held];
}

export function zoneCharacterNeeds(content: Content, zone: ZoneDef, equipped: WornBases | null, hero: string | null = null): CharacterNeeds {
  const rig: string = heroRig(content, hero);
  const rigs: Set<string> = new Set<string>([rig]);
  const look: Look = lookOf(content, rig, heroBase(content, rig), equipped);
  const heroFrame: string = frameOf(content, rig);
  const wearables: Set<string> = new Set<string>(look.wearables.map((id: string): string => wearKey(heroFrame, id)));
  const attachments: Set<string> = new Set<string>(look.held);
  const add = (other: string, wear: readonly string[], gear: readonly string[]): void => {
    rigs.add(other);
    for (const id of wornWearables(content, other, wear, null)) wearables.add(wearKey(frameOf(content, other), id));
    for (const id of gear) attachments.add(id);
  };
  for (const placed of zone.npcs) {
    const npc: NpcDef | undefined = content.npcs.get(placed.npc);
    if (npc !== undefined) add(npc.rig, npc.wear, npc.gear);
  }
  for (const pack of zone.packs) {
    for (const member of pack.members) {
      const monster: MonsterDef | undefined = content.monsters.get(member.monster);
      if (monster !== undefined) add(monster.rig, monster.wear, monster.gear);
    }
  }
  for (const entry of [...(zone.moments?.table ?? []), ...(zone.moments?.first ?? [])]) {
    for (const echo of content.moments.defs.get(entry.moment)?.echoes ?? []) {
      const monster: MonsterDef | undefined = content.monsters.get(echo.monster);
      if (monster === undefined) continue;
      add(echo.look?.rig ?? monster.rig, echo.look?.wear ?? monster.wear, echo.look?.gear ?? monster.gear);
    }
  }
  return { rigs, wearables, attachments };
}
