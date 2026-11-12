import { confirmItem, dropTickets, giveTickets, takeClaims } from '../../sim/world/ledger.ts';
import type { LedgerItem, LootTicket, MintClaim } from '../../sim/world/ledger.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { Clock, KeyValueStore, Timers } from './backend.ts';
import type { LedgerApi, MintAnswer, TicketAnswer, TicketHand } from './ledger-api.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export interface Minter {
  prefetch(): Promise<readonly LootTicket[]>;
  pump(world: World): boolean;
  unverified(item: ItemInstance): boolean;
}

export interface MinterOptions {
  readonly serverUrl: string;
  readonly store: KeyValueStore;
  readonly api: LedgerApi;
  readonly clock: Clock;
  readonly timers: Timers;
}

interface Confirmed {
  readonly uid: number;
  readonly item: LedgerItem;
}

export const MINTER: { readonly lowTickets: number; readonly refreshShare: number; readonly refillGapMs: number; readonly requestMs: number; readonly retryMs: number; readonly attempts: number; readonly prefetchMs: number } = {
  lowTickets: 6,
  refreshShare: 0.5,
  refillGapMs: 5000,
  requestMs: 6000,
  retryMs: 3000,
  attempts: 3,
  prefetchMs: 1500,
};

export function createMinter(options: MinterOptions): Minter {
  const { api, clock, timers } = options;
  const pending: Set<number> = new Set<number>();
  const confirmed: Confirmed[] = [];
  let hand: TicketHand | null = null;
  let handAt: number = 0;
  let handLifeMs: number = Number.POSITIVE_INFINITY;
  let asking: boolean = false;
  let askedAt: number = Number.NEGATIVE_INFINITY;

  const token = (): string | null => {
    const record: SyncRecord | null = parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl);
    return record === null ? null : record.token;
  };

  const ask = (held: string): void => {
    asking = true;
    askedAt = clock();
    const receive = async (): Promise<void> => {
      const answer: TicketAnswer = await api.tickets(held, AbortSignal.timeout(MINTER.requestMs));
      asking = false;
      if (answer.kind !== 'ok') return;
      hand = answer.hand;
      handAt = clock();
      handLifeMs = answer.hand.lifeMs;
    };
    void receive();
  };

  const send = (held: string, claim: MintClaim, attempt: number): void => {
    const settle = async (): Promise<void> => {
      const answer: MintAnswer = await api.mint(held, claim, AbortSignal.timeout(MINTER.requestMs));
      if (answer.kind === 'minted') {
        confirmed.push({ uid: claim.uid, item: answer.item });
        return;
      }
      if (answer.kind === 'failed' && attempt < MINTER.attempts) {
        timers.after(MINTER.retryMs * attempt, (): void => send(held, claim, attempt + 1));
        return;
      }
      pending.delete(claim.uid);
    };
    void settle();
  };

  const stale = (world: World, now: number): boolean => {
    if (world.ledger.tickets.length < MINTER.lowTickets) return true;
    return now - handAt > handLifeMs * MINTER.refreshShare;
  };

  return {
    prefetch: async (): Promise<readonly LootTicket[]> => {
      const held: string | null = token();
      if (held === null) return [];
      askedAt = clock();
      const answer: TicketAnswer = await api.tickets(held, AbortSignal.timeout(MINTER.prefetchMs));
      if (answer.kind !== 'ok') return [];
      handAt = clock();
      handLifeMs = answer.hand.lifeMs;
      return answer.hand.tickets;
    },
    pump: (world: World): boolean => {
      let changed: boolean = false;
      for (const done of confirmed.splice(0, confirmed.length)) {
        changed = confirmItem(world, done.uid, done.item) || changed;
        pending.delete(done.uid);
      }
      if (hand !== null) {
        dropTickets(world);
        giveTickets(world, hand.tickets);
        hand = null;
      }
      const claims: readonly MintClaim[] = takeClaims(world);
      const held: string | null = token();
      if (held === null) return changed;
      for (const claim of claims) {
        pending.add(claim.uid);
        send(held, claim, 1);
      }
      const now: number = clock();
      if (!asking && now - askedAt >= MINTER.refillGapMs && stale(world, now)) ask(held);
      return changed;
    },
    unverified: (item: ItemInstance): boolean => item.ledger === null && !pending.has(item.uid),
  };
}
