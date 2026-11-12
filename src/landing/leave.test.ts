import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { LeaveClick } from './leave.ts';
import { fadesOut, LEAVE, leaveMs } from './leave.ts';

const PLAIN: LeaveClick = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

void test('a plain click fades the page out before it navigates', (): void => {
  assert.equal(fadesOut(PLAIN), true);
});

void test('a click that opens a new tab or was already handled is left to the browser', (): void => {
  const others: readonly LeaveClick[] = [{ ...PLAIN, button: 1 }, { ...PLAIN, metaKey: true }, { ...PLAIN, ctrlKey: true }, { ...PLAIN, shiftKey: true }, { ...PLAIN, altKey: true }, { ...PLAIN, defaultPrevented: true }];
  assert.deepEqual(
    others.map((click: LeaveClick): boolean => fadesOut(click)),
    others.map((): boolean => false),
  );
});

void test('the fade lasts as long as the spring token says, with a fallback for a missing token', (): void => {
  assert.equal(leaveMs('260ms'), 260);
  assert.equal(leaveMs(' 520ms'), 520);
  assert.equal(leaveMs(''), LEAVE.fallbackMs);
});

void test('a token the minifier rewrote in seconds still reads as milliseconds', (): void => {
  assert.equal(leaveMs('.26s'), 260);
  assert.equal(leaveMs(' 0.52s'), 520);
  assert.equal(leaveMs('260'), 260);
});

void test('both pages opt in to cross-document view transitions and share the leaving fade', (): void => {
  const shared: string = readFileSync(new URL('../page-transition.css', import.meta.url), 'utf8');
  assert.match(shared, /@view-transition\s*\{\s*navigation:\s*auto;/);
  assert.match(shared, new RegExp(`body\\.${LEAVE.leavingClass}\\s*\\{\\s*opacity:\\s*0;`));
  assert.match(readFileSync(new URL('./landing.css', import.meta.url), 'utf8'), /@import "\.\.\/page-transition\.css";/);
  const title: string = readFileSync(new URL('../title-motion.css', import.meta.url), 'utf8');
  assert.match(title, /@import "\.\/page-transition\.css";/);
  assert.match(title, /body\s*\{\s*animation:\s*page-in /);
});
