import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameGate } from './frame-gate.ts';
import type { FrameState } from './frame-gate.ts';

const PLAYING: FrameState = { playing: true, blocking: false, lost: false, menuOpen: false };

void test('the world steps while the menu is open, and the game takes no commands', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, menuOpen: true }), { collect: true, queue: false, step: true });
});

void test('with the menu closed the world steps and takes commands', (): void => {
  assert.deepEqual(frameGate(PLAYING), { collect: true, queue: true, step: true });
});

void test('nothing steps or collects on the lobby or when the touch input is lost', (): void => {
  const still: FrameState[] = [{ ...PLAYING, playing: false }, { ...PLAYING, lost: true }];
  for (const state of still) assert.deepEqual(frameGate(state), { collect: false, queue: false, step: false });
});

void test('during a zone change input is drained but nothing is queued or stepped', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, blocking: true }), { collect: true, queue: false, step: false });
});
