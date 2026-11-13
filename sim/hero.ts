import type { ZoneEncounter } from './content/story-types.ts';
import type { Condition, Content, HeroDef } from './content/types.ts';
import type { PlayerState, World } from './world/types.ts';

export const HERO = { size: 1 } as const;

export function heroOf(content: Content, id: string | null): HeroDef {
  return content.player.heroes.find((hero: HeroDef): boolean => hero.id === id) ?? content.player.hero;
}

export function heroRig(content: Content, id: string | null): string {
  return heroOf(content, id).rig;
}

export type HeroStanding = Pick<PlayerState, 'level' | 'xp' | 'equipped'>;

export function heroOpen(player: HeroStanding): boolean {
  return player.level <= 1 && player.xp <= 0 && player.equipped.weapon === null;
}

export function chooseHero(world: World, id: string): boolean {
  const wanted: HeroDef | undefined = world.content.player.heroes.find((hero: HeroDef): boolean => hero.id === id);
  if (wanted === undefined || !heroOpen(world.player)) return false;
  if (world.player.hero === wanted.id) return true;
  world.player.hero = wanted.id;
  world.events.push({ type: 'character_changed' });
  return true;
}

export function heroFind(content: Content, id: string): string | null {
  const opening: string | null = content.world.opening;
  const encounters: readonly ZoneEncounter[] = (opening === null ? undefined : content.zones.get(opening))?.void?.encounters ?? [];
  for (const met of encounters) {
    if (met.find.type !== 'item' || !met.find.equip) continue;
    if (met.when.some((condition: Condition): boolean => condition.type === 'hero' && !condition.not && condition.is === id)) return met.find.item;
  }
  return null;
}
