import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFakeClock, createFakeTimers } from '../../test/backend-support.ts';
import type { FakeClock, FakeTimers } from '../../test/backend-support.ts';
import { createLive, LIVE, retryDelayMs } from './live.ts';
import type { Live, LiveEvent, SocketHandlers, Stand } from './live.ts';

interface FakeSocket {
  readonly url: string;
  readonly sent: unknown[];
  readonly handlers: SocketHandlers;
  closed: boolean;
}

interface Harness {
  readonly live: Live;
  readonly clock: FakeClock;
  readonly timers: FakeTimers;
  readonly sockets: FakeSocket[];
  readonly events: LiveEvent[];
  token: string | null;
  refuseOpen: boolean;
}

const HIDEOUT: Stand = { zone: 'hideout', x: 20, z: 18, facing: 0 };
const ROAD: Stand = { zone: 'road', x: 20, z: 18, facing: 0 };
const PLAYER: Readonly<Record<string, unknown>> = { id: 'h1', name: 'Wren', hero: null, worn: {}, x: 21, z: 18, facing: 0 };

function harness(): Harness {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const sockets: FakeSocket[] = [];
  const events: LiveEvent[] = [];
  const state: Harness = {
    clock,
    timers,
    sockets,
    events,
    token: 'secret-token',
    refuseOpen: false,
    live: createLive({
      serverUrl: 'http://localhost:8787',
      open: (url: string, handlers: SocketHandlers) => {
        if (state.refuseOpen) throw new Error('refused');
        const socket: FakeSocket = { url, sent: [], handlers, closed: false };
        sockets.push(socket);
        return {
          send: (text: string): void => {
            socket.sent.push(JSON.parse(text));
          },
          close: (): void => {
            socket.closed = true;
          },
        };
      },
      token: (): string | null => state.token,
      clock: clock.read,
      timers: timers.timers,
      random: (): number => 1,
    }),
  };
  state.live.subscribe((event: LiveEvent): void => {
    events.push(event);
  });
  return state;
}

function last(h: Harness): FakeSocket {
  const socket: FakeSocket | undefined = h.sockets[h.sockets.length - 1];
  assert.ok(socket !== undefined, 'a socket was opened');
  return socket;
}

function say(socket: FakeSocket, frame: unknown): void {
  socket.handlers.message(JSON.stringify(frame));
}

function welcomed(h: Harness, stand: Stand = HIDEOUT): FakeSocket {
  h.live.update(stand);
  const socket: FakeSocket = last(h);
  socket.handlers.open();
  say(socket, { type: 'welcome' });
  h.live.update(stand);
  return socket;
}

void test('outside the Hideout or out of play no socket is opened', (): void => {
  const h: Harness = harness();
  h.live.update(ROAD);
  h.live.update({ ...HIDEOUT, zone: null });
  assert.equal(h.sockets.length, 0);
});

void test('the token goes only in the first frame and enter follows the welcome', (): void => {
  const h: Harness = harness();
  h.live.update(HIDEOUT);
  const socket: FakeSocket = last(h);
  assert.equal(socket.url, 'ws://localhost:8787/v1/live');
  assert.ok(!socket.url.includes('secret'));
  h.live.update(HIDEOUT);
  assert.deepEqual(socket.sent, []);
  socket.handlers.open();
  assert.deepEqual(socket.sent, [{ type: 'hello', token: 'secret-token' }]);
  h.live.update(HIDEOUT);
  assert.equal(socket.sent.length, 1);
  say(socket, { type: 'welcome' });
  h.live.update(HIDEOUT);
  assert.deepEqual(socket.sent[1], { type: 'enter', zone: 'hideout', x: 20, z: 18, facing: 0 });
});

void test('moves go out at most every 100 ms and only when the place changed', (): void => {
  const h: Harness = harness();
  const socket: FakeSocket = welcomed(h);
  const before: number = socket.sent.length;
  h.clock.now += LIVE.moveEveryMs / 2;
  h.live.update({ ...HIDEOUT, x: 20.5 });
  assert.equal(socket.sent.length, before);
  h.clock.now += LIVE.moveEveryMs / 2;
  h.live.update({ ...HIDEOUT, x: 20.5 });
  assert.deepEqual(socket.sent[before], { type: 'move', x: 20.5, z: 18, facing: 0 });
  h.clock.now += LIVE.moveEveryMs * 3;
  h.live.update({ ...HIDEOUT, x: 20.5 });
  assert.equal(socket.sent.length, before + 1);
  h.live.update({ ...HIDEOUT, x: 20.5, facing: 1 });
  assert.deepEqual(socket.sent[before + 1], { type: 'move', x: 20.5, z: 18, facing: 1 });
});

void test('leaving the Hideout says leave, closes the socket and lets the others go', (): void => {
  const h: Harness = harness();
  const socket: FakeSocket = welcomed(h);
  say(socket, { type: 'present', zone: 'hideout', you: 'me', players: [PLAYER, { ...PLAYER, id: 'me' }] });
  assert.deepEqual(h.events.map((event: LiveEvent): string => event.type), ['present']);
  const present: LiveEvent | undefined = h.events[0];
  assert.equal(present?.type === 'present' ? present.players.length : -1, 1);
  h.live.update(ROAD);
  assert.deepEqual(socket.sent[socket.sent.length - 1], { type: 'leave' });
  assert.equal(socket.closed, true);
  assert.deepEqual(h.events.map((event: LiveEvent): string => event.type), ['present', 'gone']);
  h.live.update(ROAD);
  assert.equal(h.sockets.length, 1);
});

async function dropAndWait(h: Harness, wait: number): Promise<void> {
  last(h).handlers.closed(1006);
  const opened: number = h.sockets.length;
  assert.equal(h.timers.nextDelay(), wait);
  await h.timers.advance(wait - 1);
  h.live.update(HIDEOUT);
  assert.equal(h.sockets.length, opened);
  await h.timers.advance(1);
  h.live.update(HIDEOUT);
  assert.equal(h.sockets.length, opened + 1);
}

void test('a dropped socket reconnects after 1 s, then 2 s, doubling to 30 s', async (): Promise<void> => {
  const h: Harness = harness();
  h.live.update(HIDEOUT);
  await dropAndWait(h, 1000);
  await dropAndWait(h, 2000);
  await dropAndWait(h, 4000);
  await dropAndWait(h, 8000);
  await dropAndWait(h, 16_000);
  await dropAndWait(h, 30_000);
  await dropAndWait(h, 30_000);
  const socket: FakeSocket = last(h);
  socket.handlers.open();
  say(socket, { type: 'welcome' });
  socket.handlers.closed(1006);
  assert.equal(h.timers.nextDelay(), 1000);
});

void test('the retry waits are spread by jitter', (): void => {
  assert.equal(retryDelayMs(0, 1), 1000);
  assert.equal(retryDelayMs(0, 0), 500);
  assert.equal(retryDelayMs(3, 0.5), 6000);
  assert.equal(retryDelayMs(40, 1), 30_000);
});

void test('a server that refuses the upgrade or a socket that cannot be made never throws', async (): Promise<void> => {
  const h: Harness = harness();
  h.refuseOpen = true;
  assert.doesNotThrow((): void => h.live.update(HIDEOUT));
  assert.equal(h.timers.nextDelay(), 1000);
  h.refuseOpen = false;
  await h.timers.advance(1000);
  h.live.update(HIDEOUT);
  assert.equal(h.sockets.length, 1);
});

void test('with no token yet it waits instead of connecting', async (): Promise<void> => {
  const h: Harness = harness();
  h.token = null;
  h.live.update(HIDEOUT);
  assert.equal(h.sockets.length, 0);
  h.token = 'later';
  await h.timers.advance(LIVE.tokenWaitMs);
  h.live.update(HIDEOUT);
  last(h).handlers.open();
  assert.deepEqual(last(h).sent, [{ type: 'hello', token: 'later' }]);
});

void test('a full Hideout or a second tab stands down until the player comes back', (): void => {
  for (const type of ['full', 'replaced']) {
    const h: Harness = harness();
    const socket: FakeSocket = welcomed(h);
    say(socket, { type: 'present', zone: 'hideout', you: 'me', players: [PLAYER] });
    say(socket, { type });
    assert.equal(socket.closed, true);
    assert.equal(h.events[h.events.length - 1]?.type, 'gone');
    socket.handlers.closed(1000);
    h.live.update(HIDEOUT);
    assert.equal(h.sockets.length, 1);
    assert.equal(h.timers.pending(), 0);
    h.live.update(ROAD);
    h.live.update(HIDEOUT);
    assert.equal(h.sockets.length, 2);
  }
});

void test('a refused enter is tried again after the backoff', (): void => {
  const h: Harness = harness();
  const socket: FakeSocket = welcomed(h);
  say(socket, { type: 'refused', reason: 'no_character' });
  const sent: number = socket.sent.length;
  h.clock.now += 999;
  h.live.update(HIDEOUT);
  assert.equal(socket.sent.length, sent);
  h.clock.now += 1;
  h.live.update(HIDEOUT);
  assert.deepEqual(socket.sent[sent], { type: 'enter', zone: 'hideout', x: 20, z: 18, facing: 0 });
});

void test('moves are stamped with the time they arrived and junk frames are ignored', (): void => {
  const h: Harness = harness();
  const socket: FakeSocket = welcomed(h);
  socket.handlers.message('not json');
  socket.handlers.message({ type: 'moves' });
  say(socket, { type: 'teleport' });
  assert.deepEqual(h.events, []);
  say(socket, { type: 'moves', players: [['h1', 1, 2, 3]] });
  assert.deepEqual(h.events, [{ type: 'moves', moves: [{ id: 'h1', x: 1, z: 2, facing: 3 }], at: h.clock.now }]);
});

void test('a listener that throws does not stop the others or the socket', (): void => {
  const h: Harness = harness();
  h.live.subscribe((): void => {
    throw new Error('listener broke');
  });
  const socket: FakeSocket = welcomed(h);
  assert.doesNotThrow((): void => say(socket, { type: 'joined', player: PLAYER }));
  assert.equal(h.events.length, 1);
});

void test('frames from a socket that was replaced by a newer one are ignored', (): void => {
  const h: Harness = harness();
  const first: FakeSocket = welcomed(h);
  first.handlers.closed(1006);
  say(first, { type: 'joined', player: PLAYER });
  assert.deepEqual(h.events, []);
});
