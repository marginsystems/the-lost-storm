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

export type SignInMethod = 'google' | 'email';
export type AccountKind = 'guest' | SignInMethod;

export interface Providers {
  readonly googleClientId: string | null;
  readonly emailSiteKey: string | null;
}

export type EmailStartAnswer =
  | { readonly kind: 'sent'; readonly resendAfterMs: number }
  | { readonly kind: 'refused'; readonly status: number; readonly code: string; readonly retryAfterMs: number | null }
  | { readonly kind: 'unreachable' };

export type EmailVerifyAnswer =
  | { readonly kind: 'ok'; readonly session: Session }
  | { readonly kind: 'wrong'; readonly attemptsLeft: number }
  | { readonly kind: 'refused'; readonly status: number; readonly code: string; readonly retryAfterMs: number | null }
  | { readonly kind: 'unreachable' };

export interface Profile {
  readonly accountId: string;
  readonly kind: AccountKind;
  readonly name: string | null;
}

export type SignInOutcome = 'linked' | 'existing';

export interface Session {
  readonly accountId: string;
  readonly token: string;
  readonly outcome: SignInOutcome;
  readonly name: string | null;
}

export type ProvidersResult = { readonly kind: 'ok'; readonly providers: Providers } | Failure;
export type ProfileResult = { readonly kind: 'ok'; readonly profile: Profile } | Failure;
export type NonceResult = { readonly kind: 'ok'; readonly nonce: string } | Failure;
export type SessionResult = { readonly kind: 'ok'; readonly session: Session } | Failure;
export type SignOutResult = { readonly kind: 'ok' } | Failure;

export type GuestResult = { readonly kind: 'ok'; readonly account: GuestAccount } | Failure;
export type ReadResult = { readonly kind: 'ok'; readonly state: CloudState } | Failure;
export type WriteResult = { readonly kind: 'ok'; readonly copy: CloudCopy } | { readonly kind: 'conflict'; readonly current: CloudState } | Failure;

export interface BoardRow {
  readonly rank: number;
  readonly name: string;
  readonly level: number;
  readonly furthest: string;
  readonly online: boolean;
}

export interface YourRow extends BoardRow {
  readonly chosen: boolean;
}

export interface LevelUpNote {
  readonly name: string;
  readonly level: number;
  readonly minutesAgo: number;
}

export interface Leaderboard {
  readonly top: readonly BoardRow[];
  readonly you: YourRow | null;
  readonly online: number;
  readonly characters: number;
  readonly levelUps: readonly LevelUpNote[];
}

export type NameRefusal = 'name_length' | 'name_characters' | 'name_blocked' | 'name_taken';

export type LeaderboardResult = { readonly kind: 'ok'; readonly board: Leaderboard } | Failure;
export type NameResult = { readonly kind: 'ok'; readonly name: string } | { readonly kind: 'invalid'; readonly reason: NameRefusal } | { readonly kind: 'limited' } | Failure;

export interface Api {
  createGuest(signal: AbortSignal): Promise<GuestResult>;
  readSave(token: string, signal: AbortSignal): Promise<ReadResult>;
  writeSave(token: string, save: SaveData, baseRevision: number, signal: AbortSignal): Promise<WriteResult>;
  providers(signal: AbortSignal): Promise<ProvidersResult>;
  profile(token: string, signal: AbortSignal): Promise<ProfileResult>;
  googleNonce(token: string, signal: AbortSignal): Promise<NonceResult>;
  googleSignIn(token: string, credential: string, signal: AbortSignal): Promise<SessionResult>;
  signOut(token: string, signal: AbortSignal): Promise<SignOutResult>;
  emailStart(token: string, email: string, turnstileToken: string, signal: AbortSignal): Promise<EmailStartAnswer>;
  emailVerify(token: string, email: string, code: string, signal: AbortSignal): Promise<EmailVerifyAnswer>;
}

export interface Answer {
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

function textOf(source: Fields, key: string): string | null {
  const value: unknown = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function nameOf(source: Fields): string | null | undefined {
  const value: unknown = source['name'];
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : undefined;
}

function offered(value: unknown, key: string): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isFields(value)) return undefined;
  return textOf(value, key) ?? undefined;
}

export function readProviders(value: unknown): Providers | null {
  if (!isFields(value)) return null;
  const googleClientId: string | null | undefined = offered(value['google'], 'clientId');
  const emailSiteKey: string | null | undefined = offered(value['email'], 'turnstileSiteKey');
  if (googleClientId === undefined || emailSiteKey === undefined || !('google' in value)) return null;
  return { googleClientId, emailSiteKey };
}

const MS_PER_SECOND: number = 1000;
const DEFAULT_RESEND_MS: number = 60_000;
const MAX_RESEND_MS: number = 600_000;

export function readEmailSent(value: unknown): number | null {
  if (!isFields(value) || value['sent'] !== true) return null;
  const seconds: unknown = value['resendAfterSeconds'];
  if (seconds === undefined) return DEFAULT_RESEND_MS;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? Math.min(MAX_RESEND_MS, seconds * MS_PER_SECOND) : null;
}

export function errorCodeOf(body: unknown): string {
  const error: unknown = isFields(body) ? body['error'] : null;
  const code: string | null = isFields(error) ? textOf(error, 'code') : null;
  return code ?? 'unknown';
}

function attemptsLeftOf(body: unknown): number | null {
  const left: unknown = isFields(body) ? body['attemptsLeft'] : null;
  return typeof left === 'number' && Number.isSafeInteger(left) && left >= 0 ? left : null;
}

export function readProfile(value: unknown): Profile | null {
  if (!isFields(value)) return null;
  const accountId: string | null = textOf(value, 'accountId');
  const kind: unknown = value['kind'];
  const name: string | null | undefined = nameOf(value);
  if (accountId === null || name === undefined || (kind !== 'guest' && kind !== 'google' && kind !== 'email')) return null;
  return { accountId, kind, name };
}

export function readSession(value: unknown): Session | null {
  if (!isFields(value)) return null;
  const accountId: string | null = textOf(value, 'accountId');
  const token: string | null = textOf(value, 'token');
  const outcome: unknown = value['outcome'];
  const name: string | null | undefined = nameOf(value);
  if (accountId === null || token === null || name === undefined || (outcome !== 'linked' && outcome !== 'existing')) return null;
  return { accountId, token, outcome, name };
}

export async function exchange(fetchFn: FetchFn, url: string, init: RequestInit): Promise<Answer | null> {
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

export function failureOf(answer: Answer | null): Failure {
  if (answer === null) return { kind: 'retry', afterMs: null };
  if (answer.status === 401) return { kind: 'unauthorized' };
  if (answer.status === 429) return { kind: 'retry', afterMs: retryAfterMs(answer.retryAfter) };
  if (answer.status === 408 || answer.status >= 500) return { kind: 'retry', afterMs: null };
  return { kind: 'refused', status: answer.status };
}

export function succeeded(answer: Answer | null): answer is Answer {
  return answer !== null && answer.status >= 200 && answer.status < 300;
}

export function headers(token: string): Record<string, string> {
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
    async providers(signal: AbortSignal): Promise<ProvidersResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/auth/providers`, { method: 'GET', signal });
      if (!succeeded(answer)) return failureOf(answer);
      const providers: Providers | null = readProviders(answer.body);
      return providers === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', providers };
    },
    async profile(token: string, signal: AbortSignal): Promise<ProfileResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/me`, { method: 'GET', headers: headers(token), signal });
      if (!succeeded(answer)) return failureOf(answer);
      const profile: Profile | null = readProfile(answer.body);
      return profile === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', profile };
    },
    async googleNonce(token: string, signal: AbortSignal): Promise<NonceResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/auth/google/nonce`, { method: 'POST', headers: headers(token), signal });
      if (!succeeded(answer)) return failureOf(answer);
      const nonce: string | null = isFields(answer.body) ? textOf(answer.body, 'nonce') : null;
      return nonce === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', nonce };
    },
    async googleSignIn(token: string, credential: string, signal: AbortSignal): Promise<SessionResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/auth/google`, { method: 'POST', headers: headers(token), body: JSON.stringify({ credential }), signal });
      if (!succeeded(answer)) return failureOf(answer);
      const session: Session | null = readSession(answer.body);
      return session === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', session };
    },
    async signOut(token: string, signal: AbortSignal): Promise<SignOutResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/signout`, { method: 'POST', headers: headers(token), signal });
      return succeeded(answer) ? { kind: 'ok' } : failureOf(answer);
    },
    async emailStart(token: string, email: string, turnstileToken: string, signal: AbortSignal): Promise<EmailStartAnswer> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/auth/email/start`, { method: 'POST', headers: headers(token), body: JSON.stringify({ email, turnstileToken }), signal });
      if (answer === null) return { kind: 'unreachable' };
      const resendAfterMs: number | null = succeeded(answer) ? readEmailSent(answer.body) : null;
      if (resendAfterMs !== null) return { kind: 'sent', resendAfterMs };
      return { kind: 'refused', status: answer.status, code: errorCodeOf(answer.body), retryAfterMs: retryAfterMs(answer.retryAfter) };
    },
    async emailVerify(token: string, email: string, code: string, signal: AbortSignal): Promise<EmailVerifyAnswer> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/auth/email/verify`, { method: 'POST', headers: headers(token), body: JSON.stringify({ email, code }), signal });
      if (answer === null) return { kind: 'unreachable' };
      const session: Session | null = succeeded(answer) ? readSession(answer.body) : null;
      if (session !== null) return { kind: 'ok', session };
      const attemptsLeft: number | null = attemptsLeftOf(answer.body);
      if (answer.status === 422 && errorCodeOf(answer.body) === 'wrong_code' && attemptsLeft !== null) return { kind: 'wrong', attemptsLeft };
      return { kind: 'refused', status: answer.status, code: errorCodeOf(answer.body), retryAfterMs: retryAfterMs(answer.retryAfter) };
    },
  };
}
