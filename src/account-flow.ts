import type { AccountService, AccountState, SignInResult, SignOutResult } from './backend/account.ts';
import type { AccountView, TitleAccount } from './title-account.ts';

export interface AccountFlowOptions {
  readonly account: AccountService;
  readonly view: TitleAccount;
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

function viewOf(state: AccountState): AccountView {
  if (state.kind === 'signed-in') return { kind: 'signed-in', name: state.name };
  return { kind: state.kind };
}

export function createAccountFlow(options: AccountFlowOptions): AccountFlow {
  const { account, view, showButton, reload, setBusy } = options;
  let current: AccountState = { kind: 'hidden' };
  let busy: boolean = false;

  const hold = (next: boolean): void => {
    busy = next;
    setBusy(next);
  };

  const present = async (state: AccountState, note: string): Promise<void> => {
    current = state;
    if (state.kind !== 'guest') {
      view.show(viewOf(state), note);
      return;
    }
    const rendered: boolean = await showButton(state.clientId, state.nonce, onCredential);
    if (!rendered) {
      current = { kind: 'hidden' };
      view.show({ kind: 'hidden' }, note);
      return;
    }
    view.show({ kind: 'guest' }, note);
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
    await present(result.state.kind === 'hidden' && current.kind === 'guest' ? current : result.state, ACCOUNT_NOTES.failed);
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
