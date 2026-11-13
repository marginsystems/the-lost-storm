import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { FetchFn } from './api.ts';
import { createAuctionApi, filterQuery, readHistory, readListing, readListingPage, readMyAuction, readRules, readSale } from './auction-api.ts';
import type { AuctionApi, AuctionFilters } from './auction-api.ts';

const SERVER: string = 'http://localhost:8787';
const SIGNAL: AbortSignal = new AbortController().signal;
const ITEM = { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };
const LISTING = { id: 'lst_BBBBBBBBBBBBBBBBBBBBBB', item: ITEM, price: 120, seller: 'Ash', listedAt: '2026-11-14T10:00:00.000Z', endsAt: '2026-11-16T10:00:00.000Z', yours: false };
const RULES = { minPrice: 1, maxPrice: 1_000_000, maxListings: 10, cut: 0.1, lifeHours: 48, sellLevel: 3 };
const FIRST_PAGE: AuctionFilters = { slot: null, rarity: null, minLevel: null, maxLevel: null, maxPrice: null, sort: 'price', page: 1 };
const SALE = { id: 'lst_BBBBBBBBBBBBBBBBBBBBBB', item: ITEM, price: 120, cut: 12, proceeds: 108, outcome: 'sold', closedAt: '2026-11-15T10:00:00.000Z', collected: false };
const ENTRY = { id: 7, kind: 'buy', gold: -120, item: ITEM, direction: 'in' };

interface Seen {
  readonly url: string;
  readonly init: RequestInit;
}

function client(status: number, body: unknown): { readonly api: AuctionApi; readonly seen: Seen[] } {
  const seen: Seen[] = [];
  const fetchFn: FetchFn = (url: string, init: RequestInit): Promise<Response> => {
    seen.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { api: createAuctionApi(SERVER, fetchFn, content), seen };
}

function only(seen: readonly Seen[]): Seen {
  assert.equal(seen.length, 1);
  return must(seen[0], 'the request');
}

function sentBody(seen: readonly Seen[]): unknown {
  const body: unknown = only(seen).init.body;
  return typeof body === 'string' ? JSON.parse(body) : null;
}

const offline: FetchFn = (): Promise<Response> => Promise.reject(new Error('offline'));

void test('a listing is read only with its id shape, a ledger roll, a whole price and real times', (): void => {
  assert.deepEqual(readListing(content, LISTING), LISTING);
  assert.deepEqual(readListing(content, { ...LISTING, seller: null }), { ...LISTING, seller: null });
  const bad: readonly unknown[] = [
    { ...LISTING, id: 'lst_short' },
    { ...LISTING, item: { ...ITEM, base: 'no_such_base' } },
    { ...LISTING, price: 0 },
    { ...LISTING, price: 1.5 },
    { ...LISTING, endsAt: 'soon' },
    { ...LISTING, yours: 'no' },
    { ...LISTING, seller: 4 },
  ];
  for (const value of bad) assert.equal(readListing(content, value), null);
});

void test('a page keeps the listings it can read and needs its page number and more flag', (): void => {
  assert.deepEqual(readListingPage(content, { listings: [LISTING, { id: 'nope' }], page: 2, more: true }), { listings: [LISTING], page: 2, more: true });
  assert.equal(readListingPage(content, { listings: [], page: 0, more: false }), null);
  assert.equal(readListingPage(content, { listings: [], page: 1 }), null);
});

void test('the rules are bounded prices, a fraction cut and a lifetime in hours', (): void => {
  assert.deepEqual(readRules(RULES), RULES);
  assert.deepEqual(readRules({ ...RULES, cut: 0, sellLevel: 0 }), { ...RULES, cut: 0, sellLevel: 0 });
  for (const value of [{ ...RULES, cut: 10 }, { ...RULES, maxPrice: 0 }, { ...RULES, lifeHours: 0 }, { ...RULES, minPrice: 5, maxPrice: 4 }]) assert.equal(readRules(value), null);
});

void test('my page carries listings, what waits, the rules and unapplied entries', (): void => {
  const mine = { listings: [{ ...LISTING, yours: true }], waiting: { gold: 90, items: [ITEM] }, rules: RULES, entries: [ENTRY] };
  assert.deepEqual(readMyAuction(content, mine), mine);
  assert.equal(readMyAuction(content, { ...mine, waiting: { gold: -1, items: [] } }), null);
  assert.equal(readMyAuction(content, { ...mine, entries: [{ id: 1 }] }), null);
});

void test('browsing sends the filters in the query with the token', async (): Promise<void> => {
  const { api, seen } = client(200, { listings: [LISTING], page: 1, more: false });
  const filters: AuctionFilters = { ...FIRST_PAGE, slot: 'weapon', rarity: 'rare', minLevel: 2, maxLevel: 9, maxPrice: 500, sort: 'newest' };
  assert.deepEqual(await api.browse('tok', filters, SIGNAL), { kind: 'ok', value: { listings: [LISTING], page: 1, more: false } });
  const sent: Seen = only(seen);
  assert.equal(sent.url, `${SERVER}/v1/auction/listings?slot=weapon&rarity=rare&minLevel=2&maxLevel=9&maxPrice=500&sort=newest&page=1`);
  assert.equal(new Headers(sent.init.headers).get('authorization'), 'Bearer tok');
  assert.equal(filterQuery(FIRST_PAGE), 'sort=price&page=1');
});

void test('my page is asked for with the purse cursor', async (): Promise<void> => {
  const { api, seen } = client(200, { listings: [], waiting: { gold: 0, items: [] }, rules: RULES, entries: [] });
  const answer = await api.mine('tok', 12, SIGNAL);
  assert.equal(answer.kind, 'ok');
  assert.equal(only(seen).url, `${SERVER}/v1/auction/me?purse=12`);
});

void test('listing posts the ledger id, the price and the cursor and returns the listing and its entries', async (): Promise<void> => {
  const out = { ...ENTRY, kind: 'list', gold: 0, direction: 'out' };
  const { api, seen } = client(201, { listing: { ...LISTING, yours: true }, entries: [out] });
  assert.deepEqual(await api.list('tok', ITEM.id, 120, 6, SIGNAL), { kind: 'ok', value: { listing: { ...LISTING, yours: true }, entries: [out] } });
  assert.deepEqual(sentBody(seen), { item: ITEM.id, price: 120, purse: 6 });
  assert.equal(only(seen).init.method, 'POST');
});

void test('buying, cancelling and collecting post to their routes and return entries', async (): Promise<void> => {
  const buying = client(200, { entries: [ENTRY] });
  assert.deepEqual(await buying.api.buy('tok', LISTING.id, 120, 6, SIGNAL), { kind: 'ok', value: [ENTRY] });
  assert.equal(only(buying.seen).url, `${SERVER}/v1/auction/listings/${LISTING.id}/buy`);
  assert.deepEqual(sentBody(buying.seen), { price: 120, purse: 6 });
  const cancelling = client(200, { entries: [] });
  assert.deepEqual(await cancelling.api.cancel('tok', LISTING.id, 6, SIGNAL), { kind: 'ok', value: [] });
  assert.equal(only(cancelling.seen).url, `${SERVER}/v1/auction/listings/${LISTING.id}/cancel`);
  assert.deepEqual(sentBody(cancelling.seen), { purse: 6 });
  const collecting = client(200, { entries: [] });
  assert.deepEqual(await collecting.api.collect('tok', 6, SIGNAL), { kind: 'ok', value: [] });
  assert.equal(only(collecting.seen).url, `${SERVER}/v1/auction/collect`);
});

void test('each refusal comes back by its code', async (): Promise<void> => {
  const cases: readonly (readonly [number, string])[] = [
    [409, 'listing_gone'],
    [409, 'price_changed'],
    [409, 'not_enough_gold'],
    [404, 'no_such_listing'],
    [403, 'level_too_low'],
    [400, 'bad_price'],
    [429, 'rate_limited'],
  ];
  const answers = await Promise.all(cases.map(([status, code]: readonly [number, string]): Promise<unknown> => client(status, { error: { code, message: code } }).api.buy('tok', LISTING.id, 1, 0, SIGNAL)));
  assert.deepEqual(
    answers,
    cases.map(([, code]: readonly [number, string]): unknown => ({ kind: 'refused', code })),
  );
  assert.deepEqual(await client(401, { error: { code: 'unauthorized', message: 'x' } }).api.collect('tok', 0, SIGNAL), { kind: 'refused', code: 'unauthorized' });
});

void test('a server without the auction routes is a closed house', async (): Promise<void> => {
  const { api } = client(404, { error: { code: 'not_found', message: 'no route' } });
  assert.deepEqual(await api.mine('tok', 0, SIGNAL), { kind: 'closed' });
  assert.deepEqual(await api.browse('tok', FIRST_PAGE, SIGNAL), { kind: 'closed' });
});

void test('a network failure, a server error or an unreadable answer is a failure that changes nothing', async (): Promise<void> => {
  assert.deepEqual(await createAuctionApi(SERVER, offline, content).collect('tok', 0, SIGNAL), { kind: 'failed' });
  assert.deepEqual(await client(503, {}).api.collect('tok', 0, SIGNAL), { kind: 'failed' });
  assert.deepEqual(await client(200, { entries: [{ id: 'x' }] }).api.collect('tok', 0, SIGNAL), { kind: 'failed' });
  assert.deepEqual(await client(418, { error: { code: 'teapot', message: 'x' } }).api.collect('tok', 0, SIGNAL), { kind: 'failed' });
});

void test('a closed sale is read with its outcome, its cut and proceeds and whether it was collected', (): void => {
  assert.deepEqual(readSale(content, SALE), SALE);
  for (const value of [{ ...SALE, outcome: 'stolen' }, { ...SALE, proceeds: -1 }, { ...SALE, collected: 'no' }, { ...SALE, closedAt: 'later' }, { ...SALE, id: '' }]) assert.equal(readSale(content, value), null);
  assert.deepEqual(readHistory(content, { sales: [SALE, { id: 'x' }] }), [SALE]);
  assert.equal(readHistory(content, { sales: 'none' }), null);
});

void test('the history is asked for with the token, and an older server without it is a closed history', async (): Promise<void> => {
  const { api, seen } = client(200, { sales: [SALE] });
  assert.deepEqual(await api.history('tok', SIGNAL), { kind: 'ok', value: [SALE] });
  assert.equal(only(seen).url, `${SERVER}/v1/auction/history`);
  assert.deepEqual(await client(404, { error: { code: 'not_found', message: 'no route' } }).api.history('tok', SIGNAL), { kind: 'closed' });
  assert.deepEqual(await client(429, { error: { code: 'rate_limited', message: 'slow' } }).api.history('tok', SIGNAL), { kind: 'refused', code: 'rate_limited' });
});
