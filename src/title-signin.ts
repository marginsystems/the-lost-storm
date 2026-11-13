import type { AccountService, EmailOffer, EmailStartResult, EmailVerifyResult } from './backend/account.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { createAccountFlow } from './account-flow.ts';
import type { AccountFlow, GoogleAnswer } from './account-flow.ts';
import { loadGoogleIdentity, showGoogleMark } from './google-identity.ts';
import { createTitleEmail, digitInputs } from './title-email.ts';
import type { TitleEmail } from './title-email.ts';
import { createTurnstileGate, loadTurnstile } from './turnstile.ts';
import type { TurnstileApi, TurnstileGate } from './turnstile.ts';
import type { GoogleAsk, GoogleIdentity } from './google-identity.ts';
import { createTitleAccount, offersSignIn } from './title-account.ts';
import type { AccountView, SigningIn, TitleAccount } from './title-account.ts';
import { element } from './dom-element.ts';

export const GOOGLE_BUTTON = {
  drawnWithinMs: 1500,
} as const;

function within(ms: number, work: Promise<void>): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    window.setTimeout(resolve, ms);
    void work.then(resolve);
  });
}

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
  const mount: HTMLButtonElement = element('title-google', HTMLButtonElement);
  const marked: Promise<void> = within(GOOGLE_BUTTON.drawnWithinMs, showGoogleMark(element('title-google-mark', HTMLImageElement)));
  const google: { ask: GoogleAsk | null } = { ask: null };
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
    signingIn(state: SigningIn): void {
      control.signingIn(state);
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
    showButton: async (clientId: string, answer: GoogleAnswer): Promise<boolean> => {
      const identity: GoogleIdentity | null = await loadGoogleIdentity();
      if (identity === null) return false;
      google.ask = identity.start({ clientId, onToken: answer.onToken, onEnd: answer.onEnd });
      await marked;
      return true;
    },
  });
  email.current = startTitleEmail(flow);
  mount.addEventListener('click', (): void => {
    if (google.ask !== null && flow.ask()) google.ask.ask();
  });
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
