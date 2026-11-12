import { readServerUrl } from '../backend/create.ts';
import type { ServerUrl } from '../backend/create.ts';
import { createTracesClient } from '../backend/traces-api.ts';
import type { TracesClient } from '../backend/traces-api.ts';
import { createBrowserStore } from '../storage.ts';

export function createBrowserTracesClient(rawUrl: string | undefined): TracesClient | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  return createTracesClient({ serverUrl: server.url, store: createBrowserStore(), fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init) });
}
