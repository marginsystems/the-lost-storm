import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshStandardMaterial, NormalBlending } from 'three';
import type { RockFrame } from './shore-rock.ts';
import { rockAlpha, SHORE_ROCK, snapped, wetStone } from './shore-rock.ts';

const frame: RockFrame = { hero: { x: 10, z: 0 }, shift: { x: 0, z: 0 }, at: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, shown: 1 };

void test('the rock is solid across the whole shore, far from the hero as well as under him', (): void => {
  assert.equal(rockAlpha({ x: 10, z: 0 }, frame), SHORE_ROCK.opacity);
  assert.equal(rockAlpha({ x: 30, z: 25 }, frame), SHORE_ROCK.opacity);
});

void test('the rock eases in over a few metres at the shore line', (): void => {
  const half: number = rockAlpha({ x: (SHORE_ROCK.lineFrom + SHORE_ROCK.lineTo) / 2, z: 0 }, frame);
  assert.ok(half > 0 && half < SHORE_ROCK.opacity);
  assert.ok(SHORE_ROCK.lineTo - SHORE_ROCK.lineFrom <= 5);
});

void test('there is no rock on the mist side of the shore line, and none before the shore shows', (): void => {
  assert.equal(rockAlpha({ x: SHORE_ROCK.lineFrom - 1, z: 0 }, { ...frame, hero: { x: SHORE_ROCK.lineFrom - 1, z: 0 } }), 0);
  assert.equal(rockAlpha({ x: 10, z: 0 }, { ...frame, shown: 0 }), 0);
});

void test('the rock follows the hero in whole texture tiles so its pattern stays put', (): void => {
  assert.equal(snapped(7.1, 3.4), 6.8);
  assert.equal(snapped(-1.6, 3.4), -0);
});

void test('the rock is its own wet lit stone laid over the ground, not a blend that keeps the haze underneath', (): void => {
  const shared: MeshStandardMaterial = new MeshStandardMaterial();
  const rock: MeshStandardMaterial = wetStone(shared, SHORE_ROCK.wet);
  assert.notEqual(rock, shared);
  assert.equal(rock.blending, NormalBlending);
  assert.equal(rock.transparent, true);
  assert.equal(shared.transparent, false);
});
