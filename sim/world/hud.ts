import { inMist } from './glitch.ts';
import type { SkillDef } from '../content/types.ts';
import { activeQuests } from './quests.ts';
import type { ItemInstance, PlayerState, World } from './types.ts';


export const HUD_PARTS = ['life', 'mana', 'xp', 'gold', 'quests', 'inventory', 'character', 'chart', 'map', 'minimap'] as const;
export type HudPart = (typeof HUD_PARTS)[number];

export interface HudView {
  readonly parts: readonly HudPart[];
  readonly slots: readonly number[];
}

function present(item: ItemInstance | null): boolean {
  return item !== null;
}

export function usable(player: PlayerState, skill: SkillDef): boolean {
  return skill.damage.weaponPercent <= 0 || player.equipped.weapon !== null;
}

export function hudView(world: World): HudView {
  const player: PlayerState = world.player;
  const owns: boolean = player.inventory.some(present) || Object.values(player.equipped).some(present);
  const earned: Readonly<Record<HudPart, boolean>> = {
    life: owns,
    mana: player.skills.some((skill: SkillDef | null): boolean => skill !== null && skill.manaCost > 0),
    xp: player.xp > 0 || player.level > 1,
    gold: player.gold > 0,
    quests: activeQuests(world).length > 0,
    inventory: player.inventory.some(present),
    character: player.level > 1 || Object.values(player.equipped).some(present),
    chart: player.skillPoints > 0 || player.allocated.length > 0,
    map: world.visited.length > 1,
    minimap: world.visited.length > 1,
  };
  const slots: number[] = player.skills.flatMap((skill: SkillDef | null, slot: number): number[] => (skill !== null && usable(player, skill) ? [slot] : []));
  return { parts: HUD_PARTS.filter((part: HudPart): boolean => earned[part]), slots };
}

export function hudHidden(world: World): boolean {
  if (inMist(world)) return true;
  const view: HudView = hudView(world);
  return view.parts.length === 0 && view.slots.length === 0;
}
