import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createHarness, makeSave } from '../../test/backend-support.ts';
import type { Harness, RecordedRequest } from '../../test/backend-support.ts';
import { isFields } from '../../sim/content/read.ts';
import { generateItem } from '../../sim/items.ts';
import { createRng } from '../../sim/rng.ts';
import type { SaveData } from '../../sim/save.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import { must } from '../../test/support.ts';
import type { FetchFn } from './api.ts';
import type { Backend } from './backend.ts';
import { createBackend } from './create.ts';
import { readStashRecord, STASH_KEY } from './shared-stash.ts';

const URL_A: string = 'http://localhost:8787';
const QUIET = { info: (): void => undefined, warn: (): void => undefined };

interface SharedLogin {
  items: unknown;
  revision: number;
  refused: number;
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

function stashing(items: readonly (ItemInstance | null)[]): SaveData {
  const save: SaveData = makeSave(2, 0);
  return { ...save, stash: save.stash.map((entry: ItemInstance | null, index: number): ItemInstance | null => items[index] ?? entry) };
}

function sharing(harness: Harness, items: readonly (ItemInstance | null)[], revision: number): SharedLogin {
  const login: SharedLogin = {
    items,
    revision,
    refused: 0,
    fetch: async (url: string, init: RequestInit): Promise<Response> => {
      const method: string = init.method ?? 'GET';
      const sent: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      if (new URL(url).pathname === '/v1/save' && method === 'PUT' && isFields(sent) && 'stashRevision' in sent && sent['stashRevision'] !== login.revision) {
        login.refused += 1;
        const conflict: string = JSON.stringify({ error: { code: 'stash_conflict', message: 'moved on' }, stash: { items: login.items, revision: login.revision } });
        return new Response(conflict, { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      const answer: Response = await harness.server.fetch(url, init);
      if (new URL(url).pathname !== '/v1/save' || answer.status !== 200) return answer;
      const body: unknown = await answer.json();
      assert.ok(isFields(body));
      const extra: Record<string, unknown> = {};
      if (method === 'GET') extra['stash'] = { items: login.items, revision: login.revision };
      if (method === 'PUT' && isFields(sent) && 'stashRevision' in sent && isFields(sent['save'])) {
        login.items = sent['save']['stash'];
        login.revision += 1;
        extra['stashRevision'] = login.revision;
      }
      return new Response(JSON.stringify({ ...body, ...extra }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  return login;
}

function open(harness: Harness, fetch: FetchFn): Backend {
  return createBackend(content, URL_A, { fetch, store: harness.store, clock: harness.clock.read, timers: harness.timers.timers, log: QUIET, characterKeys: [] });
}

function uids(items: unknown): readonly unknown[] {
  if (!Array.isArray(items)) return [];
  const list: readonly unknown[] = items;
  return list.flatMap((item: unknown): unknown[] => (isFields(item) ? [item['uid']] : []));
}

function lastPut(harness: Harness): Readonly<Record<string, unknown>> {
  const request: RecordedRequest = must(harness.server.requests.findLast((entry: RecordedRequest): boolean => entry.method === 'PUT'), 'a PUT');
  assert.ok(isFields(request.body));
  return request.body;
}

void test('a character with no save is laid the login stash, and its save sends the stash back for every character', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const login: SharedLogin = sharing(harness, [gear(5)], 3);
  const backend: Backend = open(harness, login.fetch);
  assert.equal(await backend.load(), null);
  assert.deepEqual(uids(backend.stash()), [5]);
  backend.save(stashing([gear(6)]));
  await harness.timers.advance(1000);
  assert.equal(lastPut(harness)['stashRevision'], 3);
  assert.deepEqual(uids(login.items), [6]);
  assert.equal(readStashRecord(content, harness.store.read(STASH_KEY))?.revision, 4);
});

void test('stash changes made while the cloud was away are kept when the cloud still has the stash they came from', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const login: SharedLogin = sharing(harness, [gear(5)], 3);
  const first: Backend = open(harness, login.fetch);
  await first.load();
  harness.server.goDown();
  first.save(stashing([gear(7)]));
  first.close();
  harness.server.comeUp();
  const next: Backend = open(harness, login.fetch);
  await next.load();
  assert.deepEqual(uids(next.stash()), [7]);
  await harness.timers.advance(1000);
  assert.deepEqual(uids(login.items), [7]);
});

void test('the stash another device left on the login wins over the copy on this device', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const login: SharedLogin = sharing(harness, [gear(5)], 3);
  const first: Backend = open(harness, login.fetch);
  await first.load();
  first.save(stashing([gear(6)]));
  await harness.timers.advance(1000);
  first.close();
  login.items = [gear(9)];
  login.revision += 1;
  const next: Backend = open(harness, login.fetch);
  await next.load();
  assert.deepEqual(uids(next.stash()), [9]);
});

void test('a save from a stash another window has moved on from stops saving, and the reload takes the newer stash and keeps the character as it was saved', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const login: SharedLogin = sharing(harness, [gear(5)], 3);
  const first: Backend = open(harness, login.fetch);
  await first.load();
  login.items = [gear(9)];
  login.revision += 1;
  first.save({ ...stashing([gear(6)]), gold: 321 });
  await harness.timers.advance(1000);
  assert.equal(login.refused, 1);
  assert.deepEqual(uids(readStashRecord(content, harness.store.read(STASH_KEY))?.items), [9]);
  first.save({ ...stashing([gear(6)]), gold: 322 });
  await harness.timers.advance(60_000);
  assert.equal(login.refused, 1);
  assert.deepEqual(uids(readStashRecord(content, harness.store.read(STASH_KEY))?.items), [9]);
  first.close();
  const next: Backend = open(harness, login.fetch);
  assert.equal((await next.load())?.gold, 321);
  assert.deepEqual(uids(next.stash()), [9]);
  await harness.timers.advance(1000);
  assert.equal(lastPut(harness)['stashRevision'], 4);
});

void test('away from the cloud the stash this device agreed with the login is used', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const login: SharedLogin = sharing(harness, [gear(5)], 3);
  const first: Backend = open(harness, login.fetch);
  await first.load();
  first.close();
  harness.server.goDown();
  const away: Backend = open(harness, login.fetch);
  await away.load();
  assert.deepEqual(uids(away.stash()), [5]);
});

void test('a server with no shared stash leaves each character its own stash and is never sent a stash revision', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = open(harness, harness.server.fetch);
  await backend.load();
  assert.equal(backend.stash(), null);
  backend.save(stashing([gear(6)]));
  await harness.timers.advance(1000);
  assert.equal('stashRevision' in lastPut(harness), false);
});
