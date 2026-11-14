import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../../test/backend-support.ts';
import type { FakeClock, FakeTimers } from '../../test/backend-support.ts';
import type { Leaderboard } from '../backend/api.ts';
import type { LobbyService, RenameOutcome } from '../backend/lobby.ts';
import { createLobbyFeed, FEED_TIMING } from './lobby-feed.ts';
import type { LobbyFeed } from './lobby-feed.ts';

interface Fixture {
  readonly feed: LobbyFeed;
  readonly clock: FakeClock;
  readonly timers: FakeTimers;
  readonly calls: { count: number; answer: Leaderboard | null };
  readonly seen: (readonly [number | null, number | null])[];
}

function board(online: number): Leaderboard {
  return { by: 'level', top: [], you: null, online, characters: 0, levelUps: [] };
}

function setup(): Fixture {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const calls = { count: 0, answer: board(1) as Leaderboard | null };
  const service: LobbyService = {
    read: (): Promise<Leaderboard | null> => {
      calls.count += 1;
      return Promise.resolve(calls.answer);
    },
    rename: (): Promise<RenameOutcome> => Promise.resolve({ kind: 'unavailable' }),
    hasAccount: (): boolean => false,
  };
  const feed: LobbyFeed = createLobbyFeed(service, timers.timers, clock.read);
  const seen: (readonly [number | null, number | null])[] = [];
  feed.subscribe((next: Leaderboard | null, previous: Leaderboard | null): void => {
    seen.push([next?.online ?? null, previous?.online ?? null]);
  });
  return { feed, clock, timers, calls, seen };
}

void test('listeners hear each read with the board before it', async (): Promise<void> => {
  const { feed, calls, seen } = setup();
  await feed.refresh(true);
  calls.answer = board(4);
  await feed.refresh(true);
  assert.deepEqual(seen, [[1, null], [4, 1]]);
  assert.equal(feed.current()?.online, 4);
});

void test('a failed read keeps the last board and still tells listeners', async (): Promise<void> => {
  const { feed, calls, seen } = setup();
  await feed.refresh(true);
  calls.answer = null;
  await feed.refresh(true);
  assert.deepEqual(seen, [[1, null], [null, 1]]);
  assert.equal(feed.current()?.online, 1);
});

void test('a forced refresh during a read runs again once that read is done', async (): Promise<void> => {
  const { feed, calls, seen } = setup();
  const first: Promise<void> = feed.refresh(true);
  calls.answer = board(9);
  const second: Promise<void> = feed.refresh(true);
  const third: Promise<void> = feed.refresh(true);
  await Promise.all([first, second, third]);
  assert.equal(calls.count, 2);
  assert.equal(feed.current()?.online, 9);
  assert.equal(seen.length, 2);
});

void test('a listener that throws does not stop the interval', async (): Promise<void> => {
  const { feed, calls, timers } = setup();
  const unsubscribe: () => void = feed.subscribe((): void => {
    throw new Error('panel broke');
  });
  feed.every(1000);
  await assert.rejects(feed.refresh(true));
  unsubscribe();
  const before: number = calls.count;
  await timers.advance(1000);
  assert.ok(calls.count > before);
});

void test('every listener hears a read even when an earlier one throws', async (): Promise<void> => {
  const { feed, seen } = setup();
  const unsubscribe: () => void = feed.subscribe((): void => {
    throw new Error('panel broke');
  });
  const later: number[] = [];
  feed.subscribe((next: Leaderboard | null): void => {
    later.push(next?.online ?? 0);
  });
  await assert.rejects(feed.refresh(true));
  unsubscribe();
  assert.deepEqual(later, [1]);
  assert.equal(seen.length, 1);
});

void test('a forced refresh queued behind a failing read still reads', async (): Promise<void> => {
  const { feed, calls } = setup();
  let broken: boolean = true;
  feed.subscribe((): void => {
    if (!broken) return;
    broken = false;
    throw new Error('panel broke');
  });
  const first: Promise<void> = feed.refresh(true);
  const second: Promise<void> = feed.refresh(true);
  await assert.rejects(first);
  await second;
  assert.equal(calls.count, 2);
  await feed.refresh(true);
  assert.equal(calls.count, 3);
});

void test('focus refreshes are spaced out, forced ones are not', async (): Promise<void> => {
  const { feed, calls, clock } = setup();
  await feed.refresh(false);
  await feed.refresh(false);
  assert.equal(calls.count, 1);
  await feed.refresh(true);
  assert.equal(calls.count, 2);
  clock.now += FEED_TIMING.minGapMs;
  await feed.refresh(false);
  assert.equal(calls.count, 3);
});

void test('the board refreshes on its interval and soon after a nudge, and stops when the interval is cleared', async (): Promise<void> => {
  const { feed, calls, timers } = setup();
  feed.every(30_000);
  await timers.advance(30_000);
  assert.equal(calls.count, 1);
  await timers.advance(30_000);
  assert.equal(calls.count, 2);
  feed.every(0);
  await timers.advance(90_000);
  assert.equal(calls.count, 2);
  feed.soon(8000);
  await timers.advance(8000);
  assert.equal(calls.count, 3);
});
