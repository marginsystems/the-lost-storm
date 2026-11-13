import { ITEM_SLOTS } from '../content/types.ts';
import { isStoryItem } from '../items.ts';
import { refreshPlayer } from './character.ts';
import { dropOnGround, removeGround } from './ground.ts';
import type { LedgerItem, PurseCommand, PurseEntry } from './ledger.ts';
import type { GroundItem, ItemInstance, VendorStock, World } from './types.ts';

export type ItemPlace = 'bag' | 'stash';

export interface ItemSpot {
  readonly place: ItemPlace;
  readonly index: number;
}

export type ListRefusal = 'empty' | 'unverified' | 'story';

export type Listable = { readonly kind: 'ok'; readonly ledger: string; readonly item: ItemInstance } | { readonly kind: 'refused'; readonly reason: ListRefusal };

function holder(world: World, place: ItemPlace): (ItemInstance | null)[] {
  return place === 'bag' ? world.player.inventory : world.stash;
}

export function itemAt(world: World, spot: ItemSpot): ItemInstance | null {
  return holder(world, spot.place)[spot.index] ?? null;
}

export function listable(world: World, spot: ItemSpot): Listable {
  const item: ItemInstance | null = itemAt(world, spot);
  if (item === null) return { kind: 'refused', reason: 'empty' };
  if (isStoryItem(world.content, item)) return { kind: 'refused', reason: 'story' };
  if (item.ledger === null) return { kind: 'refused', reason: 'unverified' };
  return { kind: 'ok', ledger: item.ledger, item };
}

export function findLedger(world: World, ledger: string): ItemSpot | null {
  for (const place of ['bag', 'stash'] as const) {
    const index: number = holder(world, place).findIndex((item: ItemInstance | null): boolean => item !== null && item.ledger === ledger);
    if (index >= 0) return { place, index };
  }
  return null;
}

function empty(item: ItemInstance | null): boolean {
  return item === null;
}

export function freeSlots(world: World): number {
  return world.player.inventory.filter(empty).length + world.stash.filter(empty).length;
}

export function hasRoom(world: World): boolean {
  return freeSlots(world) > 0;
}

function groundHolds(ground: GroundItem, ledger: string): boolean {
  return ground.content.kind === 'item' && ground.content.item.ledger === ledger;
}

function holds(world: World, ledger: string): boolean {
  const owns = (item: ItemInstance | null): boolean => item !== null && item.ledger === ledger;
  if (world.player.inventory.some(owns) || world.stash.some(owns)) return true;
  if (ITEM_SLOTS.some((slot): boolean => owns(world.player.equipped[slot]))) return true;
  return world.ground.some((ground: GroundItem): boolean => groundHolds(ground, ledger));
}

function clearList(list: (ItemInstance | null)[], ledger: string): boolean {
  let removed: boolean = false;
  for (const [index, item] of list.entries()) {
    if (item === null || item.ledger !== ledger) continue;
    list[index] = null;
    removed = true;
  }
  return removed;
}

function removeLedger(world: World, ledger: string): boolean {
  let removed: boolean = clearList(world.player.inventory, ledger);
  removed = clearList(world.stash, ledger) || removed;
  for (const slot of ITEM_SLOTS) {
    if (world.player.equipped[slot]?.ledger !== ledger) continue;
    world.player.equipped[slot] = null;
    removed = true;
  }
  for (const ground of world.ground.filter((candidate: GroundItem): boolean => groundHolds(candidate, ledger))) {
    removeGround(world, ground.id);
    removed = true;
  }
  for (const vendor of Object.values(world.vendors)) {
    removed = clearList(vendor.stock, ledger) || removed;
    const kept: ItemInstance[] = vendor.buyback.filter((item: ItemInstance): boolean => item.ledger !== ledger);
    removed = kept.length !== vendor.buyback.length || removed;
    vendor.buyback = kept;
  }
  return removed;
}

function unverifiedCopy(item: ItemInstance): ItemInstance {
  return { uid: item.uid, base: item.base, rarity: item.rarity, level: item.level, affixes: item.affixes, ledger: null };
}

function clearedIn(item: ItemInstance, ledgers: ReadonlySet<string>): ItemInstance {
  return item.ledger !== null && ledgers.has(item.ledger) ? unverifiedCopy(item) : item;
}

function clearedSlot(item: ItemInstance | null, ledgers: ReadonlySet<string>): ItemInstance | null {
  return item === null ? null : clearedIn(item, ledgers);
}

function unverifyList(list: (ItemInstance | null)[], ledgers: ReadonlySet<string>): boolean {
  let changed: boolean = false;
  for (const [index, item] of list.entries()) {
    const cleared: ItemInstance | null = clearedSlot(item, ledgers);
    if (cleared === item) continue;
    list[index] = cleared;
    changed = true;
  }
  return changed;
}

function unverifyVendor(vendor: VendorStock, ledgers: ReadonlySet<string>): boolean {
  const changed: boolean = unverifyList(vendor.stock, ledgers);
  const buyback: ItemInstance[] = vendor.buyback.map((item: ItemInstance): ItemInstance => clearedIn(item, ledgers));
  const moved: boolean = buyback.some((item: ItemInstance, index: number): boolean => item !== vendor.buyback[index]);
  vendor.buyback = buyback;
  return changed || moved;
}

export function unverifyLedger(world: World, ids: readonly string[]): boolean {
  if (ids.length === 0) return false;
  const ledgers: ReadonlySet<string> = new Set<string>(ids);
  let changed: boolean = unverifyList(world.player.inventory, ledgers);
  changed = unverifyList(world.stash, ledgers) || changed;
  for (const slot of ITEM_SLOTS) {
    const worn: ItemInstance | null = world.player.equipped[slot];
    const cleared: ItemInstance | null = clearedSlot(worn, ledgers);
    if (cleared === worn) continue;
    world.player.equipped[slot] = cleared;
    changed = true;
  }
  for (const ground of world.ground) {
    if (ground.content.kind !== 'item') continue;
    const cleared: ItemInstance = clearedIn(ground.content.item, ledgers);
    if (cleared === ground.content.item) continue;
    ground.content = { kind: 'item', item: cleared };
    changed = true;
  }
  for (const vendor of Object.values(world.vendors)) changed = unverifyVendor(vendor, ledgers) || changed;
  return changed;
}

function fromLedger(world: World, item: LedgerItem): ItemInstance {
  const made: ItemInstance = { uid: world.nextItemUid, base: item.base, rarity: item.rarity, level: item.level, affixes: [...item.affixes], ledger: item.id };
  world.nextItemUid += 1;
  return made;
}

function receive(world: World, item: ItemInstance): void {
  const bag: number = world.player.inventory.indexOf(null);
  if (bag >= 0) {
    world.player.inventory[bag] = item;
    return;
  }
  const stash: number = world.stash.indexOf(null);
  if (stash >= 0) {
    world.stash[stash] = item;
    return;
  }
  dropOnGround(world, world.player.pos, { kind: 'item', item }).kept = true;
}

function applyItem(world: World, entry: PurseEntry): boolean {
  const item: LedgerItem | null = entry.item;
  if (item === null || entry.direction === null) return false;
  if (entry.direction === 'out') return removeLedger(world, item.id);
  if (holds(world, item.id)) return false;
  receive(world, fromLedger(world, item));
  return true;
}

function applyEntry(world: World, entry: PurseEntry): boolean {
  const gold: number = Math.max(0, world.player.gold + entry.gold);
  const paid: boolean = gold !== world.player.gold;
  world.player.gold = gold;
  const moved: boolean = applyItem(world, entry);
  world.purse = entry.id;
  return paid || moved;
}

export function applyPurse(world: World, entries: readonly PurseEntry[]): boolean {
  let changed: boolean = false;
  for (const entry of entries.toSorted((a: PurseEntry, b: PurseEntry): number => a.id - b.id)) {
    if (entry.id <= world.purse) continue;
    changed = applyEntry(world, entry) || changed;
  }
  return changed;
}

export function stripLedger(world: World, ledgers: readonly string[]): boolean {
  let changed: boolean = false;
  for (const ledger of ledgers) changed = removeLedger(world, ledger) || changed;
  return changed;
}

export function handlePurse(world: World, command: PurseCommand): void {
  const worn: readonly (ItemInstance | null)[] = ITEM_SLOTS.map((slot): ItemInstance | null => world.player.equipped[slot]);
  const applied: boolean = applyPurse(world, command.entries);
  const removed: boolean = stripLedger(world, command.stripped);
  const cleared: boolean = unverifyLedger(world, command.unverified);
  if (ITEM_SLOTS.some((slot, index: number): boolean => world.player.equipped[slot] !== worn[index])) refreshPlayer(world);
  else if (applied || removed || cleared) world.events.push({ type: 'character_changed' });
}
