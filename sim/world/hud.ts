import { inMist } from './glitch.ts';
import type { SkillDef } from '../content/types.ts';
import { activeQuests } from './quests.ts';
import type { ItemInstance, PlayerState, World } from './types.ts';


export const HUD_PARTS = ['life', 'mana', 'xp', 'gold', 'quests', 'inventory', 'character', 'chart', 'map', 'minimap'] as const;
export type HudPart = (typeof HUD_PARTS)[number];

export const HUD_FRAME: readonly HudPart[] = ['life', 'xp', 'inventory', 'character', 'chart', 'map'];

export interface HudView {
  readonly parts: readonly HudPart[];
  readonly slots: readonly number[];
}

function present(item: ItemInstance | null): boolean {
  return item !== null;
}

function earnedGear(world: World, item: ItemInstance | null): boolean {
  if (item === null) return false;
  const starter: boolean = world.content.player.startingItems.includes(item.base);
  return !starter || (world.content.itemBases.get(item.base)?.wear.length ?? 0) === 0;
}

export function usable(player: PlayerState, skill: SkillDef): boolean {
  return skill.damage.weaponPercent <= 0 || player.equipped.weapon !== null;
}

function costly(skill: SkillDef | null): boolean {
  return skill !== null && skill.manaCost > 0;
}

function manaShown(world: World): boolean {
  return world.content.player.manaShows === 'always' || world.player.skills.some(costly);
}

function filledSlots(player: PlayerState): number[] {
  return player.skills.flatMap((skill: SkillDef | null, slot: number): number[] => (skill !== null && usable(player, skill) ? [slot] : []));
}

export function hudView(world: World): HudView {
  const player: PlayerState = world.player;
  const earned: Readonly<Record<HudPart, boolean>> = {
    life: true,
    mana: manaShown(world),
    xp: true,
    gold: player.gold > 0,
    quests: activeQuests(world).length > 0,
    inventory: true,
    character: true,
    chart: true,
    map: true,
    minimap: world.visited.length > 1,
  };
  return { parts: HUD_PARTS.filter((part: HudPart): boolean => earned[part]), slots: filledSlots(player) };
}

export function hudBegun(world: World): boolean {
  const player: PlayerState = world.player;
  const owns: boolean = player.inventory.some(present) || Object.values(player.equipped).some((item: ItemInstance | null): boolean => earnedGear(world, item));
  return owns || player.xp > 0 || player.level > 1 || player.gold > 0 || world.visited.length > 1 || activeQuests(world).length > 0 || filledSlots(player).length > 0;
}

export function hudHidden(world: World): boolean {
  return inMist(world) || !hudBegun(world);
}
