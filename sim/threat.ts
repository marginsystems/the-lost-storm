import type { BossPhase } from './content/boss-types.ts';
import type { MonsterElement, MonsterModDef } from './content/combat-types.ts';
import type { PackRankDef, RankModChoice, RankScale } from './content/rank-types.ts';
import type { ActDef, Content, DamageType, MonsterDef, SkillDef, ZoneDef, ZonePack } from './content/types.ts';
import { DAMAGE_TYPES } from './content/types.ts';
import { modAvailable, rankChance } from './world/ranks.ts';
import { withMods } from './world/elites.ts';

export const THREAT = {
  engagedSeconds: 6,
  bossSeconds: 30,
  minCycle: 0.25,
  summonDepth: 1,
  hereShare: 0.5,
  aheadFalloff: 0.75,
  staleLevels: 5,
} as const;

export type DamageMix = Readonly<Record<DamageType, number>>;

export interface ThreatZone {
  readonly id: string;
  readonly name: string;
  readonly stormTier: number;
  readonly weight: number;
  readonly ahead: boolean;
  readonly mix: DamageMix;
}

export interface Threat {
  readonly zones: readonly ThreatZone[];
}

export interface RouteZone {
  readonly zone: ZoneDef;
  readonly steps: number;
}

type Dealt = Record<DamageType, number>;

interface RankOdds {
  readonly rank: PackRankDef | null;
  readonly odds: number;
}

interface ModOdds {
  readonly mod: MonsterModDef;
  readonly odds: number;
}

function none(): Dealt {
  return { physical: 0, storm: 0, frost: 0 };
}

function addInto(into: Dealt, from: Dealt, times: number): void {
  for (const type of DAMAGE_TYPES) into[type] += from[type] * times;
}

function hitOf(def: MonsterDef, skill: SkillDef): number {
  return ((def.damageMin + def.damageMax) / 2) * skill.damage.weaponPercent + (skill.damage.flatMin + skill.damage.flatMax) / 2;
}

function cycleOf(skill: SkillDef): number {
  return Math.max(skill.windup + skill.recovery, skill.cooldown, THREAT.minCycle);
}

function phaseRate(content: Content, def: MonsterDef, phase: BossPhase): Dealt {
  const rate: Dealt = none();
  if (phase.measure.length > 0) {
    const span: number = Math.max(THREAT.minCycle, phase.beat) * phase.measure.length;
    for (const id of phase.measure) {
      const skill: SkillDef | undefined = content.skills.get(id);
      if (skill !== undefined) rate[skill.damage.type] += hitOf(def, skill) / span;
    }
    return rate;
  }
  const weighed: number = phase.skills.reduce((sum: number, entry): number => {
    const skill: SkillDef | undefined = content.skills.get(entry.skill);
    return skill === undefined ? sum : sum + entry.weight * cycleOf(skill);
  }, 0);
  if (weighed <= 0) return rate;
  for (const entry of phase.skills) {
    const skill: SkillDef | undefined = content.skills.get(entry.skill);
    if (skill !== undefined) rate[skill.damage.type] += (entry.weight * hitOf(def, skill)) / weighed;
  }
  return rate;
}

function bossDealt(content: Content, def: MonsterDef, phases: readonly BossPhase[]): Dealt {
  const dealt: Dealt = none();
  const ordered: BossPhase[] = phases.toSorted((a: BossPhase, b: BossPhase): number => b.below - a.below);
  ordered.forEach((phase: BossPhase, index: number): void => {
    const share: number = Math.max(0, phase.below - (ordered[index + 1]?.below ?? 0));
    addInto(dealt, phaseRate(content, def, phase), share * THREAT.bossSeconds);
  });
  return dealt;
}

export function charged(dealt: Dealt, element: MonsterElement | null): void {
  if (element === null) return;
  for (const type of DAMAGE_TYPES) {
    if (type === element.type) continue;
    const moved: number = dealt[type] * element.share;
    dealt[type] -= moved;
    dealt[element.type] += moved;
  }
}

function dealtBy(content: Content, def: MonsterDef, depth: number): Dealt {
  const dealt: Dealt = none();
  if (def.boss !== null && def.boss.phases.length > 0) addInto(dealt, bossDealt(content, def, def.boss.phases), 1);
  else {
    const skill: SkillDef | undefined = content.skills.get(def.skill);
    if (skill !== undefined) dealt[skill.damage.type] += hitOf(def, skill) * (THREAT.engagedSeconds / cycleOf(skill));
  }
  const last: SkillDef | undefined = def.deathSkill === null ? undefined : content.skills.get(def.deathSkill);
  if (last !== undefined) dealt[last.damage.type] += hitOf(def, last);
  charged(dealt, def.element);
  const called: MonsterDef | undefined = def.summon === null || def.summon.monster === null ? undefined : content.monsters.get(def.summon.monster);
  if (called !== undefined && def.summon !== null && depth < THREAT.summonDepth) addInto(dealt, dealtBy(content, called, depth + 1), def.summon.limit);
  return dealt;
}

function scaledDef(def: MonsterDef, scale: RankScale): MonsterDef {
  return { ...def, damageMin: def.damageMin * scale.damage, damageMax: def.damageMax * scale.damage };
}

function modOdds(content: Content, picks: number, leader: boolean, level: number): readonly ModOdds[] {
  const pool: readonly RankModChoice[] = content.packRanks.pool.filter((choice: RankModChoice): boolean => modAvailable(choice, leader, level));
  const total: number = pool.reduce((sum: number, choice: RankModChoice): number => sum + Math.max(0, choice.weight), 0);
  if (total <= 0 || picks <= 0) return [];
  return pool.flatMap((choice: RankModChoice): ModOdds[] => {
    const mod: MonsterModDef | undefined = content.monsterMods.get(choice.mod);
    const one: number = Math.max(0, choice.weight) / total;
    return mod === undefined ? [] : [{ mod, odds: 1 - Math.pow(1 - one, picks) }];
  });
}

function rankedDealt(content: Content, def: MonsterDef, scale: RankScale, shared: number, level: number): Dealt {
  const base: MonsterDef = scaledDef(def, scale);
  const plain: Dealt = dealtBy(content, base, 0);
  const dealt: Dealt = { ...plain };
  const own: number = Math.max(0, scale.mods - shared);
  for (const { mod, odds } of [...modOdds(content, Math.min(shared, scale.mods), false, level), ...modOdds(content, own, true, level)]) {
    const modded: Dealt = dealtBy(content, withMods(base, [mod]), 0);
    for (const type of DAMAGE_TYPES) dealt[type] += odds * (modded[type] - plain[type]);
  }
  return dealt;
}

function rankOdds(content: Content, zone: ZoneDef, pack: ZonePack): readonly RankOdds[] {
  if (!zone.ranks) return [{ rank: null, odds: 1 }];
  const ranks: readonly PackRankDef[] = content.packRanks.ranks;
  if (pack.rank !== undefined) return [{ rank: ranks.find((rank: PackRankDef): boolean => rank.id === pack.rank) ?? null, odds: 1 }];
  const level: number = pack.level ?? zone.level;
  const odds: RankOdds[] = [];
  let left: number = 1;
  for (let index: number = ranks.length - 1; index > 0; index -= 1) {
    const rank: PackRankDef | undefined = ranks[index];
    if (rank === undefined || rank.chance === null) continue;
    const chance: number = left * rankChance(rank.chance, level);
    odds.push({ rank, odds: chance });
    left -= chance;
  }
  odds.push({ rank: ranks[0] ?? null, odds: left });
  return odds;
}

function packDealt(content: Content, zone: ZoneDef, pack: ZonePack): Dealt {
  const defs: MonsterDef[] = pack.members.flatMap((member): MonsterDef[] => {
    const base: MonsterDef | undefined = content.monsters.get(member.monster);
    if (base === undefined) return [];
    const mods: MonsterModDef[] = member.mods.flatMap((id: string): MonsterModDef[] => {
      const mod: MonsterModDef | undefined = content.monsterMods.get(id);
      return mod === undefined ? [] : [mod];
    });
    const def: MonsterDef = withMods(base, mods);
    return Array.from({ length: Math.max(0, member.count) }, (): MonsterDef => def);
  });
  const dealt: Dealt = none();
  const rankable: boolean = defs.length > 0 && defs.every((def: MonsterDef): boolean => def.boss === null && def.rank === null && def.mods.length === 0);
  for (const { rank, odds } of rankOdds(content, zone, pack)) {
    const leader: RankScale | null = rank === null || rank.chance === null || !rankable ? null : rank.leader;
    const lead: number = leader === null ? -1 : defs.reduce((best: number, def: MonsterDef, index: number): number => (def.life > (defs[best]?.life ?? 0) ? index : best), 0);
    defs.forEach((def: MonsterDef, index: number): void => {
      const scale: RankScale | null = rank === null || rank.chance === null || !rankable ? null : index === lead && leader !== null ? leader : rank.members;
      addInto(dealt, scale === null || rank === null ? dealtBy(content, def, 0) : rankedDealt(content, def, scale, rank.members.mods, pack.level ?? zone.level), odds);
    });
  }
  return dealt;
}

export function zoneDamageMix(content: Content, zone: ZoneDef): DamageMix {
  const dealt: Dealt = none();
  for (const pack of zone.packs) addInto(dealt, packDealt(content, zone, pack), 1);
  const total: number = DAMAGE_TYPES.reduce((sum: number, type: DamageType): number => sum + dealt[type], 0);
  if (total <= 0) return { physical: 1, storm: 0, frost: 0 };
  return { physical: dealt.physical / total, storm: dealt.storm / total, frost: dealt.frost / total };
}

function fights(zone: ZoneDef): boolean {
  return zone.kind === 'wild' && zone.packs.length > 0;
}

export function currentZone(content: Content, visited: readonly string[], here: ZoneDef): ZoneDef | null {
  if (fights(here)) return here;
  const seen: ZoneDef[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => fights(zone) && visited.includes(zone.id)).toSorted((a: ZoneDef, b: ZoneDef): number => a.level - b.level);
  return seen[seen.length - 1] ?? null;
}

export function routeAhead(content: Content, from: ZoneDef): readonly RouteZone[] {
  const act: ActDef | undefined = content.world.acts.find((candidate: ActDef): boolean => candidate.atlas.places.some((place): boolean => place.zone === from.id));
  if (act === undefined) return [];
  const steps: Map<string, number> = new Map<string, number>([[from.id, 0]]);
  const queue: string[] = [from.id];
  for (let index: number = 0; index < queue.length; index += 1) {
    const at: string = queue[index] ?? '';
    const step: number = steps.get(at) ?? 0;
    for (const road of act.atlas.roads) {
      if (road.from !== at || steps.has(road.to)) continue;
      steps.set(road.to, step + 1);
      queue.push(road.to);
    }
  }
  return [...steps.entries()].flatMap(([id, step]: [string, number]): RouteZone[] => {
    const zone: ZoneDef | undefined = content.zones.get(id);
    return zone === undefined || step === 0 || !fights(zone) ? [] : [{ zone, steps: step }];
  });
}

function stale(zone: ZoneDef, level: number): boolean {
  return level - Math.max(zone.level, zone.levelUpTo) > THREAT.staleLevels;
}

function threatZone(content: Content, zone: ZoneDef, weight: number, ahead: boolean): ThreatZone {
  return { id: zone.id, name: zone.name, stormTier: zone.stormTier, weight, ahead, mix: zoneDamageMix(content, zone) };
}

export function threatAt(content: Content, current: ZoneDef | null, level: number): Threat {
  if (current === null) return mixThreat({ physical: 1, storm: 0, frost: 0 });
  const route: RouteZone[] = routeAhead(content, current).filter((entry: RouteZone): boolean => !stale(entry.zone, level));
  const raw: number[] = route.map((entry: RouteZone): number => Math.pow(THREAT.aheadFalloff, entry.steps - 1));
  const total: number = raw.reduce((sum: number, value: number): number => sum + value, 0);
  const counted: boolean = !stale(current, level) || total <= 0;
  const hereWeight: number = !counted ? 0 : total <= 0 ? 1 : THREAT.hereShare;
  const aheadShare: number = 1 - hereWeight;
  const ahead: ThreatZone[] = route.map((entry: RouteZone, index: number): ThreatZone => threatZone(content, entry.zone, total <= 0 ? 0 : (aheadShare * (raw[index] ?? 0)) / total, true));
  return { zones: [threatZone(content, current, hereWeight, false), ...ahead].filter((zone: ThreatZone): boolean => zone.weight > 0) };
}

export function threatNear(content: Content, visited: readonly string[], here: ZoneDef, level: number): Threat {
  return threatAt(content, currentZone(content, visited, here), level);
}

export function mixThreat(mix: DamageMix, stormTier: number = 0): Threat {
  return { zones: [{ id: '', name: '', stormTier, weight: 1, ahead: false, mix }] };
}

export function partOf(threat: Threat, ahead: boolean): Threat | null {
  const zones: ThreatZone[] = threat.zones.filter((zone: ThreatZone): boolean => zone.ahead === ahead);
  const total: number = zones.reduce((sum: number, zone: ThreatZone): number => sum + zone.weight, 0);
  if (total <= 0) return null;
  return { zones: zones.map((zone: ThreatZone): ThreatZone => ({ id: zone.id, name: zone.name, stormTier: zone.stormTier, weight: zone.weight / total, ahead: zone.ahead, mix: zone.mix })) };
}

export function shareOf(threat: Threat, type: DamageType): number {
  return threat.zones.reduce((sum: number, zone: ThreatZone): number => sum + zone.weight * zone.mix[type], 0);
}
