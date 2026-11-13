import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createMemoryStore } from '../../test/backend-support.ts';
import type { FetchFn } from './api.ts';
import { createAuctionApi } from './auction-api.ts';
import { createAuctionHouse } from './auction.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const SERVER: string = 'http://localhost:8787';

function counting(): { readonly fetch: FetchFn; readonly urls: string[]; readonly tokens: (string | null)[] } {
  const urls: string[] = [];
  const tokens: (string | null)[] = [];
  return {
    urls,
    tokens,
    fetch: (url: string, init: RequestInit): Promise<Response> => {
      urls.push(url);
      tokens.push(new Headers(init.headers).get('authorization'));
      return Promise.resolve(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    },
  };
}

void test('without a saved account the house asks nothing and says a character is needed', async (): Promise<void> => {
  const net = counting();
  const house = createAuctionHouse({ serverUrl: SERVER, store: createMemoryStore(), api: createAuctionApi(SERVER, net.fetch, content) });
  assert.deepEqual(await house.collect(0), { kind: 'refused', code: 'no_character' });
  assert.deepEqual(net.urls, []);
});

void test('the house sends the token this server issued', async (): Promise<void> => {
  const net = counting();
  const store = createMemoryStore();
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl: SERVER, accountId: 'acc', token: 'tok-9', revision: 1, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  const house = createAuctionHouse({ serverUrl: SERVER, store, api: createAuctionApi(SERVER, net.fetch, content) });
  assert.deepEqual(await house.collect(3), { kind: 'ok', value: [] });
  assert.deepEqual(net.tokens, ['Bearer tok-9']);
  const other = createAuctionHouse({ serverUrl: 'http://elsewhere:9000', store, api: createAuctionApi('http://elsewhere:9000', net.fetch, content) });
  assert.deepEqual(await other.collect(3), { kind: 'refused', code: 'no_character' });
  assert.equal(net.urls.length, 1);
});
