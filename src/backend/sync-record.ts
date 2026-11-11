import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';

export const SYNC_KEY: string = 'the-lost-storm.cloud.v1';

export interface SyncRecord {
  readonly serverUrl: string;
  readonly accountId: string;
  readonly token: string;
  readonly revision: number;
  readonly updatedAt: string | null;
  readonly savedAt: string | null;
  readonly pending: boolean;
  readonly overwriteCloud: boolean;
}

function textOf(source: Fields, key: string): string | null {
  const value: unknown = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function nullableTextOf(source: Fields, key: string): string | null | undefined {
  const value: unknown = source[key];
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function flagOf(source: Fields, key: string): boolean | null {
  const value: unknown = source[key];
  return typeof value === 'boolean' ? value : null;
}

export function parseSyncRecord(text: string | null, serverUrl: string): SyncRecord | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isFields(parsed)) return null;
  const url: string | null = textOf(parsed, 'serverUrl');
  const accountId: string | null = textOf(parsed, 'accountId');
  const token: string | null = textOf(parsed, 'token');
  const revision: unknown = parsed['revision'];
  const updatedAt: string | null | undefined = nullableTextOf(parsed, 'updatedAt');
  const savedAt: string | null | undefined = nullableTextOf(parsed, 'savedAt');
  const pending: boolean | null = flagOf(parsed, 'pending');
  const overwriteCloud: boolean | null = flagOf(parsed, 'overwriteCloud');
  if (url !== serverUrl || accountId === null || token === null) return null;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) return null;
  if (updatedAt === undefined || savedAt === undefined || pending === null || overwriteCloud === null) return null;
  return { serverUrl: url, accountId, token, revision, updatedAt, savedAt, pending, overwriteCloud };
}

export function serializeSyncRecord(record: SyncRecord): string {
  return JSON.stringify(record);
}
