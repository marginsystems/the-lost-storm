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

export type Condition = QuestCondition | ObjectiveCondition;
