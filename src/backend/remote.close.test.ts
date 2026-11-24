import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, makeSave, settle, storedLocal, synced } from '../../test/backend-support.ts';
import type { Harness } from '../../test/backend-support.ts';
import type { Backend } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { TIMING } from './remote.ts';
import { SYNC_KEY } from './sync-record.ts';

void test('a push sent before closing still reaches the server, and its late answer writes nothing to the store', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  backend.save(makeSave(3, 0));
  const release: () => void = harness.server.holdNext();
  backend.flush();
  await settle();
  backend.close();
  const other: string = storedLocal(makeSave(7, 0));
  harness.store.write(SAVE_KEY, other);
  harness.store.remove(SYNC_KEY);
  release();
  await settle();
  await settle();
  assert.equal(harness.store.read(SAVE_KEY), other);
  assert.equal(harness.store.read(SYNC_KEY), null);
  assert.equal(harness.server.accounts[0]?.save?.level, 3);
});

void test('a closed backend takes no saves, sends nothing more and starts no retries', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  const puts: number = harness.server.count('PUT', '/v1/save');
  const stored: string | null = harness.store.read(SAVE_KEY);
  backend.close();
  assert.equal(backend.save(makeSave(4, 0)), true);
  backend.flush();
  await backend.sync();
  await backend.reset();
  await harness.timers.advance(TIMING.retryMaxMs);
  assert.equal(harness.server.count('PUT', '/v1/save'), puts);
  assert.equal(harness.store.read(SAVE_KEY), stored);
});

void test('a load still waiting on the cloud when the backend closes writes nothing to the store', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 2);
  harness.store.remove(SAVE_KEY);
  const backend: Backend = harness.open();
  const release: () => void = harness.server.holdNext();
  const loading: Promise<unknown> = backend.load();
  await settle();
  backend.close();
  const other: string = storedLocal(makeSave(7, 0));
  harness.store.write(SAVE_KEY, other);
  release();
  await loading;
  assert.equal(harness.store.read(SAVE_KEY), other);
});
