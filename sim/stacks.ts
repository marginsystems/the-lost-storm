import type { Content } from './content/types.ts';
import { baseOf } from './items.ts';
import type { ItemInstance } from './world/types.ts';

export type ItemList = (ItemInstance | null)[];

export function stackSize(content: Content, item: ItemInstance): number {
  return baseOf(content, item)?.stack ?? 1;
}

export function countOf(item: ItemInstance): number {
  return item.count ?? 1;
}

export function withCount(item: ItemInstance, count: number): ItemInstance {
  const known: ItemInstance = { uid: item.uid, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes, ledger: item.ledger };
  const plain: ItemInstance = item.unidentified === true ? { ...known, unidentified: true } : known;
  return count === 1 ? plain : { ...plain, count };
}

export function stacksWith(content: Content, held: ItemInstance, item: ItemInstance): boolean {
  return held.base === item.base && held.rarity === item.rarity && held.affixes.length === 0 && item.affixes.length === 0 && held.ledger === null && item.ledger === null && stackSize(content, item) > 1;
}

export function readCount(content: Content, item: ItemInstance, value: unknown): ItemInstance {
  const size: number = stackSize(content, item);
  const count: number = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  return withCount(item, Math.min(size, Math.max(1, count)));
}

export function roomFor(content: Content, list: readonly (ItemInstance | null)[], item: ItemInstance): number {
  const size: number = stackSize(content, item);
  let room: number = 0;
  for (const held of list) {
    if (held === null) room += size;
    else if (stacksWith(content, held, item)) room += Math.max(0, size - countOf(held));
  }
  return room;
}

export function fits(content: Content, list: readonly (ItemInstance | null)[], item: ItemInstance): boolean {
  return roomFor(content, list, item) >= countOf(item);
}

function topUp(content: Content, list: ItemList, item: ItemInstance, before: number): number {
  const size: number = stackSize(content, item);
  let left: number = countOf(item);
  for (let index: number = 0; index < before && left > 0; index += 1) {
    const held: ItemInstance | null = list[index] ?? null;
    if (held === null || !stacksWith(content, held, item)) continue;
    const taken: number = Math.min(left, size - countOf(held));
    if (taken <= 0) continue;
    list[index] = withCount(held, countOf(held) + taken);
    left -= taken;
  }
  return left;
}

export function placeIn(content: Content, list: ItemList, item: ItemInstance): ItemInstance | null {
  const left: number = topUp(content, list, item, list.length);
  if (left === 0) return null;
  const rest: ItemInstance = withCount(item, left);
  const free: number = list.indexOf(null);
  if (free < 0) return rest;
  list[free] = rest;
  return null;
}

export function moveStack(content: Content, from: ItemList, index: number, to: ItemList): boolean {
  const item: ItemInstance | null = from[index] ?? null;
  if (item === null) return false;
  const rest: ItemInstance | null = placeIn(content, to, item);
  if (rest !== null && countOf(rest) === countOf(item)) return false;
  from[index] = rest;
  restack(content, from);
  restack(content, to);
  return true;
}

function smallestLike(content: Content, list: ItemList, index: number, item: ItemInstance): number {
  let best: number = index;
  let fewest: number = countOf(item);
  list.forEach((held: ItemInstance | null, at: number): void => {
    if (held === null || at === index || !stacksWith(content, held, item) || countOf(held) >= fewest) return;
    best = at;
    fewest = countOf(held);
  });
  return best;
}

export function takeOne(content: Content, list: ItemList, index: number): ItemInstance | null {
  const item: ItemInstance | null = list[index] ?? null;
  if (item === null) return null;
  const from: number = smallestLike(content, list, index, item);
  const taken: ItemInstance = list[from] ?? item;
  const count: number = countOf(taken);
  list[from] = count > 1 ? withCount(taken, count - 1) : null;
  restack(content, list);
  return withCount(taken, 1);
}

export function restack(content: Content, list: ItemList): void {
  list.forEach((item: ItemInstance | null, index: number): void => {
    if (item === null || stackSize(content, item) <= 1) return;
    const left: number = topUp(content, list, item, index);
    list[index] = left === 0 ? null : withCount(item, left);
  });
}
