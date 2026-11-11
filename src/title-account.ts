import type { Timers } from './backend/backend.ts';

export type AccountView =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'guest' }
  | { readonly kind: 'signed-in'; readonly name: string | null };

export interface AccountPart {
  textContent: string | null;
  toggleAttribute(name: string, force: boolean): boolean;
}

export interface AccountRoot {
  readonly dataset: Record<string, string | undefined>;
  readonly classList: { add(name: string): void; remove(name: string): void };
}

export interface TitleAccountParts {
  readonly root: AccountRoot;
  readonly button: AccountPart;
  readonly line: AccountPart;
  readonly name: AccountPart;
  readonly note: AccountPart;
}

export interface TitleAccount {
  show(view: AccountView, note: string): void;
}

export const TITLE_ACCOUNT: { readonly swapMs: number; readonly fallbackName: string } = { swapMs: 280, fallbackName: 'Signed in' };

function sameView(left: AccountView | null, right: AccountView): boolean {
  if (left === null || left.kind !== right.kind) return false;
  return left.kind !== 'signed-in' || right.kind !== 'signed-in' || left.name === right.name;
}

export function createTitleAccount(parts: TitleAccountParts, timers: Timers): TitleAccount {
  let shown: AccountView | null = null;
  let shownNote: string = '';
  let cancelSwap: (() => void) | null = null;

  const apply = (view: AccountView, note: string): void => {
    cancelSwap = null;
    parts.button.toggleAttribute('hidden', view.kind !== 'guest');
    parts.line.toggleAttribute('hidden', view.kind !== 'signed-in');
    parts.name.textContent = view.kind === 'signed-in' ? (view.name ?? TITLE_ACCOUNT.fallbackName) : '';
    parts.note.textContent = note;
    parts.note.toggleAttribute('hidden', note === '');
    parts.root.dataset['state'] = view.kind;
    if (view.kind !== 'hidden' || note !== '') parts.root.classList.add('shown');
  };

  return {
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
