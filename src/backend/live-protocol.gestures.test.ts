import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveAct, ServerFrame } from './live-protocol.ts';
import { enterFrame, moveFrame, nextAct, readAct, readServerFrame, sameAct } from './live-protocol.ts';

const PLAYER: Readonly<Record<string, unknown>> = { id: 'h1', name: 'Wren', username: null, hero: null, worn: {}, x: 21, z: 18, facing: 0 };

function frame(value: unknown): ServerFrame | null {
  return readServerFrame(JSON.stringify(value));
}

void test('a move carries a known gesture and its stamp, and an older four-field move carries none', (): void => {
  assert.deepEqual(frame({ type: 'moves', players: [['h1', 1, 2, 0.5, 'nod', 1700], ['h2', 3, 4, 0]] }), {
    type: 'moves',
    moves: [
      { id: 'h1', x: 1, z: 2, facing: 0.5, act: { id: 'nod', at: 1700 } },
      { id: 'h2', x: 3, z: 4, facing: 0 },
    ],
  });
});

void test('an unknown gesture, a wrong type or a null act reads as no act, and a bad stamp as zero', (): void => {
  const moves: ServerFrame | null = frame({ type: 'moves', players: [['a', 0, 0, 0, 'dance', 1], ['b', 0, 0, 0, 7, 1], ['c', 0, 0, 0, null, 1], ['d', 0, 0, 0, 'sit', -4], ['e', 0, 0, 0, 'sit', 1.5], ['f', 0, 0, 0, '__proto__', 1]] });
  assert.ok(moves?.type === 'moves');
  assert.deepEqual(
    moves.moves.map((move): LiveAct | null => move.act ?? null),
    [null, null, null, { id: 'sit', at: 0 }, { id: 'sit', at: 0 }, null],
  );
});

void test('a player present or joining may already be in a gesture', (): void => {
  const present: ServerFrame | null = frame({ type: 'present', zone: 'hideout', you: 'me', players: [{ ...PLAYER, act: 'sit_talk', actAt: 9 }, { ...PLAYER, id: 'h2', act: 'wave', actAt: 9 }], chat: [] });
  assert.ok(present?.type === 'present');
  assert.deepEqual(present.players[0]?.act, { id: 'sit_talk', at: 9 });
  assert.equal(present.players[1]?.act, undefined);
  const joined: ServerFrame | null = frame({ type: 'joined', player: { ...PLAYER, resident: true, act: 'arms_folded', actAt: 3 } });
  assert.ok(joined?.type === 'joined');
  assert.deepEqual(joined.player, { ...PLAYER, resident: true, act: { id: 'arms_folded', at: 3 } });
});

void test('enter and move frames name the act only while one is set', (): void => {
  assert.deepEqual(JSON.parse(moveFrame({ x: 1.234, z: 2, facing: 0 })), { type: 'move', x: 1.23, z: 2, facing: 0 });
  assert.deepEqual(JSON.parse(moveFrame({ x: 1, z: 2, facing: 0, act: { id: 'crouch', at: 42 } })), { type: 'move', x: 1, z: 2, facing: 0, act: 'crouch', actAt: 42 });
  assert.deepEqual(JSON.parse(enterFrame({ x: 1, z: 2, facing: 0, act: { id: 'sit', at: 1 } })), { type: 'enter', zone: 'hideout', x: 1, z: 2, facing: 0, act: 'sit', actAt: 1 });
});

void test('the next act keeps the stamp of the act it continues, takes a given stamp, and drops an unknown id', (): void => {
  const talking: LiveAct | undefined = nextAct(undefined, 'talk', undefined, 1000.4);
  assert.deepEqual(talking, { id: 'talk', at: 1000 });
  assert.equal(nextAct(talking, 'talk', undefined, 5000), talking);
  assert.deepEqual(nextAct(talking, 'nod', undefined, 5000), { id: 'nod', at: 5000 });
  assert.deepEqual(nextAct(talking, 'talk', 77.6, 5000), { id: 'talk', at: 78 });
  assert.deepEqual(nextAct(talking, 'talk', -1, 5000), talking);
  assert.equal(nextAct(talking, null, undefined, 5000), undefined);
  assert.equal(nextAct(talking, 'dance', 3, 5000), undefined);
  assert.equal(readAct('dance', 1), null);
  assert.ok(sameAct({ id: 'nod', at: 1 }, { id: 'nod', at: 1 }));
  assert.ok(!sameAct({ id: 'nod', at: 1 }, { id: 'nod', at: 2 }));
  assert.ok(sameAct(undefined, undefined));
});
