import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SaveData } from '../../sim/save.ts';
import { createHarness, makeSave, settle, storedLocal } from '../../test/backend-support.ts';
import type { Harness, RecordedRequest } from '../../test/backend-support.ts';
import type { Backend, BackendState } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { createPlay } from './play.ts';
import type { Play } from './play.ts';
import { TIMING } from './remote.ts';
import { createSwitchableBackend } from './switchable.ts';
import type { SwitchableBackend } from './switchable.ts';
import { SYNC_KEY } from './sync-record.ts';

function opener(harness: Harness): { readonly opened: Backend[]; readonly make: () => Backend } {
  const opened: Backend[] = [];
  return {
    opened,
    make: (): Backend => {
      const backend: Backend = harness.open();
      opened.push(backend);
      return backend;
    },
  };
}

void test('reopening retires the old backend and loads the character the store holds now', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const { opened, make } = opener(harness);
  const backend: SwitchableBackend = createSwitchableBackend(make);
  await backend.load();
  backend.save(makeSave(3, 0));
  await harness.timers.advance(1000);
  harness.store.write(SAVE_KEY, storedLocal(makeSave(6, 0)));
  harness.store.remove(SYNC_KEY);
  const loaded: SaveData | null = await backend.reopen();
  assert.equal(opened.length, 2);
  assert.equal(loaded?.level, 6);
  backend.save(makeSave(7, 0));
  await harness.timers.advance(1000);
  assert.equal(harness.server.accounts.length, 2);
  assert.equal(harness.server.accounts[0]?.save?.level, 3);
  assert.equal(harness.server.accounts[1]?.save?.level, 7);
});

void test('a retired backend takes no saves until the next one is open', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const { make } = opener(harness);
  const backend: SwitchableBackend = createSwitchableBackend(make);
  await backend.load();
  backend.save(makeSave(2, 0));
  await harness.timers.advance(1000);
  const stored: string | null = harness.store.read(SAVE_KEY);
  backend.retire();
  assert.equal(backend.save(makeSave(9, 0)), true);
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(harness.store.read(SAVE_KEY), stored);
  assert.equal(harness.server.accounts[0]?.save?.level, 2);
});

void test('state reaches listeners from the open backend only', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const { opened, make } = opener(harness);
  const backend: SwitchableBackend = createSwitchableBackend(make);
  const heard: BackendState[] = [];
  backend.subscribe((state: BackendState): void => void heard.push(state));
  await backend.load();
  assert.deepEqual(heard, ['cloud']);
  harness.store.remove(SYNC_KEY);
  await backend.reopen();
  await settle();
  assert.equal(backend.state(), opened[1]?.state());
  assert.equal(heard.at(-1), backend.state());
});

void test('a retired backend lets the server know this play has left before the next opens', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const play: Play = createPlay('page-a');
  const backend: SwitchableBackend = createSwitchableBackend((): Backend => harness.open(undefined, play));
  await backend.load();
  backend.save(makeSave(2, 0));
  await harness.timers.advance(1000);
  const before: number = harness.server.requests.length;
  backend.retire();
  await settle();
  assert.equal(harness.server.requests.slice(before).filter((entry: RecordedRequest): boolean => entry.path === '/v1/play/leave').length, 1);
});
