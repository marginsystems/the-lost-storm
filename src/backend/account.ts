import type { Api, EmailStartAnswer, EmailVerifyAnswer, ProfileResult, Providers, ProvidersResult, Session, SessionResult, SignInMethod } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { parseSyncRecord, serializeSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export interface GoogleOffer {
  readonly clientId: string;
}

export interface EmailOffer {
  readonly siteKey: string;
}

export type AccountState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'guest'; readonly google: GoogleOffer | null; readonly email: EmailOffer | null }
  | { readonly kind: 'signed-in'; readonly method: SignInMethod; readonly name: string | null };

export type SignInResult = { readonly kind: 'reload' } | { readonly kind: 'failed'; readonly state: AccountState };

export type EmailStartResult =
  | { readonly kind: 'sent'; readonly resendAfterMs: number }
  | { readonly kind: 'invalid-email' }
  | { readonly kind: 'bot-check' }
  | { readonly kind: 'wait'; readonly afterMs: number | null }
  | { readonly kind: 'unavailable' };

export type EmailVerifyResult =
  | SignInResult
  | { readonly kind: 'wrong'; readonly attemptsLeft: number }
  | { readonly kind: 'expired' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'wait'; readonly afterMs: number | null };

export type SignOutResult = 'reload' | 'unsynced';

export interface AccountService {
  load(): Promise<AccountState>;
  signIn(accessToken: string): Promise<SignInResult>;
  startEmail(email: string, turnstileToken: string): Promise<EmailStartResult>;
  verifyEmail(email: string, code: string): Promise<EmailVerifyResult>;
  signOut(): Promise<SignOutResult>;
}

export interface AccountOptions {
  readonly serverUrl: string;
  readonly api: Api;
  readonly store: KeyValueStore;
}

export const ACCOUNT_TIMING: { readonly requestMs: number; readonly signInMs: number } = { requestMs: 8000, signInMs: 30_000 };

const HIDDEN: AccountState = { kind: 'hidden' };
const UNREACHABLE: AccountState = { kind: 'unreachable' };

function timeout(): AbortSignal {
  return AbortSignal.timeout(ACCOUNT_TIMING.requestMs);
}

export function recordAfterSignIn(held: SyncRecord, session: Session): SyncRecord {
  if (session.accountId === held.accountId) return { ...held, token: session.token };
  return { serverUrl: held.serverUrl, accountId: session.accountId, token: session.token, revision: 0, updatedAt: null, savedAt: held.pending ? held.savedAt : null, pending: held.pending, overwriteCloud: false };
}

export function emailStartResult(answer: EmailStartAnswer): EmailStartResult {
  if (answer.kind === 'sent') return { kind: 'sent', resendAfterMs: answer.resendAfterMs };
  if (answer.kind === 'unreachable') return { kind: 'unavailable' };
  if (answer.code === 'invalid_email') return { kind: 'invalid-email' };
  if (answer.code === 'bot_check_failed') return { kind: 'bot-check' };
  if (answer.status === 429) return { kind: 'wait', afterMs: answer.retryAfterMs };
  return { kind: 'unavailable' };
}

function hasOffer(providers: Providers): boolean {
  return providers.googleClientId !== null || providers.emailSiteKey !== null;
}

export function createAccountService(options: AccountOptions): AccountService {
  const { serverUrl, api, store } = options;
  const held = (): SyncRecord | null => parseSyncRecord(store.read(SYNC_KEY), serverUrl);

  const load = async (): Promise<AccountState> => {
    const record: SyncRecord | null = held();
    if (record === null) return UNREACHABLE;
    const offered: ProvidersResult = await api.providers(timeout());
    if (offered.kind !== 'ok') return UNREACHABLE;
    if (!hasOffer(offered.providers)) return HIDDEN;
    const who: ProfileResult = await api.profile(record.token, timeout());
    if (who.kind !== 'ok') return UNREACHABLE;
    if (who.profile.kind !== 'guest') return { kind: 'signed-in', method: who.profile.kind, name: who.profile.name };
    const email: EmailOffer | null = offered.providers.emailSiteKey === null ? null : { siteKey: offered.providers.emailSiteKey };
    const clientId: string | null = offered.providers.googleClientId;
    return { kind: 'guest', google: clientId === null ? null : { clientId }, email };
  };

  const adopt = async (asked: SyncRecord, session: Session | null): Promise<SignInResult> => {
    const current: SyncRecord | null = held();
    if (session !== null && current?.token === asked.token && store.write(SYNC_KEY, serializeSyncRecord(recordAfterSignIn(current, session)))) return { kind: 'reload' };
    const state: AccountState = await load();
    return state.kind === 'signed-in' ? { kind: 'reload' } : { kind: 'failed', state };
  };

  return {
    load,
    async signIn(accessToken: string): Promise<SignInResult> {
      const asked: SyncRecord | null = held();
      if (asked === null) return { kind: 'failed', state: UNREACHABLE };
      const result: SessionResult = await api.googleSignIn(asked.token, accessToken, AbortSignal.timeout(ACCOUNT_TIMING.signInMs));
      return adopt(asked, result.kind === 'ok' ? result.session : null);
    },
    async startEmail(email: string, turnstileToken: string): Promise<EmailStartResult> {
      const asked: SyncRecord | null = held();
      if (asked === null) return { kind: 'unavailable' };
      return emailStartResult(await api.emailStart(asked.token, email, turnstileToken, AbortSignal.timeout(ACCOUNT_TIMING.signInMs)));
    },
    async verifyEmail(email: string, code: string): Promise<EmailVerifyResult> {
      const asked: SyncRecord | null = held();
      if (asked === null) return { kind: 'failed', state: UNREACHABLE };
      const answer: EmailVerifyAnswer = await api.emailVerify(asked.token, email, code, AbortSignal.timeout(ACCOUNT_TIMING.signInMs));
      if (answer.kind === 'ok') return adopt(asked, answer.session);
      if (answer.kind === 'wrong') return { kind: 'wrong', attemptsLeft: answer.attemptsLeft };
      if (answer.kind === 'refused' && answer.code === 'code_expired') return { kind: 'expired' };
      if (answer.kind === 'refused' && answer.code === 'too_many_attempts') return { kind: 'locked' };
      if (answer.kind === 'refused' && answer.status === 429) return { kind: 'wait', afterMs: answer.retryAfterMs };
      return adopt(asked, null);
    },
    async signOut(): Promise<SignOutResult> {
      const asked: SyncRecord | null = held();
      if (asked === null) return 'reload';
      if (asked.pending || asked.overwriteCloud) return 'unsynced';
      await api.signOut(asked.token, timeout());
      const current: SyncRecord | null = held();
      const arrived: boolean = current !== null && (current.pending || current.overwriteCloud);
      store.remove(SYNC_KEY);
      if (!arrived) store.remove(SAVE_KEY);
      return 'reload';
    },
  };
}
