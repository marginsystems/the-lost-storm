import type { Content, DamageType, ItemSlot, ModOp, SkillDef, StatBlock, StatId, ZoneDef } from './content/types.ts';
import { DAMAGE_TYPES, ITEM_STATS } from './content/types.ts';
import { baseOf, itemMods, slotOf } from './items.ts';
import { describeMod, isRatio, roundStat, statLabel } from './stat-text.ts';
import { computeStats, damagePerSecond, damageTakenScale } from './stats.ts';
import type { Equipment, ItemInstance, PlayerState } from './world/types.ts';

export const READING = {
  even: 0.005,
} as const;

export interface ReadingRow {
  readonly stat: StatId;
  readonly op: ModOp;
  readonly text: string;
  readonly delta: number | null;
  readonly deltaText: string | null;
}

export type Headline =
  | { readonly kind: 'damage'; readonly min: number; readonly max: number; readonly delta: number | null }
  | { readonly kind: 'stat'; readonly row: ReadingRow }
  | { readonly kind: 'none' };

export type VerdictKind = 'better' | 'worse' | 'trade' | 'same';

export interface Verdict {
  readonly kind: VerdictKind;
  readonly damage: number;
  readonly toughness: number;
}

export interface ItemReading {
  readonly headline: Headline;
  readonly rows: readonly ReadingRow[];
  readonly lost: readonly ReadingRow[];
}

export type DamageMix = Readonly<Record<DamageType, number>>;

export type ReadingSubject = Pick<PlayerState, 'level' | 'equipped' | 'allocated' | 'skills'>;

interface Total {
  readonly stat: StatId;
  readonly op: ModOp;
  value: number;
}

const ARMOUR_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>(['head', 'chest', 'hands', 'legs', 'feet']);

function keyOf(stat: StatId, op: ModOp): string {
  return `${stat}:${op}`;
}

function orderOf(stat: StatId): number {
  const index: number = ITEM_STATS.findIndex((candidate: StatId): boolean => candidate === stat);
  return index === -1 ? ITEM_STATS.length : index;
}

function totals(content: Content, item: ItemInstance | null): Map<string, Total> {
  const sums: Map<string, Total> = new Map<string, Total>();
  if (item === null) return sums;
  for (const mod of itemMods(content, item)) {
    const key: string = keyOf(mod.stat, mod.op);
    const sum: Total | undefined = sums.get(key);
    if (sum === undefined) sums.set(key, { stat: mod.stat, op: mod.op, value: mod.value });
    else sum.value += mod.value;
  }
  return sums;
}

function signed(stat: StatId, op: ModOp, value: number): string {
  const sign: string = value < 0 ? '−' : '+';
  const size: number = Math.abs(value);
  return isRatio(stat, op) ? `${sign}${Math.round(size * 100)}%` : `${sign}${size}`;
}

function row(stat: StatId, op: ModOp, value: number, other: number | null, named: boolean): ReadingRow {
  const rounded: number = roundStat(stat, op, value);
  const delta: number | null = other === null ? null : roundStat(stat, op, value - other);
  return { stat, op, text: named ? statLabel(stat) : describeMod({ stat, op, value: rounded }), delta, deltaText: delta === null || delta === 0 ? null : signed(stat, op, delta) };
}

function byOrder(a: ReadingRow, b: ReadingRow): number {
  const order: number = orderOf(a.stat) - orderOf(b.stat);
  return order === 0 ? a.op.localeCompare(b.op) : order;
}

function valueOf(sums: Map<string, Total>, stat: StatId, op: ModOp): number {
  return sums.get(keyOf(stat, op))?.value ?? 0;
}

export function readItem(content: Content, item: ItemInstance, equipped: ItemInstance | null): ItemReading {
  const mine: Map<string, Total> = totals(content, item);
  const theirs: Map<string, Total> | null = equipped === null ? null : totals(content, equipped);
  const other = (stat: StatId, op: ModOp): number | null => (theirs === null ? null : valueOf(theirs, stat, op));
  const rows: ReadingRow[] = [...mine.values()]
    .filter((total: Total): boolean => total.stat !== 'damageMin' && total.stat !== 'damageMax')
    .map((total: Total): ReadingRow => row(total.stat, total.op, total.value, other(total.stat, total.op), false))
    .toSorted(byOrder);
  const lost: ReadingRow[] =
    theirs === null
      ? []
      : [...theirs.values()]
          .filter((total: Total): boolean => !mine.has(keyOf(total.stat, total.op)) && total.stat !== 'damageMin' && total.stat !== 'damageMax')
          .map((total: Total): ReadingRow => row(total.stat, total.op, 0, total.value, true))
          .toSorted(byOrder);
  const slot: ItemSlot | null = slotOf(content, item);
  if (mine.has(keyOf('damageMin', 'add')) && mine.has(keyOf('damageMax', 'add'))) {
    const min: number = valueOf(mine, 'damageMin', 'add');
    const max: number = valueOf(mine, 'damageMax', 'add');
    const theirsAverage: number | null = theirs === null ? null : (valueOf(theirs, 'damageMin', 'add') + valueOf(theirs, 'damageMax', 'add')) / 2;
    return { headline: { kind: 'damage', min, max, delta: theirsAverage === null ? null : Math.round(((min + max) / 2 - theirsAverage) * 10) / 10 }, rows, lost };
  }
  const armour: ReadingRow | undefined = rows.find((candidate: ReadingRow): boolean => candidate.stat === 'armour' && candidate.op === 'add');
  if (slot !== null && ARMOUR_SLOTS.has(slot) && armour !== undefined) {
    return { headline: { kind: 'stat', row: armour }, rows: rows.filter((candidate: ReadingRow): boolean => candidate !== armour), lost };
  }
  const first: ReadingRow | undefined = rows[0];
  if (first === undefined) return { headline: { kind: 'none' }, rows, lost };
  return { headline: { kind: 'stat', row: first }, rows: rows.slice(1), lost };
}

export function zoneDamageMix(content: Content, zone: ZoneDef): DamageMix {
  const counts: Record<DamageType, number> = { physical: 0, storm: 0, frost: 0 };
  for (const pack of zone.packs) {
    for (const member of pack.members) {
      const skill: string | undefined = content.monsters.get(member.monster)?.skill;
      const type: DamageType = (skill === undefined ? undefined : content.skills.get(skill)?.damage.type) ?? 'physical';
      counts[type] += member.count;
    }
  }
  const total: number = DAMAGE_TYPES.reduce((sum: number, type: DamageType): number => sum + counts[type], 0);
  if (total === 0) return { physical: 1, storm: 0, frost: 0 };
  return { physical: counts.physical / total, storm: counts.storm / total, frost: counts.frost / total };
}

function bestDamage(stats: StatBlock, skills: readonly (SkillDef | null)[]): number {
  return skills.reduce((best: number, skill: SkillDef | null): number => (skill === null || skill.delivery.type === 'dash' ? best : Math.max(best, damagePerSecond(stats, skill))), 0);
}

export function toughness(content: Content, stats: StatBlock, zone: ZoneDef): number {
  const mix: DamageMix = zoneDamageMix(content, zone);
  const taken: number = DAMAGE_TYPES.reduce((sum: number, type: DamageType): number => sum + mix[type] * damageTakenScale(stats, type, content.player.resistance, zone.stormTier), 0);
  return stats.maxLife / Math.max(READING.even, taken);
}

function change(after: number, before: number): number {
  return before <= 0 ? 0 : after / before - 1;
}

export function itemVerdict(content: Content, subject: ReadingSubject, zone: ZoneDef, item: ItemInstance): Verdict | null {
  const slot: ItemSlot | null = slotOf(content, item);
  if (slot === null || baseOf(content, item) === null) return null;
  const swapped: Equipment = { ...subject.equipped, [slot]: item };
  const before: StatBlock = computeStats(content, subject.level, subject.equipped, subject.allocated);
  const after: StatBlock = computeStats(content, subject.level, swapped, subject.allocated);
  const damage: number = change(bestDamage(after, subject.skills), bestDamage(before, subject.skills));
  const tough: number = change(toughness(content, after, zone), toughness(content, before, zone));
  const up: boolean = damage > READING.even || tough > READING.even;
  const down: boolean = damage < -READING.even || tough < -READING.even;
  const kind: VerdictKind = up && down ? 'trade' : up ? 'better' : down ? 'worse' : 'same';
  return { kind, damage, toughness: tough };
}
