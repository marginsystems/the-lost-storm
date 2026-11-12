import type { Content, ObjectiveDef, PathObjective, ZoneDef, ZoneExit } from '../content/types.ts';
import { objectivePaths } from '../content/road.ts';
import type { Vec2 } from '../math.ts';
import { allHold } from './conditions.ts';
import { fightZones, nearestFight, strikeGround } from './moments.ts';
import { activeQuests, currentObjective } from './quests.ts';
import type { MonsterState, NpcState, World } from './types.ts';

export interface QuestMark {
  readonly quest: string;
  readonly pos: Vec2;
  readonly here: boolean;
}

function zonesWith(content: Content, has: (zone: ZoneDef) => boolean): string[] {
  return [...content.zones.values()].filter(has).map((zone: ZoneDef): string => zone.id);
}

function pathZones(world: World, objective: PathObjective): string[] {
  let zones: string[];
  switch (objective.type) {
    case 'talk':
      zones = zonesWith(world.content, (zone: ZoneDef): boolean => zone.npcs.some((placed): boolean => placed.npc === objective.npc));
      break;
    case 'reach':
      zones = [objective.zone];
      break;
    case 'defeat':
      zones = zonesWith(world.content, (zone: ZoneDef): boolean => zone.packs.some((pack): boolean => pack.members.some((member): boolean => member.monster === objective.monster)));
      break;
    case 'moment':
      zones = fightZones(world.content);
      break;
  }
  return zones;
}

function talkTarget(world: World, npcId: string): Vec2 | null {
  const npc: NpcState | undefined = world.npcs.find((candidate: NpcState): boolean => candidate.def.id === npcId);
  return npc === undefined ? null : { x: npc.pos.x, z: npc.pos.z };
}

function defeatTarget(world: World, monsterId: string): Vec2 | null {
  const monster: MonsterState | undefined = world.monsters.find((candidate: MonsterState): boolean => candidate.alive && candidate.def.id === monsterId);
  if (monster !== undefined) return { x: monster.pos.x, z: monster.pos.z };
  const pack = world.zone.packs.find((candidate): boolean => candidate.members.some((member): boolean => member.monster === monsterId));
  return pack === undefined ? null : { x: pack.x, z: pack.z };
}

function pathTarget(world: World, objective: PathObjective): Vec2 | null {
  let target: Vec2 | null;
  switch (objective.type) {
    case 'talk':
      target = talkTarget(world, objective.npc);
      break;
    case 'reach':
      target = world.zone.id === objective.zone ? { x: objective.x, z: objective.z } : null;
      break;
    case 'defeat':
      target = defeatTarget(world, objective.monster);
      break;
    case 'moment':
      target = nearestFight(world)?.pos ?? strikeGround(world);
      break;
  }
  return target;
}

function shown(world: World, exit: ZoneExit): boolean {
  return !(exit.hiddenWhenLocked && !allHold(world, exit.requires));
}

export function firstExitToward(world: World, goals: readonly string[]): ZoneExit | null {
  const wanted: ReadonlySet<string> = new Set<string>(goals);
  const seen: Set<string> = new Set<string>([world.zone.id]);
  let frontier: { readonly zone: string; readonly first: ZoneExit }[] = world.zone.exits
    .filter((exit: ZoneExit): boolean => shown(world, exit))
    .map((exit: ZoneExit): { readonly zone: string; readonly first: ZoneExit } => ({ zone: exit.to, first: exit }));
  while (frontier.length > 0) {
    const found = frontier.find((step): boolean => wanted.has(step.zone));
    if (found !== undefined) return found.first;
    const next: { readonly zone: string; readonly first: ZoneExit }[] = [];
    for (const step of frontier) {
      if (seen.has(step.zone)) continue;
      seen.add(step.zone);
      for (const exit of world.content.zones.get(step.zone)?.exits ?? []) {
        if (!seen.has(exit.to) && shown(world, exit)) next.push({ zone: exit.to, first: step.first });
      }
    }
    frontier = next;
  }
  return null;
}

function openPaths(world: World, objective: ObjectiveDef): PathObjective[] {
  return objectivePaths(objective).filter((path: PathObjective): boolean => allHold(world, path.when));
}

function targetZones(world: World, objective: ObjectiveDef): string[] {
  return openPaths(world, objective).flatMap((path: PathObjective): string[] => pathZones(world, path));
}

function localTarget(world: World, objective: ObjectiveDef): Vec2 | null {
  for (const path of openPaths(world, objective)) {
    const target: Vec2 | null = pathTarget(world, path);
    if (target !== null) return target;
  }
  return null;
}

export function questMarks(world: World): QuestMark[] {
  const marks: QuestMark[] = [];
  for (const quest of activeQuests(world)) {
    const objective: ObjectiveDef | null = currentObjective(world, quest);
    if (objective === null) continue;
    const local: Vec2 | null = localTarget(world, objective);
    if (local !== null) {
      marks.push({ quest: quest.id, pos: local, here: true });
      continue;
    }
    const exit: ZoneExit | null = firstExitToward(world, targetZones(world, objective).filter((zone: string): boolean => zone !== world.zone.id));
    if (exit !== null) marks.push({ quest: quest.id, pos: { x: exit.x, z: exit.z }, here: false });
  }
  return marks;
}
