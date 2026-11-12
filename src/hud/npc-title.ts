import type { NpcDef } from '../../sim/content/types.ts';

export function shownTitle(npc: Pick<NpcDef, 'name' | 'title'>): string {
  return npc.name.toLowerCase().includes(npc.title.toLowerCase()) ? '' : npc.title;
}
