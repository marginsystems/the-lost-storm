import type { IdentifyPrice } from './content/trade-types.ts';
import type { Content, RarityDef } from './content/types.ts';
import type { ItemPlace } from './world/service-types.ts';
import type { ItemInstance, World } from './world/types.ts';

export interface HeldUnidentified {
  readonly place: ItemPlace;
  readonly index: number;
  readonly item: ItemInstance;
  readonly cost: number;
}

export function isUnidentified(item: ItemInstance): boolean {
  return item.unidentified === true;
}

export function hiddenAtDrop(content: Content, rarity: string): boolean {
  return content.trade.identify.prices[rarity] !== undefined;
}

export function veiled(content: Content, item: ItemInstance): ItemInstance {
  return hiddenAtDrop(content, item.rarity) ? { ...item, unidentified: true } : item;
}

export function revealed(item: ItemInstance): ItemInstance {
  if (!isUnidentified(item)) return item;
  const { uid, base, rarity, level, affixes, ledger, count } = item;
  return count === undefined ? { uid, base, rarity, level, affixes, ledger } : { uid, base, rarity, level, affixes, ledger, count };
}

export function identifyCost(content: Content, item: ItemInstance): number {
  const price: IdentifyPrice | undefined = content.trade.identify.prices[item.rarity];
  if (price === undefined) return 0;
  return Math.max(1, Math.round(price.base * (1 + price.perLevel * (item.level - 1))));
}

export function goodFind(content: Content, item: ItemInstance): boolean {
  const rarity: RarityDef | undefined = content.rarities.find((candidate: RarityDef): boolean => candidate.id === item.rarity);
  return rarity !== undefined && (rarity.powers || (rarity.affixMax > 0 && item.affixes.length >= rarity.affixMax));
}

function heldIn(content: Content, place: ItemPlace, list: readonly (ItemInstance | null)[]): HeldUnidentified[] {
  return list.flatMap((item: ItemInstance | null, index: number): HeldUnidentified[] => (item !== null && isUnidentified(item) ? [{ place, index, item, cost: identifyCost(content, item) }] : []));
}

export function heldUnidentified(world: World): readonly HeldUnidentified[] {
  return [...heldIn(world.content, 'bag', world.player.inventory), ...heldIn(world.content, 'stash', world.stash)];
}

export function totalCost(held: readonly HeldUnidentified[]): number {
  return held.reduce((sum: number, entry: HeldUnidentified): number => sum + entry.cost, 0);
}

export function revealCarried(world: World): boolean {
  let any: boolean = false;
  for (const [index, item] of world.player.inventory.entries()) {
    if (item === null || !isUnidentified(item)) continue;
    world.player.inventory[index] = revealed(item);
    any = true;
  }
  return any;
}
