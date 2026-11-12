import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  afterStart,
  afterVerify,
  canCheck,
  canResend,
  checkingEntry,
  cleanAddress,
  closedEntry,
  completeCode,
  digitsOf,
  EMAIL_NOTES,
  invalidEntry,
  openEntry,
  placeDigits,
  sendingEntry,
  wrongNote,
} from './email-entry.ts';
import type { EmailEntry } from './email-entry.ts';

const NOW: number = 1_000_000;
const ADA: string = 'ada@example.com';

function codeEntry(): EmailEntry {
  return afterStart(sendingEntry(openEntry()), ADA, { kind: 'sent', resendAfterMs: 60_000 }, NOW);
}

void test('an address is trimmed and needs one at sign and a dotted domain', (): void => {
  assert.equal(cleanAddress('  ada@example.com '), ADA);
  for (const bad of ['', 'ada', 'ada@example', 'a b@example.com', '@example.com', `${'a'.repeat(250)}@x.com`]) assert.equal(cleanAddress(bad), null, bad);
});

void test('opening asks for an address with no note, and a bad one says so', (): void => {
  assert.deepEqual(openEntry(), { step: { kind: 'address', sending: false }, note: '', tone: 'info' });
  assert.deepEqual(invalidEntry(), { step: { kind: 'address', sending: false }, note: EMAIL_NOTES.invalid, tone: 'problem' });
  assert.equal(closedEntry().step.kind, 'closed');
});

void test('a sent code moves to the code boxes with the resend cooldown from the server', (): void => {
  const entry: EmailEntry = codeEntry();
  assert.deepEqual(entry, { step: { kind: 'code', email: ADA, resendAt: NOW + 60_000, checking: false, spent: false }, note: EMAIL_NOTES.sent, tone: 'info' });
  assert.ok(!canResend(entry, NOW + 59_999));
  assert.ok(canResend(entry, NOW + 60_000));
  assert.ok(canCheck(entry));
});

void test('a refused send stays where it was with a note that says why', (): void => {
  const asking: EmailEntry = sendingEntry(openEntry());
  assert.deepEqual(afterStart(asking, ADA, { kind: 'invalid-email' }, NOW), { step: { kind: 'address', sending: false }, note: EMAIL_NOTES.invalid, tone: 'problem' });
  assert.equal(afterStart(asking, ADA, { kind: 'bot-check' }, NOW).note, EMAIL_NOTES.botFailed);
  assert.equal(afterStart(asking, ADA, { kind: 'wait', afterMs: 30_000 }, NOW).note, EMAIL_NOTES.wait);
  assert.equal(afterStart(asking, ADA, { kind: 'unavailable' }, NOW).note, EMAIL_NOTES.unavailable);
  const resending: EmailEntry = sendingEntry(codeEntry());
  const refused: EmailEntry = afterStart(resending, ADA, { kind: 'wait', afterMs: null }, NOW);
  assert.equal(refused.step.kind, 'code');
  assert.equal(refused.note, EMAIL_NOTES.wait);
});

void test('a wrong code counts down, and the last wrong one or an expired code asks for a new one', (): void => {
  const checking: EmailEntry = checkingEntry(codeEntry());
  assert.ok(!canCheck(checking));
  const wrong: EmailEntry = afterVerify(checking, { kind: 'wrong', attemptsLeft: 2 });
  assert.equal(wrong.note, 'That code is not right. 2 tries left.');
  assert.ok(canCheck(wrong));
  assert.equal(wrongNote(1), 'That code is not right. 1 try left.');
  const last: EmailEntry = afterVerify(checking, { kind: 'wrong', attemptsLeft: 0 });
  assert.equal(last.note, EMAIL_NOTES.lastWrong);
  assert.ok(!canCheck(last));
  for (const [result, note] of [
    [{ kind: 'expired' }, EMAIL_NOTES.expired],
    [{ kind: 'locked' }, EMAIL_NOTES.locked],
  ] as const) {
    const after: EmailEntry = afterVerify(checking, result);
    assert.equal(after.note, note);
    assert.ok(!canCheck(after));
    assert.ok(canResend(after, NOW + 60_000));
  }
});

void test('a reload keeps the boxes locked and a failure closes the entry', (): void => {
  const checking: EmailEntry = checkingEntry(codeEntry());
  assert.ok(!canCheck(afterVerify(checking, { kind: 'reload' })));
  assert.equal(afterVerify(checking, { kind: 'failed', state: { kind: 'unreachable' } }).step.kind, 'closed');
});

void test('digits are pulled out of anything pasted, at most six', (): void => {
  assert.equal(digitsOf('Your code: 042-917'), '042917');
  assert.equal(digitsOf('1234567890'), '123456');
  assert.equal(digitsOf('abc'), '');
});

void test('typing fills one box and moves on, a paste of six fills them all, and clearing empties one', (): void => {
  const empty: readonly string[] = ['', '', '', '', '', ''];
  assert.deepEqual(placeDigits(empty, 0, '4'), { digits: ['4', '', '', '', '', ''], focus: 1 });
  assert.deepEqual(placeDigits(empty, 3, '042917'), { digits: ['0', '4', '2', '9', '1', '7'], focus: 5 });
  assert.deepEqual(placeDigits(empty, 4, '12'), { digits: ['', '', '', '', '1', '2'], focus: 5 });
  assert.deepEqual(placeDigits(['1', '2', '3', '', '', ''], 2, ''), { digits: ['1', '2', '', '', '', ''], focus: 2 });
  assert.deepEqual(placeDigits(empty, 0, 'x'), { digits: empty, focus: 0 });
});

void test('a code is complete only with six digits', (): void => {
  assert.equal(completeCode(['0', '4', '2', '9', '1', '7']), '042917');
  assert.equal(completeCode(['0', '4', '2', '9', '1', '']), null);
});
