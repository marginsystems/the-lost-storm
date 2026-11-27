import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness } from '../../test/backend-support.ts';
import type { Harness } from '../../test/backend-support.ts';
import type { Backend } from './backend.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';

const URL_A: string = 'http://localhost:8787';

function token(harness: Harness): string | null {
  return parseSyncRecord(harness.store.read(SYNC_KEY), URL_A)?.token ?? null;
}

void test('a device whose first load could not reach the server gets its account the moment a name is claimed', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.server.goDown();
  const backend: Backend = harness.open();
  assert.equal(await backend.load(), null);
  assert.equal(token(harness), null);
  harness.server.comeUp();
  assert.equal(await backend.account(), true);
  assert.equal(token(harness), 'token-1');
  assert.equal(backend.state(), 'cloud');
  assert.equal(harness.server.count('POST', '/v1/guest'), 1);
});

void test('a device that already has its account answers at once and makes no second guest', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  assert.equal(await backend.account(), true);
  assert.equal(harness.server.count('POST', '/v1/guest'), 1);
});

void test('a device that still cannot reach the server says it has no account, so the name is kept on the device', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.server.goDown();
  const backend: Backend = harness.open();
  await backend.load();
  assert.equal(await backend.account(), false);
  assert.equal(token(harness), null);
});
