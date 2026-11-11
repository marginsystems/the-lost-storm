import type { Content } from '../../sim/content/types.ts';
import { createBrowserTimers } from '../browser-timers.ts';
import { createBrowserStore } from '../storage.ts';
import { createAccountService } from './account.ts';
import type { AccountService } from './account.ts';
import { createApi } from './api.ts';
import type { Backend } from './backend.ts';
import { createConsoleLogger } from './console-log.ts';
import { createBackend, readServerUrl } from './create.ts';
import type { ServerUrl } from './create.ts';

export function createBrowserBackend(content: Content, rawUrl: string | undefined): Backend {
  return createBackend(content, rawUrl, {
    fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init),
    store: createBrowserStore(),
    clock: (): number => Date.now(),
    timers: createBrowserTimers(),
    log: createConsoleLogger(),
  });
}

export function createBrowserAccount(content: Content, rawUrl: string | undefined): AccountService | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  const api = createApi(server.url, (url: string, init: RequestInit): Promise<Response> => fetch(url, init), content);
  return createAccountService({ serverUrl: server.url, api, store: createBrowserStore() });
}
