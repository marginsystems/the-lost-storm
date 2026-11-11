import type { Api, NonceResult, ProfileResult, ProvidersResult, Session, SessionResult } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { parseSyncRecord, serializeSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export type AccountState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'guest'; readonly clientId: string; readonly nonce: string }
  | { readonly kind: 'signed-in'; readonly name: string | null };

export type SignInResult = { readonly kind: 'reload' } | { readonly kind: 'failed'; readonly state: AccountState };

export type SignOutResult = 'reload' | 'unsynced';

export interface AccountService {
  load(): Promise<AccountState>;
  signIn(credential: string): Promise<SignInResult>;
  signOut(): Promise<SignOutResult>;
}

export interface AccountOptions {
  readonly serverUrl: string;
  readonly api: Api;
  readonly store: KeyValueStore;
}

export const ACCOUNT_TIMING: { readonly requestMs: number } = { requestMs: 8000 };

const HIDDEN: AccountState = { kind: 'hidden' };

function timeout(): AbortSignal {
  return AbortSignal.timeout(ACCOUNT_TIMING.requestMs);
}

export function recordAfterSignIn(held: SyncRecord, session: Session): SyncRecord {
  if (session.accountId === held.accountId) return { ...held, token: session.token };
  return { serverUrl: held.serverUrl, accountId: session.accountId, token: session.token, revision: 0, updatedAt: null, savedAt: held.pending ? held.savedAt : null, pending: held.pending, overwriteCloud: false };
}

export function createAccountService(options: AccountOptions): AccountService {
  const { serverUrl, api, store } = options;
  const held = (): SyncRecord | null => parseSyncRecord(store.read(SYNC_KEY), serverUrl);

  const load = async (): Promise<AccountState> => {
    const record: SyncRecord | null = held();
    if (record === null) return HIDDEN;
    const offered: ProvidersResult = await api.providers(timeout());
    if (offered.kind !== 'ok' || offered.providers.googleClientId === null) return HIDDEN;
    const who: ProfileResult = await api.profile(record.token, timeout());
    if (who.kind !== 'ok') return HIDDEN;
    if (who.profile.kind === 'google') return { kind: 'signed-in', name: who.profile.name };
    const issued: NonceResult = await api.googleNonce(record.token, timeout());
    if (issued.kind !== 'ok') return HIDDEN;
    return { kind: 'guest', clientId: offered.providers.googleClientId, nonce: issued.nonce };
  };

  return {
    load,
    async signIn(credential: string): Promise<SignInResult> {
      const asked: SyncRecord | null = held();
      if (asked === null) return { kind: 'failed', state: HIDDEN };
      const result: SessionResult = await api.googleSignIn(asked.token, credential, timeout());
      const current: SyncRecord | null = held();
      if (result.kind === 'ok' && current?.token === asked.token && store.write(SYNC_KEY, serializeSyncRecord(recordAfterSignIn(current, result.session)))) return { kind: 'reload' };
      return { kind: 'failed', state: await load() };
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
