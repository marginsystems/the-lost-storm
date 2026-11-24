import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createFakeClock, createFakeServer, createFakeTimers, createMemoryStore, settle } from '../../test/backend-support.ts';
import type { FakeClock, FakeServer, FakeTimers } from '../../test/backend-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { makeItem } from '../../sim/world/ledger.ts';
import type { ItemSource } from '../../sim/world/ledger.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { KeyValueStore } from './backend.ts';
import { createLedgerApi } from './ledger-api.ts';
import { createMinter } from './minter.ts';
import type { Minter } from './minter.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const SERVER: string = 'http://localhost:8787';
const STARTING_BASE: string = content.player.startingItems[0] ?? '';
const START: ItemSource = { kind: 'start', base: STARTING_BASE };

function world(): World {
  const made: World = worldIn(content, content.world.start, 3);
  made.ledger.waiting = [];
  return made;
}

void test('a minter that forgets the character never hands its tickets or confirmed items to the next one', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const fake: FakeServer = createFakeServer(clock);
  const store: KeyValueStore = createMemoryStore();
  await fake.fetch(`${SERVER}/v1/guest`, { method: 'POST' });
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl: SERVER, accountId: 'account-1', token: 'token-1', revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  const minter: Minter = createMinter({ serverUrl: SERVER, store, api: createLedgerApi(SERVER, fake.fetch, content), clock: clock.read, timers: timers.timers });
  const first: World = world();
  minter.pump(first);
  await settle();
  await settle();
  minter.pump(first);
  const item: ItemInstance = must(makeItem(first, 1, STARTING_BASE, 'common', START), 'item');
  first.player.inventory[0] = item;
  minter.pump(first);
  minter.forget();
  await settle();
  await settle();
  const next: World = world();
  next.player.inventory[0] = { ...item };
  assert.ok(first.ledger.tickets.length > 0);
  assert.equal(minter.pump(next), false);
  assert.equal(next.player.inventory[0].ledger, null);
  assert.deepEqual(next.ledger.tickets, []);
});
