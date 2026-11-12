import assert from 'node:assert/strict';
import { test } from 'node:test';
import { repeatedSteps } from './shared-steps.ts';

void test('a step two quests share is shown on the first quest only', (): void => {
  assert.deepEqual(repeatedSteps(['Go to The Hall of Time', 'Go to The Hall of Time']), [false, true]);
});

void test('different steps and empty steps are all kept', (): void => {
  assert.deepEqual(repeatedSteps(['Find shelter', '', 'Go to The Hall of Time', '']), [false, false, false, false]);
});

void test('the first of three equal steps stays and the later two hide', (): void => {
  assert.deepEqual(repeatedSteps(['Rest', 'Climb', 'Rest', 'Rest']), [false, false, true, true]);
});
