import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Press } from './membrane.ts';
import { MEMBRANE, pressAngle, pressTarget, SLACK, stepPress } from './membrane.ts';

const FRAME: number = 1 / 60;

void test('the membrane is slack in the middle of a bubble and presses harder as the hero nears its edge from inside', (): void => {
  assert.equal(pressTarget(0, 6), 0);
  assert.equal(pressTarget(6 * MEMBRANE.from, 6), 0);
  const mid: number = pressTarget(6 * (MEMBRANE.from + MEMBRANE.to) / 2, 6);
  assert.ok(mid > 0 && mid < 1);
  assert.equal(pressTarget(6 * MEMBRANE.to, 6), 1);
  assert.equal(pressTarget(6.2, 6), 0);
});

void test('the press springs in and out over several frames and never jumps from one frame to the next', (): void => {
  let press: Press = SLACK;
  let largest: number = 0;
  const targets: number[] = [...Array.from({ length: 60 }, (): number => 1), ...Array.from({ length: 90 }, (): number => 0)];
  for (const target of targets) {
    const next: Press = stepPress(press, target, FRAME);
    largest = Math.max(largest, Math.abs(next.level - press.level));
    press = next;
  }
  assert.ok(largest < 0.2, `largest step ${largest.toFixed(3)}`);
  assert.deepEqual(press, SLACK);
});

void test('the press faces the hero, in the same angle the dome measures around itself', (): void => {
  assert.equal(pressAngle({ x: 5, z: 0 }, { x: 0, z: 0 }), 0);
  assert.ok(Math.abs(pressAngle({ x: 0, z: 5 }, { x: 0, z: 0 }) - Math.PI / 2) < 1e-9);
});
