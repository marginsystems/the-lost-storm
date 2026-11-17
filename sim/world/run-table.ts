import type { RunCondition, RunPricing, RunTableDef } from '../content/run-table-types.ts';
import type { Content, MonsterDef, PackMember, RarityDef, ZoneDef, ZonePack } from '../content/types.ts';
import type { PackRankDef } from '../content/rank-types.ts';
import { rankChance } from './ranks.ts';
import { closePortal } from './portal.ts';
import { clashIn, pinned } from './run-state.ts';
import type { PinnedCondition } from './run-state.ts';
import { copySetup } from './run-state.ts';
import type { RunPin, RunSetup } from './run-types.ts';
import { chargeGold } from './trade.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

export type RunRefusal = 'away' | 'level' | 'pins' | 'pick' | 'gold';

function meanAffixes(rarity: RarityDef): number {
  return (rarity.affixMin + rarity.affixMax) / 2;
}

export function meanSellValue(content: Content, level: number): number {
  const price = content.trade.price;
  const weight: number = content.rarities.reduce((sum: number, rarity: RarityDef): number => sum + rarity.weight, 0);
  if (weight <= 0) return 0;
  const value: number = content.rarities.reduce((sum: number, rarity: RarityDef): number => {
    const worth: number = price.base * (price.rarity[rarity.id] ?? 1) * (1 + price.perLevel * (level - 1)) * (1 + price.perAffix * meanAffixes(rarity));
    return sum + rarity.weight * worth * price.sellRatio;
  }, 0);
  return value / weight;
}

function rankLift(content: Content, level: number, read: (rank: PackRankDef) => number): number {
  return content.packRanks.ranks.reduce((lift: number, rank: PackRankDef): number => (rank.chance === null ? lift : lift + rankChance(rank.chance, level) * (read(rank) - 1)), 1);
}

function memberWorth(content: Content, member: PackMember, level: number): number {
  const monster: MonsterDef | undefined = content.monsters.get(member.monster);
  if (monster === undefined || monster.boss !== null) return 0;
  const gold: number = monster.loot.goldChance * ((monster.loot.goldMin + monster.loot.goldMax) / 2) * (1 + content.world.scaling.xpPerLevel * (level - 1)) * rankLift(content, level, (rank: PackRankDef): number => rank.members.gold);
  const items: number = Math.min(1, monster.loot.itemChance * rankLift(content, level, (rank: PackRankDef): number => rank.members.itemChance)) * meanSellValue(content, level);
  return member.count * (gold + items);
}

export function clearValue(content: Content, zone: ZoneDef): number {
  return zone.packs.reduce((sum: number, pack: ZonePack): number => {
    const level: number = pack.level ?? zone.level;
    return sum + pack.members.reduce((inner: number, member: PackMember): number => inner + memberWorth(content, member, level), 0);
  }, 0);
}

function rounded(pricing: RunPricing, value: number): number {
  return Math.max(pricing.least, Math.round(value / pricing.round) * pricing.round);
}

export function pinPrices(content: Content, zone: ZoneDef, pins: readonly RunPin[]): number[] {
  const pricing: RunPricing = content.runTable.pricing;
  const unit: number = clearValue(content, zone) * pricing.share;
  const list: PinnedCondition[] = pinned(content, pins);
  const weightOf = (index: number): number => list[index]?.condition.price ?? 0;
  const order: number[] = list.map((_: PinnedCondition, index: number): number => index).toSorted((a: number, b: number): number => (weightOf(b) === weightOf(a) ? a - b : weightOf(b) - weightOf(a)));
  const prices: number[] = list.map((): number => 0);
  order.forEach((index: number, place: number): void => {
    const weight: number = list[index]?.condition.price ?? 0;
    prices[index] = rounded(pricing, unit * weight * (pricing.steps[place] ?? pricing.steps[pricing.steps.length - 1] ?? 1));
  });
  return prices;
}

export function runPrice(content: Content, zone: ZoneDef, pins: readonly RunPin[]): number {
  return pinPrices(content, zone, pins).reduce((sum: number, price: number): number => sum + price, 0);
}

export function reachedLevels(world: World): ZoneDef[] {
  return world.content.runTable.levels.flatMap((id: string): ZoneDef[] => {
    const zone: ZoneDef | undefined = world.content.zones.get(id);
    return zone !== undefined && world.waypoints.includes(id) ? [zone] : [];
  });
}

export function levelKinds(content: Content, zone: ZoneDef): MonsterDef[] {
  const seen: Map<string, MonsterDef> = new Map<string, MonsterDef>();
  for (const pack of zone.packs) {
    for (const member of pack.members) {
      const monster: MonsterDef | undefined = content.monsters.get(member.monster);
      if (monster !== undefined && monster.boss === null && monster.rank === null && monster.summon === null && !seen.has(monster.name)) seen.set(monster.name, monster);
    }
  }
  return [...seen.values()];
}

function pinProblem(content: Content, zone: ZoneDef, pin: RunPin): RunRefusal | null {
  const condition: RunCondition | undefined = content.runTable.conditions.find((entry: RunCondition): boolean => entry.id === pin.condition);
  if (condition === undefined) return 'pins';
  let problem: RunRefusal | null = null;
  switch (condition.pick) {
    case 'none':
      problem = pin.pick === null ? null : 'pick';
      break;
    case 'monster':
      problem = pin.pick !== null && levelKinds(content, zone).some((monster: MonsterDef): boolean => monster.id === pin.pick) ? null : 'pick';
      break;
  }
  return problem;
}

export function setupProblem(world: World, setup: RunSetup): RunRefusal | null {
  const table: RunTableDef = world.content.runTable;
  if (world.service?.kind !== 'descent') return 'away';
  const zone: ZoneDef | undefined = world.content.zones.get(setup.zone);
  if (zone === undefined || !reachedLevels(world).includes(zone)) return 'level';
  const ids: string[] = setup.pins.map((pin: RunPin): string => pin.condition);
  if (setup.pins.length > table.pins || new Set<string>(ids).size !== ids.length) return 'pins';
  if (setup.pins.some((pin: RunPin): boolean => clashIn(world.content, setup.pins, pin.condition) !== null)) return 'pins';
  for (const pin of setup.pins) {
    const problem: RunRefusal | null = pinProblem(world.content, zone, pin);
    if (problem !== null) return problem;
  }
  return world.player.gold < runPrice(world.content, zone, setup.pins) ? 'gold' : null;
}

export function setOut(world: World, setup: RunSetup): void {
  const problem: RunRefusal | null = setupProblem(world, setup);
  const zone: ZoneDef | undefined = world.content.zones.get(setup.zone);
  if (problem === 'gold') world.events.push({ type: 'notice', reason: 'no_gold' });
  if (problem !== null || zone === undefined) {
    if (problem !== 'gold') world.events.push({ type: 'notice', reason: 'run_refused' });
    return;
  }
  const price: number = runPrice(world.content, zone, setup.pins);
  if (!chargeGold(world, price)) return;
  const kept: RunSetup = copySetup(setup);
  world.service = null;
  if (world.portal?.zone === zone.id) closePortal(world);
  world.run.active = setup.pins.length > 0 ? kept : null;
  world.run.last = kept;
  const from: string = world.zone.id;
  enterZone(world, zone, { type: 'waypoint' });
  world.events.push({ type: 'zone_changed', from, to: zone.id });
  world.events.push({ type: 'run_set', zone: zone.id, price });
}
