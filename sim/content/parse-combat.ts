import type { Fields } from './read.ts';
import { choice, colour, ContentError, fields, flag, nullableText, numeric, positive, text, textList } from './read.ts';
import type { AlarmDef, BodyCrust, DormantDef, FieldDelivery, GuardDef, MarkDelivery, ModMotes, MonsterElement, MonsterModDef, MonsterPoise, MonsterTrail, ReviveDelivery, SkillCommit, SkillEchoing, SkillLeap, SummonDef } from './combat-types.ts';
import type { MonsterRank } from './rank-types.ts';
import { bodyCrust } from './parse-crust.ts';
import type { Content, MonsterDef, SkillDef } from './types.ts';

const STEADY: MonsterPoise = { knockback: 1, stagger: 1, resolve: 0 };

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
  const count: number = source['count'] === undefined ? 1 : positive(source, 'count', where);
  if (!Number.isInteger(count)) throw new ContentError(`${where}.count`, 'expected a whole number');
  const spacing: number = source['spacing'] === undefined ? 0 : zeroOrMore(source, 'spacing', where);
  if (count > 1 && spacing === 0) throw new ContentError(`${where}.spacing`, 'a row of marks needs a spacing');
  const step: number = source['step'] === undefined ? 0 : zeroOrMore(source, 'step', where);
  return { type: 'mark', range: zeroOrMore(source, 'range', where), radius: positive(source, 'radius', where), delay: positive(source, 'delay', where), count, spacing, step };
}

function leap(source: Fields, where: string): SkillLeap {
  return { distance: positive(source, 'distance', where), stopShort: zeroOrMore(source, 'stopShort', where), airTime: positive(source, 'airTime', where), lane: source['lane'] === undefined ? false : flag(source, 'lane', where) };
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

function commit(source: Fields, where: string): SkillCommit {
  return { at: share(source, 'at', where), breakStagger: positive(source, 'breakStagger', where) };
}

export interface SkillMotion extends SkillEchoing {
  readonly leap: SkillLeap | null;
  readonly root: number;
  readonly hold: number;
  readonly stun: number;
  readonly lifeOnHit: number;
  readonly leech: number;
  readonly commit: SkillCommit | null;
  readonly leaves: string | null;
}

export function skillMotion(source: Fields, where: string): SkillMotion {
  return {
    leap: optional(source['leap'], `${where}.leap`, leap),
    root: zeroOrMore(source, 'root', where),
    hold: zeroOrMore(source, 'hold', where),
    stun: zeroOrMore(source, 'stun', where),
    echo: zeroOrMore(source, 'echo', where),
    echoTurn: source['echoTurn'] === undefined ? 0 : numeric(source, 'echoTurn', where),
    echoShare: source['echoShare'] === undefined ? 1 : share(source, 'echoShare', where),
    lifeOnHit: zeroOrMore(source, 'lifeOnHit', where),
    leech: source['leech'] === undefined ? 0 : share(source, 'leech', where),
    commit: optional(source['commit'], `${where}.commit`, commit),
    leaves: source['leaves'] === undefined ? null : text(source, 'leaves', where),
  };
}

function dormant(source: Fields, where: string): DormantDef {
  return { noiseRadius: positive(source, 'noiseRadius', where) };
}

function alarm(source: Fields, where: string): AlarmDef {
  return { reach: positive(source, 'reach', where), cry: positive(source, 'cry', where) };
}

function poise(source: Fields, where: string): MonsterPoise {
  return { knockback: share(source, 'knockback', where), stagger: share(source, 'stagger', where), resolve: zeroOrMore(source, 'resolve', where) };
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

const ELEMENTS = ['storm', 'frost'] as const;

function element(source: Fields, where: string): MonsterElement {
  return { type: choice(source, 'type', ELEMENTS, where), share: share(source, 'share', where), resist: share(source, 'resist', where) };
}

function trail(source: Fields, where: string): MonsterTrail {
  const limit: number = positive(source, 'limit', where);
  if (!Number.isInteger(limit)) throw new ContentError(`${where}.limit`, 'expected a whole number');
  return { skill: text(source, 'skill', where), every: positive(source, 'every', where), limit };
}

function motes(source: Fields, where: string): ModMotes {
  return { color: colour(source, 'color', where), rate: positive(source, 'rate', where), lift: positive(source, 'lift', where) };
}

export interface MonsterTraits {
  readonly poise: MonsterPoise;
  readonly guard: GuardDef | null;
  readonly deathSkill: string | null;
  readonly summon: SummonDef | null;
  readonly mods: readonly string[];
  readonly faction: string;
  readonly dormant: DormantDef | null;
  readonly alarm: AlarmDef | null;
  readonly support: string | null;
  readonly barks: readonly string[];
  readonly regen: number;
  readonly element: MonsterElement | null;
  readonly trail: MonsterTrail | null;
  readonly rank: MonsterRank | null;
  readonly heatproof: boolean;
  readonly crust: BodyCrust | null;
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
    alarm: optional(source['alarm'], `${where}.alarm`, alarm),
    support: nullableText(source, 'support', where),
    barks: source['barks'] === undefined ? [] : textList(source, 'barks', where),
    regen: zeroOrMore(source, 'regen', where),
    element: optional(source['element'], `${where}.element`, element),
    trail: optional(source['trail'], `${where}.trail`, trail),
    rank: null,
    heatproof: source['heatproof'] === undefined ? false : flag(source, 'heatproof', where),
    crust: source['crust'] === undefined || source['crust'] === null ? null : bodyCrust(source['crust'], `${where}.crust`),
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
    staggerScale: source['staggerScale'] === undefined ? 1 : positive(source, 'staggerScale', where),
    knockbackScale: source['knockbackScale'] === undefined ? 1 : positive(source, 'knockbackScale', where),
    regen: zeroOrMore(source, 'regen', where),
    guard: optional(source['guard'], `${where}.guard`, guard),
    element: optional(source['element'], `${where}.element`, element),
    trail: optional(source['trail'], `${where}.trail`, trail),
    motes: optional(source['motes'], `${where}.motes`, motes),
    line: text(source, 'line', where),
  };
}

function blasts(content: Content, holder: string, skillId: string | null, need: (ok: boolean, problem: string) => void): void {
  if (skillId === null) return;
  const used: SkillDef | undefined = content.skills.get(skillId);
  need(used !== undefined, `${holder} bursts with unknown skill ${skillId}`);
  if (used !== undefined) need(used.delivery.type === 'mark', `${holder} bursts with skill ${skillId}, which is not a mark on the ground`);
}

function trails(content: Content, holder: string, left: MonsterTrail | null, need: (ok: boolean, problem: string) => void): void {
  if (left === null) return;
  const used: SkillDef | undefined = content.skills.get(left.skill);
  need(used !== undefined, `${holder} leaves a trail of unknown skill ${left.skill}`);
  if (used !== undefined) need(used.delivery.type === 'area' && used.delivery.anchor === 'ground', `${holder} leaves a trail of ${left.skill}, which is not a lasting area on the ground`);
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
    trails(content, `monster ${def.id}`, def.trail, need);
    if (def.support !== null) {
      const helper: SkillDef | undefined = content.skills.get(def.support);
      need(helper !== undefined, `monster ${def.id} supports with unknown skill ${def.support}`);
      if (helper !== undefined) need(helper.delivery.type === 'revive', `monster ${def.id} supports with skill ${def.support}, which raises nobody`);
    }
    need(def.dormant === null || def.boss === null, `boss ${def.id} cannot be dormant`);
    need(def.alarm === null || def.boss === null, `boss ${def.id} cannot raise an alarm`);
    const used: SkillDef | undefined = content.skills.get(def.skill);
    if (used !== undefined) need(used.delivery.type !== 'revive', `monster ${def.id} attacks with ${def.skill}, which only raises the fallen`);
    if (def.behaviour.type === 'stalker' && used !== undefined) need(used.engageRange > def.behaviour.orbitRange, `monster ${def.id} circles at ${def.behaviour.orbitRange}, outside the reach of its skill ${def.skill}`);
    if (def.behaviour.type === 'ambush' && used !== undefined) need(used.engageRange >= def.behaviour.spring, `monster ${def.id} springs from ${def.behaviour.spring}, beyond the reach of its skill ${def.skill}`);
  }
  for (const ground of content.surfaces.values()) {
    if (ground.heat === null) continue;
    const scorch: SkillDef | undefined = content.skills.get(ground.heat.skill);
    need(scorch !== undefined, `surface ${ground.id} burns with unknown skill ${ground.heat.skill}`);
    if (scorch !== undefined) need(scorch.burn !== null, `surface ${ground.id} burns with skill ${ground.heat.skill}, which sets nothing alight`);
  }
  for (const mod of content.monsterMods.values()) {
    blasts(content, `monster mod ${mod.id}`, mod.deathSkill, need);
    summons(content, `monster mod ${mod.id}`, mod.summon, need);
    trails(content, `monster mod ${mod.id}`, mod.trail, need);
    need(mod.guard === null || mod.guard.breakStagger > 0, `monster mod ${mod.id} grants a guard nothing can break`);
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
    if (used.leaves !== null) {
      const left: SkillDef | undefined = content.skills.get(used.leaves);
      need(left !== undefined, `skill ${used.id} leaves unknown skill ${used.leaves}`);
      if (left !== undefined) need(left.delivery.type === 'area' && left.leaves === null, `skill ${used.id} leaves ${used.leaves}, which is not a lasting area that leaves nothing itself`);
    }
  }
  return problems;
}
