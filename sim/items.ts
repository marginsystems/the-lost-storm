import type { AffixDef, Content, ItemBaseDef, ItemSlot, RarityDef, StatMod } from './content/types.ts';
import type { Rng } from './rng.ts';
import { pickWeighted } from './rng.ts';
import { describeMod, describeSkillMod, roundStat } from './stat-text.ts';
import type { Equipment, ItemInstance, RolledAffix } from './world/types.ts';

export interface ItemLine {
  readonly text: string;
  readonly source: 'implicit' | 'affix' | 'skill' | 'flavour';
}

const FALLBACK_RARITY: RarityDef = { id: 'unknown', name: 'Unknown', color: '#9aa3ad', weight: 0, affixMin: 0, affixMax: 0, statScale: 1, maxPerGroup: 0 };

export const UNIQUE_RARITY: string = 'unique';

export function emptyEquipment(): Equipment {
  return { weapon: null, offhand: null, head: null, chest: null, hands: null, legs: null, feet: null, ring: null, amulet: null, charm: null };
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
  const grown: number = base.uniqueWeight > 0 ? 1 : 1 + content.itemScaling.implicitPerLevel * (item.level - 1);
  const factor: number = rarityOf(content, item).statScale * grown;
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

export function itemName(content: Content, item: ItemInstance): string {
  const base: string = baseOf(content, item)?.name ?? item.base;
  const labelAt = (position: AffixDef['position']): string | null => {
    for (const rolled of item.affixes) {
      const affix: AffixDef | undefined = content.affixes.get(rolled.affix);
      if (affix?.position === position) return affix.label;
    }
    return null;
  };
  const prefix: string | null = labelAt('prefix');
  const suffix: string | null = labelAt('suffix');
  return `${prefix === null ? '' : `${prefix} `}${base}${suffix === null ? '' : ` ${suffix}`}`;
}

export function itemLines(content: Content, item: ItemInstance): ItemLine[] {
  const lines: ItemLine[] = [];
  const implicit: StatMod[] = implicitMods(content, item);
  const min: StatMod | undefined = implicit.find((mod: StatMod): boolean => mod.stat === 'damageMin' && mod.op === 'add');
  const max: StatMod | undefined = implicit.find((mod: StatMod): boolean => mod.stat === 'damageMax' && mod.op === 'add');
  if (min !== undefined && max !== undefined) lines.push({ text: `${min.value}–${max.value} Damage`, source: 'implicit' });
  for (const mod of implicit) {
    if (min !== undefined && max !== undefined && (mod === min || mod === max)) continue;
    lines.push({ text: describeMod(mod), source: 'implicit' });
  }
  for (const mod of affixMods(content, item)) lines.push({ text: describeMod(mod), source: 'affix' });
  const base: ItemBaseDef | null = baseOf(content, item);
  for (const mod of base?.skillMods ?? []) lines.push({ text: describeSkillMod(content, mod), source: 'skill' });
  if (base?.flavour !== null && base?.flavour !== undefined) lines.push({ text: base.flavour, source: 'flavour' });
  return lines;
}

function eligibleAffixes(content: Content, rarity: RarityDef, slot: ItemSlot | null, level: number, rolled: readonly RolledAffix[]): AffixDef[] {
  const taken: AffixDef[] = rolled.flatMap((entry: RolledAffix): AffixDef[] => {
    const found: AffixDef | undefined = content.affixes.get(entry.affix);
    return found === undefined ? [] : [found];
  });
  const positions: number = rolled.length;
  const needsFreePosition: boolean = positions < 2 && taken.length > 0;
  return [...content.affixes.values()].filter((affix: AffixDef): boolean => {
    if (slot === null || !affix.slots.includes(slot) || affix.minLevel > level || affix.weight <= 0) return false;
    if (taken.some((other: AffixDef): boolean => other.family === affix.family || other.stat === affix.stat)) return false;
    if (taken.filter((other: AffixDef): boolean => other.position === affix.position).length >= content.itemScaling.maxPerPosition) return false;
    if (needsFreePosition && taken.some((other: AffixDef): boolean => other.position === affix.position)) return false;
    return taken.filter((other: AffixDef): boolean => other.group === affix.group).length < rarity.maxPerGroup;
  });
}

function rollAffixes(content: Content, rng: Rng, base: ItemBaseDef, rarity: RarityDef, level: number): RolledAffix[] {
  const wanted: number = rng.int(rarity.affixMin, rarity.affixMax);
  const rolled: RolledAffix[] = [];
  while (rolled.length < wanted) {
    const affix: AffixDef | undefined = pickWeighted(rng, eligibleAffixes(content, rarity, base.slot, level, rolled)) ?? undefined;
    if (affix === undefined) break;
    const scale: number = (1 + affix.perLevel * (level - 1)) * rarity.statScale;
    rolled.push({ affix: affix.id, value: roundStat(affix.stat, affix.op, rng.range(affix.min, affix.max) * scale) });
  }
  return rolled;
}

function uniqueChance(content: Content, level: number, find: number): number {
  return (content.itemScaling.uniqueChance + content.itemScaling.uniqueChancePerLevel * (level - 1)) * (1 + find);
}

function pickBase(content: Content, rng: Rng, level: number, unique: boolean): ItemBaseDef | null {
  const pool: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.minLevel <= level && base.maxLevel >= level && (unique ? base.uniqueWeight > 0 : base.dropWeight > 0));
  return pickWeighted(rng, pool.map((base: ItemBaseDef): { weight: number; base: ItemBaseDef } => ({ weight: unique ? base.uniqueWeight : base.dropWeight, base })))?.base ?? null;
}

function pickRarity(content: Content, rng: Rng, find: number): RarityDef | null {
  return pickWeighted(rng, content.rarities.map((rarity: RarityDef, index: number): RarityDef => (index === 0 ? rarity : { ...rarity, weight: rarity.weight * (1 + find) })));
}

export function generateItem(content: Content, rng: Rng, uid: number, level: number, forcedBase: string | null, forcedRarity: string | null, find: number = 0): ItemInstance | null {
  const unique: boolean = forcedRarity === UNIQUE_RARITY || (forcedBase === null && forcedRarity === null && rng.chance(uniqueChance(content, level, find)));
  const picked: ItemBaseDef | null = pickBase(content, rng, level, unique) ?? (unique ? pickBase(content, rng, level, false) : null);
  const base: ItemBaseDef | null = forcedBase === null ? picked : (content.itemBases.get(forcedBase) ?? null);
  const rarityId: string | null = base !== null && base.uniqueWeight > 0 ? UNIQUE_RARITY : forcedRarity;
  const rarity: RarityDef | null = rarityId === null ? pickRarity(content, rng, find) : (content.rarities.find((candidate: RarityDef): boolean => candidate.id === rarityId) ?? null);
  if (base === null || rarity === null) return null;
  return { uid, base: base.id, rarity: rarity.id, level, affixes: rollAffixes(content, rng, base, rarity, level) };
}
