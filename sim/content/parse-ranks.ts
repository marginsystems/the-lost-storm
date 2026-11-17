import type { Fields } from './read.ts';
import { colour, ContentError, each, fields, flag, nonNegative, nullableText, positive, share, text, textList } from './read.ts';
import type { MonsterModDef } from './combat-types.ts';
import type { ModPair, PackRankDef, PackRanks, RankChance, RankLook, RankModChoice, RankScale } from './rank-types.ts';
import type { Content, MonsterDef, PackMember, RarityDef, ZoneDef, ZonePack } from './types.ts';

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
    size: positive(source, 'size', where),
  };
}

function look(value: unknown, where: string): RankLook | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { body: share(source, 'body', where), ground: share(source, 'ground', where), reach: positive(source, 'reach', where) };
}

function rank(value: unknown, where: string): PackRankDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    color: colour(source, 'color', where),
    aura: source['aura'] === null || source['aura'] === undefined ? null : colour(source, 'aura', where),
    look: look(source['look'], `${where}.look`),
    chance: chance(source['chance'], `${where}.chance`),
    members: scale(source['members'], `${where}.members`),
    leader: source['leader'] === null || source['leader'] === undefined ? null : scale(source['leader'], `${where}.leader`),
  };
}

function choice(value: unknown, where: string): RankModChoice {
  const source: Fields = fields(value, where);
  return { mod: text(source, 'mod', where), weight: positive(source, 'weight', where), leader: source['leader'] === undefined ? false : flag(source, 'leader', where), from: source['from'] === undefined ? 1 : Math.max(1, whole(source, 'from', where)) };
}

function pair(value: unknown, where: string): ModPair {
  if (!Array.isArray(value) || value.length !== 2) throw new ContentError(where, 'expected a pair of modifier ids');
  const items: readonly unknown[] = value.map((item: unknown): unknown => item);
  const first: unknown = items[0];
  const second: unknown = items[1];
  if (typeof first !== 'string' || typeof second !== 'string' || first === second) throw new ContentError(where, 'expected two different modifier ids');
  return [first, second];
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
    apart: source['apart'] === undefined ? [] : each(source['apart'], `${where}.apart`, pair),
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

function rankless(content: Content, member: PackMember): boolean {
  const monster: MonsterDef | undefined = content.monsters.get(member.monster);
  return member.mods.length === 0 && (monster?.boss ?? null) === null && (monster?.rank ?? null) === null;
}

function namedRankProblems(content: Content, zone: ZoneDef, pack: ZonePack, named: string, need: (ok: boolean, problem: string) => void): void {
  const at: string = `zone ${zone.id} pack at ${pack.x},${pack.z}`;
  need(content.packRanks.ranks.some((def: PackRankDef): boolean => def.id === named), `${at} names unknown rank ${named}`);
  need(zone.ranks, `${at} names rank ${named}, but the zone has no ranks`);
  need(pack.members.every((member: PackMember): boolean => rankless(content, member)), `${at} names rank ${named}, but a boss, a ranked monster or a modded member never takes a rank`);
}

export function zoneRankProblems(content: Content, zone: ZoneDef): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  for (const pack of zone.packs) if (pack.rank !== undefined) namedRankProblems(content, zone, pack, pack.rank, need);
  return problems;
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
    need(def.look === null || def.aura !== null, `pack rank ${def.id} has a look but no aura colour to light it with`);
    if (def.leader !== null) floorKnown(content, `pack rank ${def.id} leader`, def.leader, need);
    const shared: number = ranks.pool.filter((entry: RankModChoice): boolean => !entry.leader).length;
    const led: number = ranks.pool.length - shared;
    need(def.members.mods <= shared, `pack rank ${def.id} rolls ${def.members.mods} shared modifiers, but the pool holds ${shared}`);
    if (def.leader !== null) need(def.leader.mods - def.members.mods <= led, `pack rank ${def.id} gives its leader ${def.leader.mods - def.members.mods} modifiers of its own, but the pool holds ${led} for leaders`);
    if (def.leader !== null) need(def.leader.mods >= def.members.mods, `pack rank ${def.id} gives its followers more modifiers than its leader`);
  }
  for (const entry of ranks.pool) {
    const mod: MonsterModDef | undefined = content.monsterMods.get(entry.mod);
    need(mod !== undefined, `pack rank pool names unknown modifier ${entry.mod}`);
    if (mod !== undefined) need(mod.summon === null || (entry.leader && mod.summon.monster === null), `pack rank pool modifier ${entry.mod} summons, and only a leader may call, and only its own kind`);
  }
  for (const [first, second] of ranks.apart) {
    for (const id of [first, second]) need(ranks.pool.some((entry: RankModChoice): boolean => entry.mod === id), `pack rank modifiers kept apart name ${id}, which is not in the pool`);
  }
  need(ranks.names.first.length > 0 && ranks.names.second.length > 0, 'pack ranks need names for rare leaders');
  for (const zone of content.zones.values()) problems.push(...zoneRankProblems(content, zone));
  return problems;
}
