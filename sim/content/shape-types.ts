import type { Condition } from './condition-types.ts';
import type { SkillCommit, SkillLeap } from './combat-types.ts';
import type { SkillTarget } from './chart-types.ts';
import type { SkillMod, StatMod } from './types.ts';

export interface ChainDelivery {
  readonly type: 'chain';
  readonly range: number;
  readonly jumps: number;
  readonly jumpRange: number;
  readonly falloff: number;
}

export const AREA_ANCHORS = ['ground', 'caster'] as const;
export type AreaAnchor = (typeof AREA_ANCHORS)[number];

export interface AreaStoke {
  readonly perPulse: number;
  readonly max: number;
}

export interface AreaExposure {
  readonly target: SkillTarget;
  readonly value: number;
}

export interface AreaAura {
  readonly statMods: readonly StatMod[];
  readonly skillMods: readonly SkillMod[];
  readonly exposes: readonly AreaExposure[];
}

export interface AreaDelivery {
  readonly type: 'area';
  readonly range: number;
  readonly radius: number;
  readonly duration: number;
  readonly pulse: number;
  readonly pull: number;
  readonly slow: number;
  readonly weaken: number;
  readonly anchor: AreaAnchor;
  readonly opening: boolean;
  readonly pushForward: boolean;
  readonly stoke: AreaStoke | null;
  readonly length: number;
  readonly blocks: boolean;
  readonly slam: string | null;
  readonly aura: AreaAura | null;
}

export interface BlinkDelivery {
  readonly type: 'blink';
  readonly range: number;
  readonly radius: number;
}

export interface BeamDelivery {
  readonly type: 'beam';
  readonly range: number;
  readonly width: number;
}

export interface ChargePress {
  readonly type: 'charge';
  readonly max: number;
  readonly damageScale: number;
  readonly areaScale: number;
  readonly hint: string | null;
}

export interface ChannelPress {
  readonly type: 'channel';
  readonly interval: number;
  readonly max: number;
  readonly move: number;
  readonly strafe?: boolean;
  readonly passThrough: boolean;
  readonly hint: string | null;
}

export type PressDef = ChargePress | ChannelPress;

export interface BrandDef {
  readonly duration: number;
  readonly burst: string;
}

export interface MomentumTier {
  readonly at: number;
  readonly turn: number;
  readonly reach: number;
}

export interface MomentumDef {
  readonly perHit: number;
  readonly cap: number;
  readonly grace: number;
  readonly drain: number;
  readonly steady: number;
  readonly manaPerHit: number;
  readonly lifePerHit: number;
  readonly tiers: readonly MomentumTier[];
}

export interface MomentumSpend {
  readonly damage: number;
  readonly area: number;
  readonly range: number;
  readonly stun: number;
}

export interface SoakDef {
  readonly tempo: number;
  readonly duration: number;
}

export interface BurnDef {
  readonly duration: number;
  readonly tick: number;
  readonly share: number;
}

export interface SkillShape {
  readonly leap: SkillLeap | null;
  readonly root: number;
  readonly commit: SkillCommit | null;
  readonly press: PressDef | null;
  readonly brand: BrandDef | null;
  readonly momentum: MomentumDef | null;
  readonly burn: BurnDef | null;
  readonly soak: SoakDef | null;
  readonly spend: MomentumSpend | null;
  readonly spent: number;
}

export interface SkillUnlock {
  readonly skill: string;
  readonly level: number;
  readonly when: readonly Condition[];
}

