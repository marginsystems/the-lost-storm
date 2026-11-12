import type { ObjectiveDef, QuestDef, ZoneDef, ZoneExit, ZoneNpc, ZonePack } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { allHold } from './conditions.ts';
import { activeQuests, currentObjective } from './quests.ts';
import type { MonsterState, NpcState, World } from './types.ts';

export type ObjectiveTargetKind = 'person' | 'exit' | 'monster' | 'spot';

export interface ObjectiveTarget {
  readonly kind: ObjectiveTargetKind;
  readonly pos: Vec2;
  readonly radius: number;
  readonly quest: QuestDef;
  readonly objective: ObjectiveDef;
  readonly zone: ZoneDef;
  readonly name: string;
}

const MARK = {
  personRadius: 1.1,
  monsterRadius: 1.4,
} as const;

function zonesWhere(world: World, has: (zone: ZoneDef) => boolean): string[] {
  return [...world.content.zones.values()].filter(has).map((zone: ZoneDef): string => zone.id);
}

function destinations(world: World, objective: ObjectiveDef): readonly string[] {
  let ids: readonly string[];
  switch (objective.type) {
    case 'reach':
      ids = [objective.zone];
      break;
    case 'talk':
      ids = zonesWhere(world, (zone: ZoneDef): boolean => zone.npcs.some((placement: ZoneNpc): boolean => placement.npc === objective.npc && allHold(world, placement.when)));
      break;
    case 'defeat':
      ids = zonesWhere(world, (zone: ZoneDef): boolean => zone.packs.some((pack: ZonePack): boolean => allHold(world, pack.when) && pack.members.some((member): boolean => member.monster === objective.monster)));
      break;
  }
  return ids;
}

export function exitToward(world: World, goals: readonly string[]): ZoneExit | null {
  if (goals.length === 0) return null;
  const first: Map<string, ZoneExit> = new Map<string, ZoneExit>();
  const queue: string[] = [world.zone.id];
  const reached: Set<string> = new Set<string>(queue);
  for (let index: number = 0; index < queue.length; index += 1) {
    const zone: ZoneDef | undefined = world.content.zones.get(queue[index] ?? '');
    if (zone === undefined) continue;
    for (const exit of zone.exits) {
      if (reached.has(exit.to) || !allHold(world, exit.requires)) continue;
      reached.add(exit.to);
      const via: ZoneExit | undefined = first.get(zone.id) ?? exit;
      first.set(exit.to, via);
      queue.push(exit.to);
    }
  }
  for (const goal of goals) {
    const via: ZoneExit | undefined = first.get(goal);
    if (via !== undefined) return via;
  }
  return null;
}

interface LocalTarget {
  readonly kind: ObjectiveTargetKind;
  readonly pos: Vec2;
  readonly radius: number;
  readonly name: string;
}

function localTarget(world: World, objective: ObjectiveDef): LocalTarget | null {
  let target: LocalTarget | null = null;
  switch (objective.type) {
    case 'reach':
      if (world.zone.id === objective.zone) target = { kind: 'spot', pos: { x: objective.x, z: objective.z }, radius: objective.radius, name: world.zone.name };
      break;
    case 'talk': {
      const person: NpcState | undefined = world.npcs.find((npc: NpcState): boolean => npc.def.id === objective.npc);
      if (person !== undefined) target = { kind: 'person', pos: person.pos, radius: MARK.personRadius, name: person.def.name };
      break;
    }
    case 'defeat': {
      const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.alive && candidate.def.id === objective.monster);
      const pack: ZonePack | undefined = world.zone.packs.find((candidate: ZonePack): boolean => allHold(world, candidate.when) && candidate.members.some((member): boolean => member.monster === objective.monster));
      if (monster !== undefined) target = { kind: 'monster', pos: monster.pos, radius: MARK.monsterRadius, name: monster.def.name };
      else if (pack !== undefined) target = { kind: 'spot', pos: { x: pack.x, z: pack.z }, radius: MARK.monsterRadius * 2, name: world.content.monsters.get(objective.monster)?.name ?? '' };
      break;
    }
  }
  return target;
}

export function questTarget(world: World, quest: QuestDef): ObjectiveTarget | null {
  const objective: ObjectiveDef | null = currentObjective(world, quest);
  if (objective === null) return null;
  const here = localTarget(world, objective);
  if (here !== null) return { ...here, quest, objective, zone: world.zone };
  const exit: ZoneExit | null = exitToward(world, destinations(world, objective));
  if (exit === null) return null;
  const to: string = world.content.zones.get(exit.to)?.name ?? '';
  return { kind: 'exit', pos: { x: exit.x, z: exit.z }, radius: exit.radius, quest, objective, zone: world.zone, name: to };
}

export function objectiveTarget(world: World): ObjectiveTarget | null {
  for (const quest of activeQuests(world)) {
    const target: ObjectiveTarget | null = questTarget(world, quest);
    if (target !== null) return target;
  }
  return null;
}

export function nextAction(target: ObjectiveTarget | null, fallback: string): string {
  if (target === null) return fallback;
  let line: string;
  switch (target.kind) {
    case 'person':
      line = `Talk to ${target.name}`;
      break;
    case 'exit':
      line = `Leave through the marked exit to ${target.name}`;
      break;
    case 'monster':
      line = `Defeat ${target.name}`;
      break;
    case 'spot':
      line = target.objective.type === 'defeat' ? `Find ${target.name}` : 'Go to the marked place';
      break;
  }
  return line;
}
