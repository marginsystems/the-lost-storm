import assert from 'node:assert/strict';
import { test } from 'node:test';
import { within } from './timeout.ts';

void test('work that finishes in time returns its result', async (): Promise<void> => {
  assert.equal(await within(200, (): Promise<string> => Promise.resolve('done')), 'done');
});

void test('work that never finishes is abandoned and its signal is aborted', async (): Promise<void> => {
  const signals: AbortSignal[] = [];
  await assert.rejects(
    within(20, (signal: AbortSignal): Promise<string> => {
      signals.push(signal);
      return new Promise<string>((): void => undefined);
    }),
    /timed out/,
  );
  assert.equal(signals[0]?.aborted, true);
});

void test('work that throws at once is reported and a throw from inside is passed on', async (): Promise<void> => {
  await assert.rejects(
    within(200, (): Promise<string> => {
      throw new Error('boom');
    }),
    /boom/,
  );
  await assert.rejects(within(200, (): Promise<string> => Promise.reject(new Error('later'))), /later/);
});
