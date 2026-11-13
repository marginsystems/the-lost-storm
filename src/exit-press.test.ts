import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExitFrame } from './exit-press.ts';
import { exitPress } from './exit-press.ts';

const HELD: ExitFrame = { fresh: false, travelling: false, ground: { x: 3, z: 4 } };

void test('a fresh click on an exit travels through it', (): void => {
  assert.deepEqual(exitPress('into_the_hall', { ...HELD, fresh: true }), { type: 'travel', exit: 'into_the_hall' });
});

void test('a held walk over an exit keeps walking like any ground and never travels', (): void => {
  assert.deepEqual(exitPress('into_the_hall', HELD), { type: 'move', held: true, dest: { x: 3, z: 4 } });
});

void test('the held frames after a click on an exit send nothing, so the travel it started is not overwritten', (): void => {
  assert.equal(exitPress('into_the_hall', { ...HELD, travelling: true }), null);
});
