import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BoltPoint } from './fork-bolt.ts';
import { FORK_BOLT, forkSegments } from './fork-bolt.ts';

void test('a forked bolt runs from the cloud to the ground with branches, and its shape follows its seed', (): void => {
  const segments: BoltPoint[][] = forkSegments(0.37);
  assert.equal(segments.length, FORK_BOLT.steps + FORK_BOLT.branches * FORK_BOLT.branchSteps);
  const heights: number[] = segments.flat().map((point: BoltPoint): number => point.y);
  assert.equal(Math.max(...heights), FORK_BOLT.top);
  assert.equal(Math.min(...segments.slice(0, FORK_BOLT.steps).flat().map((point: BoltPoint): number => point.y)), 0);
  assert.deepEqual(forkSegments(0.37), segments);
  assert.notDeepEqual(forkSegments(0.81), segments);
});
