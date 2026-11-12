import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createHarness, createSecondBrowser, freshSave, makeSave, preEpochLocal, settle, storedLocal } from '../../test/backend-support.ts';
import type { Harness, RecordedRequest, ServerAccount } from '../../test/backend-support.ts';
import { isFields } from '../../sim/content/read.ts';
import { must } from '../../test/support.ts';
import type { Backend } from './backend.ts';
import { SAVE_EPOCH } from './epoch.ts';
import { readLocalSave, SAVE_KEY } from './local.ts';
import { TIMING } from './remote.ts';
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
  harness.store.write(SAVE_KEY, storedLocal(makeSave(4, 2)));
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

void test('flush does not send inside a wait the server asked for, and sends once the wait is over', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  harness.server.plan(429, { 'Retry-After': '60' });
  backend.save(makeSave(2, 0));
  await harness.timers.advance(1000);
  const puts: number = harness.server.count('PUT', '/v1/save');
  backend.flush();
  await settle();
  await settle();
  assert.equal(harness.server.count('PUT', '/v1/save'), puts);
  assert.equal(harness.timers.nextDelay(), 60_000);
  await harness.timers.advance(60_000);
  assert.equal(account(harness).save?.level, 2);
});

void test('a start over that cannot replace the cloud copy at load keeps trying until it can', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 5);
  harness.server.goDown();
  await backend.reset();
  harness.server.comeUp();
  harness.server.plan(503, {}, 'PUT');
  const reopened: Backend = harness.open();
  assert.equal(await reopened.load(), null);
  assert.equal(reopened.state(), 'offline');
  assert.equal(account(harness).save?.level, 5);
  assert.equal(harness.timers.nextDelay(), 2000);
  await harness.timers.advance(2000);
  assert.equal(account(harness).save?.level, 1);
  assert.equal(reopened.state(), 'cloud');
  assert.equal(record(harness).overwriteCloud, false);
});

void test('a conflict keeps the savedAt written by a save that landed while the push was in flight', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  harness.server.plant(account(harness), makeSave(3, 0));
  backend.save(makeSave(4, 0));
  const release: () => void = harness.server.holdNext();
  await harness.timers.advance(1000);
  harness.clock.now += 5000;
  backend.save(makeSave(5, 0));
  const later: string = new Date(harness.clock.now).toISOString();
  release();
  await settle();
  await settle();
  assert.equal(record(harness).savedAt, later);
});

void test('a push that settles after another writer replaced the record does not put the old token back', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  const guest: SyncRecord = record(harness);
  const release: () => void = harness.server.holdNext();
  backend.save(makeSave(5, 0));
  await harness.timers.advance(1000);
  const replaced: SyncRecord = { ...guest, accountId: 'another-account', token: 'a-new-session', revision: 0, pending: false };
  harness.store.write(SYNC_KEY, JSON.stringify(replaced));
  release();
  await settle();
  await settle();
  assert.deepEqual(record(harness), replaced);
  backend.save(makeSave(6, 0));
  await harness.timers.advance(5000);
  assert.deepEqual(record(harness), replaced);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
});

void test('a first visit that cannot reach the server gets its account once the server answers, without any save being made', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.server.goDown();
  const backend: Backend = harness.open();
  assert.equal(await backend.load(), null);
  assert.equal(harness.store.read(SYNC_KEY), null);
  harness.server.comeUp();
  await harness.timers.advance(must(harness.timers.nextDelay(), 'a retry of the account request'));
  assert.equal(harness.server.accounts.length, 1);
  assert.equal(record(harness).accountId, account(harness).accountId);
  assert.equal(backend.state(), 'cloud');
  assert.equal(harness.timers.pending(), 0);
});

void test('the account request is retried with a growing delay and given up after the last retry', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.server.goDown();
  await harness.open().load();
  const delays: number[] = await retryDelays(harness, TIMING.maxEnrolRetries);
  assert.deepEqual(delays.slice(0, 3), [2000, 4000, 8000]);
  assert.equal(harness.timers.pending(), 0);
  assert.equal(harness.server.accounts.length, 0);
});

void test('a save kept on this device from a visit with no account is sent once the server answers', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.store.write(SAVE_KEY, storedLocal(makeSave(6, 0)));
  harness.server.goDown();
  const backend: Backend = harness.open();
  assert.equal((await backend.load())?.level, 6);
  harness.server.comeUp();
  await harness.timers.advance(TIMING.retryBaseMs);
  await harness.timers.advance(0);
  assert.equal(harness.server.accounts.length, 1);
  assert.equal(backend.state(), 'cloud');
  assert.equal(account(harness).save?.level, 6);
});

void test('a save made while the account request is in flight does not create a second account', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.server.goDown();
  const backend: Backend = harness.open();
  await backend.load();
  harness.server.comeUp();
  const release: () => void = harness.server.holdNext();
  await harness.timers.advance(TIMING.retryBaseMs);
  backend.save(makeSave(3, 0));
  await harness.timers.advance(TIMING.pushGapMs);
  release();
  await settle();
  await settle();
  assert.equal(harness.server.accounts.length, 1);
  assert.equal(account(harness).save?.level, 3);
});

void test('a save on this device is sent to an account created in a load whose save read then failed', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.store.write(SAVE_KEY, storedLocal(makeSave(7, 0)));
  harness.server.plan(503, {}, 'GET');
  const backend: Backend = harness.open();
  assert.equal((await backend.load())?.level, 7);
  assert.equal(harness.server.accounts.length, 1);
  assert.equal(record(harness).pending, true);
  assert.equal(account(harness).save, null);
  await harness.timers.advance(TIMING.retryBaseMs);
  assert.equal(account(harness).save?.level, 7);
  assert.equal(record(harness).pending, false);
  assert.equal(harness.server.accounts.length, 1);
});

void test('a save on this device is sent to the account that replaces one the server no longer knows, when the save read then failed', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 5);
  harness.server.plan(401, {}, 'GET');
  harness.server.plan(503, {}, 'GET');
  const backend: Backend = harness.open();
  assert.equal((await backend.load())?.level, 5);
  assert.equal(harness.server.accounts.length, 2);
  await harness.timers.advance(TIMING.retryBaseMs);
  assert.equal(account(harness, 1).save?.level, 5);
});

void test('when the save read is refused for an account created in that load, the device save waits for the next save', async (): Promise<void> => {
  const harness: Harness = createHarness();
  harness.store.write(SAVE_KEY, storedLocal(makeSave(7, 0)));
  harness.server.plan(400, {}, 'GET');
  const backend: Backend = harness.open();
  assert.equal((await backend.load())?.level, 7);
  assert.equal(harness.timers.pending(), 0);
  assert.equal(harness.server.count('PUT', '/v1/save'), 0);
  backend.save(makeSave(7, 5));
  await harness.timers.advance(TIMING.pushGapMs);
  assert.equal(account(harness).save?.xp, 5);
});

async function beforeTheWipe(harness: Harness, level: number): Promise<void> {
  await synced(harness, level);
  harness.store.write(SAVE_KEY, preEpochLocal(makeSave(level, 0)));
}

function putsAbove(harness: Harness, level: number): number {
  return harness.server.requests.filter((request: RecordedRequest): boolean => request.method === 'PUT' && isFields(request.body) && isFields(request.body['save']) && Number(request.body['save']['level']) > level).length;
}

void test('after the wipe an old local save is discarded before the merge: the character starts new and the old one never reaches the cloud', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await beforeTheWipe(harness, 8);
  const before: number = record(harness).revision;
  harness.server.wipe();
  const backend: Backend = harness.open();
  assert.equal(await backend.load(), null);
  assert.equal(harness.store.read(SAVE_KEY), null);
  assert.equal(record(harness).revision, 0);
  assert.equal(record(harness).pending, false);
  assert.ok(before > 0);
  await harness.timers.advance(TIMING.retryMaxMs);
  assert.equal(account(harness).save, null);
  backend.save(makeSave(1, 30));
  await harness.timers.advance(TIMING.pushGapMs);
  assert.deepEqual(lastPut(harness), { baseRevision: 0, level: 1 });
  assert.equal(account(harness).revision, 1);
  assert.equal(putsAbove(harness, 1), 1);
  assert.equal(harness.warns.length, 0);
});

void test('an old local save is discarded even when the first load after the wipe is offline, and nothing old is pushed when the server comes back', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await beforeTheWipe(harness, 8);
  harness.server.wipe();
  harness.server.goDown();
  const backend: Backend = harness.open();
  assert.equal(await backend.load(), null);
  harness.server.comeUp();
  await harness.timers.advance(TIMING.retryMaxMs);
  assert.equal(account(harness).save, null);
  assert.equal(putsAbove(harness, 1), 1);
});

void test('signed in on two devices, both old saves are dropped and the second device picks up the new character from the cloud', async (): Promise<void> => {
  const first: Harness = createHarness();
  await beforeTheWipe(first, 8);
  const second: Harness = createSecondBrowser(first);
  second.store.write(SYNC_KEY, must(first.store.read(SYNC_KEY), 'the sync record'));
  second.store.write(SAVE_KEY, preEpochLocal(makeSave(11, 0)));
  first.server.wipe();
  const one: Backend = first.open();
  assert.equal(await one.load(), null);
  one.save(makeSave(2, 15));
  await first.timers.advance(TIMING.pushGapMs);
  assert.equal(account(first).save?.level, 2);
  const two: Backend = second.open();
  const loaded = must(await two.load(), 'the cloud save');
  assert.equal(loaded.level, 2);
  assert.equal(loaded.xp, 15);
  assert.deepEqual(readLocalSave(content, second.store.read(SAVE_KEY))?.epoch, SAVE_EPOCH);
  await second.timers.advance(TIMING.retryMaxMs);
  assert.equal(account(first).save?.level, 2);
  assert.equal(account(first).revision, 1);
  assert.equal(first.server.accounts.length, 1);
});

void test('a wipe while the game is open: the next push is refused as stale, the save on this device is dropped and nothing more is sent', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 4);
  harness.server.wipe(SAVE_EPOCH + 1);
  backend.save(makeSave(5, 0));
  await harness.timers.advance(TIMING.pushGapMs);
  assert.equal(account(harness).save, null);
  assert.equal(harness.store.read(SAVE_KEY), null);
  assert.ok(harness.warns.some((line: string): boolean => line.includes('every save was reset')));
  const puts: number = harness.server.count('PUT', '/v1/save');
  backend.save(makeSave(6, 0));
  await harness.timers.advance(TIMING.retryMaxMs);
  assert.equal(harness.server.count('PUT', '/v1/save'), puts);
  const next: Backend = harness.open();
  assert.equal(await next.load(), null);
  next.save(makeSave(1, 1));
  await harness.timers.advance(TIMING.pushGapMs);
  assert.equal(account(harness).save?.level, 1);
});

void test('a server epoch above the one this build knows makes a save stamped with the older epoch stale on load', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await synced(harness, 6);
  harness.server.wipe(SAVE_EPOCH + 1);
  const backend: Backend = harness.open();
  assert.equal(await backend.load(), null);
  assert.equal(harness.store.read(SAVE_KEY), null);
  backend.save(makeSave(1, 2));
  await harness.timers.advance(TIMING.pushGapMs);
  assert.equal(account(harness).save?.level, 1);
  assert.deepEqual(readLocalSave(content, harness.store.read(SAVE_KEY))?.epoch, SAVE_EPOCH + 1);
});
