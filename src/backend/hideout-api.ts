import { isFields } from '../../sim/content/read.ts';
import { errorCodeOf, exchange, headers } from './api.ts';
import type { Answer, FetchFn, FriendEntry, FriendRefusal, FriendResult, FriendsList, FriendsResult, FriendState, ReportReason, ReportResult } from './api.ts';

export interface HideoutApi {
  report(token: string, line: number, reason: ReportReason, signal: AbortSignal): Promise<ReportResult>;
  befriend(token: string, name: string, signal: AbortSignal): Promise<FriendResult>;
  friends(token: string, signal: AbortSignal): Promise<FriendsResult>;
  accept(token: string, name: string, signal: AbortSignal): Promise<FriendResult>;
  remove(token: string, name: string, signal: AbortSignal): Promise<FriendResult>;
}

export const FRIEND_LIMITS: { readonly nameChars: number; readonly rows: number } = { nameChars: 32, rows: 200 };

const MISSING_ROUTE: string = 'not_found';
const FRIEND_STATES: readonly FriendState[] = ['requested', 'friends', 'none'];
const FRIEND_REFUSALS: readonly FriendRefusal[] = ['name_needed', 'own_name', 'no_such_character', 'friend_limit', 'no_such_request'];

function missingRoute(answer: Answer | null): boolean {
  return answer !== null && answer.status === 404 && errorCodeOf(answer.body) === MISSING_ROUTE;
}

export function reportResultOf(answer: Answer | null): ReportResult {
  if (answer === null) return 'failed';
  if (answer.status === 201 || answer.status === 200) return 'reported';
  if (missingRoute(answer)) return 'unsupported';
  if (answer.status === 404) return 'gone';
  if (answer.status === 400 && errorCodeOf(answer.body) === 'own_line') return 'own';
  if (answer.status === 429) return 'slow';
  return 'failed';
}

export function friendResultOf(answer: Answer | null): FriendResult {
  if (answer === null) return { kind: 'failed' };
  if (missingRoute(answer)) return { kind: 'unsupported' };
  const code: string = errorCodeOf(answer.body);
  const refusal: FriendRefusal | undefined = FRIEND_REFUSALS.find((known: FriendRefusal): boolean => known === code);
  if (refusal !== undefined) return { kind: 'refused', reason: refusal };
  if (answer.status < 200 || answer.status >= 300 || !isFields(answer.body)) return { kind: 'failed' };
  const said: unknown = answer.body['state'];
  const state: FriendState | undefined = FRIEND_STATES.find((known: FriendState): boolean => known === said);
  return state === undefined ? { kind: 'failed' } : { kind: 'ok', state };
}

function friendName(value: unknown): string | null {
  if (!isFields(value)) return null;
  const name: unknown = value['name'];
  return typeof name === 'string' && name !== '' && name.length <= FRIEND_LIMITS.nameChars ? name : null;
}

function readFriend(value: unknown): FriendEntry | null {
  const name: string | null = friendName(value);
  const here: unknown = isFields(value) ? value['here'] : null;
  return name === null || typeof here !== 'boolean' ? null : { name, here };
}

function readRows<T>(value: unknown, read: (entry: unknown) => T | null): readonly T[] | null {
  if (!Array.isArray(value)) return null;
  const list: readonly unknown[] = value;
  return list.slice(0, FRIEND_LIMITS.rows).flatMap((entry: unknown): T[] => {
    const found: T | null = read(entry);
    return found === null ? [] : [found];
  });
}

export function readFriendsList(body: unknown): FriendsList | null {
  if (!isFields(body)) return null;
  const friends: readonly FriendEntry[] | null = readRows(body['friends'], readFriend);
  const incoming: readonly string[] | null = readRows(body['incoming'], friendName);
  const outgoing: readonly string[] | null = readRows(body['outgoing'], friendName);
  return friends === null || incoming === null || outgoing === null ? null : { friends, incoming, outgoing };
}

export function friendsResultOf(answer: Answer | null): FriendsResult {
  if (answer === null) return { kind: 'failed' };
  if (missingRoute(answer)) return { kind: 'unsupported' };
  if (answer.status < 200 || answer.status >= 300) return { kind: 'failed' };
  const list: FriendsList | null = readFriendsList(answer.body);
  return list === null ? { kind: 'failed' } : { kind: 'ok', list };
}

export function createHideoutApi(baseUrl: string, fetchFn: FetchFn): HideoutApi {
  return {
    async report(token: string, line: number, reason: ReportReason, signal: AbortSignal): Promise<ReportResult> {
      return reportResultOf(await exchange(fetchFn, `${baseUrl}/v1/reports`, { method: 'POST', headers: headers(token), body: JSON.stringify({ line, reason }), signal }));
    },
    async befriend(token: string, name: string, signal: AbortSignal): Promise<FriendResult> {
      return friendResultOf(await exchange(fetchFn, `${baseUrl}/v1/friends/request`, { method: 'POST', headers: headers(token), body: JSON.stringify({ name }), signal }));
    },
    async friends(token: string, signal: AbortSignal): Promise<FriendsResult> {
      return friendsResultOf(await exchange(fetchFn, `${baseUrl}/v1/friends`, { method: 'GET', headers: headers(token), signal }));
    },
    async accept(token: string, name: string, signal: AbortSignal): Promise<FriendResult> {
      return friendResultOf(await exchange(fetchFn, `${baseUrl}/v1/friends/accept`, { method: 'POST', headers: headers(token), body: JSON.stringify({ name }), signal }));
    },
    async remove(token: string, name: string, signal: AbortSignal): Promise<FriendResult> {
      return friendResultOf(await exchange(fetchFn, `${baseUrl}/v1/friends/remove`, { method: 'POST', headers: headers(token), body: JSON.stringify({ name }), signal }));
    },
  };
}
