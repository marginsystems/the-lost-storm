import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatRefusal, enterFrame, helloFrame, leaveFrame, LIVE_LIMITS, liveUrl, moveFrame, mutesFrame, readLine, readPlayer, readServerFrame, sayable, sayFrame, whisperFrame } from './live-protocol.ts';
import type { ServerFrame } from './live-protocol.ts';

const WREN: Readonly<Record<string, unknown>> = { id: 'h1', name: 'Wren', hero: 'woman', worn: { weapon: 'hand_crossbow' }, x: 20, z: 18.5, facing: 1.2 };

const LINE: Readonly<Record<string, unknown>> = { id: 4, from: 'h1', name: 'Wren', text: 'hello', at: '2026-11-14T10:00:00.000Z', own: false };
const OLD_LINE: Readonly<Record<string, unknown>> = { id: 5, from: 'h1', name: 'Wren', text: 'hello', at: '2026-11-14T10:00:00.000Z' };

function read(value: unknown): ServerFrame | null {
  return readServerFrame(JSON.stringify(value));
}

void test('the live URL swaps http for ws and https for wss and adds the live path', (): void => {
  assert.equal(liveUrl('http://localhost:8787'), 'ws://localhost:8787/v1/live');
  assert.equal(liveUrl('https://api.theloststorm.com/base'), 'wss://api.theloststorm.com/base/v1/live');
});

void test('client frames carry the token only in the hello and round places to centimetres', (): void => {
  assert.deepEqual(JSON.parse(helloFrame('secret')), { type: 'hello', token: 'secret', chat: 1 });
  assert.deepEqual(JSON.parse(whisperFrame('Bo Reed', 'hi')), { type: 'whisper', to: 'Bo Reed', text: 'hi' });
  assert.deepEqual(JSON.parse(enterFrame({ x: 20.123_4, z: 18.005_1, facing: 0.333_33 })), { type: 'enter', zone: 'hideout', x: 20.12, z: 18.01, facing: 0.33 });
  assert.deepEqual(JSON.parse(moveFrame({ x: 1, z: 2, facing: -2.505_9 })), { type: 'move', x: 1, z: 2, facing: -2.51 });
  assert.deepEqual(JSON.parse(leaveFrame()), { type: 'leave' });
});

void test('every server message the protocol names is read', (): void => {
  assert.deepEqual(read({ type: 'welcome' }), { type: 'welcome', roaming: null });
  assert.deepEqual(read({ type: 'welcome', you: 'c1', chat: [LINE] }), { type: 'welcome', roaming: { you: 'c1', chat: [LINE] } });
  assert.deepEqual(read({ type: 'whisper', dir: 'from', with: 'Bo Reed', line: LINE }), { type: 'whisper', dir: 'from', with: 'Bo Reed', line: LINE });
  assert.deepEqual(read({ type: 'whisper', dir: 'to', with: 'Bo Reed', line: LINE }), { type: 'whisper', dir: 'to', with: 'Bo Reed', line: LINE });
  assert.deepEqual(read({ type: 'unsent', reason: 'ignored', to: 'Bo Reed' }), { type: 'unsent', reason: 'ignored', to: 'Bo Reed' });
  assert.deepEqual(read({ type: 'full' }), { type: 'full' });
  assert.deepEqual(read({ type: 'replaced' }), { type: 'replaced' });
  assert.deepEqual(read({ type: 'friends' }), { type: 'friends' });
  assert.deepEqual(read({ type: 'present', zone: 'hideout', you: 'me', players: [WREN] }), { type: 'present', zone: 'hideout', you: 'me', players: [WREN], chat: null });
  assert.deepEqual(read({ type: 'present', zone: 'hideout', you: 'me', players: [], chat: [LINE, { id: 'x' }] }), { type: 'present', zone: 'hideout', you: 'me', players: [], chat: [LINE] });
  assert.deepEqual(read({ type: 'said', line: LINE }), { type: 'said', line: LINE });
  assert.deepEqual(read({ type: 'refused', reason: 'slow_down' }), { type: 'refused', reason: 'slow_down' });
  assert.deepEqual(read({ type: 'joined', player: { ...WREN, hero: null, worn: {} } }), { type: 'joined', player: { ...WREN, hero: null, worn: {} } });
  assert.deepEqual(read({ type: 'left', id: 'h1' }), { type: 'left', id: 'h1' });
  assert.deepEqual(read({ type: 'look', id: 'h1', hero: 'man', worn: { chest: 'tunic' } }), { type: 'look', id: 'h1', name: null, hero: 'man', worn: { chest: 'tunic' } });
  assert.deepEqual(read({ type: 'look', id: 'h1', name: 'Rook', hero: 'man', worn: {} }), { type: 'look', id: 'h1', name: 'Rook', hero: 'man', worn: {} });
  assert.equal(read({ type: 'look', id: 'h1', name: 7, hero: 'man', worn: {} }), null);
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
  assert.equal(read({ type: 'whisper', dir: 'sideways', with: 'Bo', line: LINE }), null);
  assert.equal(read({ type: 'whisper', dir: 'from', line: LINE }), null);
  assert.equal(read({ type: 'unsent', reason: 'because', to: 'Bo' }), null);
  assert.equal(read({ type: 'unsent', reason: 'offline' }), null);
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

void test('a line to say is trimmed, never empty and at most 200 characters, counting an emoji once', (): void => {
  assert.equal(sayable('  hello  '), 'hello');
  assert.equal(sayable('   '), null);
  assert.equal(sayable('a'.repeat(LIVE_LIMITS.sayChars)), 'a'.repeat(LIVE_LIMITS.sayChars));
  assert.equal(sayable('a'.repeat(LIVE_LIMITS.sayChars + 1)), null);
  assert.equal(sayable('\u{1F600}'.repeat(LIVE_LIMITS.sayChars)), '\u{1F600}'.repeat(LIVE_LIMITS.sayChars));
  assert.deepEqual(JSON.parse(sayFrame('hi')), { type: 'say', text: 'hi' });
});

void test('chat refusals are told apart from enter refusals', (): void => {
  assert.equal(chatRefusal('name_needed'), 'name_needed');
  assert.equal(chatRefusal('off_floor'), null);
});

void test('a line from an older server has no own flag, and a replayed line has no handle', (): void => {
  assert.deepEqual(readLine(OLD_LINE), { ...OLD_LINE, own: null });
  assert.deepEqual(readLine({ ...LINE, from: null, own: true }), { ...LINE, from: null, own: true });
  assert.equal(readLine({ ...LINE, from: undefined }), null);
  assert.equal(readLine({ ...LINE, from: 7 }), null);
});

void test('the mute list keeps the newest names that fit in one frame', (): void => {
  assert.deepEqual(JSON.parse(mutesFrame(['ash', '', 'bo reed'])), { type: 'mutes', names: ['ash', 'bo reed'] });
  const many: readonly string[] = Array.from({ length: 500 }, (_: unknown, index: number): string => `name number ${String(index)}`);
  const frame: string = mutesFrame(many);
  assert.ok(frame.length <= LIVE_LIMITS.muteFrameChars);
  const names: unknown = Reflect.get(JSON.parse(frame), 'names');
  assert.ok(Array.isArray(names));
  assert.equal(names.at(-1), 'name number 499');
  assert.ok(names.length > 100);
});
