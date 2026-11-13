import { isFields } from '../../sim/content/read.ts';
import { errorCodeOf, exchange, headers } from './api.ts';
import type { Answer, FetchFn, FriendRefusal, FriendResult, FriendState, ReportReason, ReportResult } from './api.ts';

export interface HideoutApi {
  report(token: string, line: number, reason: ReportReason, signal: AbortSignal): Promise<ReportResult>;
  befriend(token: string, name: string, signal: AbortSignal): Promise<FriendResult>;
}

const MISSING_ROUTE: string = 'not_found';
const FRIEND_STATES: readonly FriendState[] = ['requested', 'friends', 'none'];
const FRIEND_REFUSALS: readonly FriendRefusal[] = ['name_needed', 'own_name', 'no_such_character', 'friend_limit'];

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

export function createHideoutApi(baseUrl: string, fetchFn: FetchFn): HideoutApi {
  return {
    async report(token: string, line: number, reason: ReportReason, signal: AbortSignal): Promise<ReportResult> {
      return reportResultOf(await exchange(fetchFn, `${baseUrl}/v1/reports`, { method: 'POST', headers: headers(token), body: JSON.stringify({ line, reason }), signal }));
    },
    async befriend(token: string, name: string, signal: AbortSignal): Promise<FriendResult> {
      return friendResultOf(await exchange(fetchFn, `${baseUrl}/v1/friends/request`, { method: 'POST', headers: headers(token), body: JSON.stringify({ name }), signal }));
    },
  };
}
