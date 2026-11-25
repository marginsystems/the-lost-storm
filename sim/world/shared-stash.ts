import { restack } from '../stacks.ts';
import { dropOnGround } from './ground.ts';
import type { ItemInstance, World } from './types.ts';

export function mergeStashes(stashes: readonly (readonly (ItemInstance | null)[])[]): (ItemInstance | null)[] {
  const [first, ...rest] = stashes;
  const merged: (ItemInstance | null)[] = first === undefined ? [] : [...first];
  const seen: Set<string> = new Set<string>(merged.flatMap((item: ItemInstance | null): string[] => (item === null || item.ledger === null ? [] : [item.ledger])));
  for (const stash of rest) {
    for (const item of stash) {
      if (item === null) continue;
      if (item.ledger !== null && seen.has(item.ledger)) continue;
      if (item.ledger !== null) seen.add(item.ledger);
      const free: number = merged.indexOf(null);
      if (free >= 0) merged[free] = item;
      else merged.push(item);
    }
  }
  return merged;
}

function renumbered(world: World, item: ItemInstance): ItemInstance {
  const uid: number = world.nextItemUid;
  world.nextItemUid += 1;
  return { ...item, uid };
}

export function shelveStash(world: World, items: readonly (ItemInstance | null)[]): void {
  const size: number = world.content.trade.stashSize;
  const stash: (ItemInstance | null)[] = Array.from({ length: size }, (_: unknown, index: number): ItemInstance | null => {
    const item: ItemInstance | null = items[index] ?? null;
    return item === null ? null : renumbered(world, item);
  });
  restack(world.content, stash);
  world.stash = stash;
  for (const item of items.slice(size)) {
    if (item !== null) dropOnGround(world, world.player.pos, { kind: 'item', item: renumbered(world, item) }).kept = true;
  }
}
