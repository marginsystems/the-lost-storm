import type { Fields } from './read.ts';
import { colour, ContentError, each, fields, nonNegative, nullableText, positive, share, text, textList } from './read.ts';
import type { MonsterModDef } from './combat-types.ts';
import type { PackRankDef, PackRanks, RankChance, RankModChoice, RankScale } from './rank-types.ts';
import type { Content, RarityDef } from './types.ts';

function chance(value: unknown, where: string): RankChance | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  const read: RankChance = { base: share(source, 'base', where), perLevel: nonNegative(source, 'perLevel', where), max: share(source, 'max', where) };
  if (read.max < read.base) throw new ContentError(`${where}.max`, 'the chance cannot cap below where it starts');
  return read;
}

function whole(source: Fields, key: string, where: string): number {
  const value: number = nonNegative(source, key, where);
  if (!Number.isInteger(value)) throw new ContentError(`${where}.${key}`, 'expected a whole number');
  return value;
}

function scale(value: unknown, where: string): RankScale {
  const source: Fields = fields(value, where);
  return {
    life: positive(source, 'life', where),
    damage: positive(source, 'damage', where),
    xp: positive(source, 'xp', where),
    itemChance: nonNegative(source, 'itemChance', where),
    gold: nonNegative(source, 'gold', where),
    items: whole(source, 'items', where),
    floor: nullableText(source, 'floor', where),
    mods: whole(source, 'mods', where),
  };
}

function rank(value: unknown, where: string): PackRankDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    color: colour(source, 'color', where),
    aura: source['aura'] === null || source['aura'] === undefined ? null : colour(source, 'aura', where),
    chance: chance(source['chance'], `${where}.chance`),
    members: scale(source['members'], `${where}.members`),
    leader: source['leader'] === null || source['leader'] === undefined ? null : scale(source['leader'], `${where}.leader`),
  };
}

function choice(value: unknown, where: string): RankModChoice {
  const source: Fields = fields(value, where);
  return { mod: text(source, 'mod', where), weight: positive(source, 'weight', where) };
}

export function packRanks(value: unknown, where: string): PackRanks {
  const source: Fields = fields(value, where);
  const names: Fields = fields(source['names'], `${where}.names`);
  const ranks: PackRankDef[] = each(source['ranks'], `${where}.ranks`, rank);
  const first: PackRankDef | undefined = ranks[0];
  if (first === undefined || first.chance !== null) throw new ContentError(`${where}.ranks`, 'the first rank is the plain one: it has no chance of its own');
  if (ranks.slice(1).some((later: PackRankDef): boolean => later.chance === null)) throw new ContentError(`${where}.ranks`, 'every rank after the first needs a chance');
  return {
    ranks,
    pool: each(source['pool'], `${where}.pool`, choice),
    names: { first: textList(names, 'first', `${where}.names`), second: textList(names, 'second', `${where}.names`) },
  };
}

function floorKnown(content: Content, owner: string, scaled: RankScale, need: (ok: boolean, problem: string) => void): void {
  if (scaled.floor === null) return;
  need(
    content.rarities.some((rarity: RarityDef): boolean => rarity.id === scaled.floor),
    `${owner} floors its drops at unknown rarity ${scaled.floor}`,
  );
}

export function rankProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  const ranks: PackRanks = content.packRanks;
  const seen: Set<string> = new Set<string>();
  for (const def of ranks.ranks) {
    need(!seen.has(def.id), `pack rank ${def.id} is listed twice`);
    seen.add(def.id);
    floorKnown(content, `pack rank ${def.id} members`, def.members, need);
    if (def.leader !== null) floorKnown(content, `pack rank ${def.id} leader`, def.leader, need);
    const most: number = Math.max(def.members.mods, def.leader?.mods ?? 0);
    need(most <= ranks.pool.length, `pack rank ${def.id} rolls ${most} modifiers, but the pool holds ${ranks.pool.length}`);
    if (def.leader !== null) need(def.leader.mods >= def.members.mods, `pack rank ${def.id} gives its followers more modifiers than its leader`);
  }
  for (const entry of ranks.pool) {
    const mod: MonsterModDef | undefined = content.monsterMods.get(entry.mod);
    need(mod !== undefined, `pack rank pool names unknown modifier ${entry.mod}`);
    if (mod !== undefined) need(mod.summon === null, `pack rank pool modifier ${entry.mod} summons, and a ranked pack must not call monsters from outside its zone`);
  }
  need(ranks.names.first.length > 0 && ranks.names.second.length > 0, 'pack ranks need names for rare leaders');
  return problems;
}
