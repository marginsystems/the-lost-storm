import assert from 'node:assert/strict';
import { test } from 'node:test';
import { springTo, stepSpring } from './character-spring.ts';
import type { Spring } from './character-spring.ts';

function run(spring: Spring, seconds: number): number {
  let peak: number = spring.value;
  for (let time: number = 0; time < seconds; time += 1 / 60) {
    stepSpring(spring, 1 / 60);
    peak = Math.max(peak, spring.value);
  }
  return peak;
}

void test('a spring settles exactly on its target', (): void => {
  const spring: Spring = { value: 100, velocity: 0, target: 100 };
  springTo(spring, 160);
  run(spring, 3);
  assert.equal(spring.value, 160);
  assert.equal(spring.velocity, 0);
});

void test('a spring does not jump on its first frame and overshoots a little', (): void => {
  const spring: Spring = { value: 0, velocity: 0, target: 0 };
  springTo(spring, 100);
  stepSpring(spring, 1 / 60);
  assert.ok(spring.value > 0 && spring.value < 20);
  const peak: number = run(spring, 3);
  assert.ok(peak > 100 && peak < 120);
});

void test('a spring at rest reports no movement', (): void => {
  const spring: Spring = { value: 5, velocity: 0, target: 5 };
  assert.equal(stepSpring(spring, 1 / 60), false);
});
