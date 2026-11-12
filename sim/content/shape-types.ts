import type { SkillLeap } from './combat-types.ts';

export interface ChainDelivery {
  readonly type: 'chain';
  readonly range: number;
  readonly jumps: number;
  readonly jumpRange: number;
  readonly falloff: number;
}

export const FIELD_ANCHORS = ['ground', 'caster'] as const;
export type FieldAnchor = (typeof FIELD_ANCHORS)[number];

export interface FieldDelivery {
  readonly type: 'field';
  readonly range: number;
  readonly radius: number;
  readonly duration: number;
  readonly pulse: number;
  readonly pull: number;
  readonly slow: number;
  readonly anchor: FieldAnchor;
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

export interface ChargeHold {
  readonly type: 'charge';
  readonly max: number;
  readonly damageScale: number;
  readonly areaScale: number;
}

export interface ChannelHold {
  readonly type: 'channel';
  readonly interval: number;
  readonly max: number;
}

export type HoldDef = ChargeHold | ChannelHold;

export interface BrandDef {
  readonly duration: number;
  readonly burst: string;
}

export interface SkillShape {
  readonly leap: SkillLeap | null;
  readonly root: number;
  readonly hold: HoldDef | null;
  readonly brand: BrandDef | null;
}
