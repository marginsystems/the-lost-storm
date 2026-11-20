import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import type { GroundBatches } from './ground.ts';
import { GROUND_ORDER, groundBatches } from './ground.ts';

void test('tile fringes draw over the solid ground and under every blend, so a blend is never buried by a seam', (): void => {
  const order: readonly number[] = [GROUND_ORDER.solid, GROUND_ORDER.fringe, GROUND_ORDER.overlay];
  assert.deepEqual(order.toSorted((a: number, b: number): number => a - b), order);
  assert.equal(new Set(order).size, order.length);
});

function partial(weights: Float32Array): boolean {
  return weights.some((weight: number): boolean => weight > 0 && weight < 1);
}

void test('a lava level shapes its tile fringes apart from its blends', (): void => {
  const content = loadContent();
  const zone: ZoneDef | undefined = content.zones.get('lava_depths_2');
  if (zone === undefined) throw new Error('missing lava_depths_2');
  const batches: GroundBatches = groundBatches(content, zone);
  const floor = batches.floor;
  if (floor === null) throw new Error('lava_depths_2 has no layered floor');
  assert.ok(floor.fringes.length > 0);
  assert.ok(floor.blends.includes('lava'));
  assert.ok(partial(floor.fringeLow) || partial(floor.fringeHigh));
});
