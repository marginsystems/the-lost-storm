import type { Clock, Timers } from '../backend/backend.ts';
import type { Leaderboard } from '../backend/api.ts';
import type { LobbyService } from '../backend/lobby.ts';

export type FeedListener = (board: Leaderboard | null, previous: Leaderboard | null) => void;

export interface LobbyFeed {
  current(): Leaderboard | null;
  subscribe(listener: FeedListener): () => void;
  refresh(force: boolean): Promise<void>;
  every(ms: number): void;
  soon(ms: number): void;
}

export const FEED_TIMING: { readonly minGapMs: number } = { minGapMs: 4000 };

export function createLobbyFeed(service: LobbyService, timers: Timers, clock: Clock): LobbyFeed {
  const listeners: Set<FeedListener> = new Set<FeedListener>();
  let board: Leaderboard | null = null;
  let inFlight: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  let lastAt: number = Number.NEGATIVE_INFINITY;
  let interval: number = 0;
  let cancelTick: (() => void) | null = null;
  let cancelSoon: (() => void) | null = null;

  const schedule = (): void => {
    cancelTick?.();
    cancelTick = interval > 0 ? timers.after(interval, (): void => {
      void refresh(true);
    }) : null;
  };

  const load = async (): Promise<void> => {
    lastAt = clock();
    const previous: Leaderboard | null = board;
    const next: Leaderboard | null = await service.read();
    if (next !== null) board = next;
    const failures: unknown[] = [];
    for (const listener of listeners) {
      try {
        listener(next, previous);
      } catch (error: unknown) {
        failures.push(error);
      }
    }
    schedule();
    const [first] = failures;
    if (first !== undefined) throw first instanceof Error ? first : new Error('A ladder listener failed', { cause: first });
  };

  const refresh = async (force: boolean): Promise<void> => {
    if (inFlight !== null) {
      if (!force) return inFlight;
      const settled: Promise<void> = inFlight.catch((): void => undefined);
      queued ??= settled.then(async (): Promise<void> => {
        queued = null;
        return refresh(true);
      });
      return queued;
    }
    if (!force && clock() - lastAt < FEED_TIMING.minGapMs) return undefined;
    inFlight = load().finally((): void => {
      inFlight = null;
    });
    return inFlight;
  };

  return {
    current: (): Leaderboard | null => board,
    subscribe(listener: FeedListener): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    refresh,
    every(ms: number): void {
      interval = ms;
      schedule();
    },
    soon(ms: number): void {
      cancelSoon?.();
      cancelSoon = timers.after(ms, (): void => {
        cancelSoon = null;
        void refresh(true);
      });
    },
  };
}
