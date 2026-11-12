import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createMemoryStore, makeSave, preEpochLocal, storedLocal } from '../../test/backend-support.ts';
import { createEpochs, SAVE_EPOCH } from './epoch.ts';
import { createLocalBackend, readLocalSave, SAVE_KEY } from './local.ts';

void test('a save written by the local backend is the one it loads, under the same key as before, stamped with the epoch', async (): Promise<void> => {
  const store = createMemoryStore();
  const backend = createLocalBackend(content, store, createEpochs(SAVE_EPOCH));
  assert.equal(await backend.load(), null);
  assert.equal(backend.save(makeSave(3, 40)), true);
  assert.deepEqual(readLocalSave(content, store.read(SAVE_KEY)), { save: makeSave(3, 40), epoch: SAVE_EPOCH });
  assert.deepEqual(await backend.load(), makeSave(3, 40));
});

void test('a save from before the current epoch is discarded on load and removed, so the character starts new', async (): Promise<void> => {
  const store = createMemoryStore();
  store.write(SAVE_KEY, preEpochLocal(makeSave(9, 500)));
  assert.equal(await createLocalBackend(content, store, createEpochs(SAVE_EPOCH)).load(), null);
  assert.equal(store.read(SAVE_KEY), null);
  store.write(SAVE_KEY, storedLocal(makeSave(9, 500), SAVE_EPOCH - 1));
  assert.equal(await createLocalBackend(content, store, createEpochs(SAVE_EPOCH)).load(), null);
  assert.equal(store.read(SAVE_KEY), null);
});

void test('raising the epoch makes the save on this device stale too', async (): Promise<void> => {
  const store = createMemoryStore();
  const epochs = createEpochs(SAVE_EPOCH);
  const backend = createLocalBackend(content, store, epochs);
  backend.save(makeSave(4, 0));
  assert.equal(epochs.raise(SAVE_EPOCH + 1), true);
  assert.equal(epochs.raise(SAVE_EPOCH), false);
  assert.equal(await backend.load(), null);
  backend.save(makeSave(2, 0));
  assert.deepEqual(readLocalSave(content, store.read(SAVE_KEY))?.epoch, SAVE_EPOCH + 1);
});

void test('a failed write reports false so the game tries again', (): void => {
  const store = createMemoryStore();
  store.failWrites = true;
  assert.equal(createLocalBackend(content, store, createEpochs(SAVE_EPOCH)).save(makeSave(2, 0)), false);
});

void test('a stored value that is not a valid save loads as no save', async (): Promise<void> => {
  const texts: readonly string[] = ['{"version":99}', 'garbage', '[]', storedLocal(makeSave(2, 0)).replace(`"epoch":${SAVE_EPOCH}`, '"epoch":0')];
  const loaded = await Promise.all(
    texts.map((text: string): Promise<unknown> => {
      const store = createMemoryStore();
      store.write(SAVE_KEY, text);
      return createLocalBackend(content, store, createEpochs(SAVE_EPOCH)).load();
    }),
  );
  assert.deepEqual(loaded, [null, null, null, null]);
});

void test('reset removes the save and the local backend is always offline and has nothing to flush', async (): Promise<void> => {
  const store = createMemoryStore();
  const backend = createLocalBackend(content, store, createEpochs(SAVE_EPOCH));
  backend.save(makeSave(2, 0));
  await backend.reset();
  assert.equal(store.entries.size, 0);
  assert.equal(backend.state(), 'offline');
  backend.flush();
  backend.subscribe((): void => undefined);
});

void test('loading says a fresh start only when it dropped a save from an older epoch, such as one from epoch 2', async (): Promise<void> => {
  const empty = createLocalBackend(content, createMemoryStore(), createEpochs(SAVE_EPOCH));
  assert.equal(await empty.load(), null);
  assert.equal(empty.freshStart(), false);
  const kept = createMemoryStore();
  kept.write(SAVE_KEY, storedLocal(makeSave(4, 0), SAVE_EPOCH));
  const current = createLocalBackend(content, kept, createEpochs(SAVE_EPOCH));
  assert.deepEqual(await current.load(), makeSave(4, 0));
  assert.equal(current.freshStart(), false);
  const old = createMemoryStore();
  old.write(SAVE_KEY, storedLocal(makeSave(9, 500), 2));
  const dropped = createLocalBackend(content, old, createEpochs(SAVE_EPOCH));
  assert.equal(await dropped.load(), null);
  assert.equal(dropped.freshStart(), true);
});
