import type { AlarmDef } from '../content/combat-types.ts';
import type { PackRankDef } from '../content/rank-types.ts';
import type { MonsterDef, SurgeRules, ZonePack } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { lineOfSight } from '../nav/grid.ts';
import { aggroPack } from './combat.ts';
import { allHold } from './conditions.ts';
import { modsNamed, withMods } from './elites.ts';
import { rankPack, ranksHere, rollRank } from './ranks.ts';
import { packLevel, SPAWN, spawnMonster } from './spawn.ts';
import type { MonsterState, World } from './types.ts';

export function surgeExtra(world: World): number {
  const rules: SurgeRules | null = world.zone.surge;
  return rules === null ? 0 : Math.min(rules.maxExtraMonsters, Math.floor((world.surge - 1) / Math.max(1, rules.surgesPerExtraMonster)));
}

function packRank(world: World, pack: ZonePack, level: number): PackRankDef | null {
  if (pack.rank === undefined) return rollRank(world.content.packRanks, world.rng, level);
  return world.content.packRanks.ranks.find((named: PackRankDef): boolean => named.id === pack.rank) ?? null;
}

export function spawnPack(world: World, pack: ZonePack, extra: number, awake: boolean): void {
  world.spawnedPacks.push(pack);
  const packId: number = world.nextPackId;
  world.nextPackId += 1;
  if (world.zone.packReturn !== null) world.packReturns.push({ pack, packId, left: null });
  const level: number = packLevel(world, pack);
  const defs: MonsterDef[] = [];
  pack.members.forEach((member, index: number): void => {
    const base: MonsterDef | undefined = world.content.monsters.get(member.monster);
    if (base === undefined) return;
    const def: MonsterDef = withMods(base, modsNamed(world.content.monsterMods, member.mods));
    const count: number = member.count + (index === 0 ? extra : 0);
    for (let spawned: number = 0; spawned < count; spawned += 1) defs.push(def);
  });
  const ranked: MonsterDef[] = world.zone.ranks && ranksHere(defs) ? rankPack(world.content, world.rng, packRank(world, pack, level), defs, level) : defs;
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
