import type { LineDef, NpcDef, TalkDef, ZoneNpc } from '../content/types.ts';
import { DEGREES_TO_RADIANS, facingOf } from '../math.ts';
import { allHold } from './conditions.ts';
import { spokenLine } from './glitch-word.ts';
import type { DialogueState, NpcState, World } from './types.ts';

export const DIALOGUE = {
  reach: 2.6,
  retold: '+',
} as const;

function present(world: World): ZoneNpc[] {
  return world.zone.npcs.filter((placed: ZoneNpc): boolean => world.content.npcs.has(placed.npc) && allHold(world, placed.when));
}

export function npcAt(world: World, placed: ZoneNpc): NpcState | null {
  const def: NpcDef | undefined = world.content.npcs.get(placed.npc);
  if (def === undefined) return null;
  const facing: number = placed.facingDegrees * DEGREES_TO_RADIANS;
  const npc: NpcState = { id: world.nextId, def, placement: placed, pos: { x: placed.x, z: placed.z }, homeFacing: facing, facing, motion: 'still', gait: 0, route: [], pace: 0, fade: 1 };
  world.nextId += 1;
  return npc;
}

export function spawnNpcs(world: World): void {
  world.porter = null;
  world.npcs = present(world).flatMap((placed: ZoneNpc): NpcState[] => {
    const npc: NpcState | null = npcAt(world, placed);
    return npc === null ? [] : [npc];
  });
}

export function findNpc(world: World, npcId: number): NpcState | null {
  return world.npcs.find((npc: NpcState): boolean => npc.id === npcId) ?? null;
}

export function talkable(world: World, npcId: number): NpcState | null {
  const npc: NpcState | null = findNpc(world, npcId);
  return npc === null || isLeaving(world, npc) ? null : npc;
}

export function nextTalk(world: World, def: NpcDef): TalkDef | null {
  return def.talks.find((talk: TalkDef): boolean => allHold(world, talk.when) && (!talk.once || !world.heard.includes(talk.id))) ?? null;
}

export function hasNews(world: World, def: NpcDef): boolean {
  return nextTalk(world, def)?.once ?? false;
}

export function replayable(world: World, def: NpcDef): TalkDef[] {
  return def.talks.filter((talk: TalkDef): boolean => talk.once && world.heard.includes(talk.id) && allHold(world, talk.when));
}

export function canReplay(world: World): boolean {
  const dialogue: DialogueState | null = world.dialogue;
  return dialogue !== null && !dialogue.replay && !dialogue.talk.once && replayable(world, dialogue.npc).length > 0;
}

function retold(talks: readonly TalkDef[]): TalkDef {
  return { id: talks.map((talk: TalkDef): string => talk.id).join(DIALOGUE.retold), once: false, when: [], lines: talks.flatMap((talk: TalkDef): readonly string[] => talk.lines) };
}

function say(world: World, dialogue: DialogueState): void {
  const line: LineDef | undefined = world.content.lines.get(dialogue.talk.lines[dialogue.index] ?? '');
  if (line === undefined) return;
  world.events.push({ type: 'dialogue_line', npcId: dialogue.npcId, npc: dialogue.npc.id, talk: dialogue.talk.id, line: spokenLine(world, line), index: dialogue.index, last: dialogue.index === dialogue.talk.lines.length - 1 });
}

export function closeDialogue(world: World, finished: boolean): void {
  const dialogue: DialogueState | null = world.dialogue;
  if (dialogue === null) return;
  world.dialogue = null;
  const npc: NpcState | null = findNpc(world, dialogue.npcId);
  if (npc !== null) npc.facing = npc.homeFacing;
  if (finished && dialogue.talk.once && !world.heard.includes(dialogue.talk.id)) world.heard.push(dialogue.talk.id);
  world.events.push({ type: 'dialogue_closed', npcId: dialogue.npcId, npc: dialogue.npc.id, talk: dialogue.talk.id, finished, replay: dialogue.replay });
}

export function openDialogue(world: World, npc: NpcState): void {
  closeDialogue(world, false);
  const fresh: TalkDef | null = nextTalk(world, npc.def);
  const again: TalkDef[] = fresh === null ? replayable(world, npc.def) : [];
  const talk: TalkDef | null = fresh ?? (again.length > 0 ? retold(again) : null);
  if (talk === null) return;
  const toward = { x: world.player.pos.x - npc.pos.x, z: world.player.pos.z - npc.pos.z };
  if (Math.hypot(toward.x, toward.z) > 1e-3) {
    npc.facing = facingOf(toward);
    world.player.facing = facingOf({ x: -toward.x, z: -toward.z });
  }
  world.dialogue = { npcId: npc.id, npc: npc.def, talk, replay: fresh === null, index: 0 };
  say(world, world.dialogue);
}

export function replayDialogue(world: World): void {
  const dialogue: DialogueState | null = world.dialogue;
  if (dialogue === null || !canReplay(world)) return;
  world.dialogue = { npcId: dialogue.npcId, npc: dialogue.npc, talk: retold(replayable(world, dialogue.npc)), replay: true, index: 0 };
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

export function refreshNpcs(world: World): void {
  const wanted: ZoneNpc[] = present(world);
  const staging: ZoneNpc | null = world.scene?.placement ?? null;
  const staged: NpcState[] = world.npcs.filter((npc: NpcState): boolean => npc.placement === staging || npc === world.porter);
  const staying: NpcState[] = world.npcs.filter((npc: NpcState): boolean => wanted.includes(npc.placement));
  const leaving: NpcState[] = world.npcs.filter((npc: NpcState): boolean => npc.placement !== staging && !wanted.includes(npc.placement) && npc.placement.leave > 0 && npc.fade > 0);
  if (staying.length + staged.length + leaving.length === world.npcs.length && staying.length === wanted.length) return;
  if (world.dialogue !== null && ![...staying, ...staged].some((npc: NpcState): boolean => npc.id === world.dialogue?.npcId)) closeDialogue(world, false);
  const arriving: NpcState[] = wanted
    .filter((placed: ZoneNpc): boolean => !staying.some((npc: NpcState): boolean => npc.placement === placed))
    .flatMap((placed: ZoneNpc): NpcState[] => {
      const npc: NpcState | null = npcAt(world, placed);
      return npc === null ? [] : [npc];
    });
  world.npcs = [...staying, ...arriving, ...staged, ...leaving];
}

export function isLeaving(world: World, npc: NpcState): boolean {
  return npc.placement.leave > 0 && npc.placement !== world.scene?.placement && !allHold(world, npc.placement.when);
}

export function easeLeaving(world: World, dt: number): void {
  let gone: boolean = false;
  for (const npc of world.npcs) {
    if (!isLeaving(world, npc)) {
      if (npc.placement.leave > 0 && npc.placement !== world.scene?.placement) npc.fade = 1;
      continue;
    }
    npc.fade = Math.max(0, npc.fade - dt / npc.placement.leave);
    if (npc.fade === 0) gone = true;
  }
  if (gone) world.npcs = world.npcs.filter((npc: NpcState): boolean => !isLeaving(world, npc) || npc.fade > 0);
}
