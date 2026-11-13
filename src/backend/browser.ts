import type { Content } from '../../sim/content/types.ts';
import { createBrowserTimers } from '../browser-timers.ts';
import { CHARACTER_KEYS } from '../character-keys.ts';
import { createBrowserStore } from '../storage.ts';
import { createAccountService } from './account.ts';
import type { AccountService } from './account.ts';
import { createApi } from './api.ts';
import { createHideoutApi } from './hideout-api.ts';
import type { HideoutApi } from './hideout-api.ts';
import { createLobbyApi } from './lobby-api.ts';
import type { LobbyApi } from './lobby-api.ts';
import type { Backend, KeyValueStore } from './backend.ts';
import { createConsoleLogger } from './console-log.ts';
import { createAuctionApi } from './auction-api.ts';
import { createAuctionHouse } from './auction.ts';
import type { AuctionHouse } from './auction.ts';
import { createLedgerApi } from './ledger-api.ts';
import { createLive } from './live.ts';
import type { Live, LiveSocket, SocketHandlers } from './live.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';
import { createMinter } from './minter.ts';
import type { Minter } from './minter.ts';
import { createBackend, readServerUrl } from './create.ts';
import type { ServerUrl } from './create.ts';

export function createBrowserBackend(content: Content, rawUrl: string | undefined): Backend {
  return createBackend(content, rawUrl, {
    fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
    store: createBrowserStore(),
    clock: (): number => Date.now(),
    timers: createBrowserTimers(),
    log: createConsoleLogger(),
    characterKeys: CHARACTER_KEYS,
  });
}

export function createBrowserAccount(content: Content, rawUrl: string | undefined): AccountService | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  const api = createApi(server.url, (url: string, init: RequestInit): Promise<Response> => fetch(url, init), content);
  return createAccountService({ serverUrl: server.url, api, store: createBrowserStore() });
}

export function createBrowserMinter(content: Content, rawUrl: string | undefined): Minter | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  return createMinter({
    serverUrl: server.url,
    store: createBrowserStore(),
    api: createLedgerApi(server.url, (url: string, init: RequestInit): Promise<Response> => fetch(url, init), content),
    clock: (): number => Date.now(),
    timers: createBrowserTimers(),
  });
}

function browserFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function openBrowserSocket(url: string, handlers: SocketHandlers): LiveSocket {
  const socket: WebSocket = new WebSocket(url);
  socket.addEventListener('open', (): void => handlers.open());
  socket.addEventListener('message', (event: MessageEvent<unknown>): void => handlers.message(event.data));
  socket.addEventListener('close', (event: CloseEvent): void => handlers.closed(event.code));
  return {
    send(text: string): void {
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
    },
    close(): void {
      socket.close();
    },
  };
}

export interface HideoutServer {
  readonly live: Live;
  readonly api: HideoutApi;
  readonly lobby: LobbyApi;
  token(): string | null;
}

export function createBrowserHideoutServer(rawUrl: string | undefined): HideoutServer | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  const store: KeyValueStore = createBrowserStore();
  const token = (): string | null => {
    const record: SyncRecord | null = parseSyncRecord(store.read(SYNC_KEY), server.url);
    return record === null ? null : record.token;
  };
  return {
    live: createLive({ serverUrl: server.url, open: openBrowserSocket, token, clock: (): number => performance.now(), timers: createBrowserTimers(), random: Math.random }),
    api: createHideoutApi(server.url, browserFetch),
    lobby: createLobbyApi(server.url, browserFetch),
    token,
  };
}

export function createBrowserAuctionHouse(content: Content, rawUrl: string | undefined): AuctionHouse | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  return createAuctionHouse({ serverUrl: server.url, store: createBrowserStore(), api: createAuctionApi(server.url, (url: string, init: RequestInit): Promise<Response> => fetch(url, init), content) });
}
