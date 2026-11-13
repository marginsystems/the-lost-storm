import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FetchFn } from './api.ts';
import { createHideoutApi, FRIEND_LIMITS, friendResultOf, friendsResultOf, reportResultOf } from './hideout-api.ts';

function answer(status: number, body: unknown): { readonly status: number; readonly retryAfter: null; readonly body: unknown } {
  return { status, retryAfter: null, body };
}

function error(code: string): unknown {
  return { error: { code, message: code } };
}

void test('every report answer is told apart, and a missing route means an old server', (): void => {
  assert.equal(reportResultOf(answer(201, { reported: true })), 'reported');
  assert.equal(reportResultOf(answer(404, error('no_such_line'))), 'gone');
  assert.equal(reportResultOf(answer(404, error('not_found'))), 'unsupported');
  assert.equal(reportResultOf(answer(400, error('own_line'))), 'own');
  assert.equal(reportResultOf(answer(429, error('rate_limited'))), 'slow');
  assert.equal(reportResultOf(answer(500, null)), 'failed');
  assert.equal(reportResultOf(null), 'failed');
});

void test('every friend request answer is told apart', (): void => {
  assert.deepEqual(friendResultOf(answer(200, { state: 'requested' })), { kind: 'ok', state: 'requested' });
  assert.deepEqual(friendResultOf(answer(200, { state: 'friends' })), { kind: 'ok', state: 'friends' });
  assert.deepEqual(friendResultOf(answer(403, error('name_needed'))), { kind: 'refused', reason: 'name_needed' });
  assert.deepEqual(friendResultOf(answer(409, error('friend_limit'))), { kind: 'refused', reason: 'friend_limit' });
  assert.deepEqual(friendResultOf(answer(404, error('no_such_character'))), { kind: 'refused', reason: 'no_such_character' });
  assert.deepEqual(friendResultOf(answer(404, error('not_found'))), { kind: 'unsupported' });
  assert.deepEqual(friendResultOf(answer(200, { state: 'enemies' })), { kind: 'failed' });
  assert.deepEqual(friendResultOf(null), { kind: 'failed' });
  assert.deepEqual(friendResultOf(answer(200, { state: 'none' })), { kind: 'ok', state: 'none' });
  assert.deepEqual(friendResultOf(answer(404, error('no_such_request'))), { kind: 'refused', reason: 'no_such_request' });
});

void test('a report is posted with the token and the line, and a dead network is a failure', async (): Promise<void> => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn: FetchFn = (url: string, init: RequestInit): Promise<Response> => {
    seen.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify({ reported: true }), { status: 201 }));
  };
  const api = createHideoutApi('http://localhost:8787', fetchFn);
  assert.equal(await api.report('tok', 7, 'spam', AbortSignal.timeout(1000)), 'reported');
  const [first] = seen;
  assert.ok(first !== undefined);
  assert.equal(first.url, 'http://localhost:8787/v1/reports');
  assert.equal(first.init.body, JSON.stringify({ line: 7, reason: 'spam' }));
  assert.deepEqual(first.init.headers, { Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
  const down = createHideoutApi('http://localhost:8787', (): Promise<Response> => Promise.reject(new Error('offline')));
  assert.equal(await down.report('tok', 7, 'spam', AbortSignal.timeout(1000)), 'failed');
  assert.deepEqual(await down.befriend('tok', 'Ash', AbortSignal.timeout(1000)), { kind: 'failed' });
});

void test('a friends list is read entry by entry and anything unreadable is left out', (): void => {
  const body: unknown = {
    friends: [{ name: 'Ash', here: true }, { name: 'Elm' }, { name: '', here: false }, 'Oak'],
    incoming: [{ name: 'Fern' }, { name: 7 }],
    outgoing: [],
  };
  assert.deepEqual(friendsResultOf(answer(200, body)), { kind: 'ok', list: { friends: [{ name: 'Ash', here: true }], incoming: ['Fern'], outgoing: [] } });
  assert.deepEqual(friendsResultOf(answer(200, { friends: [], incoming: [] })), { kind: 'failed' });
  assert.deepEqual(friendsResultOf(answer(404, error('not_found'))), { kind: 'unsupported' });
  assert.deepEqual(friendsResultOf(answer(500, null)), { kind: 'failed' });
  assert.deepEqual(friendsResultOf(null), { kind: 'failed' });
  const many: unknown = { friends: Array.from({ length: FRIEND_LIMITS.rows + 5 }, (_: unknown, index: number): unknown => ({ name: `P${String(index)}`, here: false })), incoming: [], outgoing: [] };
  const read = friendsResultOf(answer(200, many));
  assert.ok(read.kind === 'ok');
  assert.equal(read.list.friends.length, FRIEND_LIMITS.rows);
});

void test('the friends routes send the name with the token', async (): Promise<void> => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchFn: FetchFn = (url: string, init: RequestInit): Promise<Response> => {
    seen.push({ url, init });
    const reply: unknown = url.endsWith('/v1/friends') ? { friends: [], incoming: [], outgoing: [] } : { state: url.endsWith('accept') ? 'friends' : 'none' };
    return Promise.resolve(new Response(JSON.stringify(reply), { status: 200 }));
  };
  const api = createHideoutApi('http://localhost:8787', fetchFn);
  assert.deepEqual(await api.friends('tok', AbortSignal.timeout(1000)), { kind: 'ok', list: { friends: [], incoming: [], outgoing: [] } });
  assert.deepEqual(await api.accept('tok', 'Ash', AbortSignal.timeout(1000)), { kind: 'ok', state: 'friends' });
  assert.deepEqual(await api.remove('tok', 'Ash', AbortSignal.timeout(1000)), { kind: 'ok', state: 'none' });
  assert.deepEqual(
    seen.map((call: { url: string; init: RequestInit }): string => `${call.init.method ?? ''} ${call.url} ${typeof call.init.body === 'string' ? call.init.body : ''}`),
    ['GET http://localhost:8787/v1/friends ', 'POST http://localhost:8787/v1/friends/accept {"name":"Ash"}', 'POST http://localhost:8787/v1/friends/remove {"name":"Ash"}'],
  );
});
