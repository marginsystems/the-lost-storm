import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Presence } from './shaft-motion.ts';
import { crowdShare, hidden, settle } from './shaft-motion.ts';

function run(from: Presence, target: number, seconds: number, frame: number): { readonly end: Presence; readonly peak: number; readonly trough: number } {
  const presence: Presence = { value: from.value, velocity: from.velocity };
  let peak: number = presence.value;
  let trough: number = presence.value;
  for (let time: number = 0; time < seconds; time += frame) {
    settle(presence, target, frame);
    peak = Math.max(peak, presence.value);
    trough = Math.min(trough, presence.value);
  }
  return { end: presence, peak, trough };
}

function shares(points: readonly (readonly [number, number])[]): number[] {
  const xs: Float32Array = Float32Array.from(points.map((point: readonly [number, number]): number => point[0]));
  const zs: Float32Array = Float32Array.from(points.map((point: readonly [number, number]): number => point[1]));
  return points.map((_: readonly [number, number], index: number): number => crowdShare(xs, zs, points.length, index));
}

void test('a marker rises to full without overshooting and comes to rest', (): void => {
  const rise = run(hidden(), 1, 2, 1 / 60);
  assert.equal(rise.end.value, 1);
  assert.equal(rise.end.velocity, 0);
  assert.ok(rise.peak <= 1);
});

void test('a marker eases in rather than popping on the first frame', (): void => {
  const first: Presence = hidden();
  settle(first, 1, 1 / 60);
  assert.ok(first.value > 0 && first.value < 0.1);
});

void test('a marker fades out to nothing without dipping below zero', (): void => {
  const fall = run({ value: 1, velocity: 0 }, 0, 2, 1 / 60);
  assert.equal(fall.end.value, 0);
  assert.ok(fall.trough >= 0);
});

void test('a long frame settles the same as many short ones', (): void => {
  const long: Presence = hidden();
  settle(long, 1, 0.25);
  const short = run(hidden(), 1, 0.25, 1 / 120);
  assert.ok(Math.abs(long.value - short.end.value) < 0.02);
});

void test('a lone marker keeps its full brightness', (): void => {
  assert.deepEqual(shares([[0, 0]]), [1]);
});

void test('a pile of drops dims each marker so the pile stays near the light of a few', (): void => {
  const pile: [number, number][] = Array.from({ length: 9 }, (_: unknown, index: number): [number, number] => [index * 0.3, 0]);
  const each: number[] = shares(pile);
  const total: number = each.reduce((sum: number, share: number): number => sum + share, 0);
  assert.ok(each.every((share: number): boolean => share < 1));
  assert.ok(total < 4);
});

void test('markers far apart do not dim each other', (): void => {
  assert.deepEqual(shares([[0, 0], [20, 0]]), [1, 1]);
});
