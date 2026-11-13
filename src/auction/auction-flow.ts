import type { ItemSpot, Listable } from '../../sim/world/purse.ts';
import { findLedger, freeSlots, hasRoom, listable } from '../../sim/world/purse.ts';
import type { PurseEntry } from '../../sim/world/ledger.ts';
import type { Command, World } from '../../sim/world/types.ts';
import type { AuctionAnswer, AuctionFilters, AuctionRules, Listed, Listing, ListingPage, MyAuction, Sale } from '../backend/auction-api.ts';
import type { AuctionHouse } from '../backend/auction.ts';
import type { AuctionLine, AuctionTab } from './auction-model.ts';
import { AUCTION_LINES, collectedLine, FIRST_PAGE, parsePrice, pickLine, priceLine, refusalLine } from './auction-model.ts';

export type AuctionWork = 'list' | 'buy' | 'cancel' | 'collect';

export interface AuctionState {
  readonly tab: AuctionTab;
  readonly filters: AuctionFilters;
  readonly page: ListingPage | null;
  readonly mine: MyAuction | null;
  readonly history: readonly Sale[] | null;
  readonly picked: string | null;
  readonly price: string;
  readonly confirm: string | null;
  readonly work: AuctionWork | null;
  readonly loading: boolean;
  readonly line: AuctionLine | null;
  readonly closed: boolean;
}

interface FlowState {
  tab: AuctionTab;
  filters: AuctionFilters;
  page: ListingPage | null;
  mine: MyAuction | null;
  history: readonly Sale[] | null;
  picked: string | null;
  price: string;
  confirm: string | null;
  work: AuctionWork | null;
  loading: boolean;
  line: AuctionLine | null;
  closed: boolean;
}

export interface AuctionFlowOptions {
  readonly house: AuctionHouse;
  readonly world: () => World;
  readonly send: (command: Command) => void;
  readonly sync: () => Promise<void>;
}

export interface AuctionFlow {
  state(): AuctionState;
  revision(): number;
  rules(): AuctionRules | null;
  open(): void;
  setTab(tab: AuctionTab): void;
  filter(next: Partial<AuctionFilters>): void;
  turn(delta: number): void;
  pick(spot: ItemSpot): void;
  setPrice(text: string): void;
  list(): Promise<void>;
  ask(listing: string): void;
  buy(listing: string): Promise<void>;
  cancel(listing: string): Promise<void>;
  collect(): Promise<void>;
}

type Unanswered = Exclude<AuctionAnswer<never>, { readonly kind: 'ok' }>;

export function createAuctionFlow(options: AuctionFlowOptions): AuctionFlow {
  const { house } = options;
  const state: FlowState = { tab: 'browse', filters: FIRST_PAGE, page: null, mine: null, history: null, picked: null, price: '', confirm: null, work: null, loading: false, line: null, closed: false };
  let changes: number = 0;
  let browseTurn: number = 0;
  let mineTurn: number = 0;
  let historyTurn: number = 0;

  const touch = (): void => {
    changes += 1;
  };
  const say = (line: AuctionLine | null): void => {
    state.line = line;
    touch();
  };
  const rules = (): AuctionRules | null => state.mine?.rules ?? null;
  const purse = (): number => options.world().purse;
  const apply = (entries: readonly PurseEntry[]): void => {
    if (entries.length > 0) options.send({ type: 'purse', entries, stripped: [], unverified: [] });
  };
  const unanswered = (answer: Unanswered): void => {
    switch (answer.kind) {
      case 'closed':
        state.closed = true;
        say(AUCTION_LINES.closed);
        return;
      case 'failed':
        say(AUCTION_LINES.failed);
        return;
      case 'refused':
        say(refusalLine(answer.code, rules()));
        return;
    }
  };

  const browse = async (): Promise<void> => {
    browseTurn += 1;
    const mine: number = browseTurn;
    state.loading = true;
    touch();
    const answer: AuctionAnswer<ListingPage> = await house.browse(state.filters);
    if (mine !== browseTurn) return;
    state.loading = false;
    if (answer.kind === 'ok') {
      state.page = answer.value;
      touch();
    } else unanswered(answer);
  };

  const refreshHistory = async (): Promise<void> => {
    historyTurn += 1;
    const turn: number = historyTurn;
    const answer: AuctionAnswer<readonly Sale[]> = await house.history();
    if (turn !== historyTurn) return;
    if (answer.kind === 'ok') state.history = answer.value;
    else if (answer.kind === 'closed') state.history = null;
    touch();
  };

  const refreshMine = async (): Promise<void> => {
    mineTurn += 1;
    const turn: number = mineTurn;
    const answer: AuctionAnswer<MyAuction> = await house.mine(purse());
    if (turn !== mineTurn) return;
    if (answer.kind !== 'ok') {
      unanswered(answer);
      return;
    }
    state.mine = answer.value;
    apply(answer.value.entries);
    touch();
    void refreshHistory();
  };

  const working = async <T>(work: AuctionWork, call: () => Promise<AuctionAnswer<T>>, done: (value: T) => void): Promise<void> => {
    if (state.work !== null || state.closed) return;
    state.work = work;
    state.confirm = null;
    touch();
    const answer: AuctionAnswer<T> = await call();
    state.work = null;
    if (answer.kind === 'ok') done(answer.value);
    else unanswered(answer);
    touch();
  };

  const listingOf = (id: string): Listing | null => state.page?.listings.find((listing: Listing): boolean => listing.id === id) ?? state.mine?.listings.find((listing: Listing): boolean => listing.id === id) ?? null;

  return {
    state: (): AuctionState => state,
    revision: (): number => changes,
    rules,
    open(): void {
      state.closed = false;
      state.confirm = null;
      state.work = null;
      say(null);
      void refreshMine();
      void browse();
    },
    setTab(tab: AuctionTab): void {
      if (state.tab === tab) return;
      state.tab = tab;
      state.confirm = null;
      say(tab === 'sell' && state.picked === null ? AUCTION_LINES.pick : null);
      if (tab === 'mine') void refreshMine();
    },
    filter(next: Partial<AuctionFilters>): void {
      state.filters = { ...state.filters, ...next, page: 1 };
      state.confirm = null;
      touch();
      void browse();
    },
    turn(delta: number): void {
      const page: number = state.filters.page + delta;
      if (page < 1 || (delta > 0 && state.page?.more !== true)) return;
      state.filters = { ...state.filters, page };
      state.confirm = null;
      touch();
      void browse();
    },
    pick(spot: ItemSpot): void {
      const found: Listable = listable(options.world(), spot);
      state.tab = 'sell';
      state.confirm = null;
      if (found.kind === 'refused') {
        say(pickLine(found.reason));
        return;
      }
      state.picked = found.ledger;
      say(null);
    },
    setPrice(text: string): void {
      state.price = text;
      touch();
    },
    async list(): Promise<void> {
      const world: World = options.world();
      const spot: ItemSpot | null = state.picked === null ? null : findLedger(world, state.picked);
      if (spot === null) {
        state.picked = null;
        say(AUCTION_LINES.pick);
        return;
      }
      const found: Listable = listable(world, spot);
      if (found.kind === 'refused') {
        say(pickLine(found.reason));
        return;
      }
      if (world.player.level < (rules()?.sellLevel ?? 0)) {
        say(refusalLine('level_too_low', rules()));
        return;
      }
      const price: number | null = parsePrice(state.price, rules());
      if (price === null) {
        say(priceLine(rules()));
        return;
      }
      await working(
        'list',
        (): Promise<AuctionAnswer<Listed>> => house.list(found.ledger, price, purse()),
        (listed: Listed): void => {
          apply(listed.entries);
          state.picked = null;
          state.price = '';
          state.line = AUCTION_LINES.listed;
          void refreshMine();
          void browse();
        },
      );
    },
    ask(listing: string): void {
      if (state.work !== null) return;
      state.confirm = listing;
      touch();
    },
    async buy(id: string): Promise<void> {
      const listing: Listing | null = listingOf(id);
      if (listing === null || state.confirm !== id) return;
      if (!hasRoom(options.world())) {
        state.confirm = null;
        say(AUCTION_LINES.noRoom);
        return;
      }
      await working(
        'buy',
        async (): Promise<AuctionAnswer<readonly PurseEntry[]>> => {
          await options.sync();
          return house.buy(id, listing.price, purse());
        },
        (entries: readonly PurseEntry[]): void => {
          apply(entries);
          state.line = AUCTION_LINES.bought;
          void refreshMine();
        },
      );
      void browse();
    },
    async cancel(id: string): Promise<void> {
      if (!hasRoom(options.world())) {
        say(AUCTION_LINES.noRoom);
        return;
      }
      await working(
        'cancel',
        (): Promise<AuctionAnswer<readonly PurseEntry[]>> => house.cancel(id, purse()),
        (entries: readonly PurseEntry[]): void => {
          apply(entries);
          state.line = AUCTION_LINES.cancelled;
          void browse();
        },
      );
      void refreshMine();
    },
    async collect(): Promise<void> {
      const waiting = state.mine?.waiting ?? null;
      if (waiting === null || (waiting.gold === 0 && waiting.items.length === 0)) {
        say(AUCTION_LINES.nothing);
        return;
      }
      if (waiting.items.length > freeSlots(options.world())) {
        say(AUCTION_LINES.noRoom);
        return;
      }
      await working(
        'collect',
        (): Promise<AuctionAnswer<readonly PurseEntry[]>> => house.collect(purse()),
        (entries: readonly PurseEntry[]): void => {
          apply(entries);
          state.line = collectedLine(waiting.gold, waiting.items.length);
        },
      );
      void refreshMine();
    },
  };
}
