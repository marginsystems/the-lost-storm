import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchLadder, LADDER, readLadder } from './ladder.ts';

const BOARD: unknown = {
  top: [
    { rank: 1, name: 'Grey Heron', level: 7, furthest: 'Somewhere', online: true },
    { rank: 2, name: 'Rook', level: 5, furthest: 'Elsewhere', online: false },
  ],
  you: null,
  online: 4,
  characters: 31,
  levelUps: [],
};

void test('a leaderboard answer is read down to rank, name, level and presence', (): void => {
  assert.deepEqual(readLadder(BOARD), {
    online: 4,
    top: [
      { rank: 1, name: 'Grey Heron', level: 7, online: true },
      { rank: 2, name: 'Rook', level: 5, online: false },
    ],
  });
});

void test('an empty ladder still carries the online count', (): void => {
  assert.deepEqual(readLadder({ top: [], online: 0 }), { top: [], online: 0 });
});

void test('only the first rows the page shows are read', (): void => {
  const top: unknown[] = Array.from({ length: LADDER.rows + 5 }, (_: unknown, index: number): unknown => ({ rank: index + 1, name: `Hero ${index}`, level: 3, online: false }));
  assert.equal(readLadder({ top, online: 1 })?.top.length, LADDER.rows);
});

void test('a malformed answer is refused whole', (): void => {
  for (const value of [null, [], 'x', { top: [], online: -1 }, { top: {}, online: 1 }, { online: 1 }, { top: [{ rank: 0, name: 'A', level: 1, online: true }], online: 1 }, { top: [{ rank: 1, name: '', level: 1, online: true }], online: 1 }, { top: [{ rank: 1, name: 'A', level: 1, online: 'yes' }], online: 1 }, { top: [{ rank: 1, name: 'A'.repeat(LADDER.nameChars + 1), level: 1, online: true }], online: 1 }]) {
    assert.equal(readLadder(value), null, JSON.stringify(value));
  }
});

void test('the ladder is fetched from the server and any failure reads as no ladder', async (): Promise<void> => {
  const urls: string[] = [];
  const ok = (url: string): Promise<Response> => {
    urls.push(url);
    return Promise.resolve(new Response(JSON.stringify(BOARD), { status: 200 }));
  };
  assert.equal((await fetchLadder('https://example.com', ok))?.online, 4);
  assert.deepEqual(urls, ['https://example.com/v1/leaderboard']);
  assert.equal(await fetchLadder('https://example.com', (): Promise<Response> => Promise.resolve(new Response('{}', { status: 503 }))), null);
  assert.equal(await fetchLadder('https://example.com', (): Promise<Response> => Promise.resolve(new Response('not json', { status: 200 }))), null);
  assert.equal(await fetchLadder('https://example.com', (): Promise<Response> => Promise.reject(new Error('offline'))), null);
});
