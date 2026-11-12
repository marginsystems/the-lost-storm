import type { EmailStartResult, EmailVerifyResult } from './backend/account.ts';

export type EmailStep =
  | { readonly kind: 'closed' }
  | { readonly kind: 'address'; readonly sending: boolean }
  | { readonly kind: 'code'; readonly email: string; readonly resendAt: number; readonly checking: boolean; readonly spent: boolean };

export interface EmailEntry {
  readonly step: EmailStep;
  readonly note: string;
  readonly tone: 'info' | 'problem';
}

export const EMAIL_ENTRY: { readonly digits: number; readonly maxLength: number } = { digits: 6, maxLength: 254 };

export const EMAIL_NOTES: {
  readonly none: string;
  readonly invalid: string;
  readonly checking: string;
  readonly botFailed: string;
  readonly sent: string;
  readonly wait: string;
  readonly unavailable: string;
  readonly expired: string;
  readonly locked: string;
  readonly lastWrong: string;
} = {
  none: '',
  invalid: 'That does not look like an email address.',
  checking: 'Checking you are not a bot…',
  botFailed: 'The bot check did not pass. Try again.',
  sent: 'Check your email for a 6-digit code.',
  wait: 'Too many codes asked for. Wait a little and try again.',
  unavailable: 'Email sign-in is not available right now. Try again later.',
  expired: 'That code has expired. Ask for a new one.',
  locked: 'Too many wrong codes. Ask for a new one.',
  lastWrong: 'That code is not right. Ask for a new one.',
};

const ADDRESS: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DIGIT: RegExp = /\d/g;
const CLOSED: EmailEntry = { step: { kind: 'closed' }, note: EMAIL_NOTES.none, tone: 'info' };

function info(step: EmailStep, note: string): EmailEntry {
  return { step, note, tone: 'info' };
}

function problem(step: EmailStep, note: string): EmailEntry {
  return { step, note, tone: 'problem' };
}

export function wrongNote(attemptsLeft: number): string {
  if (attemptsLeft <= 0) return EMAIL_NOTES.lastWrong;
  return `That code is not right. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`;
}

export function closedEntry(): EmailEntry {
  return CLOSED;
}

export function openEntry(): EmailEntry {
  return info({ kind: 'address', sending: false }, EMAIL_NOTES.none);
}

export function cleanAddress(raw: string): string | null {
  const email: string = raw.trim();
  return email.length <= EMAIL_ENTRY.maxLength && ADDRESS.test(email) ? email : null;
}

export function sendingEntry(entry: EmailEntry): EmailEntry {
  if (entry.step.kind === 'code') return info({ ...entry.step, checking: true }, EMAIL_NOTES.none);
  return info({ kind: 'address', sending: true }, EMAIL_NOTES.none);
}

export function invalidEntry(): EmailEntry {
  return problem({ kind: 'address', sending: false }, EMAIL_NOTES.invalid);
}

function backToAsking(entry: EmailEntry, note: string): EmailEntry {
  if (entry.step.kind === 'code') return problem({ ...entry.step, checking: false }, note);
  return problem({ kind: 'address', sending: false }, note);
}

export function afterStart(entry: EmailEntry, email: string, result: EmailStartResult, now: number): EmailEntry {
  if (result.kind === 'sent') return info({ kind: 'code', email, resendAt: now + result.resendAfterMs, checking: false, spent: false }, EMAIL_NOTES.sent);
  if (result.kind === 'invalid-email') return problem({ kind: 'address', sending: false }, EMAIL_NOTES.invalid);
  if (result.kind === 'bot-check') return backToAsking(entry, EMAIL_NOTES.botFailed);
  if (result.kind === 'wait') return backToAsking(entry, EMAIL_NOTES.wait);
  return backToAsking(entry, EMAIL_NOTES.unavailable);
}

export function checkingEntry(entry: EmailEntry): EmailEntry {
  return entry.step.kind === 'code' ? info({ ...entry.step, checking: true }, EMAIL_NOTES.none) : entry;
}

export function afterVerify(entry: EmailEntry, result: EmailVerifyResult): EmailEntry {
  if (entry.step.kind !== 'code') return entry;
  const step: EmailStep = { ...entry.step, checking: false };
  if (result.kind === 'reload') return info({ ...entry.step, checking: true }, EMAIL_NOTES.none);
  if (result.kind === 'failed') return CLOSED;
  if (result.kind === 'wrong') return problem({ ...step, spent: result.attemptsLeft <= 0 }, wrongNote(result.attemptsLeft));
  if (result.kind === 'expired') return problem({ ...step, spent: true }, EMAIL_NOTES.expired);
  if (result.kind === 'locked') return problem({ ...step, spent: true }, EMAIL_NOTES.locked);
  return problem(step, EMAIL_NOTES.wait);
}

export function canResend(entry: EmailEntry, now: number): boolean {
  return entry.step.kind === 'code' && !entry.step.checking && now >= entry.step.resendAt;
}

export function canCheck(entry: EmailEntry): boolean {
  return entry.step.kind === 'code' && !entry.step.checking && !entry.step.spent;
}

export function digitsOf(text: string): string {
  return (text.match(DIGIT) ?? []).join('').slice(0, EMAIL_ENTRY.digits);
}

export interface Placed {
  readonly digits: readonly string[];
  readonly focus: number;
}

export function placeDigits(current: readonly string[], at: number, typed: string): Placed {
  const incoming: string = digitsOf(typed);
  const digits: string[] = Array.from({ length: EMAIL_ENTRY.digits }, (_unused: unknown, index: number): string => current[index] ?? '');
  const start: number = Math.max(0, Math.min(at, EMAIL_ENTRY.digits - 1));
  if (incoming === '') {
    digits[start] = '';
    return { digits, focus: start };
  }
  const startAt: number = incoming.length === EMAIL_ENTRY.digits ? 0 : start;
  incoming.split('').forEach((digit: string, offset: number): void => {
    if (startAt + offset < EMAIL_ENTRY.digits) digits[startAt + offset] = digit;
  });
  return { digits, focus: Math.min(EMAIL_ENTRY.digits - 1, startAt + incoming.length) };
}

export function completeCode(digits: readonly string[]): string | null {
  const code: string = digits.join('');
  return code.length === EMAIL_ENTRY.digits && digitsOf(code) === code ? code : null;
}
