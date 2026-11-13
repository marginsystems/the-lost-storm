import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { PurseEntry } from '../../sim/world/ledger.ts';
import type { Command, ItemInstance, World } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import type { AuctionAnswer, AuctionFilters, Listed, Listing, ListingPage, MyAuction, Sale } from '../backend/auction-api.ts';
import type { AuctionHouse } from '../backend/auction.ts';
import { createAuctionFlow } from './auction-flow.ts';
import type { AuctionFlow } from './auction-flow.ts';
import { AUCTION_LINES } from './auction-model.ts';

const content: Content = loadContent();
const LEDGER: string = 'itm_AAAAAAAAAAAAAAAAAAAAAA';
const ITEM = { id: LEDGER, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };
const LISTING: Listing = { id: 'lst_BBBBBBBBBBBBBBBBBBBBBB', item: { ...ITEM, id: 'itm_CCCCCCCCCCCCCCCCCCCCCC' }, price: 40, seller: 'Ash', listedAt: '2026-11-14T10:00:00.000Z', endsAt: '2026-11-16T10:00:00.000Z', yours: false };
const RULES = { minPrice: 1, maxPrice: 1000, maxListings: 10, cut: 0.1, lifeHours: 48, sellLevel: 3 };
const SALE: Sale = { id: 'lst_DDDDDDDDDDDDDDDDDDDDDD', item: LISTING.item, price: 40, cut: 4, proceeds: 36, outcome: 'sold', closedAt: '2026-11-14T12:00:00.000Z', collected: false };
const BOUGHT: PurseEntry = { id: 9, kind: 'buy', gold: -40, item: LISTING.item, direction: 'in' };

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface Answers {
  browse: AuctionAnswer<ListingPage>;
  mine: AuctionAnswer<MyAuction>;
  list: AuctionAnswer<Listed>;
  buy: AuctionAnswer<readonly PurseEntry[]>;
  cancel: AuctionAnswer<readonly PurseEntry[]>;
  collect: AuctionAnswer<readonly PurseEntry[]>;
  history: AuctionAnswer<readonly Sale[]>;
}

interface Rig {
  readonly flow: AuctionFlow;
  readonly world: World;
  readonly calls: Call[];
  readonly sent: Command[];
  readonly order: string[];
  readonly answers: Answers;
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function rig(): Rig {
  const world: World = worldIn(content, content.world.town, 3);
  world.player.inventory = world.player.inventory.map((): ItemInstance | null => null);
  world.player.gold = 100;
  world.player.level = 5;
  const calls: Call[] = [];
  const sent: Command[] = [];
  const order: string[] = [];
  const answers: Answers = {
    browse: { kind: 'ok', value: { listings: [LISTING], page: 1, more: false } },
    mine: { kind: 'ok', value: { listings: [], waiting: { gold: 0, items: [] }, rules: RULES, entries: [] } },
    list: { kind: 'failed' },
    buy: { kind: 'failed' },
    cancel: { kind: 'failed' },
    collect: { kind: 'failed' },
    history: { kind: 'ok', value: [SALE] },
  };
  const note = (name: string, args: readonly unknown[]): void => {
    calls.push({ name, args });
    order.push(name);
  };
  const house: AuctionHouse = {
    browse: (filters: AuctionFilters): Promise<AuctionAnswer<ListingPage>> => {
      note('browse', [filters]);
      return Promise.resolve(answers.browse);
    },
    mine: (purse: number): Promise<AuctionAnswer<MyAuction>> => {
      note('mine', [purse]);
      return Promise.resolve(answers.mine);
    },
    list: (ledger: string, price: number, purse: number): Promise<AuctionAnswer<Listed>> => {
      note('list', [ledger, price, purse]);
      return Promise.resolve(answers.list);
    },
    buy: (listing: string, price: number, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => {
      note('buy', [listing, price, purse]);
      return Promise.resolve(answers.buy);
    },
    cancel: (listing: string, purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => {
      note('cancel', [listing, purse]);
      return Promise.resolve(answers.cancel);
    },
    collect: (purse: number): Promise<AuctionAnswer<readonly PurseEntry[]>> => {
      note('collect', [purse]);
      return Promise.resolve(answers.collect);
    },
    history: (): Promise<AuctionAnswer<readonly Sale[]>> => {
      note('history', []);
      return Promise.resolve(answers.history);
    },
  };
  const sync = (): Promise<void> => {
    order.push('sync');
    return Promise.resolve();
  };
  const flow: AuctionFlow = createAuctionFlow({ house, world: (): World => world, send: (command: Command): void => void sent.push(command), sync });
  return { flow, world, calls, sent, order, answers };
}

function named(calls: readonly Call[], name: string): Call[] {
  return calls.filter((call: Call): boolean => call.name === name);
}

async function opened(): Promise<Rig> {
  const state: Rig = rig();
  state.flow.open();
  await settle();
  return state;
}

void test('opening asks for my page with the purse cursor and the first page of listings', async (): Promise<void> => {
  const state: Rig = rig();
  state.world.purse = 5;
  state.answers.mine = { kind: 'ok', value: { listings: [], waiting: { gold: 0, items: [] }, rules: RULES, entries: [BOUGHT] } };
  state.flow.open();
  await settle();
  assert.deepEqual(named(state.calls, 'mine')[0]?.args, [5]);
  assert.equal(named(state.calls, 'browse').length, 1);
  assert.deepEqual(state.flow.state().page?.listings, [LISTING]);
  assert.deepEqual(state.sent, [{ type: 'purse', entries: [BOUGHT], stripped: [], unverified: [] }]);
});

void test('a server without the house shows the auctioneer closed', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.mine = { kind: 'closed' };
  state.answers.browse = { kind: 'closed' };
  state.flow.open();
  await settle();
  assert.equal(state.flow.state().closed, true);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.closed);
});

void test('an unverified item cannot be picked and says why', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory[0] = { uid: 50, base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [], ledger: null };
  state.flow.pick({ place: 'bag', index: 0 });
  assert.equal(state.flow.state().picked, null);
  assert.equal(state.flow.state().tab, 'sell');
  assert.match(state.flow.state().line?.text ?? '', /not verified/);
});

void test('listing sends the picked ledger id and price, and the item leaves only on the answer', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory[2] = { uid: 51, ...ITEM, ledger: LEDGER };
  state.world.purse = 7;
  state.flow.pick({ place: 'bag', index: 2 });
  state.flow.setPrice('abc');
  await state.flow.list();
  assert.equal(named(state.calls, 'list').length, 0);
  state.flow.setPrice('120');
  const out: PurseEntry = { id: 8, kind: 'list', gold: 0, item: ITEM, direction: 'out' };
  state.answers.list = { kind: 'ok', value: { listing: { ...LISTING, yours: true }, entries: [out] } };
  const listing: Promise<void> = state.flow.list();
  assert.deepEqual(named(state.calls, 'list')[0]?.args, [LEDGER, 120, 7]);
  assert.equal(state.world.player.inventory[2].ledger, LEDGER);
  assert.deepEqual(state.sent, []);
  await listing;
  assert.deepEqual(state.sent, [{ type: 'purse', entries: [out], stripped: [], unverified: [] }]);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.listed);
  assert.equal(state.flow.state().picked, null);
});

void test('a price outside the rules is refused before any request', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory[0] = { uid: 52, ...ITEM, ledger: LEDGER };
  state.flow.pick({ place: 'bag', index: 0 });
  state.flow.setPrice('5000');
  await state.flow.list();
  assert.equal(named(state.calls, 'list').length, 0);
  assert.match(state.flow.state().line?.text ?? '', /from 1 to 1000/);
});

void test('buying takes a second click on the same row, flushes the save first and pays the price seen', async (): Promise<void> => {
  const state: Rig = await opened();
  await state.flow.buy(LISTING.id);
  assert.equal(named(state.calls, 'buy').length, 0);
  state.flow.ask(LISTING.id);
  assert.equal(state.flow.state().confirm, LISTING.id);
  state.answers.buy = { kind: 'ok', value: [BOUGHT] };
  await state.flow.buy(LISTING.id);
  assert.deepEqual(named(state.calls, 'buy')[0]?.args, [LISTING.id, 40, 0]);
  assert.ok(state.order.indexOf('sync') < state.order.indexOf('buy'));
  assert.deepEqual(state.sent.at(-1), { type: 'purse', entries: [BOUGHT], stripped: [], unverified: [] });
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.bought);
});

void test('a buy with no room in the bags or stash is not sent', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.inventory = state.world.player.inventory.map((_: ItemInstance | null, index: number): ItemInstance => ({ uid: 600 + index, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null }));
  state.world.stash = state.world.stash.map((_: ItemInstance | null, index: number): ItemInstance => ({ uid: 700 + index, base: 'rusted_blade', rarity: 'common', level: 1, affixes: [], ledger: null }));
  state.flow.ask(LISTING.id);
  await state.flow.buy(LISTING.id);
  assert.equal(named(state.calls, 'buy').length, 0);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.noRoom);
});

void test('a refused or failed buy changes nothing and says so', async (): Promise<void> => {
  const state: Rig = await opened();
  state.flow.ask(LISTING.id);
  state.answers.buy = { kind: 'refused', code: 'listing_gone' };
  await state.flow.buy(LISTING.id);
  assert.match(state.flow.state().line?.text ?? '', /gone/);
  state.flow.ask(LISTING.id);
  state.answers.buy = { kind: 'failed' };
  await state.flow.buy(LISTING.id);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.failed);
  assert.deepEqual(state.sent, []);
  assert.equal(state.world.player.gold, 100);
});

void test('collecting with nothing waiting asks nothing of the server', async (): Promise<void> => {
  const state: Rig = await opened();
  await state.flow.collect();
  assert.equal(named(state.calls, 'collect').length, 0);
  assert.deepEqual(state.flow.state().line, AUCTION_LINES.nothing);
});

void test('collecting applies the entries and names what came back', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.mine = { kind: 'ok', value: { listings: [], waiting: { gold: 90, items: [ITEM] }, rules: RULES, entries: [] } };
  state.flow.open();
  await settle();
  const entries: readonly PurseEntry[] = [
    { id: 3, kind: 'collect', gold: 90, item: null, direction: null },
    { id: 4, kind: 'collect', gold: 0, item: ITEM, direction: 'in' },
  ];
  state.answers.collect = { kind: 'ok', value: entries };
  await state.flow.collect();
  assert.deepEqual(state.sent, [{ type: 'purse', entries, stripped: [], unverified: [] }]);
  assert.equal(state.flow.state().line?.text, 'Collected 90 gold and 1 item.');
});

void test('changing a filter starts again from the first page', async (): Promise<void> => {
  const state: Rig = rig();
  state.answers.browse = { kind: 'ok', value: { listings: [LISTING], page: 1, more: true } };
  state.flow.open();
  await settle();
  state.flow.turn(1);
  await settle();
  state.flow.turn(1);
  await settle();
  assert.equal(state.flow.state().filters.page, 3);
  state.flow.filter({ slot: 'weapon' });
  await settle();
  const last: Call | undefined = named(state.calls, 'browse').at(-1);
  assert.deepEqual(last?.args, [{ ...state.flow.state().filters, slot: 'weapon', page: 1 }]);
});

void test('my page brings the closed sales, and a server without history hides them without closing the house', async (): Promise<void> => {
  const state: Rig = await opened();
  assert.deepEqual(state.flow.state().history, [SALE]);
  state.answers.history = { kind: 'failed' };
  state.flow.setTab('mine');
  await settle();
  assert.deepEqual(state.flow.state().history, [SALE]);
  state.flow.setTab('browse');
  state.answers.history = { kind: 'closed' };
  state.flow.setTab('mine');
  await settle();
  assert.equal(state.flow.state().history, null);
  assert.equal(state.flow.state().closed, false);
});

void test('a hero under the selling level is told so before any request', async (): Promise<void> => {
  const state: Rig = await opened();
  state.world.player.level = 2;
  state.world.player.inventory[0] = { uid: 53, ...ITEM, ledger: LEDGER };
  state.flow.pick({ place: 'bag', index: 0 });
  state.flow.setPrice('20');
  await state.flow.list();
  assert.equal(named(state.calls, 'list').length, 0);
  assert.equal(state.flow.state().line?.text, 'Selling needs level 3.');
});
