import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createHarness, makeSave } from '../../test/backend-support.ts';
import type { Harness, RecordedRequest } from '../../test/backend-support.ts';
import { isFields } from '../../sim/content/read.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { SaveData } from '../../sim/save.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { readLocalSave, SAVE_KEY } from './local.ts';
import type { FetchFn } from './api.ts';
import type { Backend } from './backend.ts';
import { createBackend } from './create.ts';
import { readStashRecord, STASH_KEY } from './shared-stash.ts';

const URL_A: string = 'http://localhost:8787';
const QUIET = { info: (): void => undefined, warn: (): void => undefined };

interface Login {
  items: unknown;
  revision: number;
  refused: number;
  losing: boolean;
  hanging: boolean;
  readonly fetch: FetchFn;
}

function gear(uid: number): ItemInstance {
  const base: string | undefined = [...content.itemBases.values()].find((candidate): boolean => candidate.slot !== null)?.id;
  const rarity: string | undefined = content.rarities[0]?.id;
  assert.ok(base !== undefined && rarity !== undefined);
  const item: ItemInstance | null = generateItem(content, createRng(uid), uid, 1, base, rarity);
  assert.ok(item !== null);
  return item;
}

function stashing(items: readonly (ItemInstance | null)[], gold: number): SaveData {
  const save: SaveData = makeSave(2, 0);
  return { ...save, gold, stash: save.stash.map((entry: ItemInstance | null, index: number): ItemInstance | null => items[index] ?? entry) };
}

function answer(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function login(harness: Harness, items: readonly (ItemInstance | null)[], revision: number): Login {
  const shared: Login = {
    items,
    revision,
    refused: 0,
    losing: false,
    hanging: false,
    fetch: async (url: string, init: RequestInit): Promise<Response> => {
      const method: string = init.method ?? 'GET';
      const sent: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      const putting: boolean = new URL(url).pathname === '/v1/save' && method === 'PUT' && isFields(sent) && 'stashRevision' in sent;
      if (putting && isFields(sent) && sent['stashRevision'] !== shared.revision) {
        shared.refused += 1;
        return answer({ error: { code: 'stash_conflict', message: 'moved on' }, stash: { items: shared.items, revision: shared.revision } }, 409);
      }
      const reply: Response = await harness.server.fetch(url, init);
      if (new URL(url).pathname !== '/v1/save' || reply.status !== 200) return reply;
      const body: unknown = await reply.json();
      assert.ok(isFields(body));
      const extra: Record<string, unknown> = {};
      if (method === 'GET') extra['stash'] = { items: shared.items, revision: shared.revision };
      if (putting && isFields(sent) && isFields(sent['save'])) {
        shared.items = sent['save']['stash'];
        shared.revision += 1;
        extra['stashRevision'] = shared.revision;
      }
      if (putting && shared.hanging) {
        shared.hanging = false;
        return new Promise<Response>((): void => undefined);
      }
      if (putting && shared.losing) {
        shared.losing = false;
        throw new TypeError('the answer was lost on the way back');
      }
      return answer({ ...body, ...extra }, 200);
    },
  };
  return shared;
}

function open(harness: Harness, fetch: FetchFn): Backend {
  return createBackend(content, URL_A, { fetch, store: harness.store, clock: harness.clock.read, timers: harness.timers.timers, log: QUIET, characterKeys: [] });
}

async function wait(harness: Harness, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  await harness.timers.advance(1000);
  await wait(harness, seconds - 1);
}

function uids(items: unknown): readonly unknown[] {
  if (!Array.isArray(items)) return [];
  const list: readonly unknown[] = items;
  return list.flatMap((item: unknown): unknown[] => (isFields(item) ? [item['uid']] : []));
}

function goldSent(harness: Harness): unknown {
  const request: RecordedRequest | undefined = harness.server.requests.findLast((entry: RecordedRequest): boolean => entry.method === 'PUT');
  const save: unknown = request !== undefined && isFields(request.body) ? request.body['save'] : null;
  return isFields(save) ? save['gold'] : null;
}

void test('a save that reached the server but lost its answer does not stop saving: the stash the server holds is the one this device sent', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const shared: Login = login(harness, [gear(5)], 3);
  const backend: Backend = open(harness, shared.fetch);
  await backend.load();
  shared.losing = true;
  backend.save(stashing([gear(6)], 100));
  await harness.timers.advance(1000);
  assert.equal(shared.revision, 4);
  assert.equal(readStashRecord(content, harness.store.read(STASH_KEY))?.revision, 3);
  backend.save(stashing([gear(6)], 200));
  await wait(harness, 120);
  assert.equal(shared.refused, 1);
  assert.equal(readStashRecord(content, harness.store.read(STASH_KEY))?.revision, shared.revision);
  assert.equal(goldSent(harness), 200);
  backend.save(stashing([gear(6)], 300));
  assert.equal(readLocalSave(content, harness.store.read(SAVE_KEY))?.save.gold, 300);
  await wait(harness, 120);
  assert.equal(shared.refused, 1);
  assert.equal(goldSent(harness), 300);
});

void test('a stash changed on this device after a save that lost its answer keeps the newer items and still saves', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const shared: Login = login(harness, [gear(5)], 3);
  const backend: Backend = open(harness, shared.fetch);
  await backend.load();
  shared.losing = true;
  backend.save(stashing([gear(6)], 100));
  await harness.timers.advance(1000);
  backend.save(stashing([gear(7)], 200));
  await wait(harness, 120);
  assert.equal(shared.refused, 1);
  const items: unknown = shared.items;
  assert.ok(Array.isArray(items));
  const first: unknown = items[0];
  assert.equal(isFields(first) ? first['uid'] : null, 7);
  assert.equal(readStashRecord(content, harness.store.read(STASH_KEY))?.revision, shared.revision);
});

void test('a reload after a save that lost its answer agrees the stash revision on load, so the next saves go through', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const shared: Login = login(harness, [gear(5)], 3);
  const first: Backend = open(harness, shared.fetch);
  await first.load();
  shared.losing = true;
  first.save(stashing([gear(6)], 100));
  await harness.timers.advance(1000);
  first.close();
  const next: Backend = open(harness, shared.fetch);
  await next.load();
  assert.equal(readStashRecord(content, harness.store.read(STASH_KEY))?.revision, shared.revision);
  next.save(stashing([gear(6)], 400));
  await wait(harness, 120);
  assert.equal(shared.refused, 0);
  assert.equal(goldSent(harness), 400);
});

void test('an item stashed after a save that lost its answer is still in the stash after a reload', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const shared: Login = login(harness, [gear(5)], 3);
  const first: Backend = open(harness, shared.fetch);
  await first.load();
  shared.losing = true;
  first.save(stashing([gear(6)], 100));
  await harness.timers.advance(1000);
  harness.server.goDown();
  first.save(stashing([gear(7)], 200));
  first.close();
  harness.server.comeUp();
  const next: Backend = open(harness, shared.fetch);
  await next.load();
  assert.deepEqual(uids(next.stash()), [7]);
  assert.equal(readStashRecord(content, harness.store.read(STASH_KEY))?.revision, shared.revision);
  next.save(stashing([gear(7)], 300));
  await wait(harness, 120);
  assert.equal(shared.refused, 0);
  assert.deepEqual(uids(shared.items), [7]);
});

void test('a stash another window really changed after a lost answer still wins on reload', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const shared: Login = login(harness, [gear(5)], 3);
  const first: Backend = open(harness, shared.fetch);
  await first.load();
  shared.losing = true;
  first.save(stashing([gear(6)], 100));
  await harness.timers.advance(1000);
  first.close();
  shared.items = [gear(9)];
  shared.revision += 1;
  const next: Backend = open(harness, shared.fetch);
  await next.load();
  assert.deepEqual(uids(next.stash()), [9]);
});

void test('an item stashed while a save is still waiting for its answer is still in the stash when the page closes and reloads', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const shared: Login = login(harness, [gear(5)], 3);
  const first: Backend = open(harness, shared.fetch);
  await first.load();
  shared.hanging = true;
  first.save(stashing([gear(6)], 100));
  await harness.timers.advance(1000);
  assert.equal(shared.revision, 4);
  first.save(stashing([gear(7)], 200));
  first.close();
  const next: Backend = open(harness, shared.fetch);
  await next.load();
  assert.deepEqual(uids(next.stash()), [7]);
  next.save(stashing([gear(7)], 300));
  await wait(harness, 120);
  assert.equal(shared.refused, 0);
  assert.deepEqual(uids(shared.items), [7]);
});
