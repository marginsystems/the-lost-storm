import type { PurseEntry } from '../../sim/world/ledger.ts';
import type { AuctionAnswer, AuctionApi, AuctionFilters, Listed, ListingPage, MyAuction, Sale } from './auction-api.ts';
import type { KeyValueStore } from './backend.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export const AUCTION_HOUSE: { readonly requestMs: number } = {
  requestMs: 8000,
};

export interface AuctionHouse {
  browse(filters: AuctionFilters): Promise<AuctionAnswer<ListingPage>>;
  mine(purse: number): Promise<AuctionAnswer<MyAuction>>;
  list(ledger: string, price: number, purse: number): Promise<AuctionAnswer<Listed>>;
  buy(listing: string, price: number, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>>;
  cancel(listing: string, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>>;
  collect(purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>>;
  history(): Promise<AuctionAnswer<readonly Sale[]>>;
}

export interface AuctionHouseOptions {
  readonly serverUrl: string;
  readonly store: KeyValueStore;
  readonly api: AuctionApi;
}

const UNSAVED: { readonly kind: 'refused'; readonly code: 'no_character' } = { kind: 'refused', code: 'no_character' };

function signal(): AbortSignal {
  return AbortSignal.timeout(AUCTION_HOUSE.requestMs);
}

export function createAuctionHouse(options: AuctionHouseOptions): AuctionHouse {
  const { api } = options;
  const token = (): string | null => {
    const record: SyncRecord | null = parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl);
    return record === null ? null : record.token;
  };
  const held = <T>(call: (token: string) => Promise<AuctionAnswer<T>>): Promise<AuctionAnswer<T>> => {
    const current: string | null = token();
    return current === null ? Promise.resolve(UNSAVED) : call(current);
  };
  return {
    browse: (filters: AuctionFilters): Promise<AuctionAnswer<ListingPage>> => held((current: string): Promise<AuctionAnswer<ListingPage>> => api.browse(current, filters, signal())),
    mine: (purse: number): Promise<AuctionAnswer<MyAuction>> => held((current: string): Promise<AuctionAnswer<MyAuction>> => api.mine(current, purse, signal())),
    list: (ledger: string, price: number, purse: number): Promise<AuctionAnswer<Listed>> => held((current: string): Promise<AuctionAnswer<Listed>> => api.list(current, ledger, price, purse, signal())),
    buy: (listing: string, price: number, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => held((current: string): Promise<AuctionAnswer<readonly PurseEntry[]>> => api.buy(current, listing, price, purse, signal())),
    cancel: (listing: string, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => held((current: string): Promise<AuctionAnswer<readonly PurseEntry[]>> => api.cancel(current, listing, purse, signal())),
    collect: (purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => held((current: string): Promise<AuctionAnswer<readonly PurseEntry[]>> => api.collect(current, purse, signal())),
    history: (): Promise<AuctionAnswer<readonly Sale[]>> => held((current: string): Promise<AuctionAnswer<readonly Sale[]>> => api.history(current, signal())),
  };
}
