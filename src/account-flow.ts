import type { AccountService, AccountState, EmailOffer, EmailStartResult, EmailVerifyResult, SignInResult, SignOutResult } from './backend/account.ts';
import type { Timers } from './backend/backend.ts';
import type { AccountView, TitleAccount } from './title-account.ts';

export interface AccountFlowOptions {
  readonly account: AccountService;
  readonly view: TitleAccount;
  readonly timers: Timers;
  readonly showButton: (clientId: string, nonce: string, onCredential: (credential: string) => void) => Promise<boolean>;
  readonly offerEmail: (offer: EmailOffer | null) => void;
  readonly reload: () => void;
  readonly setBusy: (busy: boolean) => void;
}

export interface AccountFlow {
  start(): Promise<void>;
  signOut(): Promise<void>;
  sendEmailCode(email: string, turnstileToken: string): Promise<EmailStartResult>;
  verifyEmailCode(email: string, code: string): Promise<EmailVerifyResult>;
}

export const ACCOUNT_NOTES: { readonly none: string; readonly failed: string; readonly unsynced: string } = {
  none: '',
  failed: 'Sign-in did not work. Try again.',
  unsynced: 'Your latest progress has not reached the cloud yet. Try again in a moment.',
};

export const ACCOUNT_RETRY: { readonly delaysMs: readonly number[] } = { delaysMs: [1500, 3000, 6000, 12_000, 24_000, 48_000] };

function viewOf(state: AccountState, google: boolean): AccountView {
  if (state.kind === 'signed-in') return { kind: 'signed-in', method: state.method, name: state.name };
  if (state.kind === 'guest') return { kind: 'guest', google, email: state.email !== null };
  return { kind: 'hidden' };
}

export function createAccountFlow(options: AccountFlowOptions): AccountFlow {
  const { account, view, timers, showButton, offerEmail, reload, setBusy } = options;
  let current: AccountState = { kind: 'unreachable' };
  let busy: boolean = false;
  let turn: number = 0;
  let retries: number = 0;
  let cancelRetry: (() => void) | null = null;

  const hold = (next: boolean): void => {
    busy = next;
    setBusy(next);
  };

  const retryLater = (note: string): void => {
    const delay: number | undefined = ACCOUNT_RETRY.delaysMs[retries];
    if (delay === undefined) return;
    retries += 1;
    cancelRetry = timers.after(delay, (): void => {
      cancelRetry = null;
      void refresh(note);
    });
  };

  const present = async (state: AccountState, note: string): Promise<void> => {
    turn += 1;
    const mine: number = turn;
    cancelRetry?.();
    cancelRetry = null;
    current = state;
    let google: boolean = false;
    if (state.kind === 'guest') {
      google = state.google !== null && (await showButton(state.google.clientId, state.google.nonce, onCredential));
      if (mine !== turn) return;
      if (!google && state.email === null) current = { kind: 'unreachable' };
    }
    offerEmail(current.kind === 'guest' ? current.email : null);
    view.show(viewOf(current, google), note);
    if (current.kind === 'unreachable') retryLater(note);
    else retries = 0;
  };

  const refresh = async (note: string): Promise<void> => {
    if (busy) return;
    const mine: number = turn;
    const state: AccountState = await account.load();
    if (mine !== turn) return;
    await present(state, note);
  };

  const exchange = async (credential: string): Promise<void> => {
    if (busy) return;
    hold(true);
    const result: SignInResult = await account.signIn(credential);
    if (result.kind === 'reload') {
      reload();
      return;
    }
    hold(false);
    retries = 0;
    await present(result.state, ACCOUNT_NOTES.failed);
  };

  function onCredential(credential: string): void {
    void exchange(credential);
  }

  const verifyEmailCode = async (email: string, code: string): Promise<EmailVerifyResult> => {
    if (busy) return { kind: 'wait', afterMs: null };
    hold(true);
    const result: EmailVerifyResult = await account.verifyEmail(email, code);
    if (result.kind === 'reload') {
      reload();
      return result;
    }
    hold(false);
    if (result.kind === 'failed') {
      retries = 0;
      await present(result.state, ACCOUNT_NOTES.failed);
    }
    return result;
  };

  return {
    async start(): Promise<void> {
      await present(await account.load(), ACCOUNT_NOTES.none);
    },
    sendEmailCode: (email: string, turnstileToken: string): Promise<EmailStartResult> => account.startEmail(email, turnstileToken),
    verifyEmailCode,
    async signOut(): Promise<void> {
      if (busy || current.kind !== 'signed-in') return;
      hold(true);
      const result: SignOutResult = await account.signOut();
      if (result === 'reload') {
        reload();
        return;
      }
      hold(false);
      view.show(viewOf(current, false), ACCOUNT_NOTES.unsynced);
    },
  };
}
