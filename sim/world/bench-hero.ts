import type { XpCurve } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { xpToNextLevel } from '../progression.ts';
import { createRng } from '../rng.ts';
import { grantXp, refreshPlayer } from './character.ts';
import { learn } from './learn.ts';
import type { BenchHero } from './dev-commands.ts';
import type { ItemInstance, PlayerState, World } from './types.ts';

function xpUpTo(curve: XpCurve, level: number, xp: number, target: number): number {
  let needed: number = -xp;
  for (let at: number = level; at < target; at += 1) needed += xpToNextLevel(curve, at);
  return Math.max(0, needed);
}

function arm(world: World, hero: BenchHero): readonly string[] {
  if (hero.weapon === null) return [];
  const item: ItemInstance | null = generateItem(world.content, createRng(hero.seed), world.nextItemUid, world.player.level, hero.weapon, world.content.rarities[0]?.id ?? null);
  if (item === null || world.content.itemBases.get(hero.weapon)?.slot !== 'weapon') return [hero.weapon];
  world.nextItemUid += 1;
  world.player.equipped.weapon = item;
  return [];
}

export function refillHero(world: World): void {
  const player: PlayerState = world.player;
  if (!player.alive) return;
  player.life = player.maxLife;
  player.mana = player.stats.maxMana;
}

export function readyBenchHero(world: World, hero: BenchHero): readonly string[] {
  world.rng.reseed(hero.seed);
  const player: PlayerState = world.player;
  const curve: XpCurve = world.content.player.xp;
  const target: number = Math.min(hero.level, curve.maxLevel);
  if (player.level < target) grantXp(world, xpUpTo(curve, player.level, player.xp, target));
  const unknown: string[] = hero.bar.filter((skill: string | null): skill is string => skill !== null && !world.content.skills.has(skill));
  for (const skill of hero.bar) if (skill !== null && !unknown.includes(skill)) learn(world, skill);
  player.bar = player.bar.map((current: string | null, slot: number): string | null => {
    if (slot >= hero.bar.length) return current !== null && hero.bar.includes(current) ? null : current;
    const wanted: string | null = hero.bar[slot] ?? null;
    return wanted !== null && unknown.includes(wanted) ? null : wanted;
  });
  unknown.push(...arm(world, hero));
  refreshPlayer(world);
  refillHero(world);
  return unknown;
}
