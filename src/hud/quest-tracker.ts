import type { ObjectiveDef, QuestDef } from '../../sim/content/types.ts';
import { activeQuests, currentObjective } from '../../sim/world/quests.ts';
import { nextAction, questTarget } from '../../sim/world/objective.ts';
import type { World, WorldEvent } from '../../sim/world/types.ts';
import { el, label, retrigger } from './dom.ts';

const TRACKER = {
  swapMs: 520,
  leaveMs: 900,
} as const;

interface QuestBlock {
  readonly element: HTMLDivElement;
  readonly goal: HTMLDivElement;
  shown: string;
  text: string;
  swapping: boolean;
  leaving: boolean;
}

export interface QuestTracker {
  readonly element: HTMLElement;
  update(world: World): void;
  handle(event: WorldEvent, world: World): void;
}

function actionText(world: World, quest: QuestDef, objective: ObjectiveDef | null): string {
  return objective === null ? '' : nextAction(questTarget(world, quest), objective.text);
}

export function createQuestTracker(root: HTMLElement): QuestTracker {
  const element: HTMLDivElement = el('div', 'hud-quests', root);
  const blocks: Map<string, QuestBlock> = new Map<string, QuestBlock>();

  const add = (world: World, quest: QuestDef): QuestBlock => {
    const block: HTMLDivElement = el('div', 'quest', element);
    label('quest-name', quest.name, block);
    const goal: HTMLDivElement = el('div', 'quest-goal', block);
    const objective: ObjectiveDef | null = currentObjective(world, quest);
    const text: string = actionText(world, quest, objective);
    goal.textContent = text;
    block.getBoundingClientRect();
    block.classList.add('in');
    const entry: QuestBlock = { element: block, goal, shown: objective?.id ?? '', text, swapping: false, leaving: false };
    blocks.set(quest.id, entry);
    return entry;
  };

  const leave = (questId: string, block: QuestBlock): void => {
    if (block.leaving) return;
    block.leaving = true;
    block.goal.classList.add('done');
    block.element.classList.add('complete');
    window.setTimeout((): void => {
      block.element.remove();
      if (blocks.get(questId) === block) blocks.delete(questId);
    }, TRACKER.leaveMs);
  };

  const swap = (world: World, quest: QuestDef, block: QuestBlock): void => {
    if (block.swapping || block.leaving) return;
    block.swapping = true;
    block.goal.classList.add('done');
    window.setTimeout((): void => {
      block.swapping = false;
      const objective: ObjectiveDef | null = currentObjective(world, quest);
      if (objective === null || block.leaving) return;
      block.shown = objective.id;
      block.text = actionText(world, quest, objective);
      block.goal.textContent = block.text;
      block.goal.classList.remove('done');
      retrigger(block.goal, 'next');
    }, TRACKER.swapMs);
  };

  return {
    element,
    update(world: World): void {
      const active: QuestDef[] = activeQuests(world);
      for (const quest of active) {
        const block: QuestBlock = blocks.get(quest.id) ?? add(world, quest);
        const objective: ObjectiveDef | null = currentObjective(world, quest);
        if (objective !== null && (objective.id !== block.shown || actionText(world, quest, objective) !== block.text)) swap(world, quest, block);
      }
      for (const [questId, block] of blocks) {
        if (!active.some((quest: QuestDef): boolean => quest.id === questId)) leave(questId, block);
      }
    },
    handle(event: WorldEvent, world: World): void {
      if (event.type !== 'quest_advanced') return;
      const quest: QuestDef | undefined = world.content.quests.get(event.quest);
      const block: QuestBlock | undefined = blocks.get(event.quest);
      if (quest !== undefined && block !== undefined) swap(world, quest, block);
    },
  };
}
