import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LoadHealth } from './load-health.ts';
import { createLoadHealth } from './load-health.ts';

void test('sound starts healthy, a failed load marks it failing and the next good load clears it', (): void => {
  const health: LoadHealth = createLoadHealth();
  const heard: boolean[] = [];
  health.subscribe((failing: boolean): void => {
    heard.push(failing);
  });
  assert.equal(health.failing, false);
  health.note(true);
  health.note(false);
  health.note(false);
  assert.equal(health.failing, true);
  health.note(true);
  assert.equal(health.failing, false);
  assert.deepEqual(heard, [true, false]);
});
