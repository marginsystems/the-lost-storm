import type { EmailOffer, EmailStartResult, EmailVerifyResult } from './backend/account.ts';
import type { Clock, Timers } from './backend/backend.ts';
import { afterStart, afterVerify, canCheck, canResend, checkingEntry, cleanAddress, closedEntry, completeCode, EMAIL_ENTRY, EMAIL_NOTES, invalidEntry, openEntry, placeDigits, sendingEntry, typedText } from './email-entry.ts';
import type { EmailEntry, Placed } from './email-entry.ts';
import type { TurnstileGate } from './turnstile.ts';

export interface TitleEmailParts {
  readonly account: HTMLElement;
  readonly open: HTMLButtonElement;
  readonly form: HTMLFormElement;
  readonly input: HTMLInputElement;
  readonly send: HTMLButtonElement;
  readonly digits: readonly HTMLInputElement[];
  readonly resend: HTMLButtonElement;
  readonly back: HTMLButtonElement;
  readonly note: HTMLElement;
  readonly check: HTMLElement;
  readonly mount: HTMLElement;
}

export interface TitleEmailOptions {
  readonly parts: TitleEmailParts;
  readonly timers: Timers;
  readonly clock: Clock;
  readonly send: (email: string, turnstileToken: string) => Promise<EmailStartResult>;
  readonly verify: (email: string, code: string) => Promise<EmailVerifyResult>;
  readonly gate: (siteKey: string, mount: HTMLElement, onInteractive: (interactive: boolean) => void) => Promise<TurnstileGate | null>;
}

export interface TitleEmail {
  offer(offer: EmailOffer | null): void;
}

export const TITLE_EMAIL: { readonly noteSwapMs: number; readonly focusDelayMs: number } = { noteSwapMs: 140, focusDelayMs: 60 };

export function createTitleEmail(options: TitleEmailOptions): TitleEmail {
  const { parts, timers, clock } = options;
  let entry: EmailEntry = closedEntry();
  let siteKey: string | null = null;
  let gate: Promise<TurnstileGate | null> | null = null;
  let shownNote: string = '';
  let cancelNote: (() => void) | null = null;
  let cancelResend: (() => void) | null = null;

  const showNote = (note: string, problem: boolean): void => {
    if (note === shownNote) {
      parts.note.classList.toggle('problem', problem);
      return;
    }
    shownNote = note;
    cancelNote?.();
    parts.note.classList.add('swap');
    cancelNote = timers.after(TITLE_EMAIL.noteSwapMs, (): void => {
      cancelNote = null;
      parts.note.textContent = note;
      parts.note.classList.toggle('problem', problem);
      parts.note.classList.remove('swap');
    });
  };

  const values = (): readonly string[] => parts.digits.map((digit: HTMLInputElement): string => digit.value);

  const fill = (placed: Placed): void => {
    parts.digits.forEach((digit: HTMLInputElement, index: number): void => {
      digit.value = placed.digits[index] ?? '';
    });
  };

  const clearDigits = (): void => {
    fill({ digits: [], focus: 0 });
  };

  const focusLater = (target: HTMLInputElement): void => {
    timers.after(TITLE_EMAIL.focusDelayMs, (): void => {
      target.focus();
    });
  };

  const render = (): void => {
    const step = entry.step;
    parts.form.dataset['step'] = step.kind;
    parts.account.classList.toggle('emailing', step.kind !== 'closed');
    const sending: boolean = step.kind === 'address' && step.sending;
    const checking: boolean = step.kind === 'code' && step.checking;
    parts.form.toggleAttribute('aria-busy', sending || checking);
    parts.input.disabled = step.kind !== 'address' || sending;
    parts.send.disabled = step.kind !== 'address' || sending;
    for (const digit of parts.digits) digit.disabled = !canCheck(entry);
    parts.resend.disabled = !canResend(entry, clock());
    parts.back.disabled = sending || checking;
    showNote(entry.note, entry.tone === 'problem');
    cancelResend?.();
    cancelResend = null;
    if (step.kind === 'code' && clock() < step.resendAt) {
      cancelResend = timers.after(step.resendAt - clock(), (): void => {
        cancelResend = null;
        render();
      });
    }
  };

  const move = (next: EmailEntry): void => {
    entry = next;
    render();
  };

  const showCheck = (interactive: boolean): void => {
    parts.check.classList.toggle('shown', interactive);
  };

  const gateFor = (): Promise<TurnstileGate | null> => {
    if (siteKey === null) return Promise.resolve(null);
    gate ??= options.gate(siteKey, parts.mount, showCheck);
    return gate;
  };

  const request = async (email: string): Promise<void> => {
    const before: EmailEntry = entry;
    const sending: EmailEntry = sendingEntry(before);
    move(sending);
    const ready: TurnstileGate | null = await gateFor();
    if (entry !== sending) return;
    if (ready === null) {
      gate = null;
      move(afterStart(before, email, { kind: 'unavailable' }, clock()));
      return;
    }
    const waitNote: () => void = timers.after(TITLE_EMAIL.noteSwapMs * 4, (): void => {
      showNote(EMAIL_NOTES.checking, false);
    });
    const token: string | null = await ready.token();
    waitNote();
    if (entry !== sending) {
      if (token !== null) ready.spend();
      return;
    }
    if (token === null) {
      move(afterStart(before, email, { kind: 'bot-check' }, clock()));
      return;
    }
    const result: EmailStartResult = await options.send(email, token);
    ready.spend();
    if (entry !== sending) return;
    move(afterStart(sending, email, result, clock()));
    if (result.kind === 'sent') {
      clearDigits();
      const first: HTMLInputElement | undefined = parts.digits[0];
      if (first !== undefined) focusLater(first);
    }
  };

  const check = async (): Promise<void> => {
    const step = entry.step;
    const code: string | null = completeCode(values());
    if (step.kind !== 'code' || code === null || !canCheck(entry)) return;
    const checking: EmailEntry = checkingEntry(entry);
    move(checking);
    const result: EmailVerifyResult = await options.verify(step.email, code);
    if (entry !== checking) return;
    move(afterVerify(checking, result));
    if (result.kind === 'wrong' || result.kind === 'expired' || result.kind === 'locked') {
      clearDigits();
      const first: HTMLInputElement | undefined = parts.digits[0];
      if (first !== undefined && canCheck(entry)) focusLater(first);
    }
  };

  const place = (index: number, typed: string): void => {
    const placed: Placed = placeDigits(values(), index, typed);
    fill(placed);
    parts.digits[placed.focus]?.focus();
    if (completeCode(placed.digits) !== null) void check();
  };

  parts.open.addEventListener('click', (): void => {
    if (siteKey === null) return;
    move(openEntry());
    void gateFor();
    focusLater(parts.input);
  });

  parts.form.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    if (entry.step.kind !== 'address' || entry.step.sending) return;
    const email: string | null = cleanAddress(parts.input.value);
    if (email === null) {
      move(invalidEntry());
      return;
    }
    void request(email);
  });

  parts.resend.addEventListener('click', (): void => {
    const step = entry.step;
    if (step.kind !== 'code' || !canResend(entry, clock())) return;
    void request(step.email);
  });

  parts.back.addEventListener('click', (): void => {
    if (entry.step.kind === 'code') {
      move(openEntry());
      focusLater(parts.input);
      return;
    }
    move(closedEntry());
    parts.open.focus();
  });

  parts.digits.forEach((digit: HTMLInputElement, index: number): void => {
    digit.addEventListener('input', (event: Event): void => {
      place(index, event instanceof InputEvent ? typedText(digit.value, event.inputType, event.data) : digit.value);
    });
    digit.addEventListener('paste', (event: ClipboardEvent): void => {
      event.preventDefault();
      place(index, event.clipboardData?.getData('text') ?? '');
    });
    digit.addEventListener('keydown', (event: KeyboardEvent): void => {
      if (event.key !== 'Backspace' || digit.value !== '' || index === 0) return;
      event.preventDefault();
      const previous: HTMLInputElement | undefined = parts.digits[index - 1];
      if (previous === undefined) return;
      previous.value = '';
      previous.focus();
    });
  });

  render();

  return {
    offer(offer: EmailOffer | null): void {
      siteKey = offer?.siteKey ?? null;
      if (siteKey === null && entry.step.kind !== 'closed') move(closedEntry());
    },
  };
}

export function digitInputs(container: HTMLElement): readonly HTMLInputElement[] {
  const found: readonly HTMLInputElement[] = [...container.querySelectorAll('input')];
  if (found.length !== EMAIL_ENTRY.digits) throw new Error(`Expected ${EMAIL_ENTRY.digits} code boxes`);
  return found;
}
