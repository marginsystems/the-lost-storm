import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeServer, createMemoryStore, makeSave } from '../../test/backend-support.ts';
import type { FakeServer } from '../../test/backend-support.ts';
import type { FetchFn } from './api.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';
import { createTracesClient, readEchoes, readMarks, readTally, readTimelines, TRACES } from './traces-api.ts';
import type { EchoPoint, TracesClient } from './traces-api.ts';

const SERVER: string = 'http://localhost:8787';
const offline: FetchFn = (): Promise<Response> => Promise.reject(new Error('offline'));
const nonsense: FetchFn = (): Promise<Response> => Promise.resolve(new Response('<html>', { status: 200 }));
const failing: FetchFn = (): Promise<Response> => Promise.resolve(new Response('{}', { status: 503 }));
const WALK: readonly EchoPoint[] = [
  [80, 80, 1.5],
  [81, 80, 1.5],
  [82, 80.5, 1.4],
  [83, 81, 1.3],
];

function signedIn(token: string, accountId: string): ReturnType<typeof createMemoryStore> {
  const store = createMemoryStore();
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl: SERVER, accountId, token, revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  return store;
}

async function guests(fake: FakeServer, count: number): Promise<readonly TracesClient[]> {
  const clients: TracesClient[] = [];
  for (let index: number = 1; index <= count; index += 1) {
    clients.push(createTracesClient({ serverUrl: SERVER, store: signedIn(`token-${index}`, `account-${index}`), fetch: fake.fetch }));
  }
  await Promise.all(clients.map((): Promise<Response> => fake.fetch(`${SERVER}/v1/guest`, { method: 'POST' })));
  return clients;
}

void test('echoes are read with only a name and points, and anything else is dropped or refused', (): void => {
  assert.deepEqual(readEchoes({ echoes: [{ name: 'Wren', points: WALK, accountId: 'secret' }] }), [{ name: 'Wren', points: WALK }]);
  assert.deepEqual(readEchoes({ echoes: [{ name: null, points: WALK }] }), [{ name: null, points: WALK }]);
  const broken: readonly unknown[] = [
    null,
    { echoes: 'no' },
    { echoes: [{ name: '', points: WALK }] },
    { echoes: [{ name: 'x'.repeat(TRACES.nameChars + 1), points: WALK }] },
    { echoes: [{ name: 'Wren', points: WALK.slice(0, 2) }] },
    { echoes: [{ name: 'Wren', points: [...WALK, [1, 2]] }] },
    { echoes: [{ name: 'Wren', points: [...WALK, [1, 2, 9]] }] },
    { echoes: [{ name: 'Wren', points: [...WALK, [Number.MAX_VALUE, 2, 0]] }] },
  ];
  for (const value of broken) assert.equal(readEchoes(value), null, JSON.stringify(value));
});

void test('lists longer than the caps are cut on the client too', (): void => {
  const many: unknown[] = Array.from({ length: TRACES.echoes + 4 }, (): unknown => ({ name: null, points: Array.from({ length: TRACES.echoPoints + 9 }, (): EchoPoint => [1, 1, 0]) }));
  const read = readEchoes({ echoes: many });
  assert.ok(read !== null);
  assert.equal(read.length, TRACES.echoes);
  assert.equal(read[0]?.points.length, TRACES.echoPoints);
});

void test('marks, tallies and timelines have strict readers', (): void => {
  assert.deepEqual(readMarks({ marks: [{ x: 1, z: 2, words: ['do_not'] }], yours: null }), { marks: [{ x: 1, z: 2, words: ['do_not'] }], yours: null });
  assert.equal(readMarks({ marks: [{ x: 1, z: 2, words: ['Free Text'] }], yours: null }), null);
  assert.equal(readMarks({ marks: [{ x: 1, z: 2, words: ['a', 'b', 'c', 'd'] }], yours: null }), null);
  assert.equal(readMarks({ marks: [], yours: 'mine' }), null);
  assert.deepEqual(readTally({ count: 3, others: 2 }), { count: 3, others: 2 });
  assert.equal(readTally({ count: 1, others: 2 }), null);
  assert.equal(readTally({ count: -1, others: 0 }), null);
  const run = { name: 'Wren', level: 4, furthest: 'The Still', furthestZone: 'the_still', playedMinutes: 37, choices: { first_choice: 'took_journal' }, path: [['between', 80, 80]] };
  assert.deepEqual(readTimelines({ runs: [{ ...run, email: 'x@y.z' }] }), [run]);
  assert.equal(readTimelines({ runs: [{ ...run, choices: { 'Bad Key': 'x' } }] }), null);
  assert.equal(readTimelines({ runs: [{ ...run, path: [['Between ', 1, 1]] }] }), null);
  assert.equal(readTimelines({ runs: [{ ...run, level: 0 }] }), null);
});

void test('the fake server answers the traces routes the way the real server does', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const [maker, other] = await guests(fake, 2);
  assert.ok(maker !== undefined && other !== undefined);
  assert.equal(await maker.leaveEcho('between', WALK), true);
  assert.deepEqual(await maker.echoes('between'), []);
  assert.deepEqual(await other.echoes('between'), [{ name: null, points: WALK }]);
  assert.equal(await maker.leaveEcho('between', [[0, 0, 0], [50, 50, 0], [0, 0, 0], [50, 50, 0]]), false);
  assert.equal(await other.echoes('nowhere'), null);
  assert.deepEqual(await maker.leaveMark('between', 81.27, 79, ['do_not', 'the_light']), { x: 81.3, z: 79, words: ['do_not', 'the_light'] });
  assert.equal(await maker.leaveMark('between', 1, 1, ['not_a_word']), null);
  assert.deepEqual(await other.marks('between'), { marks: [{ x: 81.3, z: 79, words: ['do_not', 'the_light'] }], yours: null });
  assert.deepEqual(await maker.marks('between'), { marks: [], yours: { x: 81.3, z: 79, words: ['do_not', 'the_light'] } });
  assert.deepEqual(await maker.countJournal(), { count: 1, others: 0 });
  assert.deepEqual(await maker.countJournal(), { count: 1, others: 0 });
  assert.deepEqual(await other.countJournal(), { count: 2, others: 1 });
  const account = fake.accounts[0];
  assert.ok(account !== undefined);
  fake.plant(account, makeSave(3, 10));
  const runs = await other.timelines();
  assert.ok(runs !== null);
  assert.deepEqual(
    runs.map((run) => [run.level, run.path]),
    [[3, [['between', 80, 80]]]],
  );
  assert.deepEqual(await maker.timelines(), []);
});

void test('without a token reads still work and writes make no request', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const client: TracesClient = createTracesClient({ serverUrl: SERVER, store: createMemoryStore(), fetch: fake.fetch });
  assert.equal(client.signedIn(), false);
  assert.deepEqual(await client.echoes('between'), []);
  assert.equal(fake.requests.at(-1)?.token, null);
  const before: number = fake.requests.length;
  assert.equal(await client.leaveEcho('between', WALK), false);
  assert.equal(await client.leaveMark('between', 1, 1, ['do_not']), null);
  assert.equal(await client.countJournal(), null);
  assert.equal(fake.requests.length, before);
});

void test('an unreachable server, a failure or a bad answer is silent: every call comes back empty', async (): Promise<void> => {
  const client: TracesClient = createTracesClient({ serverUrl: SERVER, store: signedIn('token-1', 'account-1'), fetch: offline });
  assert.equal(await client.echoes('between'), null);
  assert.equal(await client.leaveEcho('between', WALK), false);
  assert.equal(await client.marks('between'), null);
  assert.equal(await client.countJournal(), null);
  assert.equal(await client.timelines(), null);
  const confused: TracesClient = createTracesClient({ serverUrl: SERVER, store: signedIn('token-1', 'account-1'), fetch: nonsense });
  assert.equal(await confused.echoes('between'), null);
  assert.equal(await confused.timelines(), null);
  assert.equal(await createTracesClient({ serverUrl: SERVER, store: signedIn('token-1', 'account-1'), fetch: failing }).marks('between'), null);
});

void test('a zone id that is not a plain id is never put in a URL', async (): Promise<void> => {
  const fake: FakeServer = createFakeServer(createFakeClock());
  const client: TracesClient = createTracesClient({ serverUrl: SERVER, store: createMemoryStore(), fetch: fake.fetch });
  assert.equal(await client.echoes('../save'), null);
  assert.equal(await client.marks('a b'), null);
  assert.equal(fake.requests.length, 0);
});
