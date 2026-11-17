import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distance, fartherThan, within } from './math.ts';

const SPOTS: readonly { readonly x: number; readonly z: number }[] = [
  { x: 0, z: 0 },
  { x: 3, z: 4 },
  { x: -3, z: 4 },
  { x: 5, z: 0 },
  { x: 0.1, z: -7.25 },
  { x: 2.9999999999, z: 4.0000000001 },
  { x: 1e-9, z: 5 },
];

void test('within answers exactly as a distance comparison, on and off the edge', (): void => {
  for (const a of SPOTS) {
    for (const b of SPOTS) {
      for (const radius of [0, 1, 4.999999999, 5, 5.000000001, 7.25, 100]) {
        assert.equal(within(a, b, radius), distance(a, b) <= radius, `${JSON.stringify(a)} ${JSON.stringify(b)} ${radius}`);
      }
    }
  }
});

void test('fartherThan is only true when the distance is beyond the gap', (): void => {
  for (const a of SPOTS) {
    for (const b of SPOTS) {
      for (const gap of [0, 1, 4, 5, 7.25, Infinity]) {
        if (fartherThan(a, b, gap)) assert.ok(distance(a, b) > gap);
      }
    }
  }
  assert.equal(fartherThan({ x: 0, z: 0 }, { x: 5, z: 0 }, 4), true);
  assert.equal(fartherThan({ x: 0, z: 0 }, { x: 3, z: 3 }, 4), false);
});
