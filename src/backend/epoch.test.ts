import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFields } from '../../sim/content/read.ts';
import { content, createHarness, createSecondBrowser, makeSave, preEpochLocal } from '../../test/backend-support.ts';
import type { Harness, RecordedRequest, ServerAccount } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { Backend } from './backend.ts';
import { createEpochs, LEGACY_EPOCH, SAVE_EPOCH } from './epoch.ts';
import { readLocalSave, SAVE_KEY } from './local.ts';
import { TIMING } from './remote.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

const URL_A: string = 'http://localhost:8787';

function account(harness: Harness): ServerAccount {
  return must(harness.server.accounts[0], 'the server account');
}

function record(harness: Harness): SyncRecord {
  return must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the sync record');
}

function lastPut(harness: Harness): { readonly baseRevision: unknown; readonly level: unknown } {
  const request: RecordedRequest = must(harness.server.requests.findLast((entry: RecordedRequest): boolean => entry.method === 'PUT'), 'a PUT');
  assert.ok(isFields(request.body));
  const save: unknown = request.body['save'];
  assert.ok(isFields(save));
  return { baseRevision: request.body['baseRevision'], level: save['level'] };
}

async function synced(harness: Harness, level: number): Promise<Backend> {
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(level, 0));
  await harness.timers.advance(TIMING.pushGapMs);
  return backend;
}

void test('the epoch starts at the build minimum and only ever rises', (): void => {
  const epochs = createEpochs(SAVE_EPOCH);
  assert.ok(SAVE_EPOCH > LEGACY_EPOCH);
  assert.equal(epochs.current(), SAVE_EPOCH);
  assert.equal(epochs.raise(SAVE_EPOCH - 1), false);
  assert.equal(epochs.raise(SAVE_EPOCH + 2), true);
  assert.equal(epochs.current(), SAVE_EPOCH + 2);
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
  assert.equal(backend.freshStart(), true);
  backend.save(makeSave(1, 2));
  await harness.timers.advance(TIMING.pushGapMs);
  assert.equal(account(harness).save?.level, 1);
  assert.deepEqual(readLocalSave(content, harness.store.read(SAVE_KEY))?.epoch, SAVE_EPOCH + 1);
});

void test('a character made after Start over with the cloud out of reach is kept and sent again when the epoch moved on meanwhile', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 4);
  harness.server.goDown();
  await backend.reset();
  harness.server.wipe(SAVE_EPOCH + 1);
  backend.save(makeSave(2, 7));
  harness.server.comeUp();
  await harness.timers.advance(TIMING.retryMaxMs);
  await harness.timers.advance(0);
  await harness.timers.advance(0);
  await harness.timers.advance(0);
  assert.deepEqual(harness.server.requests.filter((request: RecordedRequest): boolean => request.method === 'PUT').map((request: RecordedRequest): unknown => (isFields(request.body) ? request.body['epoch'] : null)).slice(-2), [SAVE_EPOCH, SAVE_EPOCH + 1]);
  assert.deepEqual([account(harness).save?.level, account(harness).save?.xp], [2, 7]);
  assert.deepEqual(readLocalSave(content, harness.store.read(SAVE_KEY))?.epoch, SAVE_EPOCH + 1);
  assert.ok(!harness.warns.some((line: string): boolean => line.includes('every save was reset')));
});

async function startOverOffline(harness: Harness): Promise<void> {
  const first: Backend = await synced(harness, 4);
  harness.server.goDown();
  await first.reset();
  first.save(makeSave(3, 1));
  harness.server.wipe(SAVE_EPOCH + 1);
}

void test('a Start over that never reached the cloud keeps its new character on the next load, online or still offline, after the epoch moved on', async (): Promise<void> => {
  const online: Harness = createHarness();
  const offline: Harness = createHarness();
  await Promise.all([online, offline].map(startOverOffline));
  online.server.comeUp();
  const fromOnline: Backend = online.open();
  const fromOffline: Backend = offline.open();
  assert.deepEqual([(await fromOnline.load())?.level, (await fromOffline.load())?.level], [3, 3]);
  offline.server.comeUp();
  fromOffline.save(makeSave(3, 2));
  await offline.timers.advance(TIMING.retryMaxMs);
  await offline.timers.advance(0);
  await offline.timers.advance(0);
  for (const harness of [online, offline]) {
    assert.equal(account(harness).save?.level, 3);
    assert.deepEqual(readLocalSave(content, harness.store.read(SAVE_KEY))?.epoch, SAVE_EPOCH + 1);
    assert.ok(!harness.warns.some((line: string): boolean => line.includes('every save was reset')));
  }
  assert.equal(record(online).overwriteCloud, false);
});

void test('after a stale retry a Start over made before the wipe does not overwrite a character another device saved under the new epoch', async (): Promise<void> => {
  const first: Harness = createHarness();
  const backend: Backend = await synced(first, 4);
  const second: Harness = createSecondBrowser(first);
  second.store.write(SYNC_KEY, must(first.store.read(SYNC_KEY), 'the sync record'));
  first.server.goDown();
  await backend.reset();
  backend.save(makeSave(2, 0));
  await first.timers.advance(TIMING.pushGapMs);
  first.server.wipe(SAVE_EPOCH + 1);
  first.server.comeUp();
  const other: Backend = second.open();
  assert.equal(await other.load(), null);
  other.save(makeSave(9, 40));
  await second.timers.advance(TIMING.pushGapMs);
  assert.equal(account(first).revision, 1);
  await first.timers.advance(TIMING.retryMaxMs);
  await first.timers.advance(0);
  await first.timers.advance(0);
  await first.timers.advance(0);
  assert.deepEqual([account(first).save?.level, account(first).save?.xp], [9, 40]);
  assert.ok(first.warns.some((line: string): boolean => line.includes('keeping the cloud save')));
  assert.equal(lastPut(first).baseRevision, 0);
});

void test('a player with nothing saved anywhere is not told about a fresh start', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  assert.equal(await backend.load(), null);
  assert.equal(backend.freshStart(), false);
});
