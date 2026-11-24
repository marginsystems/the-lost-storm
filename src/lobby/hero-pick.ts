import type { Content } from '../../sim/content/types.ts';
import { heroRig } from '../../sim/hero.ts';
import type { HeroStanding } from '../../sim/hero.ts';
import { heroChoice, heroLocked, nameBodyOf, shownHero } from './hero-choice.ts';
import type { HeroChoice, HeroSituation } from './hero-choice.ts';
import type { LobbyLook } from './lobby-stage.ts';
import type { NameBody } from './name-pool.ts';

export interface HeroPickParts {
  readonly content: Content;
  readonly chosen: string | null;
  readonly standing: () => HeroStanding;
  readonly entered: () => boolean;
  readonly load: (id: string) => Promise<void>;
  readonly keep: (id: string) => void;
  readonly restage: () => void;
  readonly settled: () => Promise<void>;
}

export interface HeroPick {
  readonly chosen: string | null;
  reset(chosen: string | null): void;
  choice(): HeroChoice | null;
  look(): LobbyLook;
  choose(id: string): Promise<void>;
  preview(id: string | null): Promise<void>;
  body(): NameBody | null;
}

export function createHeroPick(parts: HeroPickParts): HeroPick {
  let chosen: string | null = parts.chosen;
  let previewed: string | null = null;
  const situation = (): HeroSituation => ({ standing: parts.standing(), chosen, entered: parts.entered() });
  const choice = (): HeroChoice | null => heroChoice(parts.content, situation());
  return {
    get chosen(): string | null {
      return chosen;
    },
    reset(next: string | null): void {
      chosen = next;
      previewed = null;
    },
    choice,
    look(): LobbyLook {
      const shown: string | null = shownHero(choice(), previewed) ?? chosen;
      return { equipped: parts.standing().equipped, rig: heroRig(parts.content, shown), veiled: shown === null };
    },
    async choose(id: string): Promise<void> {
      if (id === chosen || heroLocked(situation())) return;
      chosen = id;
      parts.keep(id);
      parts.restage();
      await parts.load(id);
      if (chosen !== id) return;
      parts.restage();
      await parts.settled();
    },
    async preview(id: string | null): Promise<void> {
      if (previewed === id) return;
      previewed = id;
      parts.restage();
      if (id === null || heroLocked(situation())) return;
      await parts.load(id);
      if (previewed === id) parts.restage();
    },
    body(): NameBody | null {
      return nameBodyOf(parts.content, chosen);
    },
  };
}
