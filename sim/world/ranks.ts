import type { MonsterModDef } from '../content/combat-types.ts';
import type { ModPair, MonsterRank, PackRankDef, PackRanks, RankChance, RankModChoice, RankScale } from '../content/rank-types.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import type { Rng } from '../rng.ts';
import { pickWeighted } from '../rng.ts';
import { withMods } from './elites.ts';

export function rankChance(chance: RankChance, level: number): number {
  if (level < chance.from) return 0;
  return Math.min(chance.max, chance.base + chance.perLevel * Math.max(0, level - 1));
}

export function lowestRank(ranks: PackRanks, level: number): PackRankDef | null {
  return ranks.ranks.find((rank: PackRankDef): boolean => rank.chance !== null && rankChance(rank.chance, level) > 0) ?? null;
}

export function rollRank(ranks: PackRanks, rng: Rng, level: number): PackRankDef | null {
  const plain: PackRankDef | null = ranks.ranks[0] ?? null;
  for (let index: number = ranks.ranks.length - 1; index > 0; index -= 1) {
    const rank: PackRankDef | undefined = ranks.ranks[index];
    if (rank === undefined || rank.chance === null) continue;
    if (rng.chance(rankChance(rank.chance, level))) return rank;
  }
  return plain;
}

export function keptApart(apart: readonly ModPair[], one: string, other: string): boolean {
  return apart.some(([first, second]: ModPair): boolean => (first === one && second === other) || (first === other && second === one));
}

export function modAvailable(entry: RankModChoice, leader: boolean, level: number): boolean {
  return entry.leader === leader && entry.from <= level;
}

export function rollMods(content: Content, rng: Rng, count: number, leader: boolean, held: readonly MonsterModDef[], level: number): MonsterModDef[] {
  const apart: readonly ModPair[] = content.packRanks.apart;
  const fits = (entry: RankModChoice, chosen: readonly MonsterModDef[]): boolean => modAvailable(entry, leader, level) && chosen.every((mod: MonsterModDef): boolean => mod.id !== entry.mod && !keptApart(apart, mod.id, entry.mod));
  const chosen: MonsterModDef[] = [...held];
  const wanted: number = held.length + count;
  while (chosen.length < wanted) {
    const left: RankModChoice[] = content.packRanks.pool.filter((entry: RankModChoice): boolean => fits(entry, chosen));
    const picked: RankModChoice | null = pickWeighted(rng, left);
    if (picked === null) break;
    const mod: MonsterModDef | undefined = content.monsterMods.get(picked.mod);
    if (mod === undefined) break;
    chosen.push(mod);
  }
  return chosen.slice(held.length);
}

function pickName(rng: Rng, names: readonly string[]): string {
  return names[rng.int(0, names.length - 1)] ?? '';
}

function leaderIndex(bases: readonly MonsterDef[]): number {
  let best: number = 0;
  bases.forEach((base: MonsterDef, index: number): void => {
    if (base.life > (bases[best]?.life ?? 0)) best = index;
  });
  return best;
}

function scaled(def: MonsterDef, rank: PackRankDef, scale: RankScale, leader: boolean, shown: string): MonsterDef {
  const ranked: MonsterRank = { id: rank.id, name: rank.name, color: rank.color, aura: rank.aura, leader, title: leader ? shown : null, xp: scale.xp, items: scale.items, floor: scale.floor, size: scale.size, look: rank.look };
  return {
    ...def,
    name: shown,
    scale: def.scale * scale.size,
    life: def.life * scale.life,
    damageMin: def.damageMin * scale.damage,
    damageMax: def.damageMax * scale.damage,
    xp: def.xp * scale.xp,
    loot: {
      goldChance: def.loot.goldChance,
      goldMin: def.loot.goldMin * scale.gold,
      goldMax: def.loot.goldMax * scale.gold,
      itemChance: Math.min(1, def.loot.itemChance * scale.itemChance),
    },
    color: rank.aura ?? def.color,
    rank: ranked,
  };
}

export function rankPack(content: Content, rng: Rng, rank: PackRankDef | null, bases: readonly MonsterDef[], level: number): MonsterDef[] {
  if (rank === null || rank.chance === null || bases.length === 0) return [...bases];
  const lead: RankScale | null = rank.leader;
  const shared: MonsterModDef[] = rollMods(content, rng, rank.members.mods, false, [], level);
  const mods: MonsterModDef[] = lead === null ? shared : [...shared, ...rollMods(content, rng, Math.max(0, lead.mods - rank.members.mods), true, shared, level)];
  const leader: number = lead === null ? -1 : leaderIndex(bases);
  const title: string | null = lead === null ? null : `${pickName(rng, content.packRanks.names.first)} ${pickName(rng, content.packRanks.names.second)}`;
  return bases.map((base: MonsterDef, index: number): MonsterDef => {
    if (index === leader && lead !== null) return scaled(withMods(base, mods), rank, lead, true, title ?? base.name);
    return scaled(withMods(base, shared), rank, rank.members, false, base.name);
  });
}

export function ranksHere(bases: readonly MonsterDef[]): boolean {
  return bases.length > 0 && bases.every((base: MonsterDef): boolean => base.boss === null && base.rank === null && base.mods.length === 0);
}

export function rankSize(def: MonsterDef): number {
  return def.rank?.size ?? 1;
}
