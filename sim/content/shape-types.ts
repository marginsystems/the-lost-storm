import type { SkillLeap } from './combat-types.ts';

export interface ChainDelivery {
  readonly type: 'chain';
  readonly range: number;
  readonly jumps: number;
  readonly jumpRange: number;
  readonly falloff: number;
}

export const AREA_ANCHORS = ['ground', 'caster'] as const;
export type AreaAnchor = (typeof AREA_ANCHORS)[number];

export interface AreaDelivery {
  readonly type: 'area';
  readonly range: number;
  readonly radius: number;
  readonly duration: number;
  readonly pulse: number;
  readonly pull: number;
  readonly slow: number;
  readonly anchor: AreaAnchor;
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
}

export interface ChannelPress {
  readonly type: 'channel';
  readonly interval: number;
  readonly max: number;
}

export type PressDef = ChargePress | ChannelPress;

export interface BrandDef {
  readonly duration: number;
  readonly burst: string;
}

export interface SkillShape {
  readonly leap: SkillLeap | null;
  readonly root: number;
  readonly press: PressDef | null;
  readonly brand: BrandDef | null;
}

export interface SkillUnlock {
  readonly skill: string;
  readonly level: number;
}
