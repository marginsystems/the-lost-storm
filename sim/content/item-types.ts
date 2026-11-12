import type { ModOp, SkillMod, StatId, StatMod } from './types.ts';

export const ITEM_SLOTS = ['weapon', 'offhand', 'head', 'chest', 'hands', 'legs', 'feet', 'ring', 'amulet', 'charm'] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const ARMOUR_MATERIALS = ['cloth', 'leather', 'mail', 'plate'] as const;
export type ArmourMaterial = (typeof ARMOUR_MATERIALS)[number];

export const AFFIX_POSITIONS = ['prefix', 'suffix'] as const;
export type AffixPosition = (typeof AFFIX_POSITIONS)[number];

export const AFFIX_GROUPS = ['offence', 'defence', 'utility'] as const;
export type AffixGroup = (typeof AFFIX_GROUPS)[number];

export interface RarityDef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly weight: number;
  readonly affixMin: number;
  readonly affixMax: number;
  readonly statScale: number;
  readonly maxPerGroup: number;
}

export interface ItemBaseDef {
  readonly id: string;
  readonly name: string;
  readonly slot: ItemSlot | null;
  readonly book: string | null;
  readonly material: ArmourMaterial | null;
  readonly icon: string;
  readonly dropWeight: number;
  readonly minLevel: number;
  readonly maxLevel: number;
  readonly implicit: readonly StatMod[];
  readonly visual: string | null;
  readonly wear: readonly string[];
  readonly uniqueWeight: number;
  readonly flavour: string | null;
  readonly skillMods: readonly SkillMod[];
}

export interface AffixDef {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly group: AffixGroup;
  readonly tier: number;
  readonly minLevel: number;
  readonly weight: number;
  readonly position: AffixPosition;
  readonly slots: readonly ItemSlot[];
  readonly stat: StatId;
  readonly op: ModOp;
  readonly min: number;
  readonly max: number;
  readonly perLevel: number;
}

export interface ItemScaling {
  readonly implicitPerLevel: number;
  readonly uniqueChance: number;
  readonly uniqueChancePerLevel: number;
  readonly maxPerPosition: number;
}
