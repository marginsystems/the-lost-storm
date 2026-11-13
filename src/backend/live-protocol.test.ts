import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enterFrame, helloFrame, leaveFrame, liveUrl, moveFrame, readPlayer, readServerFrame } from './live-protocol.ts';
import type { ServerFrame } from './live-protocol.ts';

const WREN: Readonly<Record<string, unknown>> = { id: 'h1', name: 'Wren', hero: 'woman', worn: { weapon: 'hand_crossbow' }, x: 20, z: 18.5, facing: 1.2 };

function read(value: unknown): ServerFrame | null {
  return readServerFrame(JSON.stringify(value));
}

void test('the live URL swaps http for ws and https for wss and adds the live path', (): void => {
  assert.equal(liveUrl('http://localhost:8787'), 'ws://localhost:8787/v1/live');
  assert.equal(liveUrl('https://api.theloststorm.com/base'), 'wss://api.theloststorm.com/base/v1/live');
});

void test('client frames carry the token only in the hello and round places to centimetres', (): void => {
  assert.deepEqual(JSON.parse(helloFrame('secret')), { type: 'hello', token: 'secret' });
  assert.deepEqual(JSON.parse(enterFrame({ x: 20.123_4, z: 18.005_1, facing: 0.333_33 })), { type: 'enter', zone: 'hideout', x: 20.12, z: 18.01, facing: 0.33 });
  assert.deepEqual(JSON.parse(moveFrame({ x: 1, z: 2, facing: -2.505_9 })), { type: 'move', x: 1, z: 2, facing: -2.51 });
  assert.deepEqual(JSON.parse(leaveFrame()), { type: 'leave' });
});

void test('every server message the protocol names is read', (): void => {
  assert.deepEqual(read({ type: 'welcome' }), { type: 'welcome' });
  assert.deepEqual(read({ type: 'full' }), { type: 'full' });
  assert.deepEqual(read({ type: 'replaced' }), { type: 'replaced' });
  assert.deepEqual(read({ type: 'present', zone: 'hideout', you: 'me', players: [WREN] }), { type: 'present', zone: 'hideout', you: 'me', players: [WREN] });
  assert.deepEqual(read({ type: 'joined', player: { ...WREN, hero: null, worn: {} } }), { type: 'joined', player: { ...WREN, hero: null, worn: {} } });
  assert.deepEqual(read({ type: 'left', id: 'h1' }), { type: 'left', id: 'h1' });
  assert.deepEqual(read({ type: 'look', id: 'h1', hero: 'man', worn: { chest: 'tunic' } }), { type: 'look', id: 'h1', hero: 'man', worn: { chest: 'tunic' } });
  assert.deepEqual(read({ type: 'moves', players: [['h1', 20.4, 18.1, 1.2]] }), { type: 'moves', moves: [{ id: 'h1', x: 20.4, z: 18.1, facing: 1.2 }] });
  assert.deepEqual(read({ type: 'refused', reason: 'off_floor' }), { type: 'refused', reason: 'off_floor' });
});

void test('a frame that is not JSON, not text, unknown or malformed is dropped', (): void => {
  assert.equal(readServerFrame('{nope'), null);
  assert.equal(readServerFrame(42), null);
  assert.equal(readServerFrame(new ArrayBuffer(4)), null);
  assert.equal(read({ type: 'teleport' }), null);
  assert.equal(read([1, 2]), null);
  assert.equal(read({ type: 'left' }), null);
  assert.equal(read({ type: 'joined', player: { ...WREN, x: 'far' } }), null);
  assert.equal(read({ type: 'refused', reason: 'because' }), null);
  assert.equal(read({ type: 'look', id: 'h1', hero: 'man', worn: { chest: 7 } }), null);
});

void test('one unreadable player in a batch is dropped and the rest are kept', (): void => {
  assert.deepEqual(read({ type: 'moves', players: [['h1', 1, 2, 3], ['h2', 'x', 2, 3], 'junk', ['h3', 4, 5, 6]] }), {
    type: 'moves',
    moves: [
      { id: 'h1', x: 1, z: 2, facing: 3 },
      { id: 'h3', x: 4, z: 5, facing: 6 },
    ],
  });
  const present: ServerFrame | null = read({ type: 'present', zone: 'hideout', you: 'me', players: [WREN, { id: 'h2' }] });
  assert.equal(present?.type === 'present' ? present.players.length : -1, 1);
});

void test('a player with an endless number or an overlong name is refused', (): void => {
  assert.equal(readPlayer({ ...WREN, x: Number.POSITIVE_INFINITY }), null);
  assert.equal(readPlayer({ ...WREN, name: 'x'.repeat(40) }), null);
  assert.equal(readPlayer({ ...WREN, name: '' }), null);
  assert.equal(readPlayer({ ...WREN, hero: 3 }), null);
});
