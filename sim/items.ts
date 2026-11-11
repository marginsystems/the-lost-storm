import type { AffixDef, Content, ItemBaseDef, ItemSlot, RarityDef, StatMod } from './content/types.ts';
import type { Rng } from './rng.ts';
import { pickWeighted } from './rng.ts';
import { describeMod, roundStat } from './stat-text.ts';
import type { ItemInstance, RolledAffix } from './world/types.ts';

export interface ItemLine {
  readonly text: string;
  readonly source: 'implicit' | 'affix';
}

const FALLBACK_RARITY: RarityDef = { id: 'unknown', name: 'Unknown', color: '#9aa3ad', weight: 0, affixMin: 0, affixMax: 0, statScale: 1 };

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
  const factor: number = rarityOf(content, item).statScale * (1 + content.itemScaling.implicitPerLevel * (item.level - 1));
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
  return lines;
}

function rollAffixes(content: Content, rng: Rng, base: ItemBaseDef, rarity: RarityDef, level: number): RolledAffix[] {
  const pool: AffixDef[] = [...content.affixes.values()].filter((affix: AffixDef): boolean => affix.slots.includes(base.slot));
  const wanted: number = rng.int(rarity.affixMin, rarity.affixMax);
  const rolled: RolledAffix[] = [];
  const taken: Set<AffixDef['position']> = new Set<AffixDef['position']>();
  const usedStats: Set<string> = new Set<string>();
  for (let attempt: number = 0; attempt < wanted * 6 && rolled.length < wanted; attempt += 1) {
    const affix: AffixDef | undefined = pool[rng.int(0, pool.length - 1)];
    if (affix === undefined) break;
    const needsFreeLabel: boolean = rolled.length < 2;
    if (usedStats.has(affix.stat) || (needsFreeLabel && taken.has(affix.position))) continue;
    const scale: number = (1 + affix.perLevel * (level - 1)) * rarity.statScale;
    rolled.push({ affix: affix.id, value: roundStat(affix.stat, affix.op, rng.range(affix.min, affix.max) * scale) });
    taken.add(affix.position);
    usedStats.add(affix.stat);
  }
  return rolled;
}

export function generateItem(content: Content, rng: Rng, uid: number, level: number, forcedBase: string | null, forcedRarity: string | null): ItemInstance | null {
  const bases: ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.minLevel <= level && base.dropWeight > 0);
  const pickedBase: ItemBaseDef | null = pickWeighted(rng, bases.map((base: ItemBaseDef): { weight: number; base: ItemBaseDef } => ({ weight: base.dropWeight, base })))?.base ?? null;
  const base: ItemBaseDef | null = forcedBase === null ? pickedBase : (content.itemBases.get(forcedBase) ?? null);
  const rarity: RarityDef | null = forcedRarity === null ? pickWeighted(rng, content.rarities) : (content.rarities.find((candidate: RarityDef): boolean => candidate.id === forcedRarity) ?? null);
  if (base === null || rarity === null) return null;
  return { uid, base: base.id, rarity: rarity.id, level, affixes: rollAffixes(content, rng, base, rarity, level) };
}
