import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeServer, createMemoryStore } from '../../test/backend-support.ts';
import type { FakeServer } from '../../test/backend-support.ts';
import type { FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { createJournalCountClient, readTally } from './journal-count-api.ts';
import type { JournalCountClient } from './journal-count-api.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const SERVER: string = 'http://localhost:8787';
const offline: FetchFn = (): Promise<Response> => Promise.reject(new Error('offline'));
const nonsense: FetchFn = (): Promise<Response> => Promise.resolve(new Response('<html>', { status: 200 }));
const failing: FetchFn = (): Promise<Response> => Promise.resolve(new Response('{}', { status: 503 }));

function signedIn(token: string, accountId: string): KeyValueStore {
  const store: KeyValueStore = createMemoryStore();
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl: SERVER, accountId, token, revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  return store;
}

void test('a tally is two whole numbers with no more others than the count', (): void => {
  assert.deepEqual(readTally({ count: 3, others: 2, accountId: 'secret' }), { count: 3, others: 2 });
  assert.equal(readTally({ count: 1, others: 2 }), null);
  assert.equal(readTally({ count: -1, others: 0 }), null);
  assert.equal(readTally({ count: 1.5, others: 0 }), null);
  assert.equal(readTally('3'), null);
});

void test('each account counts once, and the answer says how many others carried the journal', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  await Promise.all([1, 2].map((): Promise<Response> => fake.fetch(`${SERVER}/v1/guest`, { method: 'POST' })));
  const first: JournalCountClient = createJournalCountClient({ serverUrl: SERVER, store: signedIn('token-1', 'account-1'), fetch: fake.fetch });
  const second: JournalCountClient = createJournalCountClient({ serverUrl: SERVER, store: signedIn('token-2', 'account-2'), fetch: fake.fetch });
  assert.equal(first.signedIn(), true);
  assert.deepEqual(await first.count(), { count: 1, others: 0 });
  assert.deepEqual(await first.count(), { count: 1, others: 0 });
  assert.deepEqual(await second.count(), { count: 2, others: 1 });
});

void test('without a token nothing is sent', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const client: JournalCountClient = createJournalCountClient({ serverUrl: SERVER, store: createMemoryStore(), fetch: fake.fetch });
  assert.equal(client.signedIn(), false);
  assert.equal(await client.count(), null);
  assert.equal(fake.requests.length, 0);
});

void test('an unreachable server, a failure or a bad answer comes back as nothing', async (): Promise<void> => {
  const answers = await Promise.all([offline, nonsense, failing].map((fetch: FetchFn) => createJournalCountClient({ serverUrl: SERVER, store: signedIn('token-1', 'account-1'), fetch }).count()));
  assert.deepEqual(answers, [null, null, null]);
});
