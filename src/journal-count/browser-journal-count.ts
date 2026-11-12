import { readServerUrl } from '../backend/create.ts';
import type { ServerUrl } from '../backend/create.ts';
import { createJournalCountClient } from '../backend/journal-count-api.ts';
import type { JournalCountClient } from '../backend/journal-count-api.ts';
import { createBrowserStore } from '../storage.ts';

export function createBrowserJournalCountClient(rawUrl: string | undefined): JournalCountClient | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  return createJournalCountClient({ serverUrl: server.url, store: createBrowserStore(), fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init) });
}
