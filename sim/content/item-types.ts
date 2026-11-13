import type { SkillTarget, SkillVariant } from './chart-types.ts';
import type { ItemSlot, ModOp, SkillMod, StatId, StatMod } from './types.ts';

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
  readonly powers: boolean;
  readonly wornLimit: number | null;
}

export const ARMOUR_MATERIALS = ['cloth', 'leather', 'mail', 'plate'] as const;
export type ArmourMaterial = (typeof ARMOUR_MATERIALS)[number];

export const GROUND_MODELS = ['held', 'worn', 'bundle', 'pouch'] as const;
export type GroundModel = (typeof GROUND_MODELS)[number];
export const GROUND_KEEPS = ['all', 'left'] as const;
export type GroundKeep = (typeof GROUND_KEEPS)[number];

export interface GroundLook {
  readonly model: GroundModel;
  readonly keep: GroundKeep;
  readonly scale: number;
  readonly flatten: number;
  readonly pitch: number;
  readonly roll: number;
  readonly yawJitter: number;
}

export interface ItemBaseDef {
  readonly id: string;
  readonly name: string;
  readonly slot: ItemSlot | null;
  readonly book: string | null;
  readonly story: boolean;
  readonly material: ArmourMaterial | null;
  readonly icon: string;
  readonly dropWeight: number;
  readonly minLevel: number;
  readonly implicit: readonly StatMod[];
  readonly visual: string | null;
  readonly wear: readonly string[];
  readonly wornModel: boolean;
  readonly ground: GroundLook;
  readonly power: PowerDef | null;
  readonly variants: readonly SkillVariant[];
}

export const POWER_TRIGGERS = ['hit', 'kill', 'pulse'] as const;
export type PowerTrigger = (typeof POWER_TRIGGERS)[number];
export const POWER_TARGETS = ['any', 'echo'] as const;
export type PowerTarget = (typeof POWER_TARGETS)[number];
export const CAST_ORIGINS = ['target', 'caster'] as const;
export type CastOrigin = (typeof CAST_ORIGINS)[number];

export interface CastEffect {
  readonly type: 'cast';
  readonly skill: string;
  readonly at: CastOrigin;
}

export interface BuffEffect {
  readonly type: 'buff';
  readonly stat: StatId;
  readonly op: ModOp;
  readonly value: number;
  readonly duration: number;
  readonly stacks: number;
}

export type PowerEffect = CastEffect | BuffEffect;

export interface PowerTriggerDef {
  readonly on: PowerTrigger;
  readonly skill: SkillTarget | null;
  readonly target: PowerTarget;
  readonly every: number;
  readonly cooldown: number;
  readonly effect: PowerEffect;
}

export interface PowerDef {
  readonly family: string;
  readonly text: string;
  readonly skillMods: readonly SkillMod[];
  readonly variants: readonly SkillVariant[];
  readonly triggers: readonly PowerTriggerDef[];
}

export interface FamilyDef {
  readonly id: string;
  readonly name: string;
}

export const ITEM_STATS = ['damagePercent', 'damageMax', 'attackSpeed', 'critChance', 'critMultiplier', 'maxLife', 'lifeRegen', 'armour', 'stormResist', 'frostResist', 'moveSpeed', 'maxMana', 'manaRegen'] as const;
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
