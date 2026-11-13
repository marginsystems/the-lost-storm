import type { Content, HeroDef } from '../../sim/content/types.ts';
import type { HeroStanding } from '../../sim/hero.ts';
import { heroFind, heroOpen } from '../../sim/hero.ts';
import type { KeyValueStore } from '../backend/backend.ts';

export const HERO_KEY: string = 'lost-storm.hero';

export interface HeroOption {
  readonly id: string;
  readonly name: string;
  readonly finds: string | null;
}

export interface HeroChoice {
  readonly options: readonly HeroOption[];
  readonly chosen: string;
}

export function readHero(store: KeyValueStore, content: Content): string | null {
  const kept: string | null = store.read(HERO_KEY);
  return content.player.heroes.some((hero: HeroDef): boolean => hero.id === kept) ? kept : null;
}

export function keepHero(store: KeyValueStore, id: string): void {
  store.write(HERO_KEY, id);
}

export function heroChoice(content: Content, standing: HeroStanding, chosen: string): HeroChoice | null {
  if (content.player.heroes.length < 2 || !heroOpen(standing)) return null;
  const options: HeroOption[] = content.player.heroes.map((hero: HeroDef): HeroOption => {
    const found: string | null = heroFind(content, hero.id);
    return { id: hero.id, name: hero.name, finds: found === null ? null : (content.itemBases.get(found)?.name ?? null) };
  });
  return { options, chosen };
}
