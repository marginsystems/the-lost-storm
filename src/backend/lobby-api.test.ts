import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeServer } from '../../test/backend-support.ts';
import type { FakeServer } from '../../test/backend-support.ts';
import type { Leaderboard, LeaderboardResult, NameResult } from './api.ts';
import { RANKINGS } from './api.ts';
import { createLobbyApi, LOBBY_LIMITS, rankingPath, readLeaderboard } from './lobby-api.ts';

const URL_A: string = 'http://localhost:8787';
const ROW: Readonly<Record<string, unknown>> = { rank: 1, name: 'Grey Heron', level: 7, damage: 1234, life: 410, furthest: 'The Shallows', online: true, account: 'heron' };
const BOARD: Readonly<Record<string, unknown>> = {
  top: [ROW, { rank: 2, name: 'Ashen Wolf', level: 5, furthest: 'The Shallows', online: false }],
  you: { ...ROW, chosen: true },
  online: 3,
  characters: 40,
  levelUps: [{ name: 'Grey Heron', level: 7, minutesAgo: 2 }],
};

function server(): FakeServer {
  return createFakeServer(createFakeClock());
}

void test('a well-formed answer reads into a leaderboard and keeps only the known fields', (): void => {
  const board: Leaderboard | null = readLeaderboard({ ...BOARD, top: [{ ...ROW, accountId: 'secret' }], extra: 1 });
  assert.ok(board !== null);
  assert.deepEqual(board.top, [ROW]);
  assert.deepEqual(board.you, { ...ROW, chosen: true });
  assert.equal(board.online, 3);
  assert.equal(board.characters, 40);
  assert.deepEqual(board.levelUps, [{ name: 'Grey Heron', level: 7, minutesAgo: 2 }]);
  assert.equal(readLeaderboard({ ...BOARD, you: null })?.you, null);
});

void test('a row carries the username of the account that plays it, and an older server without one reads as no username', (): void => {
  const owned: Leaderboard | null = readLeaderboard({ ...BOARD, top: [{ ...ROW, account: 'marginsystems' }] });
  assert.equal(owned?.top[0]?.account, 'marginsystems');
  const older: Record<string, unknown> = { rank: ROW.rank, name: ROW.name, level: ROW.level, furthest: ROW.furthest, online: ROW.online };
  assert.equal(readLeaderboard({ ...BOARD, top: [older] })?.top[0]?.account, null);
  assert.equal(readLeaderboard({ ...BOARD, top: [{ ...ROW, account: 7 }] })?.top[0]?.account, null);
});

void test('an older server without rankings reads as the level board with no figures', (): void => {
  const older: Record<string, unknown> = { rank: ROW.rank, name: ROW.name, level: ROW.level, furthest: ROW.furthest, online: ROW.online };
  const board: Leaderboard | null = readLeaderboard({ ...BOARD, top: [older] });
  assert.ok(board !== null);
  assert.equal(board.by, 'level');
  assert.deepEqual([board.top[0]?.damage, board.top[0]?.life], [0, 0]);
  assert.deepEqual([readLeaderboard({ ...BOARD, by: 'damage' })?.by, readLeaderboard({ ...BOARD, by: 'life' })?.by, readLeaderboard({ ...BOARD, by: 'gold' })?.by], ['damage', 'life', 'level']);
  assert.equal(readLeaderboard({ ...BOARD, top: [{ ...ROW, damage: -3, life: 1.5 }] })?.top[0]?.damage, 0);
});

void test('each ranking asks its own path, and the level board keeps the path older servers know', async (): Promise<void> => {
  const fake: FakeServer = server();
  const api = createLobbyApi(URL_A, fake.fetch);
  const results: readonly LeaderboardResult[] = await Promise.all(RANKINGS.map((by): Promise<LeaderboardResult> => api.leaderboard(null, AbortSignal.timeout(1000), by)));
  assert.deepEqual(results.map((result: LeaderboardResult): string | null => (result.kind === 'ok' ? result.board.by : null)), [...RANKINGS]);
  assert.deepEqual(RANKINGS.map(rankingPath), ['/v1/leaderboard', '/v1/leaderboard?by=damage', '/v1/leaderboard?by=life']);
});

void test('a name that appears twice on the board is kept once, so rows stay one per character', (): void => {
  const board: Leaderboard | null = readLeaderboard({ ...BOARD, top: [ROW, { ...ROW, rank: 2, name: 'grey heron' }, { rank: 3, name: 'Ashen Wolf', level: 5, furthest: 'The Shallows', online: false }] });
  assert.deepEqual(board?.top.map((row): string => row.name), ['Grey Heron', 'Ashen Wolf']);
});

void test('anything malformed is refused whole', (): void => {
  const broken: readonly unknown[] = [
    null,
    [],
    'text',
    { ...BOARD, top: 'nope' },
    { ...BOARD, top: [{ ...ROW, rank: 0 }] },
    { ...BOARD, top: [{ ...ROW, rank: 1.5 }] },
    { ...BOARD, top: [{ ...ROW, name: '' }] },
    { ...BOARD, top: [{ ...ROW, name: 'x'.repeat(LOBBY_LIMITS.nameChars + 1) }] },
    { ...BOARD, top: [{ ...ROW, online: 'yes' }] },
    { ...BOARD, you: { ...ROW } },
    { ...BOARD, you: undefined },
    { ...BOARD, online: -1 },
    { ...BOARD, characters: '40' },
    { ...BOARD, levelUps: [{ name: 'Grey Heron', level: 7 }] },
  ];
  for (const value of broken) assert.equal(readLeaderboard(value), null, JSON.stringify(value));
});

void test('a list longer than the limit is cut, not refused', (): void => {
  const long: unknown[] = Array.from({ length: LOBBY_LIMITS.rows + 5 }, (_: unknown, index: number): unknown => ({ ...ROW, rank: index + 1, name: `Heron ${index}` }));
  assert.equal(readLeaderboard({ ...BOARD, top: long })?.top.length, LOBBY_LIMITS.rows);
});

void test('the board is read without a token, and with one the caller sees their own line', async (): Promise<void> => {
  const fake: FakeServer = server();
  const api = createLobbyApi(URL_A, fake.fetch);
  const anonymous: LeaderboardResult = await api.leaderboard(null, AbortSignal.timeout(1000));
  assert.deepEqual(anonymous, { kind: 'ok', board: { by: 'level', top: [], you: null, online: 0, characters: 0, levelUps: [] } });
  assert.equal(fake.requests[0]?.token, null);
  await fake.fetch(`${URL_A}/v1/guest`, { method: 'POST' });
  const named: NameResult = await api.rename('token-1', 'Grey Heron', AbortSignal.timeout(1000));
  assert.deepEqual(named, { kind: 'ok', name: 'Grey Heron' });
  const mine: LeaderboardResult = await api.leaderboard('token-1', AbortSignal.timeout(1000));
  assert.ok(mine.kind === 'ok');
  assert.equal(mine.board.you?.name, 'Grey Heron');
  assert.equal(mine.board.you.chosen, true);
});

void test('a refused name comes back with its reason, and other failures as the usual failures', async (): Promise<void> => {
  const fake: FakeServer = server();
  const api = createLobbyApi(URL_A, fake.fetch);
  await fake.fetch(`${URL_A}/v1/guest`, { method: 'POST' });
  await fake.fetch(`${URL_A}/v1/guest`, { method: 'POST' });
  assert.deepEqual(await api.rename('token-1', 'Wren', AbortSignal.timeout(1000)), { kind: 'ok', name: 'Wren' });
  assert.deepEqual(await api.rename('token-2', 'wren', AbortSignal.timeout(1000)), { kind: 'invalid', reason: 'name_taken' });
  assert.deepEqual(await api.rename('token-2', 'Al', AbortSignal.timeout(1000)), { kind: 'invalid', reason: 'name_length' });
  assert.deepEqual(await api.rename('token-2', 'Wr_en', AbortSignal.timeout(1000)), { kind: 'invalid', reason: 'name_characters' });
  assert.deepEqual(await api.rename('token-2', 'Admin', AbortSignal.timeout(1000)), { kind: 'invalid', reason: 'name_blocked' });
  assert.deepEqual(await api.rename('nobody', 'Wren', AbortSignal.timeout(1000)), { kind: 'unauthorized' });
  fake.plan(429, { 'Retry-After': '3' });
  assert.deepEqual(await api.leaderboard(null, AbortSignal.timeout(1000)), { kind: 'retry', afterMs: 3000 });
  fake.plan(429, { 'Retry-After': '3600' });
  assert.deepEqual(await api.rename('token-2', 'Moth', AbortSignal.timeout(1000)), { kind: 'limited' });
  fake.plan(400);
  assert.deepEqual(await api.rename('token-2', 'Moth', AbortSignal.timeout(1000)), { kind: 'refused', status: 400 });
  fake.goDown();
  assert.deepEqual(await api.leaderboard(null, AbortSignal.timeout(1000)), { kind: 'retry', afterMs: null });
});
