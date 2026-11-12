import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EchoPoint } from '../backend/traces-api.ts';
import { anchorAhead, createMistClock, leftBehind, MIST, replayAt, replayLength, shiftAnchor } from './mist.ts';

const STEP: number = 0.25;
const PATH: readonly EchoPoint[] = [
  [10, 10, 1],
  [11, 10, 1],
  [12, 10, 1],
  [13, 10, 1],
];

void test('a trace is placed ahead of the player along the heading, within the side spread', (): void => {
  const anchor = anchorAhead({ x: 0, z: 0 }, { x: 0, z: 2 }, (): number => 0.5);
  assert.ok(Math.abs(anchor.x) < 1e-9);
  assert.ok(anchor.z >= MIST.aheadNear && anchor.z <= MIST.aheadFar);
  const wide = anchorAhead({ x: 0, z: 0 }, { x: 1, z: 0 }, (): number => 1);
  assert.ok(Math.abs(wide.z) <= MIST.side + 1e-9);
});

void test('the clock waits, then places one trace at a time up to the cap', (): void => {
  const clock = createMistClock((): number => 0.5);
  assert.equal(clock.tick(MIST.firstAfter - 1, 0, { x: 0, z: 0 }, { x: 0, z: 1 }), null);
  assert.ok(clock.tick(1, 0, { x: 0, z: 0 }, { x: 0, z: 1 }) !== null);
  assert.equal(clock.tick(1, 0, { x: 0, z: 0 }, { x: 0, z: 1 }), null);
  assert.equal(clock.tick(MIST.every, MIST.shown, { x: 0, z: 0 }, { x: 0, z: 1 }), null);
});

void test('a trace far behind is let go, and a shift of the mist carries anchors along', (): void => {
  const anchor = { x: 0, z: 0 };
  assert.equal(leftBehind(anchor, { x: 0, z: MIST.behind - 1 }), false);
  assert.equal(leftBehind(anchor, { x: 0, z: MIST.behind + 1 }), true);
  shiftAnchor(anchor, { x: -24, z: 3 });
  assert.deepEqual(anchor, { x: -24, z: 3 });
});

void test('a replay walks the path from the anchor slowly, then holds, fading in and out', (): void => {
  const anchor = { x: 100, z: 50 };
  const start = replayAt(PATH, STEP, anchor, 0);
  assert.ok(start !== null);
  assert.deepEqual(start.pos, { x: 100, z: 50 });
  assert.equal(start.fade, 0);
  const walk: number = replayLength(PATH, STEP);
  const mid = replayAt(PATH, STEP, anchor, walk / 2);
  assert.ok(mid !== null && mid.moving && mid.pos.x > 100 && mid.pos.x < 103);
  assert.ok(mid.speed < 1 / STEP);
  const end = replayAt(PATH, STEP, anchor, walk + MIST.hold / 2);
  assert.ok(end !== null && !end.moving);
  assert.ok(Math.abs(end.pos.x - 103) < 1e-9);
  assert.equal(replayAt([], STEP, anchor, 0), null);
});
