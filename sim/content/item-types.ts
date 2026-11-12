import type { ItemSlot, ModOp, StatMod } from './types.ts';

export const RARITY_MARKERS = ['none', 'shaft'] as const;
export type RarityMarker = (typeof RARITY_MARKERS)[number];

export interface RarityDef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly marker: RarityMarker;
  readonly weight: number;
  readonly affixMin: number;
  readonly affixMax: number;
}

export const ARMOUR_MATERIALS = ['cloth', 'leather', 'mail', 'plate'] as const;
export type ArmourMaterial = (typeof ARMOUR_MATERIALS)[number];

export interface ItemBaseDef {
  readonly id: string;
  readonly name: string;
  readonly slot: ItemSlot | null;
  readonly book: string | null;
  readonly material: ArmourMaterial | null;
  readonly icon: string;
  readonly dropWeight: number;
  readonly minLevel: number;
  readonly implicit: readonly StatMod[];
  readonly visual: string | null;
  readonly wear: readonly string[];
}

export const ITEM_STATS = ['damagePercent', 'attackSpeed', 'critChance', 'maxLife', 'armour', 'stormResist', 'frostResist', 'moveSpeed', 'maxMana'] as const;
export type ItemStat = (typeof ITEM_STATS)[number];

export interface AffixDef {
  readonly id: string;
  readonly label: string;
  readonly slots: readonly ItemSlot[];
  readonly stat: ItemStat;
  readonly op: ModOp;
  readonly min: number;
  readonly max: number;
  readonly perLevel: number;
}

export interface ItemScaling {
  readonly implicitPerLevel: number;
}
