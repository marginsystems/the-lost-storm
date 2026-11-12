import type { Content, LineDef, NpcDef, TalkDef, ZoneDef } from '../sim/content/types.ts';
import { HUB_ZONE, OUTPOST_ZONE, roadAct } from './road-support.ts';

function talk(id: string, once: boolean, count: number): TalkDef {
  return { id, once, when: [], lines: Array.from({ length: count }, (_: unknown, index: number): string => `${id}_${index + 1}`) };
}

function person(id: string, name: string, talks: readonly TalkDef[]): NpcDef {
  return { id, name, faction: null, title: 'Test', rig: 'human_man', scale: 1, tint: '#ffffff', color: '#c9b48a', gear: [], wear: [], talks, service: null };
}

export const KEEPER: NpcDef = person('keeper', 'Keeper', [talk('keeper_first', true, 3), talk('keeper_idle', false, 1)]);
export const COURIER: NpcDef = person('courier', 'Courier', [talk('courier_first', true, 2), talk('courier_idle', false, 1)]);

export const TOWN_LINES: readonly LineDef[] = [KEEPER, COURIER].flatMap((npc: NpcDef): LineDef[] =>
  npc.talks.flatMap((entry: TalkDef): LineDef[] => entry.lines.map((id: string): LineDef => ({ id, speaker: npc.id, text: `${npc.name} says ${id}.` }))),
);

export const TOWN_ZONE: ZoneDef = {
  ...HUB_ZONE,
  npcs: [
    { npc: 'keeper', x: 16, z: 8, facingDegrees: 90, when: [] },
    { npc: 'courier', x: 16, z: 16, facingDegrees: 270, when: [] },
  ],
};

const base: Content = roadAct([TOWN_ZONE, OUTPOST_ZONE], 'hub');

export const TOWN_CONTENT: Content = {
  ...base,
  npcs: new Map<string, NpcDef>([...base.npcs, [KEEPER.id, KEEPER], [COURIER.id, COURIER]]),
  lines: new Map<string, LineDef>([...base.lines, ...TOWN_LINES.map((line: LineDef): [string, LineDef] => [line.id, line])]),
};
