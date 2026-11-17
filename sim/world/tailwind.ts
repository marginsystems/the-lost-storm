import { PLAYER_SIDE } from '../content/combat-types.ts';
import type { MonsterRank } from '../content/rank-types.ts';
import type { TailwindDef, TailwindTier } from '../content/tailwind-types.ts';
import { grantXp } from './character.ts';
import { regardOf } from './factions.ts';
import type { TailwindEnd, TailwindState } from './tailwind-types.ts';
import type { MonsterState, PlayerState, World } from './types.ts';

export function calmTailwind(): TailwindState {
  return { points: 0, kills: 0, tier: 0, best: 0, fuse: 0, full: 0, lastKill: 0, xp: 0, gold: 0 };
}

export function tierAt(def: TailwindDef, points: number): number {
  let tier: number = 0;
  for (const entry of def.tiers) if (points >= entry.at) tier += 1;
  return tier;
}

export function tierDef(def: TailwindDef, tier: number): TailwindTier | null {
  return tier <= 0 ? null : (def.tiers[tier - 1] ?? null);
}

export function fuseFor(def: TailwindDef, tier: number): number {
  return tierDef(def, tier)?.fuse ?? def.fuse;
}

export function killWeight(def: TailwindDef, monster: MonsterState): number {
  if (monster.revived) return 0;
  if (monster.def.boss !== null) return def.weights.boss;
  const rank: MonsterRank | null = monster.def.rank;
  if (rank === null) return def.weights.plain;
  if (rank.leader) return def.weights.leader;
  return def.weights.ranks[rank.id] ?? def.weights.plain;
}

export interface TailwindShares {
  readonly xp: number;
  readonly loot: number;
}

const NO_SHARES: TailwindShares = { xp: 0, loot: 0 };

export function tailwindShares(world: World): TailwindShares {
  return tierDef(world.content.tailwind, world.tailwind.tier) ?? NO_SHARES;
}

export function tailwindPace(world: World): number {
  return 1 + (tierDef(world.content.tailwind, world.tailwind.tier)?.speed ?? 0);
}

export function feedTailwind(world: World, monster: MonsterState, xp: number, gold: number): void {
  const def: TailwindDef = world.content.tailwind;
  const weight: number = killWeight(def, monster);
  if (weight <= 0 || !world.player.alive) return;
  const state: TailwindState = world.tailwind;
  const burst: boolean = state.points > 0 && world.time - state.lastKill <= def.burst.window;
  state.points += weight;
  state.kills += 1;
  state.xp += xp;
  state.gold += gold;
  state.lastKill = world.time;
  const tier: number = tierAt(def, state.points);
  if (tier > state.tier) world.events.push({ type: 'tailwind_rise', tier, points: state.points });
  state.tier = tier;
  state.best = Math.max(state.best, tier);
  state.full = fuseFor(def, tier);
  state.fuse = Math.min(state.full * def.burst.most, Math.max(state.fuse, state.full) + (burst ? def.burst.seconds : 0));
}

export function fuseRate(world: World): number {
  const player: PlayerState = world.player;
  const def: TailwindDef = world.content.tailwind;
  const still: boolean = !player.moving && player.action === null;
  let near: boolean = false;
  for (const monster of world.monsters) {
    if (!monster.alive) continue;
    const gap: number = Math.hypot(monster.pos.x - player.pos.x, monster.pos.z - player.pos.z);
    if (gap > def.fight.reach && gap > def.idle.reach) continue;
    if (regardOf(world.content, PLAYER_SIDE, monster.def.faction) !== 'hostile') continue;
    if (monster.aggro && gap <= def.fight.reach) return def.fight.drain;
    if (gap <= def.idle.reach) near = true;
  }
  return still && !near ? def.idle.drain : 1;
}

export function idling(world: World): boolean {
  return fuseRate(world) === world.content.tailwind.idle.drain;
}

export function endTailwind(world: World, reason: TailwindEnd): void {
  const state: TailwindState = world.tailwind;
  if (state.points <= 0) return;
  const best: TailwindTier | null = reason === 'fell' ? null : tierDef(world.content.tailwind, state.best);
  const xp: number = Math.round(state.xp * (best?.windfallXp ?? 0));
  const gold: number = Math.round(state.gold * (best?.windfallGold ?? 0));
  world.events.push({ type: 'tailwind_end', reason, best: state.best, points: state.points, kills: state.kills, xp, gold });
  world.tailwind = calmTailwind();
  if (gold > 0) world.player.gold += gold;
  if (xp > 0) grantXp(world, xp);
}

export function stepTailwind(world: World, dt: number): void {
  const state: TailwindState = world.tailwind;
  if (state.points <= 0) return;
  state.fuse -= dt * fuseRate(world);
  if (state.fuse <= 0) endTailwind(world, 'faded');
}
