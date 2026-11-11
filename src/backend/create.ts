import type { Content } from '../../sim/content/types.ts';
import { createApi } from './api.ts';
import type { FetchFn } from './api.ts';
import type { Backend, Clock, KeyValueStore, Logger, Timers } from './backend.ts';
import { createLocalBackend } from './local.ts';
import { createRemoteBackend } from './remote.ts';

export type ServerUrl =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'ok'; readonly url: string };

export interface BackendEnvironment {
  readonly fetch: FetchFn;
  readonly store: KeyValueStore;
  readonly clock: Clock;
  readonly timers: Timers;
  readonly log: Logger;
}

export function readServerUrl(raw: string | undefined): ServerUrl {
  const text: string = raw?.trim() ?? '';
  if (text === '') return { kind: 'none' };
  try {
    const url: URL = new URL(text);
    const secure: boolean = url.protocol === 'https:' || url.protocol === 'http:';
    if (!secure || url.username !== '' || url.password !== '') return { kind: 'invalid' };
    return { kind: 'ok', url: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
  } catch {
    return { kind: 'invalid' };
  }
}

export function createBackend(content: Content, rawUrl: string | undefined, environment: BackendEnvironment): Backend {
  const local: Backend = createLocalBackend(content, environment.store);
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind === 'none') return local;
  if (server.kind === 'invalid') {
    environment.log.warn('VITE_SERVER_URL is not an http or https URL, so the game is saving on this device only');
    return local;
  }
  return createRemoteBackend({
    content,
    serverUrl: server.url,
    local,
    store: environment.store,
    api: createApi(server.url, environment.fetch, content),
    clock: environment.clock,
    timers: environment.timers,
    log: environment.log,
  });
}
