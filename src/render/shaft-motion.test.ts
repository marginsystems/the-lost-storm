import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Presence } from './shaft-motion.ts';
import { crowdShares, HIDDEN, settle } from './shaft-motion.ts';

function run(from: Presence, target: number, seconds: number, frame: number): { readonly end: Presence; readonly peak: number; readonly trough: number } {
  let presence: Presence = from;
  let peak: number = presence.value;
  let trough: number = presence.value;
  for (let time: number = 0; time < seconds; time += frame) {
    presence = settle(presence, target, frame);
    peak = Math.max(peak, presence.value);
    trough = Math.min(trough, presence.value);
  }
  return { end: presence, peak, trough };
}

void test('a shaft rises to full without overshooting and comes to rest', (): void => {
  const rise = run(HIDDEN, 1, 2, 1 / 60);
  assert.equal(rise.end.value, 1);
  assert.equal(rise.end.velocity, 0);
  assert.ok(rise.peak <= 1);
});

void test('a shaft eases in rather than popping on the first frame', (): void => {
  const first: Presence = settle(HIDDEN, 1, 1 / 60);
  assert.ok(first.value > 0 && first.value < 0.1);
});

void test('a shaft fades out to nothing without dipping below zero', (): void => {
  const fall = run({ value: 1, velocity: 0 }, 0, 2, 1 / 60);
  assert.equal(fall.end.value, 0);
  assert.ok(fall.trough >= 0);
});

void test('a long frame settles the same as many short ones', (): void => {
  const long: Presence = settle(HIDDEN, 1, 0.25);
  const short = run(HIDDEN, 1, 0.25, 1 / 120);
  assert.ok(Math.abs(long.value - short.end.value) < 0.02);
});

void test('a lone shaft keeps its full brightness', (): void => {
  assert.deepEqual(crowdShares([{ x: 0, z: 0 }]), [1]);
});

void test('a pile of drops dims each shaft so the pile stays near the light of a few', (): void => {
  const pile = Array.from({ length: 9 }, (_: unknown, index: number): { readonly x: number; readonly z: number } => ({ x: index * 0.3, z: 0 }));
  const shares: number[] = crowdShares(pile);
  const total: number = shares.reduce((sum: number, share: number): number => sum + share, 0);
  assert.ok(shares.every((share: number): boolean => share < 1));
  assert.ok(total < 4);
});

void test('shafts far apart do not dim each other', (): void => {
  assert.deepEqual(crowdShares([{ x: 0, z: 0 }, { x: 20, z: 0 }]), [1, 1]);
});
