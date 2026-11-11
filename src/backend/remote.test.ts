import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, freshSave, makeSave, settle } from '../../test/backend-support.ts';
import type { Harness, RecordedRequest, ServerAccount } from '../../test/backend-support.ts';
import { isFields } from '../../sim/content/read.ts';
import { must } from '../../test/support.ts';
import type { Backend } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

const URL_A: string = 'http://localhost:8787';

function account(harness: Harness, index: number = 0): ServerAccount {
  return must(harness.server.accounts[index], 'the server account');
}

function lastPut(harness: Harness): { readonly baseRevision: unknown; readonly level: unknown } {
  const request: RecordedRequest = must(harness.server.requests.findLast((entry: RecordedRequest): boolean => entry.method === 'PUT'), 'a PUT');
  assert.ok(isFields(request.body));
  const save: unknown = request.body['save'];
  assert.ok(isFields(save));
  return { baseRevision: request.body['baseRevision'], level: save['level'] };
}

function record(harness: Harness): SyncRecord {
  return must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the sync record');
}

function storedLevel(harness: Harness): unknown {
  const text: string = must(harness.store.read(SAVE_KEY), 'the local save');
  const parsed: unknown = JSON.parse(text);
  assert.ok(isFields(parsed));
  return parsed['level'];
}

async function retryDelays(harness: Harness, count: number): Promise<number[]> {
  if (count === 0) return [];
  const delay: number = must(harness.timers.nextDelay(), 'a retry');
  await harness.timers.advance(delay);
  return [delay, ...(await retryDelays(harness, count - 1))];
}

async function synced(harness: Harness, level: number): Promise<Backend> {
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(level, 0));
  await harness.timers.advance(1000);
  return backend;
}

void test('the first run creates a guest account, keeps its token, and the next run reuses it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const first: Backend = harness.open();
  assert.equal(await first.load(), null);
  assert.equal(first.state(), 'cloud');
  assert.deepEqual(harness.server.requests.map((entry: RecordedRequest): string => `${entry.method} ${entry.path}`), ['POST /v1/guest', 'GET /v1/save']);
  assert.equal(record(harness).token, 'token-1');
  const second: Backend = harness.open();
  await second.load();
  assert.equal(harness.server.count('POST', '/v1/guest'), 1);
  assert.equal(must(harness.server.requests.at(-1), 'a request').token, 'token-1');
});

void test('a token is never sent to a different server than the one that issued it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await harness.open(URL_A).load();
  await harness.open('http://localhost:9999').load();
  assert.equal(harness.server.count('POST', '/v1/guest'), 2);
  assert.equal(must(harness.server.requests.at(-1), 'a request').token, 'token-2');
});

void test('a save is written locally at once and pushed in the background after a short gap', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  assert.equal(backend.save(makeSave(2, 10)), true);
  assert.equal(storedLevel(harness), 2);
  assert.equal(harness.server.count('PUT', '/v1/save'), 0);
  await harness.timers.advance(1000);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
  assert.equal(account(harness).save?.level, 2);
  assert.equal(account(harness).revision, 1);
  assert.equal(record(harness).revision, 1);
  assert.equal(record(harness).pending, false);
});

void test('a burst of saves becomes one push with the newest save, and the next push builds on its revision', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(2, 1));
  backend.save(makeSave(2, 2));
  backend.save(makeSave(3, 0));
  await harness.timers.advance(1000);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
  assert.deepEqual(lastPut(harness), { baseRevision: 0, level: 3 });
  backend.save(makeSave(4, 0));
  await harness.timers.advance(1000);
  assert.deepEqual(lastPut(harness), { baseRevision: 1, level: 4 });
});

void test('a save that arrives while a push is in flight is pushed right after it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(2, 0));
  const first: Promise<void> = harness.timers.advance(1000);
  backend.save(makeSave(3, 0));
  await first;
  await harness.timers.advance(1000);
  assert.equal(account(harness).save?.level, 3);
  assert.equal(account(harness).revision, 2);
});

void test('a server that is down never fails the game: saves stay local, retries back off, and it catches up', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.store.write(SAVE_KEY, JSON.stringify(makeSave(4, 2)));
  harness.server.goDown();
  const backend: Backend = harness.open();
  const states: string[] = [];
  backend.subscribe((state: string): void => {
    states.push(state);
  });
  assert.deepEqual(await backend.load(), makeSave(4, 2));
  assert.equal(backend.state(), 'offline');
  assert.equal(backend.save(makeSave(4, 9)), true);
  assert.equal(storedLevel(harness), 4);
  await harness.timers.advance(1000);
  assert.equal(harness.timers.nextDelay(), 2000);
  await harness.timers.advance(2000);
  assert.equal(harness.timers.nextDelay(), 4000);
  assert.equal(harness.warns.length, 1);
  harness.server.comeUp();
  await harness.timers.advance(4000);
  assert.equal(backend.state(), 'cloud');
  assert.equal(account(harness).save?.xp, 9);
  assert.deepEqual(states, ['cloud']);
});

void test('backoff is capped and a recovered server resets it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.server.goDown();
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(2, 0));
  await harness.timers.advance(1000);
 
  assert.deepEqual(await retryDelays(harness, 8), [2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
});

void test('a load that cannot reach the cloud returns the local save, and a pending one is pushed once it can', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 2);
  harness.server.goDown();
  const offline: Backend = harness.open();
  await offline.load();
  offline.save(makeSave(3, 0));
  harness.server.comeUp();
  const reopened: Backend = harness.open();
  assert.equal((await reopened.load())?.level, 3);
  await harness.timers.advance(0);
  assert.equal(account(harness).save?.level, 3);
  assert.equal(account(harness).revision, 2);
});

void test('on load the cloud save wins when it is newer and this device has nothing unsynced', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 2);
  harness.server.plant(account(harness), makeSave(5, 0));
  const loaded: number | undefined = (await harness.open().load())?.level;
  assert.equal(loaded, 5);
  assert.equal(storedLevel(harness), 5);
  assert.equal(record(harness).revision, 2);
  assert.ok(harness.infos.some((line: string): boolean => line.includes('loaded the cloud save')));
});

void test('on load a pending local save that is further along beats a cloud copy that moved, and overwrites it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 2);
  harness.server.goDown();
  const offline: Backend = harness.open();
  await offline.load();
  offline.save(makeSave(6, 0));
  harness.server.plant(account(harness), makeSave(5, 0));
  harness.server.comeUp();
  assert.equal((await harness.open().load())?.level, 6);
  await harness.timers.advance(0);
  assert.equal(account(harness).save?.level, 6);
  assert.equal(account(harness).revision, 3);
});

void test('on load a pending local save that is behind a cloud copy that moved gives way to it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 2);
  harness.server.goDown();
  const offline: Backend = harness.open();
  await offline.load();
  offline.save(makeSave(3, 0));
  harness.server.plant(account(harness), makeSave(5, 0));
  harness.server.comeUp();
  assert.equal((await harness.open().load())?.level, 5);
  assert.equal(storedLevel(harness), 5);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
});

void test('a conflict while playing keeps this device when it is further along, says so, and pushes again', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  harness.server.plant(account(harness), makeSave(3, 0));
  backend.save(makeSave(4, 0));
  await harness.timers.advance(1000);
  assert.ok(harness.infos.some((line: string): boolean => line.includes("keeping this device's save")));
  await harness.timers.advance(0);
  assert.equal(account(harness).save?.level, 4);
  assert.equal(account(harness).revision, 3);
});

void test('a conflict while playing keeps the cloud copy when it is further along, then stops saving so it cannot overwrite it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  harness.server.plant(account(harness), makeSave(9, 0));
  backend.save(makeSave(4, 0));
  await harness.timers.advance(1000);
  assert.ok(harness.warns.some((line: string): boolean => line.includes('keeping the cloud save') && line.includes('Reload')));
  assert.equal(storedLevel(harness), 9);
  const puts: number = harness.server.count('PUT', '/v1/save');
  assert.equal(backend.save(makeSave(10, 0)), true);
  await harness.timers.advance(60_000);
  assert.equal(harness.server.count('PUT', '/v1/save'), puts);
  assert.equal(storedLevel(harness), 9);
  assert.equal(account(harness).save?.level, 9);
});

void test('a token the server no longer knows is replaced by a new guest account and the save goes up', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  harness.server.accounts.splice(0);
  backend.save(makeSave(3, 0));
  await harness.timers.advance(1000);
  await harness.timers.advance(0);
  assert.equal(harness.server.count('POST', '/v1/guest'), 2);
  assert.equal(record(harness).token, 'token-2');
  assert.equal(account(harness).save?.level, 3);
});

void test('a refused save is not retried in a loop, but the next save tries again', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  harness.server.plan(422);
  backend.save(makeSave(2, 0));
  await harness.timers.advance(1000);
  assert.ok(harness.warns.some((line: string): boolean => line.includes('refused')));
  await harness.timers.advance(120_000);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
  backend.save(makeSave(3, 0));
  await harness.timers.advance(1000);
  assert.equal(account(harness).save?.level, 3);
});

void test('a rate limit is waited out for as long as the server says', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  harness.server.plan(429, { 'Retry-After': '7' });
  backend.save(makeSave(2, 0));
  await harness.timers.advance(1000);
  assert.equal(harness.timers.nextDelay(), 7000);
  await harness.timers.advance(7000);
  assert.equal(account(harness).save?.level, 2);
});

void test('a cloud copy the game rules refuse is left alone: the local save loads and nothing is overwritten blindly on load', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 2);
  harness.server.plant(account(harness), { ...makeSave(3, 0), version: 99 });
  const requests: number = harness.server.requests.length;
  const reopened: Backend = harness.open();
  assert.equal((await reopened.load())?.level, 2);
  assert.equal(reopened.state(), 'offline');
  await harness.timers.advance(60_000);
  assert.equal(harness.server.requests.slice(requests).filter((entry: RecordedRequest): boolean => entry.method === 'PUT').length, 0);
  assert.ok(harness.warns.length > 0);
});

void test('flush pushes at once instead of waiting for the gap', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(2, 0));
  backend.flush();
  await settle();
  await settle();
  assert.equal(account(harness).save?.level, 2);
  assert.equal(harness.timers.pending(), 0);
});

void test('start over clears this device and replaces the cloud copy with a fresh character', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 5);
  await backend.reset();
  assert.equal(harness.store.read(SAVE_KEY), null);
  assert.equal(account(harness).save?.level, 1);
  assert.equal(account(harness).revision, 2);
  assert.equal(record(harness).revision, 2);
  assert.equal(record(harness).overwriteCloud, false);
  assert.equal(await harness.open().load(), null);
});

void test('a cloud copy that is a fresh character loads as no save, and clears an older local save', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 5);
  harness.server.plant(account(harness), freshSave());
  assert.equal(await harness.open().load(), null);
  assert.equal(harness.store.read(SAVE_KEY), null);
  assert.equal(record(harness).revision, 2);
});

void test('start over cancels a push that was still waiting, so the old character cannot come back', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 5);
  backend.save(makeSave(6, 0));
  await backend.reset();
  await harness.timers.advance(60_000);
  assert.equal(account(harness).save?.level, 1);
});

void test('start over with the server down finishes quickly, and the next load that reaches the server replaces the cloud copy', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 5);
  harness.server.goDown();
  await backend.reset();
  assert.equal(record(harness).overwriteCloud, true);
  assert.ok(harness.warns.some((line: string): boolean => line.includes('Start over')));
  harness.server.comeUp();
  assert.equal(await harness.open().load(), null);
  assert.equal(account(harness).save?.level, 1);
  assert.equal(record(harness).overwriteCloud, false);
});

void test('after a start over that never reached the cloud, a new character wins over the old cloud copy', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 9);
  harness.server.goDown();
  await backend.reset();
  const offline: Backend = harness.open();
  await offline.load();
  offline.save(makeSave(2, 0));
  harness.server.comeUp();
  assert.equal((await harness.open().load())?.level, 2);
  assert.equal(account(harness).save?.level, 2);
});

void test('start over when the server no longer knows the token just forgets it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 5);
  harness.server.accounts.splice(0);
  await backend.reset();
  assert.equal(harness.store.read(SYNC_KEY), null);
});

void test('state changes are announced to subscribers when the connection comes and goes', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  const states: string[] = [];
  backend.subscribe((state: string): void => {
    states.push(state);
  });
  await backend.load();
  harness.server.goDown();
  backend.save(makeSave(2, 0));
  await harness.timers.advance(1000);
  harness.server.comeUp();
  await harness.timers.advance(2000);
  assert.deepEqual(states, ['cloud', 'offline', 'cloud']);
});

void test('a push that finishes after start over cannot clear the flag of a newer push', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 3);
  backend.save(makeSave(4, 0));
  const releaseOld: () => void = harness.server.holdNext();
  await harness.timers.advance(1000);
  await backend.reset();
  backend.save(makeSave(1, 5));
  const releaseNew: () => void = harness.server.holdNext();
  await harness.timers.advance(1000);
  releaseOld();
  await settle();
  await settle();
  const afterOld: number = harness.server.count('PUT', '/v1/save');
  backend.flush();
  await settle();
  assert.equal(harness.server.count('PUT', '/v1/save'), afterOld);
  releaseNew();
  await settle();
  await settle();
});
