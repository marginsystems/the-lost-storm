import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createMemoryStore, makeSave } from '../../test/backend-support.ts';
import { createLocalBackend, SAVE_KEY } from './local.ts';

void test('a save written by the local backend is the one it loads, under the same key as before', async (): Promise<void> => {
  const store = createMemoryStore();
  const backend = createLocalBackend(content, store);
  assert.equal(await backend.load(), null);
  assert.equal(backend.save(makeSave(3, 40)), true);
  assert.ok(store.entries.has(SAVE_KEY));
  assert.deepEqual(await backend.load(), makeSave(3, 40));
});

void test('a failed write reports false so the game tries again', (): void => {
  const store = createMemoryStore();
  store.failWrites = true;
  assert.equal(createLocalBackend(content, store).save(makeSave(2, 0)), false);
});

void test('a stored value that is not a valid save loads as no save', async (): Promise<void> => {
  const store = createMemoryStore();
  store.write(SAVE_KEY, '{"version":99}');
  assert.equal(await createLocalBackend(content, store).load(), null);
  store.write(SAVE_KEY, 'garbage');
  assert.equal(await createLocalBackend(content, store).load(), null);
});

void test('reset removes the save and the local backend is always offline and has nothing to flush', async (): Promise<void> => {
  const store = createMemoryStore();
  const backend = createLocalBackend(content, store);
  backend.save(makeSave(2, 0));
  await backend.reset();
  assert.equal(store.entries.size, 0);
  assert.equal(backend.state(), 'offline');
  backend.flush();
  backend.subscribe((): void => undefined);
});
