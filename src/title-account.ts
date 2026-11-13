import type { SignInMethod } from './backend/api.ts';
import type { Timers } from './backend/backend.ts';

export type AccountView =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'guest'; readonly google: boolean; readonly email: boolean }
  | { readonly kind: 'signed-in'; readonly method: SignInMethod; readonly name: string | null };

export interface AccountPart {
  textContent: string | null;
  toggleAttribute(name: string, force: boolean): boolean;
}

export interface AccountRoot {
  readonly dataset: Record<string, string | undefined>;
  readonly classList: { add(...names: string[]): void; remove(...names: string[]): void };
}

export interface TitleAccountParts {
  readonly root: AccountRoot;
  readonly button: AccountPart;
  readonly email: AccountPart;
  readonly line: AccountPart;
  readonly method: AccountPart;
  readonly name: AccountPart;
  readonly note: AccountPart;
}

export type SigningIn = 'idle' | 'asking' | 'exchanging';

export interface TitleAccount {
  show(view: AccountView, note: string): void;
  signingIn(state: SigningIn): void;
}

export const TITLE_ACCOUNT: { readonly swapMs: number; readonly busyAttribute: string; readonly fallbackName: string; readonly methods: Readonly<Record<SignInMethod, string>> } = {
  swapMs: 280,
  busyAttribute: 'data-busy',
  fallbackName: 'Signed in',
  methods: { google: 'Google', email: 'Email' },
};

export function offersSignIn(view: AccountView): boolean {
  return view.kind === 'guest' && (view.google || view.email);
}

function sameView(left: AccountView | null, right: AccountView): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

export function createTitleAccount(parts: TitleAccountParts, timers: Timers): TitleAccount {
  let shown: AccountView | null = null;
  let shownNote: string = '';
  let cancelSwap: (() => void) | null = null;

  const apply = (view: AccountView, note: string): void => {
    cancelSwap = null;
    parts.button.toggleAttribute('hidden', view.kind !== 'guest' || !view.google);
    parts.email.toggleAttribute('hidden', view.kind !== 'guest' || !view.email);
    parts.line.toggleAttribute('hidden', view.kind !== 'signed-in');
    parts.method.textContent = view.kind === 'signed-in' ? TITLE_ACCOUNT.methods[view.method] : '';
    parts.name.textContent = view.kind === 'signed-in' ? (view.name ?? TITLE_ACCOUNT.fallbackName) : '';
    parts.note.textContent = note;
    parts.note.toggleAttribute('hidden', note === '');
    parts.root.dataset['state'] = view.kind;
    if (view.kind !== 'hidden' || note !== '') parts.root.classList.add('shown');
  };

  return {
    signingIn(state: SigningIn): void {
      parts.button.toggleAttribute(TITLE_ACCOUNT.busyAttribute, state !== 'idle');
      parts.button.toggleAttribute('aria-busy', state !== 'idle');
      parts.button.toggleAttribute('disabled', state === 'exchanging');
    },
    show(view: AccountView, note: string): void {
      if (sameView(shown, view) && note === shownNote) return;
      const first: boolean = shown === null;
      shown = view;
      shownNote = note;
      cancelSwap?.();
      cancelSwap = null;
      if (first) {
        apply(view, note);
        return;
      }
      parts.root.classList.remove('shown');
      cancelSwap = timers.after(TITLE_ACCOUNT.swapMs, (): void => {
        apply(view, note);
      });
    },
  };
}
