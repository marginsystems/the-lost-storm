import { isFields } from '../../sim/content/read.ts';
import { exchange, headers, succeeded } from './api.ts';
import type { Answer, FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export interface SpokenName {
  readonly name: string;
  readonly audio: ArrayBuffer;
}

export interface NameVoiceClient {
  fetch(): Promise<SpokenName | null>;
}

export interface NameVoiceOptions {
  readonly serverUrl: string;
  readonly store: KeyValueStore;
  readonly fetch: FetchFn;
}

export const NAME_VOICE = {
  path: '/v1/voice/name',
  format: 'audio/mpeg',
  requestMs: 12000,
  maxBase64: 360000,
  nameChars: 32,
} as const;

const BASE64: RegExp = /^[A-Za-z0-9+/]+={0,2}$/;

function decode(text: string): ArrayBuffer | null {
  if (text.length === 0 || text.length > NAME_VOICE.maxBase64 || !BASE64.test(text)) return null;
  try {
    const binary: string = atob(text);
    const buffer: ArrayBuffer = new ArrayBuffer(binary.length);
    const bytes: Uint8Array = new Uint8Array(buffer);
    for (let index: number = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return buffer;
  } catch {
    return null;
  }
}

export function readSpokenName(body: unknown): SpokenName | null {
  if (!isFields(body)) return null;
  const name: unknown = body['name'];
  const format: unknown = body['format'];
  const audio: unknown = body['audio'];
  if (typeof name !== 'string' || name === '' || name.length > NAME_VOICE.nameChars || format !== NAME_VOICE.format || typeof audio !== 'string') return null;
  const decoded: ArrayBuffer | null = decode(audio);
  return decoded === null ? null : { name, audio: decoded };
}

export function createNameVoiceClient(options: NameVoiceOptions): NameVoiceClient {
  return {
    async fetch(): Promise<SpokenName | null> {
      const record: SyncRecord | null = parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl);
      if (record === null) return null;
      const answer: Answer | null = await exchange(options.fetch, `${options.serverUrl}${NAME_VOICE.path}`, { method: 'GET', headers: headers(record.token), signal: AbortSignal.timeout(NAME_VOICE.requestMs) });
      return succeeded(answer) ? readSpokenName(answer.body) : null;
    },
  };
}
