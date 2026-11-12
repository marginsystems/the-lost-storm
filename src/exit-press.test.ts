import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExitFrame } from './exit-press.ts';
import { exitPress } from './exit-press.ts';

const HELD: ExitFrame = { fresh: false, tick: true, open: true, ground: { x: 3, z: 4 } };

void test('a fresh click on an exit travels through it, open or locked, so a locked one can say why', (): void => {
  assert.deepEqual(exitPress('into_the_hall', { ...HELD, fresh: true }), { type: 'travel', exit: 'into_the_hall' });
  assert.deepEqual(exitPress('into_the_hall', { ...HELD, fresh: true, open: false }), { type: 'travel', exit: 'into_the_hall' });
});

void test('a held walk whose pointer reaches an open exit heads through it instead of stopping at its edge', (): void => {
  assert.deepEqual(exitPress('into_the_hall', HELD), { type: 'travel', exit: 'into_the_hall' });
});

void test('a held press sends nothing between its repeat ticks over an open exit, so the travel is not reset every frame', (): void => {
  assert.equal(exitPress('into_the_hall', { ...HELD, tick: false }), null);
});

void test('a held walk over a locked exit keeps walking, with no repeated locked notice', (): void => {
  assert.deepEqual(exitPress('into_the_hall', { ...HELD, open: false }), { type: 'move', held: true, dest: { x: 3, z: 4 } });
});
