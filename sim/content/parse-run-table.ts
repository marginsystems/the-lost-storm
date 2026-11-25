import type { MonsterModDef } from './combat-types.ts';
import type { Fields } from './read.ts';
import { choice, ContentError, each, fields, nonNegative, positive, share, text, textList } from './read.ts';
import type { RunCondition, RunFamily, RunPricing, RunReward, RunRise, RunShape, RunTableDef } from './run-table-types.ts';
import { RUN_PICKS } from './run-table-types.ts';
import { leanOf } from './lean-rules.ts';
import type { Content, MonsterDef, ZoneDef } from './types.ts';

function optional(source: Fields, key: string, where: string): number {
  return source[key] === undefined ? 0 : nonNegative(source, key, where);
}

function rise(value: unknown, where: string): RunRise {
  const source: Fields = fields(value, where);
  return { monster: text(source, 'monster', where), chance: share(source, 'chance', where) };
}

function shape(value: unknown, where: string): RunShape {
  const source: Fields = fields(value, where);
  const fill: unknown = source['fill'];
  if (fill !== undefined && typeof fill !== 'boolean') throw new ContentError(`${where}.fill`, 'expected true or false');
  return {
    rankChance: optional(source, 'rankChance', where),
    grow: optional(source, 'grow', where),
    mods: source['mods'] === undefined ? [] : textList(source, 'mods', where),
    life: optional(source, 'life', where),
    damage: optional(source, 'damage', where),
    fill: fill === true,
    lean: optional(source, 'lean', where),
    rise: source['rise'] === undefined ? null : rise(source['rise'], `${where}.rise`),
  };
}

function reward(value: unknown, where: string): RunReward {
  const source: Fields = fields(value, where);
  return { xp: nonNegative(source, 'xp', where), gold: nonNegative(source, 'gold', where), items: nonNegative(source, 'items', where), rarity: share(source, 'rarity', where) };
}

function condition(value: unknown, where: string): RunCondition {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    text: text(source, 'text', where),
    price: positive(source, 'price', where),
    danger: nonNegative(source, 'danger', where),
    pick: source['pick'] === undefined ? 'none' : choice(source, 'pick', RUN_PICKS, where),
    shape: shape(source['shape'], `${where}.shape`),
    reward: reward(source['reward'], `${where}.reward`),
    excludes: source['excludes'] === undefined ? [] : textList(source, 'excludes', where),
  };
}

function pricing(value: unknown, where: string): RunPricing {
  const source: Fields = fields(value, where);
  const steps: number[] = each(source['steps'], `${where}.steps`, (entry: unknown, entryWhere: string): number => {
    if (typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0) throw new ContentError(entryWhere, 'expected a number above zero');
    return entry;
  });
  return { share: positive(source, 'share', where), steps, round: positive(source, 'round', where), least: positive(source, 'least', where) };
}

function family(value: unknown, where: string): RunFamily {
  const source: Fields = fields(value, where);
  return { id: text(source, 'id', where), name: text(source, 'name', where), monsters: textList(source, 'monsters', where) };
}

export function runTable(value: unknown, where: string): RunTableDef {
  const source: Fields = fields(value, where);
  const pins: number = positive(source, 'pins', where);
  if (!Number.isInteger(pins)) throw new ContentError(`${where}.pins`, 'expected a whole number');
  return {
    levels: textList(source, 'levels', where),
    pins,
    pricing: pricing(source['pricing'], `${where}.pricing`),
    conditions: each(source['conditions'], `${where}.conditions`, condition),
    families: source['families'] === undefined ? [] : each(source['families'], `${where}.families`, family),
    familyLeast: positive(source, 'familyLeast', where),
  };
}

function levelProblems(content: Content, id: string, need: (ok: boolean, problem: string) => void): void {
  const zone: ZoneDef | undefined = content.zones.get(id);
  need(zone !== undefined, `run table names unknown level ${id}`);
  if (zone === undefined) return;
  need(zone.kind === 'wild' && zone.packs.length > 0, `run table level ${id} has no packs to shape`);
  need(zone.waypoint !== null, `run table level ${id} has no waypoint to set out to`);
}

function modProblems(content: Content, owner: string, id: string, need: (ok: boolean, problem: string) => void): void {
  const mod: MonsterModDef | undefined = content.monsterMods.get(id);
  need(mod !== undefined, `${owner} names unknown modifier ${id}`);
  if (mod !== undefined) need(mod.summon === null, `${owner} puts ${id} on every pack, but it summons from outside the level`);
}

export function runTableProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  const table: RunTableDef = content.runTable;
  for (const id of table.levels) levelProblems(content, id, need);
  need(new Set<string>(table.levels).size === table.levels.length, 'run table lists a level twice');
  need(table.pricing.steps.length >= table.pins, `run table allows ${table.pins} pins but prices only ${table.pricing.steps.length}`);
  const unleaned: readonly string[] = table.levels.filter((level: string): boolean => leanOf(content, level) === null);
  const seen: Set<string> = new Set<string>();
  for (const entry of table.conditions) {
    const owner: string = `run condition ${entry.id}`;
    need(!seen.has(entry.id), `${owner} is listed twice`);
    seen.add(entry.id);
    for (const mod of entry.shape.mods) modProblems(content, owner, mod, need);
    if (entry.shape.rise !== null) {
      const raised: MonsterDef | undefined = content.monsters.get(entry.shape.rise.monster);
      need(raised !== undefined && raised.boss === null && raised.summon === null, `${owner} raises ${entry.shape.rise.monster}, which is not a plain monster`);
      need(entry.shape.rise.chance > 0, `${owner} raises the slain with no chance`);
    }
    need(entry.shape.fill === (entry.pick !== 'none'), `${owner} fills the level exactly when the player picks a monster or a family`);
    if (entry.pick === 'family') need(table.families.length > 0, `${owner} picks a family, but the run table lists none`);
    const total: number = entry.reward.xp + entry.reward.gold + entry.reward.items + entry.reward.rarity;
    need(total > 0 || entry.shape.lean > 0, `${owner} adds no reward and no lean`);
    if (entry.shape.lean > 0) problems.push(...unleaned.map((level: string): string => `${owner} leans drops, but run table level ${level} has no drop lean`));
    for (const other of entry.excludes) need(other !== entry.id && table.conditions.some((known: RunCondition): boolean => known.id === other), `${owner} excludes ${other}, which is not another run condition`);
  }
  const families: Set<string> = new Set<string>();
  for (const entry of table.families) {
    const owner: string = `run family ${entry.id}`;
    need(!families.has(entry.id), `${owner} is listed twice`);
    families.add(entry.id);
    need(entry.monsters.length >= table.familyLeast, `${owner} has fewer than ${table.familyLeast} monsters`);
    for (const id of entry.monsters) {
      const monster: MonsterDef | undefined = content.monsters.get(id);
      need(monster !== undefined && monster.boss === null && monster.rank === null && monster.summon === null, `${owner} names ${id}, which is not a plain monster`);
    }
  }
  return problems;
}
