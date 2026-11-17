import type { AffixDef, Content, ItemBaseDef, ItemSlot, RarityDef } from '../../sim/content/types.ts';
import type { HeldUnidentified } from '../../sim/identify.ts';
import { heldUnidentified, isUnidentified, revealed, totalCost } from '../../sim/identify.ts';
import { baseOf, itemLines, itemName, rarityOf, SLOT_NAMES } from '../../sim/items.ts';
import type { ItemLine } from '../../sim/items.ts';
import { describeMod } from '../../sim/stat-text.ts';
import type { ItemPlace } from '../../sim/world/service-types.ts';
import type { ItemInstance, RolledAffix, World } from '../../sim/world/types.ts';

export interface IdentifyRow {
  readonly place: ItemPlace;
  readonly index: number;
  readonly item: ItemInstance;
  readonly name: string;
  readonly kind: string;
  readonly cost: number;
  readonly short: number;
}

export interface IdentifyView {
  readonly rows: readonly IdentifyRow[];
  readonly total: number;
  readonly gold: number;
  readonly allShort: number;
}

export interface RevealLine {
  readonly text: string;
  readonly best: boolean;
}

export const IDENTIFY_TEXT = {
  button: (cost: number): string => `Identify · ${cost}`,
  all: (total: number): string => `Identify all · ${total}`,
  short: (missing: number): string => `${missing} gold short`,
  kind: (rarity: string, slot: string, level: number): string => `${rarity} ${slot} · item level ${level}`,
  empty: 'Nothing to identify. Rare and Legendary finds arrive unidentified.',
  done: 'Identified',
  stash: 'In your stash',
} as const;

function kindOf(content: Content, item: ItemInstance): string {
  const rarity: RarityDef = rarityOf(content, item);
  const base: ItemBaseDef | null = baseOf(content, item);
  const slot: ItemSlot | null = base?.slot ?? null;
  return IDENTIFY_TEXT.kind(rarity.name, slot === null ? '' : SLOT_NAMES[slot], item.level);
}

function rowOf(content: Content, gold: number, entry: HeldUnidentified): IdentifyRow {
  return { place: entry.place, index: entry.index, item: entry.item, name: itemName(content, entry.item), kind: kindOf(content, entry.item), cost: entry.cost, short: Math.max(0, entry.cost - gold) };
}

export function identifyView(world: World): IdentifyView {
  const held: readonly HeldUnidentified[] = heldUnidentified(world);
  const gold: number = world.player.gold;
  const total: number = totalCost(held);
  return { rows: held.map((entry: HeldUnidentified): IdentifyRow => rowOf(world.content, gold, entry)), total, gold, allShort: Math.max(0, total - gold) };
}

export function rollQuality(content: Content, rolled: RolledAffix, level: number): number {
  const affix: AffixDef | undefined = content.affixes.get(rolled.affix);
  if (affix === undefined) return 0;
  const span: number = affix.max - affix.min;
  if (span === 0) return 1;
  const scale: number = 1 + affix.perLevel * (level - 1);
  return (rolled.value / scale - affix.min) / span;
}

interface Ranked {
  readonly text: string;
  readonly quality: number;
}

function rankedAffixes(content: Content, item: ItemInstance): Ranked[] {
  return item.affixes.flatMap((rolled: RolledAffix): Ranked[] => {
    const affix: AffixDef | undefined = content.affixes.get(rolled.affix);
    return affix === undefined ? [] : [{ text: describeMod({ stat: affix.stat, op: affix.op, value: rolled.value }), quality: rollQuality(content, rolled, item.level) }];
  });
}

export function revealLines(content: Content, item: ItemInstance): readonly RevealLine[] {
  const known: ItemInstance = revealed(item);
  const implicit: RevealLine[] = itemLines(content, known)
    .filter((line: ItemLine): boolean => line.source === 'implicit')
    .map((line: ItemLine): RevealLine => ({ text: line.text, best: false }));
  const affixes: Ranked[] = rankedAffixes(content, known).toSorted((a: Ranked, b: Ranked): number => a.quality - b.quality);
  const power: string | null = baseOf(content, known)?.power?.text ?? null;
  const rolled: RevealLine[] = affixes.map((line: Ranked, at: number): RevealLine => ({ text: line.text, best: power === null && at === affixes.length - 1 }));
  return power === null ? [...implicit, ...rolled] : [...implicit, ...rolled, { text: power, best: true }];
}

export function justRevealed(world: World, hidden: ReadonlySet<number>): readonly ItemInstance[] {
  return [...world.player.inventory, ...world.stash].filter((item: ItemInstance | null): item is ItemInstance => item !== null && hidden.has(item.uid) && !isUnidentified(item));
}
