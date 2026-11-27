import { ITEM_SLOTS } from './content/types.ts';
import type { Content, ItemSlot } from './content/types.ts';
import { isFields } from './content/read.ts';
import { isStoryItem, slotOf } from './items.ts';
import type { ItemInstance } from './world/types.ts';

export type LootFilter = Readonly<Partial<Record<string, readonly ItemSlot[]>>>;
export type LootMatch = 'ordinary' | 'wanted' | 'hidden' | 'essential';

export function readLootFilter(value: unknown): LootFilter {
  if (!isFields(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([rarity, slots]: [string, unknown]): [string, ItemSlot[]][] => {
    if (!Array.isArray(slots)) return [];
    return [[rarity, ITEM_SLOTS.filter((slot: ItemSlot): boolean => slots.includes(slot))]];
  }));
}

export function matchLoot(content: Content, filter: LootFilter, item: ItemInstance): LootMatch {
  const slot: ItemSlot | null = slotOf(content, item);
  if (slot === null || isStoryItem(content, item)) return 'essential';
  const slots: readonly ItemSlot[] | undefined = filter[item.rarity];
  if (slots === undefined) return 'ordinary';
  return slots.includes(slot) ? 'wanted' : 'hidden';
}
