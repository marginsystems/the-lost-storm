import { isFields } from '../../sim/content/read.ts';
import { exchange, headers, succeeded } from './api.ts';
import type { Answer, FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export interface Tally {
  readonly count: number;
  readonly others: number;
}

export interface JournalCountClient {
  signedIn(): boolean;
  count(): Promise<Tally | null>;
}

export interface JournalCountOptions {
  readonly serverUrl: string;
  readonly store: KeyValueStore;
  readonly fetch: FetchFn;
}

export const JOURNAL_COUNT_API = {
  requestMs: 6000,
  path: '/v1/tallies/journal',
} as const;

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function readTally(value: unknown): Tally | null {
  if (!isFields(value)) return null;
  const count: number | null = wholeNumber(value['count']);
  const others: number | null = wholeNumber(value['others']);
  return count === null || others === null || others > count ? null : { count, others };
}

export function createJournalCountClient(options: JournalCountOptions): JournalCountClient {
  const record = (): SyncRecord | null => parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl);
  return {
    signedIn: (): boolean => record() !== null,
    count: async (): Promise<Tally | null> => {
      const held: SyncRecord | null = record();
      if (held === null) return null;
      const answer: Answer | null = await exchange(options.fetch, `${options.serverUrl}${JOURNAL_COUNT_API.path}`, { method: 'POST', headers: headers(held.token), signal: AbortSignal.timeout(JOURNAL_COUNT_API.requestMs) });
      return succeeded(answer) ? readTally(answer.body) : null;
    },
  };
}
