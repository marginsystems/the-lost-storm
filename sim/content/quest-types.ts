import type { RemarkKind, ServiceKind } from './trade-types.ts';
import type { Condition } from './condition-types.ts';
import type { StoryFlags } from './story-types.ts';

export interface LineDef {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
}

export interface TalkDef {
  readonly id: string;
  readonly once: boolean;
  readonly when: readonly Condition[];
  readonly lines: readonly string[];
}

export interface ObjectiveGift {
  readonly rarity: string;
  readonly items: number;
}

export interface ObjectiveBase {
  readonly id: string;
  readonly text: string;
  readonly waiting: string;
  readonly when: readonly Condition[];
  readonly sets: StoryFlags;
  readonly gift: ObjectiveGift | null;
}

export interface TalkObjective extends ObjectiveBase {
  readonly type: 'talk';
  readonly npc: string;
  readonly talk: string | null;
}

export interface ReachObjective extends ObjectiveBase {
  readonly type: 'reach';
  readonly zone: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface DefeatObjective extends ObjectiveBase {
  readonly type: 'defeat';
  readonly monster: string;
}

export interface MomentObjective extends ObjectiveBase {
  readonly type: 'moment';
}

export type PathObjective = TalkObjective | ReachObjective | DefeatObjective | MomentObjective;

export interface EitherObjective extends ObjectiveBase {
  readonly type: 'either';
  readonly paths: readonly PathObjective[];
}

export type ObjectiveDef = PathObjective | EitherObjective;

export interface QuestDef {
  readonly id: string;
  readonly name: string;
  readonly requires: readonly string[];
  readonly when: readonly Condition[];
  readonly objectives: readonly ObjectiveDef[];
}

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly rig: string;
  readonly scale: number;
  readonly tint: string;
  readonly color: string;
  readonly gear: readonly string[];
  readonly wear: readonly string[];
  readonly talks: readonly TalkDef[];
  readonly service: ServiceKind | null;
  readonly remarks: Readonly<Partial<Record<RemarkKind, string>>>;
  readonly faction: string | null;
}
