import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { FakeClock } from '../../test/backend-support.ts';
import { createLive, LIVE } from './live.ts';
import type { Live, SocketHandlers, Stand } from './live.ts';

interface Sent {
  readonly live: Live;
  readonly clock: FakeClock;
  readonly sent: unknown[];
}

const HIDEOUT: Stand = { zone: 'hideout', x: 20, z: 18, facing: 0 };

function entered(first: Stand = HIDEOUT): Sent {
  const clock: FakeClock = createFakeClock();
  const sent: unknown[] = [];
  const opened: SocketHandlers[] = [];
  const live: Live = createLive({
    serverUrl: 'http://localhost:8787',
    open: (_url: string, given: SocketHandlers) => {
      opened.push(given);
      return {
        send: (text: string): void => {
          sent.push(JSON.parse(text));
        },
        close: (): void => undefined,
      };
    },
    token: (): string | null => 'secret-token',
    clock: clock.read,
    timers: createFakeTimers(clock).timers,
    random: (): number => 1,
  });
  live.update(first);
  const handlers: SocketHandlers = must(opened[0], 'a socket was opened');
  handlers.open();
  handlers.message(JSON.stringify({ type: 'welcome' }));
  live.update(first);
  return { live, clock, sent };
}

function next(state: Sent, stand: Stand): unknown {
  state.clock.now += LIVE.moveEveryMs;
  const before: number = state.sent.length;
  state.live.update(stand);
  return state.sent.length === before ? null : state.sent[state.sent.length - 1];
}

void test('a body that starts a gesture standing still sends it at once, stamped with when it started', (): void => {
  const state: Sent = entered();
  const at: number = state.clock.now + LIVE.moveEveryMs;
  assert.deepEqual(next(state, { ...HIDEOUT, act: 'nod' }), { type: 'move', x: 20, z: 18, facing: 0, act: 'nod', actAt: at });
  assert.equal(next(state, { ...HIDEOUT, act: 'nod' }), null);
  assert.deepEqual(next(state, { ...HIDEOUT, act: null }), { type: 'move', x: 20, z: 18, facing: 0 });
});

void test('a held act keeps its first stamp while it lasts, and a caller stamp starts the same gesture again', (): void => {
  const state: Sent = entered();
  const first: unknown = next(state, { ...HIDEOUT, act: 'talk' });
  assert.deepEqual(first, { type: 'move', x: 20, z: 18, facing: 0, act: 'talk', actAt: state.clock.now });
  const stamp: number = state.clock.now;
  assert.deepEqual(next(state, { ...HIDEOUT, x: 21, act: 'talk' }), { type: 'move', x: 21, z: 18, facing: 0, act: 'talk', actAt: stamp });
  assert.deepEqual(next(state, { ...HIDEOUT, x: 21, act: 'nod', actAt: 7 }), { type: 'move', x: 21, z: 18, facing: 0, act: 'nod', actAt: 7 });
  assert.deepEqual(next(state, { ...HIDEOUT, x: 21, act: 'nod', actAt: 8 }), { type: 'move', x: 21, z: 18, facing: 0, act: 'nod', actAt: 8 });
});

void test('an act nobody knows is never sent', (): void => {
  const state: Sent = entered();
  assert.equal(next(state, { ...HIDEOUT, act: 'dance' }), null);
  assert.equal(next(state, { ...HIDEOUT, act: '' }), null);
});

void test('a body that walks in already seated enters with its act', (): void => {
  const state: Sent = entered({ ...HIDEOUT, act: 'sit', actAt: 5 });
  assert.deepEqual(state.sent[state.sent.length - 1], { type: 'enter', zone: 'hideout', x: 20, z: 18, facing: 0, act: 'sit', actAt: 5 });
});
