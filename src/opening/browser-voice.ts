import { readServerUrl } from '../backend/create.ts';
import type { ServerUrl } from '../backend/create.ts';
import { createNameVoiceClient } from '../backend/name-voice.ts';
import type { NameVoiceClient } from '../backend/name-voice.ts';
import { createBrowserStore } from '../storage.ts';

export function createBrowserNameVoice(rawUrl: string | undefined): NameVoiceClient | null {
  const server: ServerUrl = readServerUrl(rawUrl);
  if (server.kind !== 'ok') return null;
  return createNameVoiceClient({ serverUrl: server.url, store: createBrowserStore(), fetch: (url: string, init: RequestInit): Promise<Response> => fetch(url, init) });
}
