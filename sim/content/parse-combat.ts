import type { Fields } from './read.ts';
import { ContentError, fields, nonNegative, nullableText, numeric, positive, text, textList } from './read.ts';
import type { DormantDef, FieldDelivery, GuardDef, MarkDelivery, MonsterModDef, MonsterPoise, ReviveDelivery, SkillLeap, SummonDef } from './combat-types.ts';
import type { Content, MonsterDef, SkillDef } from './types.ts';

const STEADY: MonsterPoise = { knockback: 1, stagger: 1 };

function optional<T>(value: unknown, where: string, read: (source: Fields, where: string) => T): T | null {
  if (value === undefined || value === null) return null;
  return read(fields(value, where), where);
}

function zeroOrMore(source: Fields, key: string, where: string): number {
  if (source[key] === undefined) return 0;
  const value: number = numeric(source, key, where);
  if (value < 0) throw new ContentError(`${where}.${key}`, 'expected zero or more');
  return value;
}

function share(source: Fields, key: string, where: string): number {
  const value: number = numeric(source, key, where);
  if (value < 0 || value > 1) throw new ContentError(`${where}.${key}`, 'expected a number from 0 to 1');
  return value;
}

export function markDelivery(source: Fields, where: string): MarkDelivery {
  return { type: 'mark', range: zeroOrMore(source, 'range', where), radius: positive(source, 'radius', where), delay: positive(source, 'delay', where) };
}

function leap(source: Fields, where: string): SkillLeap {
  return { distance: positive(source, 'distance', where), stopShort: zeroOrMore(source, 'stopShort', where), airTime: positive(source, 'airTime', where) };
}

export function reviveDelivery(source: Fields, where: string): ReviveDelivery {
  const count: number = positive(source, 'count', where);
  if (!Number.isInteger(count)) throw new ContentError(`${where}.count`, 'expected a whole number');
  const lifeShare: number = share(source, 'lifeShare', where);
  if (lifeShare === 0) throw new ContentError(`${where}.lifeShare`, 'a raised body needs some life');
  return { type: 'revive', range: positive(source, 'range', where), count, lifeShare };
}

export function fieldDelivery(source: Fields, where: string): FieldDelivery {
  return { type: 'field', range: zeroOrMore(source, 'range', where), radius: positive(source, 'radius', where), duration: positive(source, 'duration', where), slow: share(source, 'slow', where) };
}

export interface SkillMotion {
  readonly leap: SkillLeap | null;
  readonly root: number;
  readonly hold: number;
  readonly echo: number;
}

export function skillMotion(source: Fields, where: string): SkillMotion {
  return { leap: optional(source['leap'], `${where}.leap`, leap), root: zeroOrMore(source, 'root', where), hold: zeroOrMore(source, 'hold', where), echo: zeroOrMore(source, 'echo', where) };
}

function dormant(source: Fields, where: string): DormantDef {
  return { noiseRadius: positive(source, 'noiseRadius', where) };
}

function poise(source: Fields, where: string): MonsterPoise {
  return { knockback: share(source, 'knockback', where), stagger: share(source, 'stagger', where) };
}

const FULL_TURN_DEGREES: number = 360;

function arc(source: Fields, where: string): number {
  const value: number = positive(source, 'arcDegrees', where);
  if (value > FULL_TURN_DEGREES) throw new ContentError(`${where}.arcDegrees`, `expected at most ${FULL_TURN_DEGREES}`);
  return value;
}

function guard(source: Fields, where: string): GuardDef {
  return { arcDegrees: arc(source, where), damageTaken: share(source, 'damageTaken', where), breakStagger: positive(source, 'breakStagger', where), breakTime: positive(source, 'breakTime', where) };
}

function summon(source: Fields, where: string): SummonDef {
  const count: number = positive(source, 'count', where);
  const limit: number = positive(source, 'limit', where);
  if (!Number.isInteger(count) || !Number.isInteger(limit)) throw new ContentError(where, 'count and limit must be whole numbers');
  return { monster: nullableText(source, 'monster', where), count, cooldown: positive(source, 'cooldown', where), limit };
}

export interface MonsterTraits {
  readonly poise: MonsterPoise;
  readonly guard: GuardDef | null;
  readonly deathSkill: string | null;
  readonly summon: SummonDef | null;
  readonly mods: readonly string[];
  readonly faction: string;
  readonly dormant: DormantDef | null;
  readonly support: string | null;
  readonly barks: readonly string[];
  readonly shed: number;
}

export function monsterTraits(source: Fields, where: string): MonsterTraits {
  return {
    poise: optional(source['poise'], `${where}.poise`, poise) ?? STEADY,
    guard: optional(source['guard'], `${where}.guard`, guard),
    deathSkill: nullableText(source, 'deathSkill', where),
    summon: optional(source['summon'], `${where}.summon`, summon),
    mods: [],
    faction: text(source, 'faction', where),
    dormant: optional(source['dormant'], `${where}.dormant`, dormant),
    support: nullableText(source, 'support', where),
    barks: source['barks'] === undefined ? [] : textList(source, 'barks', where),
    shed: source['shed'] === undefined ? 0 : nonNegative(source, 'shed', where),
  };
}

export function packMods(source: Fields, where: string): string[] {
  return source['mods'] === undefined ? [] : textList(source, 'mods', where);
}

export function monsterMod(value: unknown, where: string): MonsterModDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    prefix: text(source, 'prefix', where),
    lifeScale: positive(source, 'lifeScale', where),
    damageScale: positive(source, 'damageScale', where),
    speedScale: positive(source, 'speedScale', where),
    sizeScale: positive(source, 'sizeScale', where),
    xpScale: positive(source, 'xpScale', where),
    lootScale: positive(source, 'lootScale', where),
    color: text(source, 'color', where),
    deathSkill: nullableText(source, 'deathSkill', where),
    summon: optional(source['summon'], `${where}.summon`, summon),
  };
}

function blasts(content: Content, holder: string, skillId: string | null, need: (ok: boolean, problem: string) => void): void {
  if (skillId === null) return;
  const used: SkillDef | undefined = content.skills.get(skillId);
  need(used !== undefined, `${holder} bursts with unknown skill ${skillId}`);
  if (used !== undefined) need(used.delivery.type === 'mark', `${holder} bursts with skill ${skillId}, which is not a mark on the ground`);
}

function summons(content: Content, holder: string, called: SummonDef | null, need: (ok: boolean, problem: string) => void): void {
  if (called === null || called.monster === null) return;
  const def: MonsterDef | undefined = content.monsters.get(called.monster);
  need(def !== undefined, `${holder} summons unknown monster ${called.monster}`);
  if (def !== undefined) need(def.boss === null && def.summon === null, `${holder} summons ${called.monster}, which is a boss or a summoner itself`);
}

export function combatProblems(content: Content): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, problem: string): void => {
    if (!ok) problems.push(problem);
  };
  for (const def of content.monsters.values()) {
    need(def.boss === null || def.guard === null, `boss ${def.id} cannot have a guard; bosses are never staggered`);
    blasts(content, `monster ${def.id}`, def.deathSkill, need);
    summons(content, `monster ${def.id}`, def.summon, need);
    if (def.support !== null) {
      const helper: SkillDef | undefined = content.skills.get(def.support);
      need(helper !== undefined, `monster ${def.id} supports with unknown skill ${def.support}`);
      if (helper !== undefined) need(helper.delivery.type === 'revive', `monster ${def.id} supports with skill ${def.support}, which raises nobody`);
    }
    need(def.dormant === null || def.boss === null, `boss ${def.id} cannot be dormant`);
    const used: SkillDef | undefined = content.skills.get(def.skill);
    if (used !== undefined) need(used.delivery.type !== 'revive', `monster ${def.id} attacks with ${def.skill}, which only raises the fallen`);
    if (def.behaviour.type === 'stalker' && used !== undefined) need(used.engageRange > def.behaviour.orbitRange, `monster ${def.id} circles at ${def.behaviour.orbitRange}, outside the reach of its skill ${def.skill}`);
  }
  for (const mod of content.monsterMods.values()) {
    blasts(content, `monster mod ${mod.id}`, mod.deathSkill, need);
    summons(content, `monster mod ${mod.id}`, mod.summon, need);
  }
  for (const zoneDef of content.zones.values()) {
    for (const packDef of zoneDef.packs) {
      for (const member of packDef.members) {
        for (const mod of member.mods) need(content.monsterMods.has(mod), `zone ${zoneDef.id} pack gives ${member.monster} unknown mod ${mod}`);
        const given: MonsterModDef[] = member.mods.flatMap((mod: string): MonsterModDef[] => {
          const found: MonsterModDef | undefined = content.monsterMods.get(mod);
          return found === undefined ? [] : [found];
        });
        need(given.filter((mod: MonsterModDef): boolean => mod.deathSkill !== null).length <= 1, `zone ${zoneDef.id} pack gives ${member.monster} more than one mod with a death burst`);
        need(given.filter((mod: MonsterModDef): boolean => mod.summon !== null).length <= 1, `zone ${zoneDef.id} pack gives ${member.monster} more than one mod that summons`);
      }
    }
  }
  for (const used of content.skills.values()) {
    if (used.leap !== null) need(used.delivery.type === 'arc' || used.delivery.type === 'nova', `skill ${used.id} leaps, so it must land with an arc or a nova`);
    if (used.leap !== null) need(used.leap.airTime <= used.windup, `skill ${used.id} is in the air longer than its windup`);
    if (used.echo > 0) need(used.delivery.type !== 'dash' && used.delivery.type !== 'revive', `skill ${used.id} echoes, but a ${used.delivery.type} cannot be replayed`);
  }
  return problems;
}
