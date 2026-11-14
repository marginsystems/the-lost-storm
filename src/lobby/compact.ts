import { createBrowserTimers } from '../browser-timers.ts';
import { readServerUrl } from '../backend/create.ts';
import type { ServerUrl } from '../backend/create.ts';
import { createLobbyApi } from '../backend/lobby-api.ts';
import { createLobbyService } from '../backend/lobby.ts';
import type { LobbyService } from '../backend/lobby.ts';
import { createBrowserStore } from '../storage.ts';
import type { Ranking } from '../backend/api.ts';
import { createLobbyFeed } from './lobby-feed.ts';
import type { LobbyFeed } from './lobby-feed.ts';
import { createLobbyPanel } from './lobby-panel.ts';
import type { LobbyPanel } from './lobby-panel.ts';

export interface CompactLeaderboardOptions {
  readonly serverUrl?: string;
  readonly rows?: number;
  readonly title?: string;
  readonly withAccount?: boolean;
}

export interface Lobby {
  readonly service: LobbyService;
  readonly feed: LobbyFeed;
  readonly boards: Readonly<Record<Ranking, LobbyFeed>>;
}

export function rankedService(service: LobbyService, by: Ranking): LobbyService {
  return { ...service, read: (): ReturnType<LobbyService['read']> => service.read(by) };
}

export const COMPACT: { readonly rows: number; readonly title: string; readonly refreshMs: number } = { rows: 10, title: 'Ladder', refreshMs: 30_000 };

export function createBrowserLobby(rawUrl: string | undefined, withAccount: boolean): Lobby | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  const service: LobbyService = createLobbyService({
    serverUrl: server.url,
    api: createLobbyApi(server.url, (url: string, init: RequestInit): Promise<Response> => fetch(url, init)),
    store: withAccount ? createBrowserStore() : null,
  });
  const feedFor = (by: Ranking): LobbyFeed => createLobbyFeed(rankedService(service, by), createBrowserTimers(), (): number => Date.now());
  const feed: LobbyFeed = feedFor('level');
  return { service, feed, boards: { level: feed, damage: feedFor('damage'), life: feedFor('life') } };
}

export function watchFocus(feed: LobbyFeed): () => void {
  const wake = (): void => {
    if (!document.hidden) void feed.refresh(false);
  };
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);
  return (): void => {
    window.removeEventListener('focus', wake);
    document.removeEventListener('visibilitychange', wake);
  };
}

export function mountCompactLeaderboard(root: HTMLElement, options: CompactLeaderboardOptions = {}): () => void {
  const lobby: Lobby | null = createBrowserLobby(options.serverUrl ?? import.meta.env.VITE_SERVER_URL, options.withAccount ?? false);
  if (lobby === null) return (): void => undefined;
  root.classList.add('lobby');
  const panel: LobbyPanel = createLobbyPanel(root, { title: options.title ?? COMPACT.title, rows: options.rows ?? COMPACT.rows, ticker: true });
  const unsubscribe: () => void = lobby.feed.subscribe((board): void => panel.show(board));
  const unwatch: () => void = watchFocus(lobby.feed);
  lobby.feed.every(COMPACT.refreshMs);
  void lobby.feed.refresh(true);
  return (): void => {
    unsubscribe();
    unwatch();
    lobby.feed.every(0);
    panel.stop();
    panel.root.remove();
  };
}
