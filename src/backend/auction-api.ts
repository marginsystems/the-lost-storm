import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { Content, ItemSlot } from '../../sim/content/types.ts';
import type { LedgerItem, PurseEntry } from '../../sim/world/ledger.ts';
import { errorCodeOf, exchange, headers } from './api.ts';
import type { Answer, FetchFn } from './api.ts';
import { readLedgerItem } from './ledger-read.ts';
import { readEntries } from './purse-read.ts';

export const LISTING_ID: RegExp = /^lst_[A-Za-z0-9_-]{22}$/;

export const AUCTION_API: { readonly listingsPath: string; readonly mePath: string; readonly collectPath: string; readonly historyPath: string; readonly closedCode: string; readonly maxPage: number } = {
  listingsPath: '/v1/auction/listings',
  mePath: '/v1/auction/me',
  collectPath: '/v1/auction/collect',
  historyPath: '/v1/auction/history',
  closedCode: 'not_found',
  maxPage: 10_000,
};

export const AUCTION_REFUSALS = ['bad_request', 'bad_price', 'no_such_listing', 'listing_gone', 'price_changed', 'own_listing', 'not_enough_gold', 'not_listable', 'no_character', 'too_many_listings', 'level_too_low', 'rate_limited', 'unauthorized'] as const;
export type AuctionRefusal = (typeof AUCTION_REFUSALS)[number];

export type AuctionSort = 'price' | 'newest';

export interface AuctionFilters {
  readonly slot: ItemSlot | null;
  readonly rarity: string | null;
  readonly minLevel: number | null;
  readonly maxLevel: number | null;
  readonly maxPrice: number | null;
  readonly sort: AuctionSort;
  readonly page: number;
}

export interface Listing {
  readonly id: string;
  readonly item: LedgerItem;
  readonly price: number;
  readonly seller: string | null;
  readonly listedAt: string;
  readonly endsAt: string;
  readonly yours: boolean;
}

export interface ListingPage {
  readonly listings: readonly Listing[];
  readonly page: number;
  readonly more: boolean;
}

export interface AuctionRules {
  readonly minPrice: number;
  readonly maxPrice: number;
  readonly maxListings: number;
  readonly cut: number;
  readonly lifeHours: number;
  readonly sellLevel: number;
}

export interface Waiting {
  readonly gold: number;
  readonly items: readonly LedgerItem[];
}

export interface MyAuction {
  readonly listings: readonly Listing[];
  readonly waiting: Waiting;
  readonly rules: AuctionRules;
  readonly entries: readonly PurseEntry[];
}

export interface Listed {
  readonly listing: Listing;
  readonly entries: readonly PurseEntry[];
}

export const SALE_OUTCOMES = ['sold', 'expired', 'cancelled'] as const;
export type SaleOutcome = (typeof SALE_OUTCOMES)[number];

export interface Sale {
  readonly id: string;
  readonly item: LedgerItem;
  readonly price: number;
  readonly cut: number;
  readonly proceeds: number;
  readonly outcome: SaleOutcome;
  readonly closedAt: string;
  readonly collected: boolean;
}

export type AuctionAnswer<T> = { readonly kind: 'ok'; readonly value: T } | { readonly kind: 'refused'; readonly code: AuctionRefusal } | { readonly kind: 'closed' } | { readonly kind: 'failed' };

export interface AuctionApi {
  browse(token: string, filters: AuctionFilters, signal: AbortSignal): Promise<AuctionAnswer<ListingPage>>;
  mine(token: string, purse: number, signal: AbortSignal): Promise<AuctionAnswer<MyAuction>>;
  list(token: string, ledger: string, price: number, purse: number, signal: AbortSignal): Promise<AuctionAnswer<Listed>>;
  buy(token: string, listing: string, price: number, purse: number, signal: AbortSignal): Promise<AuctionAnswer<readonly PurseEntry[]>>;
  cancel(token: string, listing: string, purse: number, signal: AbortSignal): Promise<AuctionAnswer<readonly PurseEntry[]>>;
  collect(token: string, purse: number, signal: AbortSignal): Promise<AuctionAnswer<readonly PurseEntry[]>>;
  history(token: string, signal: AbortSignal): Promise<AuctionAnswer<readonly Sale[]>>;
}

function wholeOf(source: Fields, key: string, min: number): number | null {
  const value: unknown = source[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;
}

function timeOf(source: Fields, key: string): string | null {
  const value: unknown = source[key];
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

export function readListing(content: Content, value: unknown): Listing | null {
  if (!isFields(value)) return null;
  const id: unknown = value['id'];
  const item: LedgerItem | null = readLedgerItem(content, value['item']);
  const price: number | null = wholeOf(value, 'price', 1);
  const seller: unknown = value['seller'];
  const listedAt: string | null = timeOf(value, 'listedAt');
  const endsAt: string | null = timeOf(value, 'endsAt');
  const yours: unknown = value['yours'];
  if (typeof id !== 'string' || !LISTING_ID.test(id) || item === null || price === null || listedAt === null || endsAt === null || typeof yours !== 'boolean') return null;
  if (seller !== null && typeof seller !== 'string') return null;
  return { id, item, price, seller, listedAt, endsAt, yours };
}

function readListings(content: Content, value: unknown): Listing[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  return list.map((entry: unknown): Listing | null => readListing(content, entry)).filter((entry: Listing | null): entry is Listing => entry !== null);
}

export function readListingPage(content: Content, value: unknown): ListingPage | null {
  if (!isFields(value)) return null;
  const listings: Listing[] | null = readListings(content, value['listings']);
  const page: number | null = wholeOf(value, 'page', 1);
  const more: unknown = value['more'];
  return listings === null || page === null || typeof more !== 'boolean' ? null : { listings, page, more };
}

export function readRules(value: unknown): AuctionRules | null {
  if (!isFields(value)) return null;
  const minPrice: number | null = wholeOf(value, 'minPrice', 1);
  const maxPrice: number | null = wholeOf(value, 'maxPrice', 1);
  const maxListings: number | null = wholeOf(value, 'maxListings', 0);
  const lifeHours: unknown = value['lifeHours'];
  const sellLevel: number | null = wholeOf(value, 'sellLevel', 0);
  const cut: unknown = value['cut'];
  if (minPrice === null || maxPrice === null || maxPrice < minPrice || maxListings === null || sellLevel === null) return null;
  if (typeof cut !== 'number' || !Number.isFinite(cut) || cut < 0 || cut >= 1 || typeof lifeHours !== 'number' || !Number.isFinite(lifeHours) || lifeHours <= 0) return null;
  return { minPrice, maxPrice, maxListings, cut, lifeHours, sellLevel };
}

function readWaiting(content: Content, value: unknown): Waiting | null {
  if (!isFields(value) || !Array.isArray(value['items'])) return null;
  const gold: number | null = wholeOf(value, 'gold', 0);
  const list: readonly unknown[] = value['items'];
  const items: (LedgerItem | null)[] = list.map((entry: unknown): LedgerItem | null => readLedgerItem(content, entry));
  if (gold === null || !items.every((entry: LedgerItem | null): boolean => entry !== null)) return null;
  return { gold, items: items.filter((entry: LedgerItem | null): entry is LedgerItem => entry !== null) };
}

export function readMyAuction(content: Content, value: unknown): MyAuction | null {
  if (!isFields(value)) return null;
  const listings: Listing[] | null = readListings(content, value['listings']);
  const waiting: Waiting | null = readWaiting(content, value['waiting']);
  const rules: AuctionRules | null = readRules(value['rules']);
  const entries: PurseEntry[] | null = readEntries(content, value['entries']);
  return listings === null || waiting === null || rules === null || entries === null ? null : { listings, waiting, rules, entries };
}

function outcomeOf(value: unknown): SaleOutcome | null {
  return SALE_OUTCOMES.find((outcome: SaleOutcome): boolean => outcome === value) ?? null;
}

export function readSale(content: Content, value: unknown): Sale | null {
  if (!isFields(value)) return null;
  const id: unknown = value['id'];
  const item: LedgerItem | null = readLedgerItem(content, value['item']);
  const price: number | null = wholeOf(value, 'price', 1);
  const cut: number | null = wholeOf(value, 'cut', 0);
  const proceeds: number | null = wholeOf(value, 'proceeds', 0);
  const outcome: SaleOutcome | null = outcomeOf(value['outcome']);
  const closedAt: string | null = timeOf(value, 'closedAt');
  const collected: unknown = value['collected'];
  if (typeof id !== 'string' || id === '' || item === null || price === null || cut === null || proceeds === null || outcome === null || closedAt === null || typeof collected !== 'boolean') return null;
  return { id, item, price, cut, proceeds, outcome, closedAt, collected };
}

export function readHistory(content: Content, value: unknown): Sale[] | null {
  if (!isFields(value) || !Array.isArray(value['sales'])) return null;
  const list: readonly unknown[] = value['sales'];
  return list.map((entry: unknown): Sale | null => readSale(content, entry)).filter((entry: Sale | null): entry is Sale => entry !== null);
}

function entriesOf(content: Content, value: unknown): PurseEntry[] | null {
  return isFields(value) ? readEntries(content, value['entries']) : null;
}

function refusalOf(code: string): AuctionRefusal | null {
  return AUCTION_REFUSALS.find((known: AuctionRefusal): boolean => known === code) ?? null;
}

function settled<T>(answer: Answer | null, read: (body: unknown) => T | null, ok: readonly number[]): AuctionAnswer<T> {
  if (answer === null || answer.status === 408 || answer.status >= 500) return { kind: 'failed' };
  if (ok.includes(answer.status)) {
    const value: T | null = read(answer.body);
    return value === null ? { kind: 'failed' } : { kind: 'ok', value };
  }
  const code: string = errorCodeOf(answer.body);
  if (answer.status === 401) return { kind: 'refused', code: 'unauthorized' };
  const refusal: AuctionRefusal | null = refusalOf(code);
  if (refusal !== null) return { kind: 'refused', code: refusal };
  if (answer.status === 404 || answer.status === 405) return { kind: 'closed' };
  return { kind: 'failed' };
}

export function filterQuery(filters: AuctionFilters): string {
  const query: URLSearchParams = new URLSearchParams();
  if (filters.slot !== null) query.set('slot', filters.slot);
  if (filters.rarity !== null) query.set('rarity', filters.rarity);
  if (filters.minLevel !== null) query.set('minLevel', String(filters.minLevel));
  if (filters.maxLevel !== null) query.set('maxLevel', String(filters.maxLevel));
  if (filters.maxPrice !== null) query.set('maxPrice', String(filters.maxPrice));
  query.set('sort', filters.sort);
  query.set('page', String(Math.min(AUCTION_API.maxPage, Math.max(1, Math.floor(filters.page)))));
  return query.toString();
}

function listingPath(listing: string, verb: string): string {
  return `${AUCTION_API.listingsPath}/${encodeURIComponent(listing)}/${verb}`;
}

export function createAuctionApi(baseUrl: string, fetchFn: FetchFn, content: Content): AuctionApi {
  const get = (token: string, path: string, signal: AbortSignal): Promise<Answer | null> => exchange(fetchFn, `${baseUrl}${path}`, { method: 'GET', headers: headers(token), signal });
  const post = (token: string, path: string, body: Readonly<Record<string, string | number>>, signal: AbortSignal): Promise<Answer | null> => exchange(fetchFn, `${baseUrl}${path}`, { method: 'POST', headers: headers(token), body: JSON.stringify(body), signal });
  const entries = (body: unknown): PurseEntry[] | null => entriesOf(content, body);
  return {
    browse: async (token: string, filters: AuctionFilters, signal: AbortSignal): Promise<AuctionAnswer<ListingPage>> =>
      settled(await get(token, `${AUCTION_API.listingsPath}?${filterQuery(filters)}`, signal), (body: unknown): ListingPage | null => readListingPage(content, body), [200]),
    mine: async (token: string, purse: number, signal: AbortSignal): Promise<AuctionAnswer<MyAuction>> =>
      settled(await get(token, `${AUCTION_API.mePath}?purse=${purse}`, signal), (body: unknown): MyAuction | null => readMyAuction(content, body), [200]),
    list: async (token: string, ledger: string, price: number, purse: number, signal: AbortSignal): Promise<AuctionAnswer<Listed>> =>
      settled(
        await post(token, AUCTION_API.listingsPath, { item: ledger, price, purse }, signal),
        (body: unknown): Listed | null => {
          const listing: Listing | null = isFields(body) ? readListing(content, body['listing']) : null;
          const read: PurseEntry[] | null = entries(body);
          return listing === null || read === null ? null : { listing, entries: read };
        },
        [200, 201],
      ),
    buy: async (token: string, listing: string, price: number, purse: number, signal: AbortSignal): Promise<AuctionAnswer<readonly PurseEntry[]>> => settled(await post(token, listingPath(listing, 'buy'), { price, purse }, signal), entries, [200]),
    cancel: async (token: string, listing: string, purse: number, signal: AbortSignal): Promise<AuctionAnswer<readonly PurseEntry[]>> => settled(await post(token, listingPath(listing, 'cancel'), { purse }, signal), entries, [200]),
    collect: async (token: string, purse: number, signal: AbortSignal): Promise<AuctionAnswer<readonly PurseEntry[]>> => settled(await post(token, AUCTION_API.collectPath, { purse }, signal), entries, [200]),
    history: async (token: string, signal: AbortSignal): Promise<AuctionAnswer<readonly Sale[]>> => settled(await get(token, AUCTION_API.historyPath, signal), (body: unknown): Sale[] | null => readHistory(content, body), [200]),
  };
}
