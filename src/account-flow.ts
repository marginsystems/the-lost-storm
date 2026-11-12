import type { AccountService, AccountState, SignInResult, SignOutResult } from './backend/account.ts';
import type { Timers } from './backend/backend.ts';
import type { AccountView, TitleAccount } from './title-account.ts';

export interface AccountFlowOptions {
  readonly account: AccountService;
  readonly view: TitleAccount;
  readonly timers: Timers;
  readonly showButton: (clientId: string, nonce: string, onCredential: (credential: string) => void) => Promise<boolean>;
  readonly reload: () => void;
  readonly setBusy: (busy: boolean) => void;
}

export interface AccountFlow {
  start(): Promise<void>;
  signOut(): Promise<void>;
}

export const ACCOUNT_NOTES: { readonly none: string; readonly failed: string; readonly unsynced: string } = {
  none: '',
  failed: 'Sign-in did not work. Try again.',
  unsynced: 'Your latest progress has not reached the cloud yet. Try again in a moment.',
};

export const ACCOUNT_RETRY: { readonly delaysMs: readonly number[] } = { delaysMs: [1500, 3000, 6000, 12_000, 24_000, 48_000] };

function viewOf(state: AccountState): AccountView {
  if (state.kind === 'signed-in') return { kind: 'signed-in', name: state.name };
  if (state.kind === 'guest') return { kind: 'guest' };
  return { kind: 'hidden' };
}

export function createAccountFlow(options: AccountFlowOptions): AccountFlow {
  const { account, view, timers, showButton, reload, setBusy } = options;
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
    if (state.kind === 'guest') {
      const rendered: boolean = await showButton(state.clientId, state.nonce, onCredential);
      if (mine !== turn) return;
      if (rendered) {
        retries = 0;
        view.show({ kind: 'guest' }, note);
        return;
      }
      current = { kind: 'unreachable' };
    }
    view.show(viewOf(current), note);
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

  return {
    async start(): Promise<void> {
      await present(await account.load(), ACCOUNT_NOTES.none);
    },
    async signOut(): Promise<void> {
      if (busy || current.kind !== 'signed-in') return;
      hold(true);
      const result: SignOutResult = await account.signOut();
      if (result === 'reload') {
        reload();
        return;
      }
      hold(false);
      view.show(viewOf(current), ACCOUNT_NOTES.unsynced);
    },
  };
}
