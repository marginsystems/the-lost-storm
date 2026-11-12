import type { ObjectiveDef, PathObjective, QuestDef } from '../content/types.ts';
import { objectivePaths } from '../content/road.ts';
import { distance } from '../math.ts';
import { allHold, questState } from './conditions.ts';
import { refreshNpcs } from './dialogue.ts';
import { spawnPacks } from './monsters.ts';
import { endedActs, reportEndedActs, writeFlags } from './flags.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

export function currentObjective(world: World, quest: QuestDef): ObjectiveDef | null {
  const index: number | undefined = world.quests[quest.id];
  return index === undefined ? null : (quest.objectives[index] ?? null);
}

export function activeQuests(world: World): QuestDef[] {
  return [...world.content.quests.values()].filter((quest: QuestDef): boolean => questState(world, quest.id) === 'active');
}

export function startQuests(world: World): void {
  let started: boolean = true;
  while (started) {
    started = false;
    for (const quest of world.content.quests.values()) {
      if (world.quests[quest.id] !== undefined) continue;
      if (!quest.requires.every((required: string): boolean => questState(world, required) === 'done') || !allHold(world, quest.when)) continue;
      world.quests[quest.id] = 0;
      world.events.push({ type: 'quest_started', quest: quest.id });
      started = true;
    }
  }
}

function advance(world: World, quest: QuestDef, objective: ObjectiveDef, path: PathObjective): void {
  const next: number = (world.quests[quest.id] ?? 0) + 1;
  world.quests[quest.id] = next;
  world.events.push({ type: 'quest_advanced', quest: quest.id, objective: objective.id });
  if (path !== objective) writeFlags(world, path.sets);
  writeFlags(world, objective.sets);
  if (next >= quest.objectives.length) world.events.push({ type: 'quest_completed', quest: quest.id });
}

function died(world: World, events: readonly WorldEvent[], monsterId: string): boolean {
  return events.some((event: WorldEvent): boolean => {
    if (event.type !== 'death' || event.team !== 'monster') return false;
    return world.monsters.some((monster: MonsterState): boolean => monster.id === event.actorId && monster.def.id === monsterId);
  });
}

function pathMet(world: World, objective: PathObjective, events: readonly WorldEvent[]): boolean {
  if (!allHold(world, objective.when)) return false;
  let done: boolean;
  switch (objective.type) {
    case 'talk':
      done = events.some((event: WorldEvent): boolean => event.type === 'dialogue_closed' && event.finished && event.npc === objective.npc);
      break;
    case 'reach':
      done = world.zone.id === objective.zone && world.player.alive && distance(world.player.pos, objective) <= objective.radius;
      break;
    case 'defeat':
      done = died(world, events, objective.monster);
      break;
  }
  return done;
}

function metPath(world: World, objective: ObjectiveDef, events: readonly WorldEvent[]): PathObjective | null {
  if (!allHold(world, objective.when)) return null;
  return objectivePaths(objective).find((path: PathObjective): boolean => pathMet(world, path, events)) ?? null;
}

export function stepQuests(world: World): void {
  const events: readonly WorldEvent[] = [...world.events];
  const ended: ReadonlySet<string> = endedActs(world);
  let changed: boolean = false;
  for (const quest of world.content.quests.values()) {
    const objective: ObjectiveDef | null = currentObjective(world, quest);
    const path: PathObjective | null = objective === null ? null : metPath(world, objective, events);
    if (objective === null || path === null) continue;
    advance(world, quest, objective, path);
    changed = true;
  }
  if (!changed) return;
  reportEndedActs(world, ended);
  startQuests(world);
  refreshNpcs(world);
  spawnPacks(world);
}
