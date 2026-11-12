import type { Content, ItemBaseDef, RarityDef } from '../content/types.ts';
import { generateItem } from '../items.ts';
import { pickWeighted } from '../rng.ts';
import type { ItemInstance, PlayerState, World } from './types.ts';

function held(player: PlayerState): ReadonlySet<string> {
  const bases: Set<string> = new Set<string>();
  for (const item of Object.values(player.equipped)) if (item !== null) bases.add(item.base);
  for (const item of player.inventory) if (item !== null) bases.add(item.base);
  return bases;
}

export function firstDropBases(content: Content, player: PlayerState, level: number): readonly ItemBaseDef[] {
  const owned: ReadonlySet<string> = held(player);
  return [...content.itemBases.values()].filter(
    (base: ItemBaseDef): boolean => base.dropWeight > 0 && base.power === null && base.minLevel <= level && base.slot !== null && player.equipped[base.slot] === null && !owned.has(base.id),
  );
}

function rank(content: Content, rarity: string | null): number {
  return rarity === null ? -1 : content.rarities.findIndex((candidate: RarityDef): boolean => candidate.id === rarity);
}

function firstDrop(world: World, level: number, rarity: string | null): ItemInstance | null {
  const content: Content = world.content;
  const base: ItemBaseDef | null = pickWeighted(world.rng, firstDropBases(content, world.player, level).map((candidate: ItemBaseDef): { weight: number; base: ItemBaseDef } => ({ weight: candidate.dropWeight, base: candidate })))?.base ?? null;
  if (base === null) return null;
  const floor: string = content.player.firstDrop.rarity;
  const chosen: string = rarity !== null && rank(content, rarity) > rank(content, floor) ? rarity : floor;
  return generateItem(content, world.rng, world.nextItemUid, level, base.id, chosen);
}

export function rollDrop(world: World, level: number, rarity: string | null): ItemInstance | null {
  const flag: string = world.content.player.firstDrop.flag;
  const first: ItemInstance | null = world.flags[flag] === undefined ? firstDrop(world, level, rarity) : null;
  const item: ItemInstance | null = first ?? generateItem(world.content, world.rng, world.nextItemUid, level, null, rarity);
  if (item === null) return null;
  world.flags[flag] = 'yes';
  world.nextItemUid += 1;
  return item;
}
