import type { Content, ItemBaseDef, ItemSlot, MonsterDef, StatBlock, ZoneDef, ZonePack } from '../sim/content/types.ts';
import type { PackRankDef } from '../sim/content/rank-types.ts';
import type { GearWeights, Power } from '../sim/bot-plan.ts';
import { BOT_PLAN, powerOf, scoreOf } from '../sim/bot-plan.ts';
import { emptyEquipment, generateItem, slotOf } from '../sim/items.ts';
import { applyXp, gapScale } from '../sim/progression.ts';
import type { XpResult } from '../sim/progression.ts';
import type { Rng } from '../sim/rng.ts';
import { createRng } from '../sim/rng.ts';
import type { MonsterScale } from '../sim/world/monster-scale.ts';
import { armourReduction, computeStats } from '../sim/stats.ts';
import { monsterScale } from '../sim/world/monster-scale.ts';
import { monsterXpScale } from '../sim/world/monster-xp.ts';
import { rankChance } from '../sim/world/ranks.ts';
import type { Equipment, ItemInstance } from '../sim/world/types.ts';

export interface ActPlace {
  readonly name: string;
  readonly zone: string;
  readonly arrival: number;
}

export interface ActArm {
  readonly name: string;
  readonly build: string;
  readonly kinds: readonly string[];
}

export interface GearModel {
  readonly dropsPerLevel: number;
  readonly lowestShare: number;
}

export const ACT_SCALING = {
  places: [
    { name: 'Hourfall Caves', zone: 'under_hall', arrival: 9 },
    { name: 'Hourfall, second level', zone: 'under_hall_2', arrival: 14 },
    { name: 'Hourfall, third level', zone: 'under_hall_3', arrival: 17 },
    { name: 'Lava depths, first level', zone: 'lava_depths', arrival: 19 },
    { name: 'Lava depths, second level', zone: 'lava_depths_2', arrival: 21 },
    { name: 'Lava depths, third level', zone: 'lava_depths_3', arrival: 23 },
    { name: 'Columned hall, first level', zone: 'ledger_hall', arrival: 25 },
    { name: 'Columned hall, second level', zone: 'ledger_hall_2', arrival: 27 },
    { name: 'Columned hall, third level', zone: 'ledger_hall_3', arrival: 28 },
    { name: 'Boss court', zone: 'ledger_court', arrival: 30 },
  ] satisfies readonly ActPlace[],
  arms: [
    { name: 'staff', build: 'stormcaller', kinds: ['staff'] },
    { name: 'crossbow', build: 'windrunner', kinds: ['crossbow'] },
    { name: 'blade', build: 'whirlwind', kinds: ['blade'] },
    { name: 'heavy', build: 'bulwark', kinds: ['greatsword', 'blunt'] },
  ] satisfies readonly ActArm[],
  gear: { dropsPerLevel: 8, lowestShare: 0.6 } satisfies GearModel,
  bossLife: 1000,
  forcedWeaponEvery: 4,
  seeds: 4,
} as const;

export interface FoeLine {
  readonly level: number;
  readonly hit: number;
  readonly life: number;
  readonly count: number;
}

export interface PlaceFoes {
  readonly lowest: number;
  readonly highest: number;
  readonly ordinaryHit: number;
  readonly eliteHit: number;
  readonly bossHit: number | null;
  readonly ordinaryLife: number;
}

export interface HeroSheet {
  readonly life: number;
  readonly reduction: number;
  readonly dps: number;
}

export interface ArmRow {
  readonly arm: string;
  readonly hero: HeroSheet;
  readonly ordinaryShare: number;
  readonly eliteShare: number;
  readonly bossShare: number | null;
  readonly killSeconds: number;
}

export interface PlaceRow {
  readonly place: ActPlace;
  readonly foes: PlaceFoes;
  readonly arms: readonly ArmRow[];
  readonly leaves: XpResult;
}

export interface ArmPlan {
  readonly arm: ActArm;
  readonly weights: GearWeights;
  readonly focus: string | null;
  readonly route: readonly string[];
}

function packLevel(zone: ZoneDef, pack: ZonePack): number {
  return pack.level ?? zone.level;
}

function meanDamage(def: MonsterDef): number {
  return (def.damageMin + def.damageMax) / 2;
}

function rankById(content: Content, id: string): PackRankDef | null {
  return content.packRanks.ranks.find((rank: PackRankDef): boolean => rank.id === id) ?? null;
}

export function foeLines(content: Content, zone: ZoneDef): FoeLine[] {
  const lines: FoeLine[] = [];
  for (const pack of zone.packs) {
    const level: number = packLevel(zone, pack);
    const scale: MonsterScale = monsterScale(content.world.scaling, level);
    for (const member of pack.members) {
      const def: MonsterDef | undefined = content.monsters.get(member.monster);
      if (def === undefined) continue;
      lines.push({ level, hit: meanDamage(def) * scale.damage, life: def.scalesLife ? def.life * scale.life : def.life, count: member.count });
    }
  }
  return lines;
}

function eliteFactor(content: Content): number {
  return Math.max(1, ...content.packRanks.ranks.map((rank: PackRankDef): number => rank.members.damage * (rank.leader === null ? 1 : rank.leader.damage / rank.members.damage)));
}

export function placeFoes(content: Content, zone: ZoneDef): PlaceFoes {
  const lines: FoeLine[] = foeLines(content, zone);
  const ordinary: FoeLine[] = lines.filter((line: FoeLine): boolean => line.life < ACT_SCALING.bossLife * monsterScale(content.world.scaling, line.level).life);
  const bosses: FoeLine[] = lines.filter((line: FoeLine): boolean => !ordinary.includes(line));
  const counted: readonly FoeLine[] = ordinary.length > 0 ? ordinary : lines;
  const total: number = counted.reduce((sum: number, line: FoeLine): number => sum + line.count, 0);
  const weighted = (pick: (line: FoeLine) => number): number => total === 0 ? 0 : counted.reduce((sum: number, line: FoeLine): number => sum + pick(line) * line.count, 0) / total;
  const levels: number[] = lines.map((line: FoeLine): number => line.level);
  return {
    lowest: levels.length === 0 ? zone.level : Math.min(...levels),
    highest: levels.length === 0 ? zone.levelUpTo : Math.max(...levels),
    ordinaryHit: weighted((line: FoeLine): number => line.hit),
    eliteHit: Math.max(0, ...counted.map((line: FoeLine): number => line.hit)) * eliteFactor(content),
    bossHit: bosses.length === 0 ? null : Math.max(...bosses.map((line: FoeLine): number => line.hit)),
    ordinaryLife: weighted((line: FoeLine): number => line.life),
  };
}

function fitsArm(content: Content, arm: ActArm, item: ItemInstance): boolean {
  const kind: string | null = content.itemBases.get(item.base)?.weaponKind ?? null;
  return kind !== null && arm.kinds.includes(kind);
}

export function typicalGear(content: Content, plan: ArmPlan, level: number, rng: Rng, model: GearModel = ACT_SCALING.gear): Equipment {
  const allocated: readonly string[] = plan.route;
  const weapons: string[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.slot === 'weapon' && base.weaponKind !== null && plan.arm.kinds.includes(base.weaponKind) && base.power === null && base.minLevel <= level).map((base: ItemBaseDef): string => base.id);
  const value = (equipped: Equipment): number => scoreOf(powerOf(content, level, equipped, allocated, plan.focus), plan.weights);
  let equipped: Equipment = emptyEquipment();
  let uid: number = 1;
  for (let drop: number = 0; drop < model.dropsPerLevel * level; drop += 1) {
    const itemLevel: number = Math.max(1, Math.round(level * (model.lowestShare + (1 - model.lowestShare) * rng.next())));
    const forced: string | null = drop % ACT_SCALING.forcedWeaponEvery === 0 ? (weapons[Math.floor(rng.next() * weapons.length)] ?? null) : null;
    const item: ItemInstance | null = generateItem(content, rng, uid, itemLevel, forced, null);
    uid += 1;
    if (item === null || (content.itemBases.get(item.base)?.power ?? null) !== null) continue;
    const slot: ItemSlot | null = slotOf(content, item);
    if (slot === null) continue;
    if (slot === 'weapon' && !fitsArm(content, plan.arm, item)) continue;
    const tried: Equipment = { ...equipped, [slot]: item };
    if (equipped[slot] === null || value(tried) > value(equipped) * BOT_PLAN.upgradeMargin) equipped = tried;
  }
  return equipped;
}

export function heroSheet(content: Content, plan: ArmPlan, level: number, equipped: Equipment): HeroSheet {
  const stats: StatBlock = computeStats(content, level, equipped, plan.route);
  const power: Power = powerOf(content, level, equipped, plan.route, plan.focus);
  return { life: stats.maxLife, reduction: armourReduction(stats.armour, content.player.resistance.armourCap), dps: power.dps };
}

export function hitShare(hit: number, hero: HeroSheet): number {
  return hero.life <= 0 ? 1 : (hit * (1 - hero.reduction)) / hero.life;
}

function rankXp(content: Content, zone: ZoneDef, pack: ZonePack, level: number): number {
  if (pack.rank !== undefined) return rankById(content, pack.rank)?.members.xp ?? 1;
  if (!zone.ranks) return 1;
  let rest: number = 1;
  let scaled: number = 0;
  for (const rank of content.packRanks.ranks) {
    if (rank.chance === null) continue;
    const chance: number = rankChance(rank.chance, level);
    scaled += chance * rank.members.xp;
    rest -= chance;
  }
  return scaled + Math.max(0, rest);
}

export function clearZone(content: Content, zone: ZoneDef, arrival: number): XpResult {
  let state: XpResult = { level: arrival, xp: 0, levelsGained: 0 };
  for (const pack of zone.packs) {
    const level: number = packLevel(zone, pack);
    const ranked: number = rankXp(content, zone, pack, level);
    for (const member of pack.members) {
      const def: MonsterDef | undefined = content.monsters.get(member.monster);
      if (def === undefined) continue;
      const each: number = def.xp * ranked * monsterXpScale(content.world.scaling, level);
      for (let one: number = 0; one < member.count; one += 1) {
        const gained: number = Math.max(1, Math.round(each * gapScale(content.player.xp.gap, state.level, level)));
        const next: XpResult = applyXp(content.player.xp, state.level, state.xp, gained);
        state = { level: next.level, xp: next.xp, levelsGained: state.levelsGained + next.levelsGained };
      }
    }
  }
  return state;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum: number, value: number): number => sum + value, 0) / values.length;
}

export function armRow(content: Content, plan: ArmPlan, place: ActPlace, foes: PlaceFoes, seeds: number): ArmRow {
  const sheets: HeroSheet[] = Array.from({ length: seeds }, (_unused: unknown, index: number): HeroSheet => heroSheet(content, plan, place.arrival, typicalGear(content, plan, place.arrival, createRng(index + 1))));
  const hero: HeroSheet = { life: mean(sheets.map((sheet: HeroSheet): number => sheet.life)), reduction: mean(sheets.map((sheet: HeroSheet): number => sheet.reduction)), dps: mean(sheets.map((sheet: HeroSheet): number => sheet.dps)) };
  return {
    arm: plan.arm.name,
    hero,
    ordinaryShare: hitShare(foes.ordinaryHit, hero),
    eliteShare: hitShare(foes.eliteHit, hero),
    bossShare: foes.bossHit === null ? null : hitShare(foes.bossHit, hero),
    killSeconds: hero.dps <= 0 ? Number.POSITIVE_INFINITY : foes.ordinaryLife / hero.dps,
  };
}

export function placeRow(content: Content, plansAt: (level: number) => readonly ArmPlan[], place: ActPlace, seeds: number): PlaceRow | null {
  const zone: ZoneDef | undefined = content.zones.get(place.zone);
  if (zone === undefined) return null;
  const foes: PlaceFoes = placeFoes(content, zone);
  return { place, foes, arms: plansAt(place.arrival).map((plan: ArmPlan): ArmRow => armRow(content, plan, place, foes, seeds)), leaves: clearZone(content, zone, place.arrival) };
}

function percent(value: number | null): string {
  return value === null ? '-' : `${(value * 100).toFixed(1)}%`;
}

function whole(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value)) : '-';
}

export function scalingTables(rows: readonly PlaceRow[]): string {
  const out: string[] = [];
  out.push('| place | monster levels | arrives at | ordinary hit | elite hit | boss hit | hero life | armour cut | ordinary share | elite share | boss share | leaves at |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const life: number = mean(row.arms.map((arm: ArmRow): number => arm.hero.life));
    const cut: number = mean(row.arms.map((arm: ArmRow): number => arm.hero.reduction));
    const typical: HeroSheet = { life, reduction: cut, dps: 0 };
    const leaves: string = `${row.leaves.level} (+${row.leaves.levelsGained})`;
    out.push(`| ${row.place.name} | ${row.foes.lowest}-${row.foes.highest} | ${row.place.arrival} | ${whole(row.foes.ordinaryHit)} | ${whole(row.foes.eliteHit)} | ${row.foes.bossHit === null ? '-' : whole(row.foes.bossHit)} | ${whole(life)} | ${percent(cut)} | ${percent(hitShare(row.foes.ordinaryHit, typical))} | ${percent(hitShare(row.foes.eliteHit, typical))} | ${row.foes.bossHit === null ? '-' : percent(hitShare(row.foes.bossHit, typical))} | ${leaves} |`);
  }
  const arms: string[] = rows[0]?.arms.map((arm: ArmRow): string => arm.arm) ?? [];
  out.push('');
  out.push(`| place | ${arms.map((arm: string): string => `${arm} life / cut / share / kill s`).join(' | ')} |`);
  out.push(`|---|${arms.map((): string => '---').join('|')}|`);
  for (const row of rows) {
    out.push(`| ${row.place.name} | ${row.arms.map((arm: ArmRow): string => `${whole(arm.hero.life)} / ${percent(arm.hero.reduction)} / ${percent(arm.ordinaryShare)} / ${Number.isFinite(arm.killSeconds) ? arm.killSeconds.toFixed(1) : '-'}`).join(' | ')} |`);
  }
  return out.join('\n');
}
