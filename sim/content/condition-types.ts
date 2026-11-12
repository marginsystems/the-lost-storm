export const QUEST_STATES = ['locked', 'active', 'done'] as const;
export type QuestState = (typeof QUEST_STATES)[number];

export const OBJECTIVE_STATES = ['pending', 'current', 'done'] as const;
export type ObjectiveState = (typeof OBJECTIVE_STATES)[number];

export interface QuestCondition {
  readonly type: 'quest';
  readonly quest: string;
  readonly is: QuestState;
  readonly not: boolean;
}

export interface ObjectiveCondition {
  readonly type: 'objective';
  readonly quest: string;
  readonly objective: string;
  readonly is: ObjectiveState;
  readonly not: boolean;
}

export interface FlagCondition {
  readonly type: 'flag';
  readonly flag: string;
  readonly is: string | null;
  readonly not: boolean;
}

export interface ShoreCondition {
  readonly type: 'shore';
  readonly depth: number;
  readonly not: boolean;
}

export interface VisitedCondition {
  readonly type: 'visited';
  readonly zone: string;
  readonly not: boolean;
}

export interface PointsCondition {
  readonly type: 'points';
  readonly not: boolean;
}

export interface SpenderCondition {
  readonly type: 'spender';
  readonly not: boolean;
}

export interface HurtCondition {
  readonly type: 'hurt';
  readonly not: boolean;
}

export interface CarryingCondition {
  readonly type: 'carrying';
  readonly count: number;
  readonly not: boolean;
}

export type Condition = QuestCondition | ObjectiveCondition | FlagCondition | ShoreCondition | VisitedCondition | PointsCondition | SpenderCondition | HurtCondition | CarryingCondition;
