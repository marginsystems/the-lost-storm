import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pressAction } from './name-press.ts';
import type { PressContext } from './name-press.ts';

const open: PressContext = { state: 'open', value: '', needed: true, limited: false };

void test('the first press opens the step only when a name is needed', (): void => {
  assert.equal(pressAction({ ...open, state: 'closed' }), 'open');
  assert.equal(pressAction({ ...open, state: 'closed', needed: false }), 'begin');
});

void test('an empty or blank field gets a suggested name instead of a refusal', (): void => {
  assert.equal(pressAction(open), 'suggest');
  assert.equal(pressAction({ ...open, value: '   ' }), 'suggest');
});

void test('a typed name is submitted', (): void => {
  assert.equal(pressAction({ ...open, value: 'Ash Vale' }), 'submit');
  assert.equal(pressAction({ ...open, value: 'x' }), 'submit');
});

void test('a busy step waits, a finished or rate limited step begins', (): void => {
  assert.equal(pressAction({ ...open, state: 'busy' }), 'wait');
  assert.equal(pressAction({ ...open, state: 'done' }), 'begin');
  assert.equal(pressAction({ ...open, limited: true }), 'begin');
});
