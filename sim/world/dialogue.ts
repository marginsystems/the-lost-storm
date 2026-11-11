import type { LineDef, NpcDef, TalkDef } from '../content/types.ts';
import { DEGREES_TO_RADIANS, facingOf } from '../math.ts';
import type { DialogueState, NpcState, World } from './types.ts';

export const DIALOGUE = {
  reach: 2.6,
} as const;

export function spawnNpcs(world: World): void {
  world.npcs = [];
  for (const placed of world.zone.npcs) {
    const def: NpcDef | undefined = world.content.npcs.get(placed.npc);
    if (def === undefined) continue;
    const facing: number = placed.facingDegrees * DEGREES_TO_RADIANS;
    world.npcs.push({ id: world.nextId, def, pos: { x: placed.x, z: placed.z }, homeFacing: facing, facing });
    world.nextId += 1;
  }
}

export function findNpc(world: World, npcId: number): NpcState | null {
  return world.npcs.find((npc: NpcState): boolean => npc.id === npcId) ?? null;
}

export function nextTalk(world: World, def: NpcDef): TalkDef | null {
  return def.talks.find((talk: TalkDef): boolean => !talk.once || !world.heard.includes(talk.id)) ?? null;
}

export function hasNews(world: World, def: NpcDef): boolean {
  return nextTalk(world, def)?.once ?? false;
}

function say(world: World, dialogue: DialogueState): void {
  const line: LineDef | undefined = world.content.lines.get(dialogue.talk.lines[dialogue.index] ?? '');
  if (line === undefined) return;
  world.events.push({ type: 'dialogue_line', npcId: dialogue.npcId, npc: dialogue.npc.id, talk: dialogue.talk.id, line, index: dialogue.index, last: dialogue.index === dialogue.talk.lines.length - 1 });
}

export function closeDialogue(world: World, finished: boolean): void {
  const dialogue: DialogueState | null = world.dialogue;
  if (dialogue === null) return;
  world.dialogue = null;
  const npc: NpcState | null = findNpc(world, dialogue.npcId);
  if (npc !== null) npc.facing = npc.homeFacing;
  if (finished && dialogue.talk.once && !world.heard.includes(dialogue.talk.id)) world.heard.push(dialogue.talk.id);
  world.events.push({ type: 'dialogue_closed', npcId: dialogue.npcId, npc: dialogue.npc.id, talk: dialogue.talk.id, finished });
}

export function openDialogue(world: World, npc: NpcState): void {
  closeDialogue(world, false);
  const talk: TalkDef | null = nextTalk(world, npc.def);
  if (talk === null) return;
  const toward = { x: world.player.pos.x - npc.pos.x, z: world.player.pos.z - npc.pos.z };
  if (Math.hypot(toward.x, toward.z) > 1e-3) {
    npc.facing = facingOf(toward);
    world.player.facing = facingOf({ x: -toward.x, z: -toward.z });
  }
  world.dialogue = { npcId: npc.id, npc: npc.def, talk, index: 0 };
  say(world, world.dialogue);
}

export function advanceDialogue(world: World): void {
  const dialogue: DialogueState | null = world.dialogue;
  if (dialogue === null) return;
  if (dialogue.index + 1 >= dialogue.talk.lines.length) {
    closeDialogue(world, true);
    return;
  }
  dialogue.index += 1;
  say(world, dialogue);
}
