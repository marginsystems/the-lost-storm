import type { AlarmDef } from '../content/combat-types.ts';
import type { PackRankDef, PackRanks, RankRun } from '../content/rank-types.ts';
import type { MonsterDef, SurgeRules, ZonePack } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { lineOfSight } from '../nav/grid.ts';
import { aggroPack } from './combat.ts';
import { allHold } from './conditions.ts';
import { modsNamed, withMods } from './elites.ts';
import { lowestRank, rankPack, ranksHere, rollRank } from './ranks.ts';
import { packLevel, SPAWN, spawnMonster } from './spawn.ts';
import type { RunShaping } from './run-state.ts';
import { runShaping } from './run-state.ts';
import { filledBy, grownCount, shapeDefs } from './run-shape.ts';
import type { MonsterState, World } from './types.ts';

export function surgeExtra(world: World): number {
  const rules: SurgeRules | null = world.zone.surge;
  return rules === null ? 0 : Math.min(rules.maxExtraMonsters, Math.floor((world.surge - 1) / Math.max(1, rules.surgesPerExtraMonster)));
}

export function freshRun(): RankRun {
  return { rolled: 0, ranked: false };
}

export function plannedRank(world: World, level: number, boost: number = 0): PackRankDef | null {
  const ranks: PackRanks = world.content.packRanks;
  const rolled: PackRankDef | null = rollRank(ranks, world.rng, level, boost);
  if (level < ranks.stretchFrom) return rolled;
  const run: RankRun = world.rankRun;
  run.rolled += 1;
  const closing: boolean = run.rolled >= ranks.stretch;
  const plain: boolean = rolled === null || rolled.chance === null;
  const chosen: PackRankDef | null = plain && closing && !run.ranked ? (lowestRank(ranks, level) ?? rolled) : rolled;
  run.ranked = run.ranked || (chosen !== null && chosen.chance !== null);
  if (closing) world.rankRun = freshRun();
  return chosen;
}

function packRank(world: World, pack: ZonePack, level: number, shaping: RunShaping | null): PackRankDef | null {
  const ranks: PackRanks = world.content.packRanks;
  const boost: number = shaping?.rankChance ?? 0;
  if (pack.rank === undefined) return plannedRank(world, level, boost);
  const named: PackRankDef | null = ranks.ranks.find((entry: PackRankDef): boolean => entry.id === pack.rank) ?? null;
  if (boost <= 0 || named === null || named !== ranks.ranks[0]) return named;
  return rollRank(ranks, world.rng, level, boost - 1);
}

export function spawnPack(world: World, pack: ZonePack, extra: number, awake: boolean): void {
  world.spawnedPacks.push(pack);
  const packId: number = world.nextPackId;
  world.nextPackId += 1;
  if (world.zone.packReturn !== null) world.packReturns.push({ pack, packId, left: null });
  const level: number = packLevel(world, pack);
  const shaping: RunShaping | null = runShaping(world);
  const defs: MonsterDef[] = [];
  pack.members.forEach((member, index: number): void => {
    const base: MonsterDef | undefined = world.content.monsters.get(member.monster);
    if (base === undefined) return;
    const def: MonsterDef = withMods(filledBy(world.content, shaping, base), modsNamed(world.content.monsterMods, member.mods));
    const count: number = grownCount(world.rng, shaping, member.count + (index === 0 ? extra : 0));
    for (let spawned: number = 0; spawned < count; spawned += 1) defs.push(def);
  });
  const ranked: MonsterDef[] = shapeDefs(world.content, shaping, world.zone.ranks && ranksHere(defs) ? rankPack(world.content, world.rng, packRank(world, pack, level, shaping), defs, level) : defs);
  const row: Vec2 = pack.row ?? { x: 0, z: 0 };
  const spawned: MonsterState[] = ranked.map((def: MonsterDef, place: number): MonsterState => spawnMonster(world, def, packId, { x: pack.x + row.x * place, z: pack.z + row.z * place }, { summonerId: null, scatter: pack.row === undefined ? SPAWN.spawnScatter : 0, revived: false, level }));
  const first: MonsterState | undefined = spawned[0];
  if (!awake || first === undefined) return;
  first.aggro = true;
  world.events.push({ type: 'aggro', monsterId: first.id });
  aggroPack(world, first);
}

export function waiting(world: World, pack: ZonePack): boolean {
  return pack.waits !== undefined && !world.spawnedPacks.includes(pack) && allHold(world, pack.when);
}

export function wakePack(world: World, pack: ZonePack): void {
  if (!waiting(world, pack)) return;
  world.roused.push(pack);
  spawnPack(world, pack, surgeExtra(world), true);
}

export function stepWaitingPacks(world: World): void {
  if (!world.player.alive) return;
  for (const pack of world.zone.packs) {
    const near: number | undefined = pack.waits?.near;
    if (near === undefined || !waiting(world, pack)) continue;
    if (distance(world.player.pos, pack) <= near && lineOfSight(world.grid, world.player.pos, pack)) wakePack(world, pack);
  }
}

export function alarmTarget(world: World, monster: MonsterState): ZonePack | null {
  const alarm: AlarmDef | null = monster.def.alarm;
  if (alarm === null) return null;
  let best: ZonePack | null = null;
  let bestGap: number = alarm.reach;
  for (const pack of world.zone.packs) {
    if (!waiting(world, pack)) continue;
    const gap: number = distance(monster.pos, pack);
    if (gap > bestGap) continue;
    best = pack;
    bestGap = gap;
  }
  return best;
}
