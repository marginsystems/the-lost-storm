import type { AffixDef, Content, ItemBaseDef, ItemSlot, ItemStat, RarityDef, StatId, StatMod } from './content/types.ts';
import { ITEM_STATS } from './content/types.ts';
import { linesFor } from './content/item-rules.ts';
import type { Rng } from './rng.ts';
import { pickWeighted } from './rng.ts';
import { describeMod, roundStat } from './stat-text.ts';
import type { Equipment, ItemInstance, RolledAffix } from './world/types.ts';

export interface ItemLine {
  readonly text: string;
  readonly source: 'implicit' | 'affix';
}

const FALLBACK_RARITY: RarityDef = { id: 'unknown', name: 'Unknown', color: '#9aa3ad', marker: 'none', weight: 0, affixMin: 0, affixMax: 0, powers: false, wornLimit: null };

export function emptyEquipment(): Equipment {
  return { weapon: null, head: null, chest: null, hands: null, legs: null, feet: null, charm: null };
}

export function rarityOf(content: Content, item: ItemInstance): RarityDef {
  return content.rarities.find((rarity: RarityDef): boolean => rarity.id === item.rarity) ?? FALLBACK_RARITY;
}

export function baseOf(content: Content, item: ItemInstance): ItemBaseDef | null {
  return content.itemBases.get(item.base) ?? null;
}

export function slotOf(content: Content, item: ItemInstance): ItemSlot | null {
  return baseOf(content, item)?.slot ?? null;
}

function implicitMods(content: Content, item: ItemInstance): StatMod[] {
  const base: ItemBaseDef | null = baseOf(content, item);
  if (base === null) return [];
  const factor: number = 1 + content.itemScaling.implicitPerLevel * (item.level - 1);
  return base.implicit.map((mod: StatMod): StatMod => ({ stat: mod.stat, op: mod.op, value: roundStat(mod.stat, mod.op, mod.value * factor) }));
}

function affixMods(content: Content, item: ItemInstance): StatMod[] {
  const mods: StatMod[] = [];
  for (const rolled of item.affixes) {
    const affix: AffixDef | undefined = content.affixes.get(rolled.affix);
    if (affix !== undefined) mods.push({ stat: affix.stat, op: affix.op, value: rolled.value });
  }
  return mods;
}

export function itemMods(content: Content, item: ItemInstance): StatMod[] {
  return [...implicitMods(content, item), ...affixMods(content, item)];
}

function orderOf(stat: StatId): number {
  const index: number = ITEM_STATS.findIndex((candidate: ItemStat): boolean => candidate === stat);
  return index === -1 ? ITEM_STATS.length : index;
}

function rolledLines(content: Content, item: ItemInstance): { readonly affix: AffixDef; readonly value: number }[] {
  const lines: { readonly affix: AffixDef; readonly value: number }[] = [];
  for (const rolled of item.affixes) {
    const affix: AffixDef | undefined = content.affixes.get(rolled.affix);
    if (affix !== undefined) lines.push({ affix, value: rolled.value });
  }
  return lines.toSorted((a, b): number => orderOf(a.affix.stat) - orderOf(b.affix.stat));
}

export function itemName(content: Content, item: ItemInstance): string {
  const base: string = baseOf(content, item)?.name ?? item.base;
  const top: AffixDef | undefined = rolledLines(content, item)[0]?.affix;
  return top === undefined ? base : `${top.label} ${base}`;
}

export function itemLines(content: Content, item: ItemInstance): ItemLine[] {
  const lines: ItemLine[] = [];
  const implicit: StatMod[] = implicitMods(content, item);
  const min: StatMod | undefined = implicit.find((mod: StatMod): boolean => mod.stat === 'damageMin' && mod.op === 'add');
  const max: StatMod | undefined = implicit.find((mod: StatMod): boolean => mod.stat === 'damageMax' && mod.op === 'add');
  if (min !== undefined && max !== undefined) lines.push({ text: `${min.value}–${max.value} Damage`, source: 'implicit' });
  const rest: StatMod[] = implicit.filter((mod: StatMod): boolean => !(min !== undefined && max !== undefined && (mod === min || mod === max)));
  for (const mod of rest.toSorted((a: StatMod, b: StatMod): number => orderOf(a.stat) - orderOf(b.stat))) lines.push({ text: describeMod(mod), source: 'implicit' });
  for (const line of rolledLines(content, item)) lines.push({ text: describeMod({ stat: line.affix.stat, op: line.affix.op, value: line.value }), source: 'affix' });
  return lines;
}

function rollAffixes(content: Content, rng: Rng, base: ItemBaseDef, rarity: RarityDef, level: number): RolledAffix[] {
  const pool: AffixDef[] = base.slot === null ? [] : [...linesFor(content, base.slot)];
  const wanted: number = rng.int(rarity.affixMin, rarity.affixMax);
  const rolled: RolledAffix[] = [];
  while (rolled.length < wanted && pool.length > 0) {
    const index: number = rng.int(0, pool.length - 1);
    const affix: AffixDef | undefined = pool[index];
    if (affix === undefined) break;
    const scale: number = 1 + affix.perLevel * (level - 1);
    rolled.push({ affix: affix.id, value: roundStat(affix.stat, affix.op, rng.range(affix.min, affix.max) * scale) });
    for (let at: number = pool.length - 1; at >= 0; at -= 1) {
      if (pool[at]?.stat === affix.stat) pool.splice(at, 1);
    }
  }
  return rolled;
}

function droppable(level: number, powered: boolean): (base: ItemBaseDef) => boolean {
  return (base: ItemBaseDef): boolean => base.minLevel <= level && base.dropWeight > 0 && (base.power !== null) === powered;
}

function pickBase(rng: Rng, bases: readonly ItemBaseDef[]): ItemBaseDef | null {
  return pickWeighted(rng, bases.map((base: ItemBaseDef): { weight: number; base: ItemBaseDef } => ({ weight: base.dropWeight, base })))?.base ?? null;
}

function plainRarity(content: Content): RarityDef | null {
  return content.rarities.findLast((rarity: RarityDef): boolean => !rarity.powers) ?? null;
}

function poweredRarity(content: Content): RarityDef | null {
  return content.rarities.find((rarity: RarityDef): boolean => rarity.powers) ?? null;
}

interface Pick {
  readonly base: ItemBaseDef;
  readonly rarity: RarityDef;
}

function settle(content: Content, rng: Rng, level: number, base: ItemBaseDef, rarity: RarityDef, forced: boolean): Pick | null {
  if (base.power !== null) {
    const powered: RarityDef | null = poweredRarity(content);
    return powered === null ? null : { base, rarity: powered };
  }
  if (!rarity.powers) return { base, rarity };
  const named: ItemBaseDef | null = forced ? null : pickBase(rng, [...content.itemBases.values()].filter(droppable(level, true)));
  if (named !== null) return { base: named, rarity };
  const plain: RarityDef | null = plainRarity(content);
  return plain === null ? null : { base, rarity: plain };
}

export function generateItem(content: Content, rng: Rng, uid: number, level: number, forcedBase: string | null, forcedRarity: string | null): ItemInstance | null {
  const pickedBase: ItemBaseDef | null = pickBase(rng, [...content.itemBases.values()].filter(droppable(level, false)));
  const base: ItemBaseDef | null = forcedBase === null ? pickedBase : (content.itemBases.get(forcedBase) ?? null);
  const rarity: RarityDef | null = forcedRarity === null ? pickWeighted(rng, content.rarities) : (content.rarities.find((candidate: RarityDef): boolean => candidate.id === forcedRarity) ?? null);
  if (base === null || rarity === null) return null;
  const pick: Pick | null = settle(content, rng, level, base, rarity, forcedBase !== null);
  if (pick === null) return null;
  return { uid, base: pick.base.id, rarity: pick.rarity.id, level, affixes: rollAffixes(content, rng, pick.base, pick.rarity, level), ledger: null };
}
