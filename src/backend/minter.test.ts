import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createFakeClock, createFakeServer, createFakeTimers, createMemoryStore, settle } from '../../test/backend-support.ts';
import type { FakeClock, FakeServer, FakeTimers } from '../../test/backend-support.ts';
import { FAKE_TICKETS } from '../../test/fake-ledger.ts';
import { must, worldIn } from '../../test/support.ts';
import { makeItem } from '../../sim/world/ledger.ts';
import type { ItemSource } from '../../sim/world/ledger.ts';
import type { ItemInstance, World } from '../../sim/world/types.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { KeyValueStore } from './backend.ts';
import { createLedgerApi } from './ledger-api.ts';
import { createMinter, MINTER } from './minter.ts';
import type { Minter } from './minter.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const SERVER: string = 'http://localhost:8787';
const STARTING_BASE: string = content.player.startingItems[0] ?? '';
const START: ItemSource = { kind: 'start', base: STARTING_BASE };

interface Rig {
  readonly fake: FakeServer;
  readonly clock: FakeClock;
  readonly timers: FakeTimers;
  readonly store: KeyValueStore;
  readonly minter: Minter;
}

async function rig(signedIn: boolean = true): Promise<Rig> {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const fake: FakeServer = createFakeServer(clock);
  const store: KeyValueStore = createMemoryStore();
  if (signedIn) {
    await fake.fetch(`${SERVER}/v1/guest`, { method: 'POST' });
    store.write(SYNC_KEY, serializeSyncRecord({ serverUrl: SERVER, accountId: 'account-1', token: 'token-1', revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  }
  const minter: Minter = createMinter({ serverUrl: SERVER, store, api: createLedgerApi(SERVER, fake.fetch, content), clock: clock.read, timers: timers.timers });
  return { fake, clock, timers, store, minter };
}

function world(): World {
  return worldIn(content, content.world.start, 3);
}

async function pumpTwice(minter: Minter, held: World): Promise<void> {
  minter.pump(held);
  await settle();
  await settle();
  minter.pump(held);
}

void test('the first pump asks for tickets, and the next drop is rolled from one and confirmed with the same item', async (): Promise<void> => {
  const { fake, minter } = await rig();
  const held: World = world();
  await pumpTwice(minter, held);
  assert.equal(held.ledger.tickets.length, FAKE_TICKETS.outstanding);
  const item: ItemInstance = must(makeItem(held, 1, STARTING_BASE, 'common', START), 'item');
  held.player.inventory[0] = item;
  assert.equal(minter.unverified(item), true);
  minter.pump(held);
  assert.equal(minter.unverified(item), false);
  await settle();
  await settle();
  assert.equal(minter.pump(held), true);
  assert.equal(minter.pump(held), false);
  const confirmed = must(held.player.inventory[0], 'confirmed');
  const minted = must(fake.ledger.items[0], 'ledger row');
  assert.equal(confirmed.ledger, minted.id);
  assert.deepEqual({ ...confirmed, ledger: null }, item);
  assert.equal(minter.unverified(confirmed), false);
});

void test('tickets fetched before the world is made mint the starting gear', async (): Promise<void> => {
  const { fake, minter } = await rig();
  const tickets = await minter.prefetch();
  const fresh: World = createWorld(content, { seed: 9, save: null, tickets });
  minter.pump(fresh);
  await settle();
  await settle();
  minter.pump(fresh);
  const worn: ItemInstance[] = Object.values(fresh.player.equipped).filter((item: ItemInstance | null): item is ItemInstance => item !== null);
  const carried: ItemInstance[] = fresh.player.inventory.filter((item: ItemInstance | null): item is ItemInstance => item !== null);
  const starting: ItemInstance[] = [...worn, ...carried];
  assert.ok(starting.length > 0);
  assert.ok(starting.every((item: ItemInstance): boolean => item.ledger !== null));
  assert.equal(fake.ledger.items.length, starting.length);
});

void test('without a sign-in record nothing is asked and drops stay unverified', async (): Promise<void> => {
  const { fake, minter } = await rig(false);
  const held: World = world();
  assert.deepEqual(await minter.prefetch(), []);
  await pumpTwice(minter, held);
  const item: ItemInstance = must(makeItem(held, 1, null, null, START), 'item');
  minter.pump(held);
  assert.equal(fake.requests.length, 0);
  assert.equal(minter.unverified(item), true);
});

void test('a refused mint leaves the item unverified and is never sent again', async (): Promise<void> => {
  const { fake, minter } = await rig();
  const held: World = world();
  await pumpTwice(minter, held);
  const item: ItemInstance = must(makeItem(held, 1, null, null, { kind: 'monster', monster: 'no_such_monster', zone: held.zone.id }), 'item');
  minter.pump(held);
  await settle();
  await settle();
  minter.pump(held);
  assert.equal(minter.unverified(item), true);
  assert.equal(fake.count('POST', '/v1/items/mint'), 1);
});

void test('a mint lost on the network is retried with the same ticket, then given up as unverified', async (): Promise<void> => {
  const { fake, timers, minter } = await rig();
  const held: World = world();
  await pumpTwice(minter, held);
  fake.loseNextAnswer('POST', '/v1/items/mint');
  const kept: ItemInstance = must(makeItem(held, 1, STARTING_BASE, 'common', START), 'kept');
  held.player.inventory[0] = kept;
  minter.pump(held);
  await settle();
  await timers.advance(MINTER.retryMs);
  minter.pump(held);
  assert.equal(fake.count('POST', '/v1/items/mint'), 2);
  assert.equal(fake.ledger.items.length, 1);
  assert.equal(must(held.player.inventory[0], 'kept').ledger, fake.ledger.items[0]?.id);
  fake.goDown();
  const lost: ItemInstance = must(makeItem(held, 1, STARTING_BASE, 'common', START), 'lost');
  minter.pump(held);
  await settle();
  await timers.advance(MINTER.retryMs);
  await timers.advance(MINTER.retryMs * 2);
  assert.equal(minter.unverified(lost), true);
  assert.equal(timers.pending(), 0);
});

void test('the hand is refreshed when it runs low or half its life has passed, never faster than the refill gap', async (): Promise<void> => {
  const { fake, clock, minter } = await rig();
  const held: World = world();
  await pumpTwice(minter, held);
  assert.equal(fake.count('POST', '/v1/items/tickets'), 1);
  for (let index: number = 0; index < FAKE_TICKETS.outstanding - MINTER.lowTickets + 1; index += 1) makeItem(held, 1, null, null, START);
  await pumpTwice(minter, held);
  assert.equal(fake.count('POST', '/v1/items/tickets'), 1);
  clock.now += MINTER.refillGapMs;
  await pumpTwice(minter, held);
  assert.equal(fake.count('POST', '/v1/items/tickets'), 2);
  assert.equal(held.ledger.tickets.length, FAKE_TICKETS.outstanding);
  clock.now += FAKE_TICKETS.lifeMs * MINTER.refreshShare + 1;
  await pumpTwice(minter, held);
  assert.equal(fake.count('POST', '/v1/items/tickets'), 3);
});

void test('a hand that has outlived its life is dropped, so a drop is not rolled from a ticket the server will refuse', async (): Promise<void> => {
  const { fake, clock, minter } = await rig();
  const held: World = world();
  await pumpTwice(minter, held);
  assert.equal(held.ledger.tickets.length, FAKE_TICKETS.outstanding);
  fake.goDown();
  clock.now += FAKE_TICKETS.lifeMs;
  minter.pump(held);
  assert.deepEqual(held.ledger.tickets, []);
  const item: ItemInstance = must(makeItem(held, 1, STARTING_BASE, 'common', START), 'item');
  minter.pump(held);
  assert.equal(minter.unverified(item), true);
  assert.equal(fake.count('POST', '/v1/items/mint'), 0);
});
