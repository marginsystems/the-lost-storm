import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lightLook, VOID_LIGHT } from './void-light.ts';

void test('the way out keeps its full fog glow in the mist and reads as a light on rock once it stands on the shore', (): void => {
  assert.deepEqual(lightLook(null), { pool: 1, pillar: 1, fire: 1 });
  assert.deepEqual(lightLook(-10), { pool: 1, pillar: 1, fire: 1 });
  const ashore = lightLook(20);
  assert.ok(Math.abs(ashore.pool - VOID_LIGHT.land.pool) < 1e-9);
  assert.ok(Math.abs(ashore.pillar - VOID_LIGHT.land.pillar) < 1e-9);
  assert.ok(Math.abs(ashore.fire - VOID_LIGHT.land.fire) < 1e-9);
  const between = lightLook(1);
  assert.ok(between.pool < 1 && between.pool > VOID_LIGHT.land.pool);
});
