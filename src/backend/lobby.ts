import type { KeyValueStore } from './backend.ts';
import type { Leaderboard, LeaderboardResult, NameRefusal, NameResult } from './api.ts';
import type { LobbyApi } from './lobby-api.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export type RenameOutcome = { readonly kind: 'named'; readonly name: string } | { readonly kind: 'invalid'; readonly reason: NameRefusal } | { readonly kind: 'limited' } | { readonly kind: 'unavailable' };

export interface LobbyService {
  read(): Promise<Leaderboard | null>;
  rename(name: string): Promise<RenameOutcome>;
  hasAccount(): boolean;
}

export interface LobbyOptions {
  readonly serverUrl: string;
  readonly api: LobbyApi;
  readonly store: KeyValueStore | null;
}

export const LOBBY_TIMING: { readonly requestMs: number } = { requestMs: 6000 };

export function createLobbyService(options: LobbyOptions): LobbyService {
  const { serverUrl, api, store } = options;
  const token = (): string | null => {
    if (store === null) return null;
    const record: SyncRecord | null = parseSyncRecord(store.read(SYNC_KEY), serverUrl);
    return record === null ? null : record.token;
  };
  return {
    hasAccount: (): boolean => token() !== null,
    async read(): Promise<Leaderboard | null> {
      const result: LeaderboardResult = await api.leaderboard(token(), AbortSignal.timeout(LOBBY_TIMING.requestMs));
      return result.kind === 'ok' ? result.board : null;
    },
    async rename(name: string): Promise<RenameOutcome> {
      const held: string | null = token();
      if (held === null) return { kind: 'unavailable' };
      const result: NameResult = await api.rename(held, name, AbortSignal.timeout(LOBBY_TIMING.requestMs));
      if (result.kind === 'ok') return { kind: 'named', name: result.name };
      if (result.kind === 'invalid') return { kind: 'invalid', reason: result.reason };
      if (result.kind === 'limited') return { kind: 'limited' };
      return { kind: 'unavailable' };
    },
  };
}
