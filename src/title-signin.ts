import type { AccountService, EmailOffer, EmailStartResult, EmailVerifyResult } from './backend/account.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { createAccountFlow } from './account-flow.ts';
import type { AccountFlow } from './account-flow.ts';
import { loadGoogleIdentity } from './google-identity.ts';
import { createTitleEmail, digitInputs } from './title-email.ts';
import type { TitleEmail } from './title-email.ts';
import { createTurnstileGate, loadTurnstile } from './turnstile.ts';
import type { TurnstileApi, TurnstileGate } from './turnstile.ts';
import type { GoogleIdentity } from './google-identity.ts';
import { createTitleAccount } from './title-account.ts';
import type { TitleAccount } from './title-account.ts';
import { element } from './dom-element.ts';

export const GOOGLE_BUTTON = {
  drawnWithinMs: 1500,
} as const;

function drawn(mount: HTMLElement): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    let settled: boolean = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      watcher.disconnect();
      resolve();
    };
    const listen = (): boolean => {
      const frame: HTMLIFrameElement | null = mount.querySelector('iframe');
      if (frame === null) return false;
      frame.addEventListener('load', done, { once: true });
      return true;
    };
    const watcher: MutationObserver = new MutationObserver((): void => {
      if (listen()) watcher.disconnect();
    });
    if (!listen()) watcher.observe(mount, { childList: true, subtree: true });
    window.setTimeout(done, GOOGLE_BUTTON.drawnWithinMs);
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

export function startTitleAccount(account: AccountService, setBusy: (busy: boolean) => void): void {
  const mount: HTMLDivElement = element('title-google', HTMLDivElement);
  const view: TitleAccount = createTitleAccount(
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
  const email: { current: TitleEmail | null } = { current: null };
  const flow: AccountFlow = createAccountFlow({
    account,
    view,
    timers: createBrowserTimers(),
    offerEmail: (offer: EmailOffer | null): void => {
      email.current?.offer(offer);
    },
    setBusy,
    reload: (): void => {
      window.location.reload();
    },
    showButton: async (clientId: string, nonce: string, onCredential: (credential: string) => void): Promise<boolean> => {
      const identity: GoogleIdentity | null = await loadGoogleIdentity();
      if (identity === null) return false;
      const official: HTMLDivElement = element('title-google-official', HTMLDivElement);
      identity.start({ clientId, nonce, onCredential }, official);
      await drawn(official);
      return true;
    },
  });
  email.current = startTitleEmail(flow);
  element('title-signout', HTMLButtonElement).addEventListener('click', (): void => {
    void flow.signOut();
  });
  void flow.start();
}
