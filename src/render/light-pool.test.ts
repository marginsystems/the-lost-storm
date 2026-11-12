import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Mesh, Points } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { COLUMN_FRAGMENT, COLUMN_VERTEX, createLightPool, LIGHT_POOL, MOTE_FRAGMENT, MOTE_VERTEX, POOL_FRAGMENT, POOL_VERTEX, poolExtent, poolLight } from './light-pool.ts';

void test('the light shaders never take pow of an unclamped value or smoothstep with reversed edges', (): void => {
  for (const source of [POOL_VERTEX, POOL_FRAGMENT, COLUMN_VERTEX, COLUMN_FRAGMENT, MOTE_VERTEX, MOTE_FRAGMENT]) assert.deepEqual(unsafeGlsl(source), []);
});

void test('the pool is brightest at its centre and only falls off from there to nothing: no dark hole and no bright band', (): void => {
  const step: number = 0.02;
  for (let d: number = step; d <= LIGHT_POOL.extent; d += step) assert.ok(poolLight(d) <= poolLight(d - step));
  assert.equal(poolLight(0), 1);
  assert.ok(poolLight(LIGHT_POOL.extent) < 1e-6);
});

void test('the light reaches a little past the trigger so its edge feathers out, and only an exit raises a column with motes', (): void => {
  assert.equal(poolExtent(2.2), 2.2 * LIGHT_POOL.extent);
  const exit = createLightPool(new Color(0x3d8cff), true);
  const spot = createLightPool(new Color(0x2fe0b8), false);
  exit.place(1, 0, 2, 2.2);
  assert.equal(exit.group.children[0]?.scale.x, poolExtent(2.2) * 2);
  assert.equal(exit.group.children.filter((part): boolean => part instanceof Mesh).length, 2);
  assert.equal(exit.group.children.filter((part): boolean => part instanceof Points).length, 1);
  assert.equal(spot.group.children.length, 1);
  exit.dispose();
  spot.dispose();
});
