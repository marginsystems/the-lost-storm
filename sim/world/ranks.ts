import type { MonsterModDef } from '../content/combat-types.ts';
import type { MonsterRank, PackRankDef, PackRanks, RankChance, RankModChoice, RankScale } from '../content/rank-types.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import type { Rng } from '../rng.ts';
import { pickWeighted } from '../rng.ts';
import { withMods } from './elites.ts';

export function rankChance(chance: RankChance, level: number): number {
  return Math.min(chance.max, chance.base + chance.perLevel * Math.max(0, level - 1));
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

function rollMods(content: Content, rng: Rng, count: number): MonsterModDef[] {
  const left: RankModChoice[] = [...content.packRanks.pool];
  const chosen: MonsterModDef[] = [];
  while (chosen.length < count && left.length > 0) {
    const picked: RankModChoice | null = pickWeighted(rng, left);
    if (picked === null) break;
    left.splice(left.indexOf(picked), 1);
    const mod: MonsterModDef | undefined = content.monsterMods.get(picked.mod);
    if (mod !== undefined) chosen.push(mod);
  }
  return chosen;
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

function scaled(def: MonsterDef, rank: PackRankDef, scale: RankScale, leader: boolean, title: string | null): MonsterDef {
  const ranked: MonsterRank = { id: rank.id, name: rank.name, color: rank.color, aura: rank.aura, leader, title, xp: scale.xp, items: scale.items, floor: scale.floor };
  return {
    ...def,
    name: title ?? def.name,
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

export function rankPack(content: Content, rng: Rng, rank: PackRankDef | null, bases: readonly MonsterDef[]): MonsterDef[] {
  if (rank === null || rank.chance === null || bases.length === 0) return [...bases];
  const lead: RankScale | null = rank.leader;
  const mods: MonsterModDef[] = rollMods(content, rng, Math.max(rank.members.mods, lead?.mods ?? 0));
  const shared: MonsterModDef[] = mods.slice(0, rank.members.mods);
  const leader: number = lead === null ? -1 : leaderIndex(bases);
  const title: string | null = lead === null ? null : `${pickName(rng, content.packRanks.names.first)} ${pickName(rng, content.packRanks.names.second)}`;
  return bases.map((base: MonsterDef, index: number): MonsterDef => {
    if (index === leader && lead !== null) return scaled(withMods(base, mods.slice(0, lead.mods)), rank, lead, true, title);
    return scaled(withMods(base, shared), rank, rank.members, false, null);
  });
}

export function ranksHere(bases: readonly MonsterDef[]): boolean {
  return bases.length > 0 && bases.every((base: MonsterDef): boolean => base.boss === null && base.rank === null && base.mods.length === 0);
}
