import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, makeSave } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import { createApi, readCloudState } from './api.ts';
import type { Api, FetchFn } from './api.ts';

const SIGNAL: AbortSignal = new AbortController().signal;

function api(respond: (url: string, init: RequestInit) => Response | Error): { readonly client: Api; readonly seen: { url: string; init: RequestInit }[] } {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn: FetchFn = (url: string, init: RequestInit): Promise<Response> => {
    seen.push({ url, init });
    const outcome: Response | Error = respond(url, init);
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  };
  return { client: createApi('http://localhost:8787', fetchFn, content), seen };
}

function reply(status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

function sent(seen: readonly Sent[]): Sent {
  return must(seen[0], 'the request');
}

function bodyOf(init: RequestInit): unknown {
  if (typeof init.body !== 'string') return null;
  const parsed: unknown = JSON.parse(init.body);
  return parsed;
}

async function wait(header: string | null): Promise<unknown> {
  const { client } = api((): Response => reply(429, {}, header === null ? {} : { 'Retry-After': header }));
  return client.writeSave('tok', SAVE, 0, SIGNAL);
}

const SAVE = makeSave(3, 12);
const COPY = { save: SAVE, revision: 2, updatedAt: '2026-11-11T10:00:00.000Z' };

void test('a guest account is created with a POST and no token', async (): Promise<void> => {
  const { client, seen } = api((): Response => reply(201, { accountId: 'a', token: 't' }));
  assert.deepEqual(await client.createGuest(SIGNAL), { kind: 'ok', account: { accountId: 'a', token: 't' } });
  assert.equal(sent(seen).url, 'http://localhost:8787/v1/guest');
  assert.equal(sent(seen).init.method, 'POST');
  assert.equal(new Headers(sent(seen).init.headers).get('authorization'), null);
});

void test('reading the save sends the token and understands a copy and an empty account', async (): Promise<void> => {
  const full = api((): Response => reply(200, COPY));
  assert.deepEqual(await full.client.readSave('tok', SIGNAL), { kind: 'ok', state: COPY });
  assert.equal(new Headers(sent(full.seen).init.headers).get('authorization'), 'Bearer tok');
  const empty = api((): Response => reply(200, { save: null, revision: 0, updatedAt: null }));
  assert.deepEqual(await empty.client.readSave('tok', SIGNAL), { kind: 'ok', state: { save: null, revision: 0, updatedAt: null } });
});

void test('writing sends the save and the base revision and returns the stored copy', async (): Promise<void> => {
  const { client, seen } = api((): Response => reply(200, COPY));
  assert.deepEqual(await client.writeSave('tok', SAVE, 1, SIGNAL), { kind: 'ok', copy: COPY });
  assert.equal(sent(seen).init.method, 'PUT');
  assert.deepEqual(bodyOf(sent(seen).init), { save: SAVE, baseRevision: 1 });
  assert.equal(sent(seen).init.keepalive, true);
});

void test('keepalive is only asked for when the body is small enough for the browser to allow it', async (): Promise<void> => {
  const small = api((): Response => reply(200, COPY));
  await small.client.writeSave('tok', SAVE, 1, SIGNAL);
  assert.equal(sent(small.seen).init.keepalive, true);
  const large = api((): Response => reply(200, COPY));
  await large.client.writeSave('tok', { ...SAVE, allocated: Array.from({ length: 8000 }, (_: unknown, index: number): string => `node_${index}`) }, 1, SIGNAL);
  assert.equal(sent(large.seen).init.keepalive, false);
});

void test('a 409 hands back the current copy, read through the game rules', async (): Promise<void> => {
  const { client } = api((): Response => reply(409, { error: { code: 'revision_conflict', message: 'x' }, current: COPY }));
  assert.deepEqual(await client.writeSave('tok', SAVE, 1, SIGNAL), { kind: 'conflict', current: COPY });
  const broken = api((): Response => reply(409, { error: {}, current: { ...COPY, save: { version: 99 } } }));
  assert.deepEqual(await broken.client.writeSave('tok', SAVE, 1, SIGNAL), { kind: 'refused', status: 409 });
});

void test('failures are told apart: unauthorized, refused, and worth retrying', async (): Promise<void> => {
  const answers: readonly [number, unknown][] = [
    [401, { error: {} }],
    [422, { error: {} }],
    [400, { error: {} }],
    [413, { error: {} }],
    [404, { error: {} }],
    [429, { error: {} }],
    [500, { error: {} }],
    [503, 'bad gateway'],
    [408, ''],
  ];
  const kinds: string[] = await Promise.all(
    answers.map(async ([status, body]: readonly [number, unknown]): Promise<string> => {
      const { client } = api((): Response => reply(status, body));
      return (await client.writeSave('tok', SAVE, 0, SIGNAL)).kind;
    }),
  );
  assert.deepEqual(kinds, ['unauthorized', 'refused', 'refused', 'refused', 'refused', 'retry', 'retry', 'retry', 'retry']);
});

void test('Retry-After on a 429 is read in seconds and capped', async (): Promise<void> => {
  assert.deepEqual(await wait('7'), { kind: 'retry', afterMs: 7000 });
  assert.deepEqual(await wait('99999'), { kind: 'retry', afterMs: 120_000 });
  assert.deepEqual(await wait('soon'), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait('0'), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait(''), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait('-3'), { kind: 'retry', afterMs: null });
  assert.deepEqual(await wait(null), { kind: 'retry', afterMs: null });
});

void test('a network error is a retry, and so is a body that cannot be read', async (): Promise<void> => {
  const down = api((): Error => new TypeError('network down'));
  assert.deepEqual(await down.client.readSave('tok', SIGNAL), { kind: 'retry', afterMs: null });
  assert.deepEqual(await down.client.createGuest(SIGNAL), { kind: 'retry', afterMs: null });
  assert.deepEqual(await down.client.writeSave('tok', SAVE, 0, SIGNAL), { kind: 'retry', afterMs: null });
});

void test('a success the client cannot understand is refused, never trusted', async (): Promise<void> => {
  const bodies: readonly unknown[] = [
    'not json',
    [],
    { save: { version: 99 }, revision: 1, updatedAt: '2026-11-11T10:00:00.000Z' },
    { save: SAVE, revision: -1, updatedAt: '2026-11-11T10:00:00.000Z' },
    { save: SAVE, revision: 1.5, updatedAt: '2026-11-11T10:00:00.000Z' },
    { save: SAVE, revision: 1 },
    { revision: 1 },
  ];
  const kinds: string[] = await Promise.all(
    bodies.map(async (body: unknown): Promise<string> => (await api((): Response => reply(200, body)).client.readSave('tok', SIGNAL)).kind),
  );
  assert.deepEqual(kinds, Array.from({ length: bodies.length }, (): string => 'refused'));
  const guest = api((): Response => reply(201, { accountId: 'a' }));
  assert.deepEqual(await guest.client.createGuest(SIGNAL), { kind: 'refused', status: 201 });
  const empty = api((): Response => reply(200, { save: null, revision: 0, updatedAt: null }));
  assert.deepEqual(await empty.client.writeSave('tok', SAVE, 0, SIGNAL), { kind: 'refused', status: 200 });
});

void test('a copy is read through readSave, so the game rules repair what they repair', (): void => {
  const repaired = readCloudState(content, { save: { ...SAVE, level: 100000 }, revision: 2, updatedAt: 'x' });
  assert.equal(repaired?.save?.level, content.player.xp.maxLevel);
});
