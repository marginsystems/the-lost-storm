import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import { computeStats } from '../stats.ts';
import { ITEM_SLOTS } from '../content/types.ts';
import type { ItemInstance, RolledAffix, World } from './types.ts';

export type ItemSource =
  | { readonly kind: 'monster'; readonly monster: string; readonly zone: string }
  | { readonly kind: 'boss'; readonly monster: string; readonly zone: string }
  | { readonly kind: 'moment'; readonly moment: string; readonly zone: string }
  | { readonly kind: 'find'; readonly find: string; readonly zone: string }
  | { readonly kind: 'start'; readonly base: string }
  | { readonly kind: 'trader'; readonly base: string; readonly rarity: string };

export interface LootTicket {
  readonly id: number;
  readonly seed: number;
}

export interface MintClaim {
  readonly uid: number;
  readonly ticket: number;
  readonly source: ItemSource;
  readonly level: number;
}

export interface LedgerItem {
  readonly id: string;
  readonly base: string;
  readonly rarity: string;
  readonly level: number;
  readonly affixes: readonly RolledAffix[];
}

export interface LedgerState {
  tickets: LootTicket[];
  claims: MintClaim[];
  readonly spent: Set<number>;
}

export type TraderSource = (item: ItemInstance) => ItemSource;

export const LEDGER_ID: RegExp = /^itm_[A-Za-z0-9_-]{22}$/;

export function emptyLedger(): LedgerState {
  return { tickets: [], claims: [], spent: new Set<number>() };
}

export function makeItem(world: World, level: number, base: string | null, rarity: string | null, source: ItemSource | TraderSource): ItemInstance | null {
  const ticket: LootTicket | undefined = world.ledger.tickets.shift();
  const rng: Rng = ticket === undefined ? world.rng : createRng(ticket.seed);
  const item: ItemInstance | null = generateItem(world.content, rng, world.nextItemUid, level, base, rarity);
  if (item === null) {
    if (ticket !== undefined) world.ledger.tickets.unshift(ticket);
    return null;
  }
  world.nextItemUid += 1;
  if (ticket !== undefined) {
    world.ledger.spent.add(ticket.id);
    world.ledger.claims.push({ uid: item.uid, ticket: ticket.id, source: typeof source === 'function' ? source(item) : source, level });
  }
  return item;
}

export function giveTickets(world: World, tickets: readonly LootTicket[]): void {
  const held: ReadonlySet<number> = new Set<number>(world.ledger.tickets.map((ticket: LootTicket): number => ticket.id));
  const fresh: readonly LootTicket[] = tickets.filter((ticket: LootTicket): boolean => !held.has(ticket.id) && !world.ledger.spent.has(ticket.id));
  world.ledger.tickets = [...world.ledger.tickets, ...fresh];
}

export function dropTickets(world: World): void {
  world.ledger.tickets = [];
}

export function takeClaims(world: World): readonly MintClaim[] {
  const claims: readonly MintClaim[] = world.ledger.claims;
  world.ledger.claims = [];
  return claims;
}

function settled(item: ItemInstance, minted: LedgerItem): ItemInstance {
  return { uid: item.uid, base: minted.base, rarity: minted.rarity, level: minted.level, affixes: minted.affixes, ledger: minted.id };
}

function settleList(list: (ItemInstance | null)[], uid: number, minted: LedgerItem): boolean {
  const index: number = list.findIndex((item: ItemInstance | null): boolean => item !== null && item.uid === uid);
  const item: ItemInstance | null | undefined = list[index];
  if (item === undefined || item === null) return false;
  list[index] = settled(item, minted);
  return true;
}

function settleWorn(world: World, uid: number, minted: LedgerItem): boolean {
  const equipped = world.player.equipped;
  for (const slot of ITEM_SLOTS) {
    const item: ItemInstance | null = equipped[slot];
    if (item === null || item.uid !== uid) continue;
    equipped[slot] = settled(item, minted);
    world.player.stats = computeStats(world.content, world.player.level, equipped, world.player.allocated);
    return true;
  }
  return false;
}

function settleGround(world: World, uid: number, minted: LedgerItem): boolean {
  for (const ground of world.ground) {
    if (ground.content.kind !== 'item' || ground.content.item.uid !== uid) continue;
    ground.content = { kind: 'item', item: settled(ground.content.item, minted) };
    return true;
  }
  return false;
}

function settleVendors(world: World, uid: number, minted: LedgerItem): boolean {
  return Object.values(world.vendors).some((vendor): boolean => settleList(vendor.stock, uid, minted) || settleList(vendor.buyback, uid, minted));
}

export function confirmItem(world: World, uid: number, minted: LedgerItem): boolean {
  if (!LEDGER_ID.test(minted.id)) return false;
  return settleGround(world, uid, minted) || settleList(world.player.inventory, uid, minted) || settleWorn(world, uid, minted) || settleList(world.stash, uid, minted) || settleVendors(world, uid, minted);
}
