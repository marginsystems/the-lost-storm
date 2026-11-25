import type { AffixDef, Content, DropLean, ItemBaseDef, ItemSlot, ItemStat, RarityDef, StatId, StatMod } from './content/types.ts';
import { leanOf } from './content/lean-rules.ts';
import { ITEM_STATS } from './content/types.ts';
import { linesFor } from './content/item-rules.ts';
import { isUnidentified } from './identify.ts';
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

export function isStoryItem(content: Content, item: ItemInstance): boolean {
  return baseOf(content, item)?.story === true;
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

export const SLOT_NAMES: Readonly<Record<ItemSlot, string>> = {
  weapon: 'Weapon',
  head: 'Headgear',
  chest: 'Body Armour',
  hands: 'Gloves',
  legs: 'Leggings',
  feet: 'Boots',
  charm: 'Charm',
};

function veiledName(content: Content, item: ItemInstance, def: ItemBaseDef | null): string {
  if (def === null) return item.base;
  if (def.power === null || def.slot === null) return def.name;
  return `${rarityOf(content, item).name} ${SLOT_NAMES[def.slot]}`;
}

export function itemName(content: Content, item: ItemInstance): string {
  const def: ItemBaseDef | null = baseOf(content, item);
  if (isUnidentified(item)) return veiledName(content, item, def);
  const base: string = def?.name ?? item.base;
  const top: AffixDef | undefined = rolledLines(content, item)[0]?.affix;
  return top === undefined || (def?.power ?? null) !== null ? base : `${top.label} ${base}`;
}

export function itemLines(content: Content, item: ItemInstance): ItemLine[] {
  const lines: ItemLine[] = [];
  if (isUnidentified(item)) return lines;
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
  const pool: AffixDef[] = base.slot === null ? [] : linesFor(content, base.slot).filter((affix: AffixDef): boolean => affix.minLevel <= level);
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

function favoured(content: Content, base: ItemBaseDef, lean: DropLean): boolean {
  if (base.power !== null && lean.families.includes(base.power.family)) return true;
  if (base.slot !== null && lean.slots.includes(base.slot)) return true;
  const kind: string | null = base.weaponKind;
  return kind !== null && content.chart.weaponGroups.some((group): boolean => lean.weapons.includes(group.id) && group.kinds.some((held: string): boolean => held === kind));
}

export function boostedLean(lean: DropLean, boost: number): DropLean {
  if (boost === 1) return lean;
  return { ...lean, share: lean.share > 1 ? lean.share * boost : lean.share, legendary: lean.legendary > 1 ? lean.legendary * boost : lean.legendary };
}

function leanFor(content: Content, zone: string | null, boost: number): DropLean | null {
  const lean: DropLean | null = leanOf(content, zone);
  return lean === null ? null : boostedLean(lean, boost);
}

export function leanedWeight(content: Content, base: ItemBaseDef, lean: DropLean | null): number {
  return lean !== null && favoured(content, base, lean) ? base.dropWeight * lean.share : base.dropWeight;
}

function pickBase(content: Content, rng: Rng, bases: readonly ItemBaseDef[], lean: DropLean | null): ItemBaseDef | null {
  return pickWeighted(rng, bases.map((base: ItemBaseDef): { weight: number; base: ItemBaseDef } => ({ weight: leanedWeight(content, base, lean), base })))?.base ?? null;
}

export function leanedRarities(rarities: readonly RarityDef[], lean: DropLean | null): readonly RarityDef[] {
  if (lean === null || lean.legendary === 1) return rarities;
  const legendary: number = lean.legendary;
  return rarities.map((rarity: RarityDef): RarityDef => (rarity.powers ? { ...rarity, weight: rarity.weight * legendary } : rarity));
}

function pickRarity(content: Content, rng: Rng, from: readonly RarityDef[], lean: DropLean | null): RarityDef | null {
  const picked: RarityDef | null = pickWeighted(rng, leanedRarities(from, lean));
  return picked === null ? null : (content.rarities.find((rarity: RarityDef): boolean => rarity.id === picked.id) ?? null);
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

function settle(content: Content, rng: Rng, level: number, base: ItemBaseDef, rarity: RarityDef, forced: boolean, lean: DropLean | null): Pick | null {
  if (base.power !== null) {
    const powered: RarityDef | null = poweredRarity(content);
    return powered === null ? null : { base, rarity: powered };
  }
  if (!rarity.powers) return { base, rarity };
  const named: ItemBaseDef | null = forced ? null : pickBase(content, rng, [...content.itemBases.values()].filter(droppable(level, true)), lean);
  if (named !== null) return { base: named, rarity };
  const plain: RarityDef | null = plainRarity(content);
  return plain === null ? null : { base, rarity: plain };
}

export function raritiesFrom(content: Content, floor: string): readonly RarityDef[] {
  const start: number = content.rarities.findIndex((candidate: RarityDef): boolean => candidate.id === floor);
  return start < 0 ? content.rarities : content.rarities.slice(start);
}

export function generateAtLeast(content: Content, rng: Rng, uid: number, level: number, forcedBase: string | null, floor: string, zone: string | null = null, boost: number = 1): ItemInstance | null {
  const lean: DropLean | null = leanFor(content, zone, boost);
  const rarity: RarityDef | null = pickRarity(content, rng, raritiesFrom(content, floor), lean);
  return rarity === null ? null : generateItem(content, rng, uid, level, forcedBase, rarity.id, zone, boost);
}

export function generateItem(content: Content, rng: Rng, uid: number, level: number, forcedBase: string | null, forcedRarity: string | null, zone: string | null = null, boost: number = 1): ItemInstance | null {
  const lean: DropLean | null = leanFor(content, zone, boost);
  const pickedBase: ItemBaseDef | null = pickBase(content, rng, [...content.itemBases.values()].filter(droppable(level, false)), lean);
  const base: ItemBaseDef | null = forcedBase === null ? pickedBase : (content.itemBases.get(forcedBase) ?? null);
  const rarity: RarityDef | null = forcedRarity === null ? pickRarity(content, rng, content.rarities, lean) : (content.rarities.find((candidate: RarityDef): boolean => candidate.id === forcedRarity) ?? null);
  if (base === null || rarity === null) return null;
  const pick: Pick | null = settle(content, rng, level, base, rarity, forcedBase !== null, lean);
  if (pick === null) return null;
  return { uid, base: pick.base.id, rarity: pick.rarity.id, level, affixes: rollAffixes(content, rng, pick.base, pick.rarity, level), ledger: null };
}

export interface ItemPlan {
  readonly base: string | null;
  readonly rarity: string | null;
  readonly floor: string | null;
  readonly zone: string | null;
}

export function rollLeaned(content: Content, rng: Rng, uid: number, level: number, plan: ItemPlan, boost: number): ItemInstance | null {
  if (plan.rarity === null && plan.floor !== null) return generateAtLeast(content, rng, uid, level, plan.base, plan.floor, plan.zone, boost);
  return generateItem(content, rng, uid, level, plan.base, plan.rarity, plan.zone, boost);
}

export function rollItem(content: Content, rng: Rng, uid: number, level: number, plan: ItemPlan): ItemInstance | null {
  return rollLeaned(content, rng, uid, level, plan, 1);
}
