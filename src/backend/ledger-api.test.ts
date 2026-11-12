import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createFakeClock, createFakeServer } from '../../test/backend-support.ts';
import type { FakeServer } from '../../test/backend-support.ts';
import type { MintClaim } from '../../sim/world/ledger.ts';
import { must } from '../../test/support.ts';
import type { FetchFn } from './api.ts';
import { createLedgerApi, LEDGER_API, readLedgerItem, readTicketHand } from './ledger-api.ts';

const SERVER: string = 'http://localhost:8787';
const ID: string = 'itm_AAAAAAAAAAAAAAAAAAAAAA';
const offline: FetchFn = (): Promise<Response> => Promise.reject(new Error('offline'));
const failing: FetchFn = (): Promise<Response> => Promise.resolve(new Response('{}', { status: 503 }));
const answering = (code: string): FetchFn => (): Promise<Response> => Promise.resolve(new Response(JSON.stringify({ error: { code, message: code } }), { status: 429 }));
const nonsense: FetchFn = (): Promise<Response> => Promise.resolve(new Response('{"tickets":"many"}', { status: 200 }));

function signal(): AbortSignal {
  return new AbortController().signal;
}

async function guest(fake: FakeServer): Promise<string> {
  await fake.fetch(`${SERVER}/v1/guest`, { method: 'POST' });
  const token: string | undefined = fake.accounts.at(-1)?.token;
  assert.ok(token !== undefined);
  return token;
}

void test('a ticket hand is a list of whole ids and seeds with a lifetime', (): void => {
  assert.deepEqual(readTicketHand({ tickets: [{ id: 1, seed: 5, extra: true }], lifeMs: 900_000 }), { tickets: [{ id: 1, seed: 5 }], lifeMs: 900_000 });
  const bad: readonly unknown[] = [
    null,
    { tickets: [], lifeMs: 0 },
    { tickets: [{ id: 0, seed: 5 }], lifeMs: 1 },
    { tickets: [{ id: 1, seed: -1 }], lifeMs: 1 },
    { tickets: [{ id: 1, seed: 2 ** 32 }], lifeMs: 1 },
    { tickets: [{ id: 1.5, seed: 1 }], lifeMs: 1 },
    { tickets: Array.from({ length: LEDGER_API.maxTickets + 1 }, (_: unknown, index: number) => ({ id: index + 1, seed: 1 })), lifeMs: 1 },
  ];
  for (const value of bad) assert.equal(readTicketHand(value), null);
});

void test('a ledger item is read only with a ledger id and content the game knows', (): void => {
  const base: string = [...content.itemBases.keys()][0] ?? '';
  const affix: string = [...content.affixes.keys()][0] ?? '';
  const good = { id: ID, base, rarity: 'magic', level: 3, affixes: [{ affix, value: 2 }] };
  assert.deepEqual(readLedgerItem(content, good), good);
  const bad: readonly unknown[] = [
    { ...good, id: 'itm_short' },
    { ...good, base: 'no_such_base' },
    { ...good, rarity: 'mythic' },
    { ...good, level: 0 },
    { ...good, level: content.player.xp.maxLevel + 1 },
    { ...good, affixes: [{ affix: 'no_such_affix', value: 1 }] },
    { ...good, affixes: [{ affix, value: Number.NaN }] },
    { ...good, affixes: 'none' },
  ];
  for (const value of bad) assert.equal(readLedgerItem(content, value), null);
});

void test('tickets and a mint go to the server with the token, and the minted item comes back', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const token: string = await guest(fake);
  const api = createLedgerApi(SERVER, fake.fetch, content);
  const hand = await api.tickets(token, signal());
  assert.equal(hand.kind, 'ok');
  const ticket = hand.hand.tickets[0];
  assert.ok(ticket !== undefined);
  const claim: MintClaim = { uid: 4, ticket: ticket.id, source: { kind: 'start', base: content.player.startingItems[0] ?? '' }, level: 1 };
  const minted = await api.mint(token, claim, signal());
  assert.equal(minted.kind, 'minted');
  const request = must(fake.requests.find((entry) => entry.path === LEDGER_API.mintPath), 'mint request');
  assert.deepEqual(request.body, { ticket: ticket.id, source: claim.source, level: 1 });
  assert.equal(request.token, token);
  assert.deepEqual(await api.mint(token, claim, signal()), minted);
});

void test('a refused mint is refused, and a network or server failure is a failure the client may retry', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const token: string = await guest(fake);
  const claim: MintClaim = { uid: 4, ticket: 999, source: { kind: 'start', base: 'x' }, level: 1 };
  assert.deepEqual(await createLedgerApi(SERVER, fake.fetch, content).mint(token, claim, signal()), { kind: 'refused' });
  assert.deepEqual(await createLedgerApi(SERVER, fake.fetch, content).mint('wrong-token', claim, signal()), { kind: 'refused' });
  assert.deepEqual(await createLedgerApi(SERVER, offline, content).mint(token, claim, signal()), { kind: 'failed' });
  assert.deepEqual(await createLedgerApi(SERVER, failing, content).mint(token, claim, signal()), { kind: 'failed' });
  assert.deepEqual(await createLedgerApi(SERVER, failing, content).tickets(token, signal()), { kind: 'failed' });
  assert.deepEqual(await createLedgerApi(SERVER, nonsense, content).tickets(token, signal()), { kind: 'failed' });
  fake.plan(429);
  assert.deepEqual(await createLedgerApi(SERVER, fake.fetch, content).tickets(token, signal()), { kind: 'refused' });
});

void test('a 429 from the general request limit is a failure to retry, while a drop or ticket limit is a refusal', async (): Promise<void> => {
  const claim: MintClaim = { uid: 4, ticket: 1, source: { kind: 'start', base: 'x' }, level: 1 };
  assert.deepEqual(await createLedgerApi(SERVER, answering(LEDGER_API.busyCode), content).mint('token', claim, signal()), { kind: 'failed' });
  assert.deepEqual(await createLedgerApi(SERVER, answering(LEDGER_API.busyCode), content).tickets('token', signal()), { kind: 'failed' });
  assert.deepEqual(await createLedgerApi(SERVER, answering('mint_limit'), content).mint('token', claim, signal()), { kind: 'refused' });
  assert.deepEqual(await createLedgerApi(SERVER, answering('ticket_limit'), content).tickets('token', signal()), { kind: 'refused' });
});
