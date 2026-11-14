import { freeSlots, listable } from '../../sim/world/purse.ts';
import type { Listable } from '../../sim/world/purse.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { Clock, Timers } from '../backend/backend.ts';
import type { Live, LiveEvent } from '../backend/live.ts';
import type { TradeState } from './trade-model.ts';
import { asked, expire, gone, NO_TRADE, parseGold, tradeStep } from './trade-model.ts';
import type { TradeFrame, TradeItem } from './trade-protocol.ts';
import { answerFrame, askFrame, cancelFrame, confirmFrame, offerFrame, TRADE_LIMITS } from './trade-protocol.ts';

export const TRADE_FLOW = {
  goldSettleMs: 350,
} as const;

export type BagBlock = 'story' | 'unverified' | null;

export interface BagEntry {
  readonly index: number;
  readonly item: ItemInstance;
  readonly ledger: string | null;
  readonly block: BagBlock;
  readonly offered: boolean;
}

export interface TradeFlowOptions {
  readonly live: Pick<Live, 'canTrade' | 'trade' | 'subscribe'>;
  readonly world: () => World | null;
  readonly sync: () => Promise<void>;
  readonly clock: Clock;
  readonly timers: Timers;
}

export interface PlayerTrade {
  state(): TradeState;
  ready(): boolean;
  ask(id: string, name: string): void;
  accept(): void;
  decline(): void;
  toggle(ledger: string): void;
  goldText(): string;
  setGold(text: string): void;
  confirmOffer(): void;
  cancel(): void;
  bag(): readonly BagEntry[];
  freeSlots(): number;
  subscribe(listener: () => void): () => void;
}

function idsOf(items: readonly TradeItem[]): string[] {
  return items.map((item: TradeItem): string => item.id);
}

function blockOf(found: Listable): BagBlock {
  if (found.kind === 'ok') return null;
  return found.reason === 'story' ? 'story' : 'unverified';
}

export function createTradeFlow(options: TradeFlowOptions): PlayerTrade {
  const { live, clock, timers } = options;
  const listeners: Set<() => void> = new Set<() => void>();
  let state: TradeState = NO_TRADE;
  let offerItems: string[] = [];
  let gold: string = '';
  let editingGold: boolean = false;
  let stopGold: (() => void) | null = null;
  let stopExpiry: (() => void) | null = null;

  const changed = (): void => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        continue;
      }
    }
  };

  const set = (next: TradeState): void => {
    if (next === state) return;
    const opened: boolean = state.open === null && next.open !== null;
    state = next;
    if (opened || next.open === null) {
      offerItems = [];
      gold = '';
      editingGold = false;
      stopGold?.();
      stopGold = null;
    }
    changed();
  };

  const watchExpiry = (): void => {
    stopExpiry?.();
    stopExpiry = null;
    const incoming = state.incoming;
    if (incoming === null) return;
    stopExpiry = timers.after(Math.max(0, incoming.expiresAt - clock()), (): void => {
      stopExpiry = null;
      set(expire(state, clock()));
    });
  };

  const sendOffer = (): void => {
    const amount: number | null = parseGold(gold);
    if (state.open === null || amount === null) return;
    live.trade(offerFrame(offerItems, amount));
  };

  const receive = (frame: TradeFrame): void => {
    const before: TradeState = state;
    set(tradeStep(state, frame, clock()));
    switch (frame.type) {
      case 'trade_asked':
        watchExpiry();
        return;
      case 'trade_state':
        offerItems = idsOf(frame.mine.items);
        if (!editingGold) gold = frame.mine.gold === 0 ? '' : String(frame.mine.gold);
        changed();
        return;
      case 'trade_refused':
        if (before.open !== null && state.open !== null) {
          offerItems = idsOf(state.open.mine.items);
          if (!editingGold) gold = state.open.mine.gold === 0 ? '' : String(state.open.mine.gold);
          changed();
        }
        return;
      case 'trade_done':
        void options.sync().catch((): void => undefined);
        return;
      case 'trade_open':
      case 'trade_closed':
        watchExpiry();
        return;
    }
  };

  live.subscribe((event: LiveEvent): void => {
    if (event.type === 'trade') receive(event.frame);
    else if (event.type === 'gone' || event.type === 'away') {
      watchExpiry();
      set(gone(state));
    }
  });

  return {
    state: (): TradeState => state,
    ready: (): boolean => live.canTrade(),
    ask(id: string, name: string): void {
      if (live.trade(askFrame(id))) set(asked(state, name));
    },
    accept(): void {
      if (state.incoming !== null) live.trade(answerFrame(true));
    },
    decline(): void {
      if (state.incoming === null) return;
      live.trade(answerFrame(false));
      set({ ...state, incoming: null });
      watchExpiry();
    },
    toggle(ledger: string): void {
      if (state.open === null || state.open.mine.confirmed && state.open.theirs.confirmed) return;
      const next: string[] = offerItems.includes(ledger) ? offerItems.filter((id: string): boolean => id !== ledger) : [...offerItems, ledger];
      if (next.length > TRADE_LIMITS.items) return;
      offerItems = next;
      sendOffer();
      changed();
    },
    goldText: (): string => gold,
    setGold(text: string): void {
      gold = text;
      editingGold = true;
      stopGold?.();
      stopGold = timers.after(TRADE_FLOW.goldSettleMs, (): void => {
        stopGold = null;
        editingGold = false;
        sendOffer();
      });
      changed();
    },
    confirmOffer(): void {
      if (state.open !== null) live.trade(confirmFrame(state.open.revision));
    },
    cancel(): void {
      live.trade(cancelFrame());
      if (state.open === null) set({ ...state, asking: null, note: null });
    },
    bag(): readonly BagEntry[] {
      const world: World | null = options.world();
      if (world === null) return [];
      return world.player.inventory.flatMap((item: ItemInstance | null, index: number): BagEntry[] => {
        if (item === null) return [];
        const found: Listable = listable(world, { place: 'bag', index });
        return [{ index, item, ledger: item.ledger, block: blockOf(found), offered: item.ledger !== null && offerItems.includes(item.ledger) }];
      });
    },
    freeSlots(): number {
      const world: World | null = options.world();
      return world === null ? 0 : freeSlots(world);
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
