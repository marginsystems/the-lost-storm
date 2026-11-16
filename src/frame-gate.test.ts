import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameGate } from './frame-gate.ts';
import type { FrameState } from './frame-gate.ts';

const PLAYING: FrameState = { playing: true, blocking: false, lost: false, menuOpen: false, presenting: true };

void test('the world steps while the menu is open, and the game takes no commands', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, menuOpen: true }), { collect: true, queue: false, step: true, draw: true });
});

void test('with the menu closed the world steps and takes commands', (): void => {
  assert.deepEqual(frameGate(PLAYING), { collect: true, queue: true, step: true, draw: true });
});

void test('nothing steps or collects on the lobby or when the touch input is lost', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, playing: false }), { collect: false, queue: false, step: false, draw: false });
  assert.deepEqual(frameGate({ ...PLAYING, lost: true }), { collect: false, queue: false, step: false, draw: true });
});

void test('during a zone change input is drained but nothing is queued or stepped', (): void => {
  assert.deepEqual(frameGate({ ...PLAYING, blocking: true, presenting: false }), { collect: true, queue: false, step: false, draw: false });
});

void test('the scene is not drawn behind the title or the lobby, nor while the veil fades in or the zone builds, and is drawn under the veil while the new zone settles', (): void => {
  assert.equal(frameGate({ ...PLAYING, playing: false }).draw, false);
  assert.equal(frameGate({ ...PLAYING, blocking: true, presenting: false }).draw, false);
  assert.equal(frameGate({ ...PLAYING, blocking: true, presenting: true }).draw, true);
  assert.equal(frameGate({ ...PLAYING, menuOpen: true }).draw, true);
});
