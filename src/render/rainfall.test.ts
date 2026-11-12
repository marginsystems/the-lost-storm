import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LENS } from './lens-water.ts';
import type { RainEdges } from './rainfall.ts';
import { RAINFALL, rainKicks } from './rainfall.ts';

void test('only the rising edge of a flash or a gust wets the lens', (): void => {
  const edges: RainEdges = { flash: 0, gust: 0 };
  assert.equal(rainKicks(edges, 0.2, 0), 0);
  assert.equal(rainKicks(edges, 1, 0), LENS.flashKick);
  assert.equal(rainKicks(edges, 0.9, 0), 0);
  assert.equal(rainKicks(edges, 0, RAINFALL.gustKickAt + 0.01), LENS.gustKick);
  assert.equal(rainKicks(edges, 0, 1), 0);
  assert.equal(rainKicks(edges, 0, 0), 0);
  assert.equal(rainKicks(edges, 1, 1), LENS.flashKick + LENS.gustKick);
});
