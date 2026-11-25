import type { RunCondition, RunReward, RunRise } from '../content/run-table-types.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { pickChoices } from './run-picks.ts';
import type { PickChoice } from './run-picks.ts';
import type { ModPair, RankModChoice } from '../content/rank-types.ts';
import { allHold } from './conditions.ts';
import type { RunEnd, RunPin, RunSetup, RunState } from './run-types.ts';
import type { MonsterState, World } from './types.ts';

export interface PinnedCondition {
  readonly condition: RunCondition;
  readonly pick: string | null;
}

export interface RunShaping {
  readonly rankChance: number;
  readonly grow: number;
  readonly mods: readonly string[];
  readonly life: number;
  readonly damage: number;
  readonly fill: readonly string[];
  readonly rise: RunRise | null;
}

export const NO_REWARD: RunReward = { xp: 0, gold: 0, items: 0, rarity: 0 };

export function emptyRun(): RunState {
  return { active: null, last: null };
}

export function copySetup(setup: RunSetup): RunSetup {
  return { zone: setup.zone, pins: setup.pins.map((pin: RunPin): RunPin => ({ condition: pin.condition, pick: pin.pick })) };
}

export function copyRun(run: RunState): RunState {
  return { active: run.active === null ? null : copySetup(run.active), last: run.last === null ? null : copySetup(run.last) };
}

export function pinned(content: Content, pins: readonly RunPin[]): PinnedCondition[] {
  return pins.flatMap((pin: RunPin): PinnedCondition[] => {
    const condition: RunCondition | undefined = content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === pin.condition);
    return condition === undefined ? [] : [{ condition, pick: pin.pick }];
  });
}

export function shapedHere(world: World): RunSetup | null {
  const active: RunSetup | null = world.run.active;
  return active !== null && active.zone === world.zone.id ? active : null;
}

function fillOf(content: Content, zone: ZoneDef | undefined, entry: PinnedCondition | undefined): readonly string[] {
  if (entry === undefined || zone === undefined) return [];
  return pickChoices(content, entry.condition.pick, zone).find((choice: PickChoice): boolean => choice.id === entry.pick)?.monsters ?? [];
}

export function shapingOf(content: Content, setup: RunSetup): RunShaping {
  const list: PinnedCondition[] = pinned(content, setup.pins);
  const sum = (read: (entry: PinnedCondition) => number): number => list.reduce((total: number, entry: PinnedCondition): number => total + read(entry), 0);
  const fill: PinnedCondition | undefined = list.find((entry: PinnedCondition): boolean => entry.condition.shape.fill && entry.pick !== null);
  return {
    rankChance: sum((entry: PinnedCondition): number => entry.condition.shape.rankChance),
    grow: sum((entry: PinnedCondition): number => entry.condition.shape.grow),
    mods: [...new Set<string>(list.flatMap((entry: PinnedCondition): readonly string[] => entry.condition.shape.mods))],
    life: sum((entry: PinnedCondition): number => entry.condition.shape.life),
    damage: sum((entry: PinnedCondition): number => entry.condition.shape.damage),
    fill: fillOf(content, content.zones.get(setup.zone), fill),
    rise: list.reduce((best: RunRise | null, entry: PinnedCondition): RunRise | null => {
      const next: RunRise | null = entry.condition.shape.rise;
      return next !== null && (best === null || next.chance > best.chance) ? next : best;
    }, null),
  };
}

export function runShaping(world: World): RunShaping | null {
  const setup: RunSetup | null = shapedHere(world);
  return setup === null ? null : shapingOf(world.content, setup);
}

export function rewardOf(content: Content, pins: readonly RunPin[]): RunReward {
  return pinned(content, pins).reduce(
    (total: RunReward, entry: PinnedCondition): RunReward => ({
      xp: total.xp + entry.condition.reward.xp,
      gold: total.gold + entry.condition.reward.gold,
      items: total.items + entry.condition.reward.items,
      rarity: Math.min(1, total.rarity + entry.condition.reward.rarity),
    }),
    NO_REWARD,
  );
}

export function leanBoostOf(content: Content, pins: readonly RunPin[]): number {
  return pinned(content, pins).reduce((total: number, entry: PinnedCondition): number => total + entry.condition.shape.lean, 1);
}

export function runLeanBoost(world: World): number {
  const setup: RunSetup | null = shapedHere(world);
  return setup === null ? 1 : leanBoostOf(world.content, setup.pins);
}

export function dangerOf(content: Content, pins: readonly RunPin[]): number {
  return pinned(content, pins).reduce((total: number, entry: PinnedCondition): number => total + entry.condition.danger, 0);
}

export function runReward(world: World): RunReward {
  const setup: RunSetup | null = shapedHere(world);
  return setup === null ? NO_REWARD : rewardOf(world.content, setup.pins);
}

function endRun(world: World, end: RunEnd): void {
  const active: RunSetup | null = world.run.active;
  if (active === null) return;
  world.run.active = null;
  world.events.push({ type: 'run_ended', zone: active.zone, end });
}

export function settleRunZone(world: World, keepRun: boolean): void {
  const active: RunSetup | null = world.run.active;
  if (active === null || active.zone === world.zone.id || keepRun) return;
  endRun(world, 'left');
}

export function settleCleared(world: World): void {
  if (shapedHere(world) === null) return;
  if (world.monsters.some((monster: MonsterState): boolean => monster.alive)) return;
  if (world.zone.packs.some((pack): boolean => !world.spawnedPacks.includes(pack) && allHold(world, pack.when))) return;
  endRun(world, 'cleared');
}

function conditionNamed(content: Content, id: string): RunCondition | undefined {
  return content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === id);
}

function carries(one: RunCondition, other: RunCondition, a: string, b: string): boolean {
  return one.shape.mods.includes(a) && other.shape.mods.includes(b);
}

function modsApart(content: Content, first: RunCondition, second: RunCondition): boolean {
  return content.packRanks.apart.some(([a, b]: ModPair): boolean => carries(first, second, a, b) || carries(first, second, b, a));
}

export function clashes(content: Content, first: string, second: string): boolean {
  const one: RunCondition | undefined = conditionNamed(content, first);
  const two: RunCondition | undefined = conditionNamed(content, second);
  if (one === undefined || two === undefined) return false;
  return one.excludes.includes(second) || two.excludes.includes(first) || modsApart(content, one, two);
}

export function conditionFrom(content: Content, condition: RunCondition): number {
  return condition.shape.mods.reduce((least: number, mod: string): number => Math.max(least, content.packRanks.pool.find((choice: RankModChoice): boolean => choice.mod === mod)?.from ?? 0), 0);
}

export function tooEarly(content: Content, zone: ZoneDef, id: string): boolean {
  const condition: RunCondition | undefined = conditionNamed(content, id);
  return condition !== undefined && conditionFrom(content, condition) > zone.level;
}

export function clashIn(content: Content, pins: readonly RunPin[], id: string): string | null {
  return pins.find((pin: RunPin): boolean => pin.condition !== id && clashes(content, pin.condition, id))?.condition ?? null;
}
