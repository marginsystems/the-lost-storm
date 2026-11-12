import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldAsk, shouldShow } from './count-state.ts';
import type { CountState } from './count-state.ts';

const fresh: CountState = { shown: false, asked: false, tally: null };

void test('the count is asked for once, only after the journal is taken and only when signed in', (): void => {
  assert.equal(shouldAsk(fresh, true, true), true);
  assert.equal(shouldAsk(fresh, false, true), false);
  assert.equal(shouldAsk(fresh, true, false), false);
  assert.equal(shouldAsk({ ...fresh, asked: true }, true, true), false);
  assert.equal(shouldAsk({ ...fresh, shown: true }, true, true), false);
});

void test('the line shows once, only with an answer, only while the HUD is shown and only while the game is on screen', (): void => {
  const answered: CountState = { shown: false, asked: true, tally: { count: 4, others: 3 } };
  assert.equal(shouldShow(answered, false, true), true);
  assert.equal(shouldShow(answered, true, true), false);
  assert.equal(shouldShow(answered, false, false), false);
  assert.equal(shouldShow({ ...answered, tally: null }, false, true), false);
  assert.equal(shouldShow({ ...answered, shown: true }, false, true), false);
});
