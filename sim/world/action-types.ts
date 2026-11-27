import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';

export type ActionPhase = 'windup' | 'channel' | 'recovery';

export interface ActionState {
  readonly skill: SkillDef;
  phase: ActionPhase;
  timeLeft: number;
  readonly windup: number;
  readonly recovery: number;
  direction: Vec2;
  target: Vec2 | null;
  readonly travelSpeed: number;
  travelLeft: number;
  readonly slot: number | null;
  elapsed: number;
  goal: Vec2 | null;
  turned: number;
  steeredAt: number;
}

export interface ChannelState {
  readonly actorId: number;
  readonly action: ActionState;
  aim: Vec2;
  last: Vec2 | null;
  piecesDrawn: number;
}
