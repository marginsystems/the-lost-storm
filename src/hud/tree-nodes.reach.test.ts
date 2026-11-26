import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeAt } from './tree-nodes.ts';
import type { NodeSpot } from './tree-nodes.ts';

const SPOTS: readonly NodeSpot[] = [
  { id: 'near', x: 0, y: 0, radius: 13 },
  { id: 'far', x: 100, y: 0, radius: 13 },
];

void test('a floor widens the reach of a place that is drawn smaller than a pointer can find', (): void => {
  assert.equal(nodeAt(SPOTS, 30, 0), null);
  assert.equal(nodeAt(SPOTS, 30, 0, 40), 'near');
});

void test('a floor never takes a place from the one the pointer is closer to', (): void => {
  assert.equal(nodeAt(SPOTS, 70, 0, 60), 'far');
  assert.equal(nodeAt(SPOTS, 30, 0, 60), 'near');
});

void test('a floor smaller than the place changes nothing', (): void => {
  assert.equal(nodeAt(SPOTS, 12, 0, 2), 'near');
  assert.equal(nodeAt(SPOTS, 14, 0, 2), null);
});
