import type { Content, ItemBaseDef, WearableDef, WearRegion } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import type { Equipment } from './world/types.ts';

export function wornWearables(content: Content, clothes: readonly string[], equipped: Equipment | null): string[] {
  const worn: Map<WearRegion, string> = new Map<WearRegion, string>();
  const put = (id: string): void => {
    const def: WearableDef | undefined = content.wearables.get(id);
    if (def !== undefined) worn.set(def.region, id);
  };
  for (const id of clothes) put(id);
  if (equipped !== null) {
    for (const slot of ITEM_SLOTS) {
      const item = equipped[slot];
      const base: ItemBaseDef | undefined = item === null ? undefined : content.itemBases.get(item.base);
      if (base !== undefined) for (const id of base.wear) put(id);
    }
  }
  return [...worn.values()];
}

export function hiddenBodyParts(content: Content, wearableIds: readonly string[]): string[] {
  const hidden: Set<string> = new Set<string>();
  for (const id of wearableIds) {
    for (const part of content.wearables.get(id)?.hides ?? []) hidden.add(part);
  }
  return [...hidden];
}
