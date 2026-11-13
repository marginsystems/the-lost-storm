import type { AccountService, EmailOffer, EmailStartResult, EmailVerifyResult } from './backend/account.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { createAccountFlow } from './account-flow.ts';
import type { AccountFlow } from './account-flow.ts';
import { loadGoogleIdentity, showGoogleMark } from './google-identity.ts';
import { createTitleEmail, digitInputs } from './title-email.ts';
import type { TitleEmail } from './title-email.ts';
import { createTurnstileGate, loadTurnstile } from './turnstile.ts';
import type { TurnstileApi, TurnstileGate } from './turnstile.ts';
import type { GoogleIdentity } from './google-identity.ts';
import { createTitleAccount, offersSignIn } from './title-account.ts';
import type { AccountView, TitleAccount } from './title-account.ts';
import { element } from './dom-element.ts';

function startTitleEmail(flow: AccountFlow): TitleEmail {
  const timers = createBrowserTimers();
  return createTitleEmail({
    parts: {
      account: element('title-account', HTMLDivElement),
      open: element('title-email-open', HTMLButtonElement),
      form: element('title-email', HTMLFormElement),
      input: element('title-email-input', HTMLInputElement),
      send: element('title-email-send', HTMLButtonElement),
      digits: digitInputs(element('title-email-digits', HTMLSpanElement)),
      resend: element('title-email-resend', HTMLButtonElement),
      back: element('title-email-back', HTMLButtonElement),
      note: element('title-email-note', HTMLParagraphElement),
      check: element('title-turnstile', HTMLDivElement),
      mount: element('title-turnstile-mount', HTMLDivElement),
    },
    timers,
    clock: (): number => Date.now(),
    send: (address: string, turnstileToken: string): Promise<EmailStartResult> => flow.sendEmailCode(address, turnstileToken),
    verify: (address: string, code: string): Promise<EmailVerifyResult> => flow.verifyEmailCode(address, code),
    gate: async (siteKey: string, mount: HTMLElement, onInteractive: (interactive: boolean) => void): Promise<TurnstileGate | null> => {
      const api: TurnstileApi | null = await loadTurnstile();
      return api === null ? null : createTurnstileGate({ api, mount, siteKey, timers, onInteractive });
    },
  });
}

export interface TitleSignIn {
  offered(): boolean;
  ask(note: string): void;
}

export interface TitleSignInOptions {
  readonly setBusy: (busy: boolean) => void;
  readonly beforeSignIn: () => void;
}

export function startTitleAccount(account: AccountService, options: TitleSignInOptions): TitleSignIn {
  const mount: HTMLDivElement = element('title-google', HTMLDivElement);
  const seen: { current: AccountView } = { current: { kind: 'hidden' } };
  const control: TitleAccount = createTitleAccount(
    {
      root: element('title-account', HTMLDivElement),
      button: mount,
      email: element('title-email-open', HTMLButtonElement),
      line: element('title-account-line', HTMLParagraphElement),
      method: element('title-account-method', HTMLSpanElement),
      name: element('title-account-name', HTMLSpanElement),
      note: element('title-account-note', HTMLParagraphElement),
    },
    createBrowserTimers(),
  );
  const view: TitleAccount = {
    show(next: AccountView, note: string): void {
      seen.current = next;
      control.show(next, note);
    },
  };
  const email: { current: TitleEmail | null } = { current: null };
  const flow: AccountFlow = createAccountFlow({
    account,
    view,
    timers: createBrowserTimers(),
    offerEmail: (offer: EmailOffer | null): void => {
      email.current?.offer(offer);
    },
    setBusy: options.setBusy,
    beforeSignIn: options.beforeSignIn,
    reload: (): void => {
      window.location.reload();
    },
    showButton: async (clientId: string, nonce: string, onCredential: (credential: string) => void): Promise<boolean> => {
      const identity: GoogleIdentity | null = await loadGoogleIdentity();
      if (identity === null) return false;
      showGoogleMark(element('title-google-mark', HTMLImageElement));
      identity.start({ clientId, nonce, onCredential }, element('title-google-official', HTMLDivElement));
      return true;
    },
  });
  email.current = startTitleEmail(flow);
  element('title-signout', HTMLButtonElement).addEventListener('click', (): void => {
    void flow.signOut();
  });
  void flow.start();
  return {
    offered: (): boolean => offersSignIn(seen.current),
    ask(note: string): void {
      void flow.refresh(note);
    },
  };
}
