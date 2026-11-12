import type { Condition } from './condition-types.ts';
import type { StoryFlags } from './story-types.ts';

export interface MomentProp {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
}

export interface EchoPose {
  readonly clip: string;
  readonly at: number;
}

export interface EchoLook {
  readonly rig: string;
  readonly scale: number;
  readonly gear: readonly string[];
  readonly wear: readonly string[];
}

export interface MomentEcho {
  readonly monster: string;
  readonly x: number;
  readonly z: number;
  readonly facingDegrees: number;
  readonly pose: EchoPose;
  readonly turns: boolean;
  readonly look: EchoLook | null;
}

export interface MomentReward {
  readonly goldMin: number;
  readonly goldMax: number;
  readonly items: number;
  readonly itemChance: number;
  readonly rarity: string | null;
}

export interface MomentDef {
  readonly id: string;
  readonly name: string;
  readonly tint: string;
  readonly bright: boolean;
  readonly radius: number;
  readonly lifetime: number;
  readonly awake: number;
  readonly turnChance: number;
  readonly props: readonly MomentProp[];
  readonly echoes: readonly MomentEcho[];
  readonly reward: MomentReward;
}

export interface MomentLibrary {
  readonly faction: string;
  readonly hostileTint: string;
  readonly telegraph: number;
  readonly fade: number;
  readonly cleared: StoryFlags;
  readonly playedShare: number;
  readonly defs: ReadonlyMap<string, MomentDef>;
}

export interface StrikeArea {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface StrikeClearance {
  readonly hero: number;
  readonly exits: number;
  readonly between: number;
}

export interface StrikeInterval {
  readonly min: number;
  readonly max: number;
}

export interface WeightedMoment {
  readonly moment: string;
  readonly weight: number;
}

export interface MomentField {
  readonly combat: boolean;
  readonly areas: readonly StrikeArea[];
  readonly clearance: StrikeClearance;
  readonly interval: StrikeInterval;
  readonly start: number;
  readonly max: number;
  readonly table: readonly WeightedMoment[];
  readonly sure: readonly Condition[];
}
