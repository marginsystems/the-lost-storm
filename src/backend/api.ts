import type { Content } from '../../sim/content/types.ts';
import type { Fields } from '../../sim/content/read.ts';
import { isFields } from '../../sim/content/read.ts';
import type { SaveData } from '../../sim/save.ts';
import type { ItemSlot } from '../../sim/content/types.ts';
import type { ItemInstance, RolledAffix } from '../../sim/world/types.ts';
import { readItemList, readSave } from '../../sim/save.ts';
import { epochOf, isEpoch } from './epoch.ts';
import { readFold } from './purse-read.ts';
import type { SaveFold } from './purse-read.ts';
import type { PlayStamp } from './play.ts';

export const PLAYED_ELSEWHERE: string = 'played_elsewhere';
export const STASH_CONFLICT: string = 'stash_conflict';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface GuestAccount {
  readonly accountId: string;
  readonly token: string;
}

export interface CloudCopy {
  readonly save: SaveData;
  readonly revision: number;
  readonly updatedAt: string;
  readonly epoch: number;
}

export interface NoCloudCopy {
  readonly save: null;
  readonly revision: number;
  readonly updatedAt: string | null;
  readonly epoch: number;
}

export type CloudState = CloudCopy | NoCloudCopy;

export interface CloudStash {
  readonly items: readonly (ItemInstance | null)[];
  readonly revision: number;
}

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
export type SessionResult = { readonly kind: 'ok'; readonly session: Session } | Failure;
export type SignOutResult = { readonly kind: 'ok' } | Failure;

export type GuestResult = { readonly kind: 'ok'; readonly account: GuestAccount } | Failure;
export type ReadResult = { readonly kind: 'ok'; readonly state: CloudState; readonly stash: CloudStash | null } | { readonly kind: 'unreadable' } | Failure;
export type WriteResult = { readonly kind: 'ok'; readonly copy: CloudCopy; readonly fold: SaveFold; readonly stashRevision: number | null } | { readonly kind: 'conflict'; readonly current: CloudState } | { readonly kind: 'stash_conflict'; readonly stash: CloudStash } | { readonly kind: 'stale'; readonly epoch: number } | { readonly kind: 'behind' } | { readonly kind: 'elsewhere' } | Failure;

export const PERF_PROTOCOL = {
  path: '/v1/perf',
  histogramEdgesMs: [6, 10, 14, 20, 25, 30, 36, 45, 55, 70, 100, 150, 250, 500, 1000],
  overMs: [33, 50, 100, 250],
  maxWindows: 6,
  hardwareChars: 120,
} as const;

export type PerfEnd = 'time' | 'zone' | 'hidden' | 'left' | 'page';
export type PerfDevice = 'desktop' | 'phone';
export type PerfTier = 'desktop' | 'mobile';

export interface PerfFactsBody {
  readonly quality: string;
  readonly lensWater: boolean;
  readonly dpr: number;
  readonly viewport: readonly [number, number];
  readonly touch: boolean;
  readonly cores: number | null;
  readonly memoryGb: number | null;
  readonly gpuVendor: string | null;
  readonly gpuRenderer: string | null;
}

export interface PerfWindowBody {
  readonly at: number;
  readonly end: PerfEnd;
  readonly zone: string;
  readonly ms: number;
  readonly frames: number;
  readonly histogram: readonly number[];
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly worst: number;
  readonly over: readonly number[];
  readonly stallMs: number;
  readonly monsters: number;
  readonly hidden: boolean;
  readonly draws: number;
  readonly triangles: number;
  readonly textures: number;
  readonly geometries: number;
  readonly canvas: readonly [number, number];
  readonly pixelRatio: number;
  readonly lost: number;
  readonly restored: number;
  readonly rearms: number;
  readonly offers: number;
}

export interface PerfReportBody {
  readonly play: string;
  readonly build: string;
  readonly device: PerfDevice;
  readonly tier: PerfTier;
  readonly facts?: PerfFactsBody;
  readonly windows: readonly PerfWindowBody[];
}

export const EVENTS_PROTOCOL = {
  path: '/v1/events',
  maxEvents: 60,
  maxFields: 8,
  textChars: 64,
} as const;

export const PLAYER_EVENT_KINDS = ['entered', 'pulse', 'panel', 'zone', 'level', 'died', 'boss', 'quest', 'skill', 'flask', 'waypoint', 'run', 'allocate', 'refund', 'respec', 'slot', 'equip', 'trade', 'travel', 'crashed', 'error'] as const;

export type PlayerEventKind = (typeof PLAYER_EVENT_KINDS)[number];

export type PlayerEventField = string | number | boolean;

export interface PlayerEventBody {
  readonly kind: PlayerEventKind;
  readonly at: number;
  readonly zone: string;
  readonly fields: Readonly<Record<string, PlayerEventField>>;
}

export interface EventBatchBody {
  readonly play: string;
  readonly build: string;
  readonly device: PerfDevice;
  readonly events: readonly PlayerEventBody[];
}

export const RANKINGS = ['level', 'damage', 'life', 'played', 'kills', 'deaths'] as const;

export type Ranking = (typeof RANKINGS)[number];

export interface BoardRow {
  readonly rank: number;
  readonly name: string;
  readonly level: number;
  readonly damage: number;
  readonly life: number;
  readonly playedMs: number;
  readonly kills: number;
  readonly deaths: number;
  readonly furthest: string;
  readonly online: boolean;
  readonly account: string | null;
}

export interface YourRow extends BoardRow {
  readonly chosen: boolean;
}

export interface LevelUpNote {
  readonly name: string;
  readonly level: number;
  readonly minutesAgo: number;
}

export interface OnlineCharacter {
  readonly name: string;
  readonly level: number;
  readonly furthest: string;
}

export interface PresentList {
  readonly characters: readonly OnlineCharacter[];
  readonly more: number;
  readonly visitors: number;
}

export interface Leaderboard {
  readonly by: Ranking;
  readonly top: readonly BoardRow[];
  readonly you: YourRow | null;
  readonly online: number;
  readonly present: PresentList | null;
  readonly characters: number;
  readonly levelUps: readonly LevelUpNote[];
}

export interface WornItem {
  readonly slot: ItemSlot;
  readonly base: string;
  readonly rarity: string;
  readonly level: number;
  readonly affixes: readonly RolledAffix[];
}

export interface ProfileStats {
  readonly playedMs: number;
  readonly kills: number;
  readonly bosses: number;
  readonly deaths: number;
  readonly bestLevel: number;
  readonly biggestHit: number;
  readonly goldLooted: number;
  readonly moments: number;
  readonly quests: number;
  readonly found: Readonly<Record<string, number>>;
}

export interface ProfileBuild {
  readonly bar: readonly (string | null)[];
  readonly places: number;
}

export interface CharacterProfile {
  readonly name: string;
  readonly hero: string | null;
  readonly level: number;
  readonly furthest: string;
  readonly online: boolean;
  readonly stats: ProfileStats;
  readonly worn: readonly WornItem[];
  readonly build: ProfileBuild | null;
}

export type ProfileLookup = { readonly kind: 'ok'; readonly profile: CharacterProfile } | { readonly kind: 'missing' } | { readonly kind: 'unsupported' } | { readonly kind: 'failed' };

export type NameRefusal = 'name_length' | 'name_characters' | 'name_blocked' | 'name_taken';

export type NameMood = 'night' | 'small-hours' | 'dawn' | 'day' | 'dusk';

export interface NameSuggestion {
  readonly name: string;
  readonly mood: NameMood | null;
}

export type ReportReason = 'abuse' | 'spam' | 'other';

export type ReportResult = 'reported' | 'gone' | 'own' | 'slow' | 'unsupported' | 'failed';

export type FriendState = 'requested' | 'friends' | 'none';

export type FriendRefusal = 'name_needed' | 'own_name' | 'no_such_character' | 'friend_limit' | 'no_such_request';

export type FriendResult = { readonly kind: 'ok'; readonly state: FriendState } | { readonly kind: 'refused'; readonly reason: FriendRefusal } | { readonly kind: 'unsupported' } | { readonly kind: 'failed' };

export interface FriendEntry {
  readonly name: string;
  readonly here: boolean;
}

export interface FriendsList {
  readonly friends: readonly FriendEntry[];
  readonly incoming: readonly string[];
  readonly outgoing: readonly string[];
}

export type FriendsResult = { readonly kind: 'ok'; readonly list: FriendsList } | { readonly kind: 'unsupported' } | { readonly kind: 'failed' };

export type LeaderboardResult = { readonly kind: 'ok'; readonly board: Leaderboard } | Failure;
export type NameResult = { readonly kind: 'ok'; readonly name: string } | { readonly kind: 'invalid'; readonly reason: NameRefusal } | { readonly kind: 'limited' } | Failure;

export interface Api {
  createGuest(signal: AbortSignal): Promise<GuestResult>;
  readSave(token: string, signal: AbortSignal): Promise<ReadResult>;
  writeSave(token: string, save: SaveData, baseRevision: number, epoch: number, signal: AbortSignal, play?: PlayStamp | null, stashRevision?: number | null): Promise<WriteResult>;
  leavePlay(token: string, play: string): void;
  providers(signal: AbortSignal): Promise<ProvidersResult>;
  profile(token: string, signal: AbortSignal): Promise<ProfileResult>;
  googleSignIn(token: string, accessToken: string, signal: AbortSignal): Promise<SessionResult>;
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

export function retryAfterMs(header: string | null): number | null {
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
  const epoch: number | null = epochOf(value, 'epoch');
  const updatedAt: unknown = value['updatedAt'];
  if (revision === null || epoch === null) return null;
  if (value['save'] === null) {
    return updatedAt === null || typeof updatedAt === 'string' ? { save: null, revision, updatedAt, epoch } : null;
  }
  const save: SaveData | null = readSave(content, value['save']);
  if (save === null || typeof updatedAt !== 'string') return null;
  return { save, revision, updatedAt, epoch };
}

export function readCloudStash(content: Content, value: unknown): CloudStash | null {
  const stash: unknown = isFields(value) ? value['stash'] : null;
  if (!isFields(stash) || !Array.isArray(stash['items'])) return null;
  const revision: number | null = revisionOf(stash);
  return revision === null ? null : { items: readItemList(content, stash['items']), revision };
}

function stashRevisionOf(value: unknown): number | null {
  const revision: unknown = isFields(value) ? value['stashRevision'] : null;
  return typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export function cloudSaveUnreadable(content: Content, value: unknown): boolean {
  return isFields(value) && value['save'] !== null && value['save'] !== undefined && readSave(content, value['save']) === null;
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
      if (state !== null) return { kind: 'ok', state, stash: readCloudStash(content, answer.body) };
      return cloudSaveUnreadable(content, answer.body) ? { kind: 'unreadable' } : { kind: 'refused', status: answer.status };
    },
    async writeSave(token: string, save: SaveData, baseRevision: number, epoch: number, signal: AbortSignal, play: PlayStamp | null = null, stashRevision: number | null = null): Promise<WriteResult> {
      const shared: { readonly stashRevision?: number } = stashRevision === null ? {} : { stashRevision };
      const body: string = JSON.stringify(play === null ? { save, baseRevision, epoch, ...shared } : { save, baseRevision, epoch, play: play.id, claim: play.claim, ...shared });
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/save`, { method: 'PUT', headers: headers(token), body, signal, keepalive: body.length < KEEPALIVE_LIMIT_CHARS });
      if (answer !== null && answer.status === 409 && errorCodeOf(answer.body) === 'stale_epoch') {
        const current: unknown = isFields(answer.body) ? answer.body['epoch'] : null;
        return isEpoch(current) && current > epoch ? { kind: 'stale', epoch: current } : { kind: 'refused', status: 409 };
      }
      if (answer !== null && answer.status === 409 && errorCodeOf(answer.body) === 'server_behind') return { kind: 'behind' };
      if (answer !== null && answer.status === 409 && errorCodeOf(answer.body) === PLAYED_ELSEWHERE) return { kind: 'elsewhere' };
      if (answer !== null && answer.status === 409 && errorCodeOf(answer.body) === STASH_CONFLICT) {
        const stash: CloudStash | null = readCloudStash(content, answer.body);
        return stash === null ? { kind: 'refused', status: 409 } : { kind: 'stash_conflict', stash };
      }
      if (answer !== null && answer.status === 409) {
        const current: CloudState | null = isFields(answer.body) ? readCloudState(content, answer.body['current']) : null;
        return current === null ? { kind: 'refused', status: 409 } : { kind: 'conflict', current };
      }
      if (!succeeded(answer)) return failureOf(answer);
      const state: CloudState | null = readCloudState(content, answer.body);
      return state === null || state.save === null ? { kind: 'refused', status: answer.status } : { kind: 'ok', copy: state, fold: readFold(content, answer.body), stashRevision: stashRevisionOf(answer.body) };
    },
    leavePlay(token: string, play: string): void {
      void exchange(fetchFn, `${baseUrl}/v1/play/leave`, { method: 'POST', headers: headers(token), body: JSON.stringify({ play }), keepalive: true });
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
    async googleSignIn(token: string, accessToken: string, signal: AbortSignal): Promise<SessionResult> {
      const answer: Answer | null = await exchange(fetchFn, `${baseUrl}/v1/auth/google`, { method: 'POST', headers: headers(token), body: JSON.stringify({ accessToken }), signal });
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
