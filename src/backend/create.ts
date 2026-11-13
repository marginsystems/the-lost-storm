import type { Content } from '../../sim/content/types.ts';
import { createApi } from './api.ts';
import { createCharactersApi } from './characters-api.ts';
import type { CharactersApi } from './characters-api.ts';
import type { FetchFn } from './api.ts';
import type { Backend, Clock, KeyValueStore, Logger, Timers } from './backend.ts';
import { createEpochs, SAVE_EPOCH } from './epoch.ts';
import type { Epochs } from './epoch.ts';
import { createLocalBackend } from './local.ts';
import { createRemoteBackend } from './remote.ts';
import { prepareRoster, reconcileRoster } from './roster-store.ts';
import type { RosterPlace } from './roster-store.ts';
import { readServerUrl } from './server-url.ts';
import type { ServerUrl } from './server-url.ts';

export { readServerUrl };
export type { ServerUrl };

export interface BackendEnvironment {
  readonly fetch: FetchFn;
  readonly store: KeyValueStore;
  readonly clock: Clock;
  readonly timers: Timers;
  readonly log: Logger;
  readonly characterKeys: readonly string[];
}

export function createBackend(content: Content, rawUrl: string | undefined, environment: BackendEnvironment): Backend {
  const epochs: Epochs = createEpochs(SAVE_EPOCH);
  const local: Backend = createLocalBackend(content, environment.store, epochs);
  const server: ServerUrl = readServerUrl(rawUrl);
  const place: RosterPlace = { store: environment.store, serverUrl: server.kind === 'ok' ? server.url : null, extraKeys: environment.characterKeys };
  prepareRoster(place);
  if (server.kind === 'none') return local;
  if (server.kind === 'invalid') {
    environment.log.warn('VITE_SERVER_URL is not an http or https URL, so the game is saving on this device only');
    return local;
  }
  const characters: CharactersApi = createCharactersApi(server.url, environment.fetch);
  return createRemoteBackend({
    content,
    serverUrl: server.url,
    local,
    store: environment.store,
    api: createApi(server.url, environment.fetch, content),
    clock: environment.clock,
    timers: environment.timers,
    log: environment.log,
    epochs,
    prepare: async (signal: AbortSignal): Promise<void> => {
      await reconcileRoster(place, characters, signal, 'boot');
    },
  });
}
