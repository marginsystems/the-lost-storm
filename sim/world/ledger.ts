import { generateItem } from '../items.ts';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
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

export type PurseKind = 'list' | 'cancel' | 'buy' | 'collect';

export type PurseDirection = 'in' | 'out';

export interface PurseEntry {
  readonly id: number;
  readonly kind: PurseKind;
  readonly gold: number;
  readonly item: LedgerItem | null;
  readonly direction: PurseDirection | null;
}

export interface PurseCommand {
  readonly type: 'purse';
  readonly entries: readonly PurseEntry[];
  readonly stripped: readonly string[];
  readonly unverified: readonly string[];
}

export interface WaitingClaim {
  readonly uid: number;
  readonly source: ItemSource;
  readonly level: number;
}

export interface LedgerState {
  tickets: LootTicket[];
  claims: MintClaim[];
  waiting: WaitingClaim[];
  readonly spent: Set<number>;
}

export const LEDGER_ID: RegExp = /^itm_[A-Za-z0-9_-]{22}$/;

export function emptyLedger(): LedgerState {
  return { tickets: [], claims: [], waiting: [], spent: new Set<number>() };
}

function seedless(world: World, base: string | null, rarity: string | null): boolean {
  const def = base === null ? undefined : world.content.itemBases.get(base);
  const tier = world.content.rarities.find((candidate): boolean => candidate.id === rarity);
  return def !== undefined && def.power === null && tier !== undefined && tier.affixMax === 0;
}

export function makeItem(world: World, level: number, base: string | null, rarity: string | null, source: ItemSource, fallback: Rng = world.rng): ItemInstance | null {
  const ticket: LootTicket | undefined = world.ledger.tickets.shift();
  const rng: Rng = ticket === undefined ? fallback : createRng(ticket.seed);
  const item: ItemInstance | null = generateItem(world.content, rng, world.nextItemUid, level, base, rarity);
  if (item === null) {
    if (ticket !== undefined) world.ledger.tickets.unshift(ticket);
    return null;
  }
  world.nextItemUid += 1;
  if (ticket === undefined && seedless(world, base, rarity)) world.ledger.waiting.push({ uid: item.uid, source, level });
  if (ticket !== undefined) {
    world.ledger.spent.add(ticket.id);
    world.ledger.claims.push({ uid: item.uid, ticket: ticket.id, source, level });
  }
  return item;
}

export function giveTickets(world: World, tickets: readonly LootTicket[]): void {
  const held: Set<number> = new Set<number>(world.ledger.tickets.map((ticket: LootTicket): number => ticket.id));
  const fresh: LootTicket[] = [];
  for (const ticket of tickets) {
    if (held.has(ticket.id) || world.ledger.spent.has(ticket.id)) continue;
    held.add(ticket.id);
    fresh.push(ticket);
  }
  world.ledger.tickets = [...world.ledger.tickets, ...fresh];
  for (const late of world.ledger.waiting.splice(0, world.ledger.waiting.length)) {
    const ticket: LootTicket | undefined = world.ledger.tickets.shift();
    if (ticket === undefined) {
      world.ledger.waiting.push(late);
      continue;
    }
    world.ledger.spent.add(ticket.id);
    world.ledger.claims.push({ uid: late.uid, ticket: ticket.id, source: late.source, level: late.level });
  }
}

export function keepTickets(world: World, keep: (ticket: LootTicket) => boolean): void {
  world.ledger.tickets = world.ledger.tickets.filter(keep);
}

export function takeClaims(world: World): readonly MintClaim[] {
  const claims: readonly MintClaim[] = world.ledger.claims;
  world.ledger.claims = [];
  return claims;
}

function sameRoll(item: ItemInstance, minted: LedgerItem): boolean {
  if (item.base !== minted.base || item.rarity !== minted.rarity || item.level !== minted.level || item.affixes.length !== minted.affixes.length) return false;
  return item.affixes.every((affix: RolledAffix, index: number): boolean => {
    const other: RolledAffix | undefined = minted.affixes[index];
    return other !== undefined && affix.affix === other.affix && affix.value === other.value;
  });
}

function settled(item: ItemInstance, minted: LedgerItem): ItemInstance | null {
  return sameRoll(item, minted) ? { ...item, ledger: minted.id } : null;
}

function settleList(list: (ItemInstance | null)[], uid: number, minted: LedgerItem): boolean | null {
  const index: number = list.findIndex((item: ItemInstance | null): boolean => item !== null && item.uid === uid);
  const item: ItemInstance | null | undefined = list[index];
  if (item === undefined || item === null) return null;
  const next: ItemInstance | null = settled(item, minted);
  if (next !== null) list[index] = next;
  return next !== null;
}

function settleWorn(world: World, uid: number, minted: LedgerItem): boolean | null {
  const equipped = world.player.equipped;
  for (const slot of ITEM_SLOTS) {
    const item: ItemInstance | null = equipped[slot];
    if (item === null || item.uid !== uid) continue;
    const next: ItemInstance | null = settled(item, minted);
    if (next !== null) equipped[slot] = next;
    return next !== null;
  }
  return null;
}

function settleGround(world: World, uid: number, minted: LedgerItem): boolean | null {
  for (const ground of world.ground) {
    if (ground.content.kind !== 'item' || ground.content.item.uid !== uid) continue;
    const next: ItemInstance | null = settled(ground.content.item, minted);
    if (next !== null) ground.content = { kind: 'item', item: next };
    return next !== null;
  }
  return null;
}

function settleVendors(world: World, uid: number, minted: LedgerItem): boolean | null {
  for (const vendor of Object.values(world.vendors)) {
    const found: boolean | null = settleList(vendor.stock, uid, minted) ?? settleList(vendor.buyback, uid, minted);
    if (found !== null) return found;
  }
  return null;
}

export function confirmItem(world: World, uid: number, minted: LedgerItem): boolean {
  if (!LEDGER_ID.test(minted.id)) return false;
  return settleGround(world, uid, minted) ?? settleList(world.player.inventory, uid, minted) ?? settleWorn(world, uid, minted) ?? settleList(world.stash, uid, minted) ?? settleVendors(world, uid, minted) ?? false;
}
