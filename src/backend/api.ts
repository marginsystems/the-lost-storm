import type { Content } from '../../sim/content/types.ts';
import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { SaveData } from '../../sim/save.ts';
import { readSave } from '../../sim/save.ts';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface GuestAccount {
  readonly accountId: string;
  readonly token: string;
}

export interface CloudCopy {
  readonly save: SaveData;
  readonly revision: number;
  readonly updatedAt: string;
}

export interface NoCloudCopy {
  readonly save: null;
  readonly revision: number;
  readonly updatedAt: string | null;
}

export type CloudState = CloudCopy | NoCloudCopy;

export type Failure =
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'refused'; readonly status: number }
  | { readonly kind: 'retry'; readonly afterMs: number | null };

export type GuestResult = { readonly kind: 'ok'; readonly account: GuestAccount } | Failure;
export type ReadResult = { readonly kind: 'ok'; readonly state: CloudState } | Failure;
export type WriteResult = { readonly kind: 'ok'; readonly copy: CloudCopy } | { readonly kind: 'conflict'; readonly current: CloudState } | Failure;

export interface Api {
  createGuest(signal: AbortSignal): Promise<GuestResult>;
  readSave(token: string, signal: AbortSignal): Promise<ReadResult>;
  writeSave(token: string, save: SaveData, baseRevision: number, signal: AbortSignal): Promise<WriteResult>;
}

interface Answer {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly body: unknown;
}

const RETRY_AFTER_CAP_MS: number = 120_000;
const KEEPALIVE_LIMIT_CHARS: number = 60_000;

function retryAfterMs(header: string | null): number | null {
  if (header === null || header.trim() === '') return null;
  const seconds: number = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(RETRY_AFTER_CAP_MS, seconds * 1000) : null;
}

function revisionOf(source: Fields): number | null {
  const value: unknown = source['revision'];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function readCloudState(content: Content, value: unknown): CloudState | null {
  if (!isFields(value)) return null;
  const revision: number | null = revisionOf(value);
  const updatedAt: unknown = value['updatedAt'];
  if (revision === null) return null;
  if (value['save'] === null) {
    return updatedAt === null || typeof updatedAt === 'string' ? { save: null, revision, updatedAt } : null;
  }
  const save: SaveData | null = readSave(content, value['save']);
  if (save === null || typeof updatedAt !== 'string') return null;
  return { save, revision, updatedAt };
}

function readGuest(value: unknown): GuestAccount | null {
  if (!isFields(value)) return null;
  const accountId: unknown = value['accountId'];
  const token: unknown = value['token'];
  return typeof accountId === 'string' && typeof token === 'string' && accountId !== '' && token !== '' ? { accountId, token } : null;
}

async function exchange(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Answer | null> {
  try {
    const response: Response = await fetchFn(url, init);
    const raw: string = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body };
  } catch {
    return null;
  }
}

function failureOf(answer: Answer | null): Failure {
  if (answer === null) return { kind: 'retry', afterMs: null };
  if (answer.status === 401) return { kind: 'unauthorized' };
  if (answer.status === 429) return { kind: 'retry', afterMs: retryAfterMs(answer.retryAfter) };
  if (answer.status === 408 || answer.status >= 500) return { kind: 'retry', afterMs: null };
  return { kind: 'refused', status: answer.status };
}

function succeeded(answer: Answer | null): answer is Answer {
  return answer !== null && answer.status >= 200 && answer.status < 300;
}

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export function createApi(baseUrl: string, fetchFn: FetchFn, content: Content): Api {
  return {
    async createGuest(signal: AbortSignal): Promise<GuestResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/guest`, { method: 'POST', signal });
      if (!succeeded(answer)) return failureOf(answer);
      const account: GuestAccount | null = readGuest(answer.body);
      return account === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', account };
    },
    async readSave(token: string, signal: AbortSignal): Promise<ReadResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/save`, { method: 'GET', headers: headers(token), signal });
      if (!succeeded(answer)) return failureOf(answer);
      const state: CloudState | null = readCloudState(content, answer.body);
      return state === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', state };
    },
    async writeSave(token: string, save: SaveData, baseRevision: number, signal: AbortSignal): Promise<WriteResult> {
      const body: string = JSON.stringify({ save, baseRevision });
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/save`, { method: 'PUT', headers: headers(token), body, signal, keepalive: body.length < KEEPALIVE_LIMIT_CHARS });
      if (answer !== null && answer.status === 409) {
        const current: CloudState | null = isFields(answer.body) ? readCloudState(content, answer.body['current']) : null;
        return current === null ? { kind: 'refused', status: 409 } : { kind: 'conflict', current };
      }
      if (!succeeded(answer)) return failureOf(answer);
      const state: CloudState | null = readCloudState(content, answer.body);
      return state === null || state.save === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', copy: state };
    },
  };
}
