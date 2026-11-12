import type { Condition, ObjectiveDef, ObjectiveState, QuestDef, QuestState } from '../content/types.ts';
import { shoreDepth } from './shore.ts';
import type { World } from './types.ts';

export function questState(world: World, questId: string): QuestState {
  const quest: QuestDef | undefined = world.content.quests.get(questId);
  const index: number | undefined = world.quests[questId];
  if (quest === undefined || index === undefined) return 'locked';
  return index >= quest.objectives.length ? 'done' : 'active';
}

export function objectiveState(world: World, questId: string, objectiveId: string): ObjectiveState {
  const quest: QuestDef | undefined = world.content.quests.get(questId);
  const index: number | undefined = world.quests[questId];
  const position: number = quest?.objectives.findIndex((objective: ObjectiveDef): boolean => objective.id === objectiveId) ?? -1;
  if (index === undefined || position < 0 || index < position) return 'pending';
  return index === position ? 'current' : 'done';
}

export function holds(world: World, condition: Condition): boolean {
  let held: boolean;
  switch (condition.type) {
    case 'quest':
      held = questState(world, condition.quest) === condition.is;
      break;
    case 'objective':
      held = objectiveState(world, condition.quest, condition.objective) === condition.is;
      break;
    case 'flag':
      held = condition.is === null ? world.flags[condition.flag] !== undefined : world.flags[condition.flag] === condition.is;
      break;
    case 'shore':
      held = shoreDepth(world) >= condition.depth;
      break;
  }
  return held !== condition.not;
}

export function allHold(world: World, conditions: readonly Condition[]): boolean {
  return conditions.every((condition: Condition): boolean => holds(world, condition));
}
