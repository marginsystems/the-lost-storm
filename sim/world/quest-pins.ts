import type { ZoneExit } from '../content/types.ts';
import type { SceneState } from './scene-state.ts';
import { hasNews, isLeaving } from './dialogue.ts';
import type { ObjectiveTarget } from './objective.ts';
import { objectiveTarget } from './objective.ts';
import type { NpcState, World } from './types.ts';

export type QuestPin = { readonly kind: 'npc'; readonly npcId: number } | { readonly kind: 'exit'; readonly exit: string };

function leading(scene: SceneState | null): number | null {
  if (scene === null || scene.phase === 'through') return null;
  return scene.npcId;
}

function talkedTo(target: ObjectiveTarget | null): string | null {
  if (target === null || target.kind !== 'person' || target.objective.type !== 'talk') return null;
  return target.objective.npc;
}

function pointedExit(world: World, target: ObjectiveTarget | null): ZoneExit | null {
  if (target === null || target.kind !== 'exit') return null;
  return world.zone.exits.find((exit: ZoneExit): boolean => exit.x === target.pos.x && exit.z === target.pos.z) ?? null;
}

export function questPins(world: World, target: ObjectiveTarget | null = objectiveTarget(world)): QuestPin[] {
  const scene: SceneState | null = world.scene;
  const guide: number | null = leading(scene);
  const asked: string | null = talkedTo(target);
  const pins: QuestPin[] = world.npcs
    .filter((npc: NpcState): boolean => world.dialogue?.npcId !== npc.id && !isLeaving(world, npc) && (npc.id === guide || npc.def.id === asked || hasNews(world, npc.def)))
    .map((npc: NpcState): QuestPin => ({ kind: 'npc', npcId: npc.id }));
  const staged: boolean = scene !== null && scene.phase !== 'through';
  const exit: ZoneExit | null = staged ? null : pointedExit(world, target);
  if (exit !== null) pins.push({ kind: 'exit', exit: exit.id });
  return pins;
}
