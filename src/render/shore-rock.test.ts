import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CustomBlending, MaxEquation, MeshStandardMaterial } from 'three';
import type { RockFrame } from './shore-rock.ts';
import { brighterOnly, rockAlpha, SHORE_ROCK, snapped } from './shore-rock.ts';

const frame: RockFrame = { hero: { x: 10, z: 0 }, shift: { x: 0, z: 0 }, at: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, shown: 1 };

void test('the rock shows solid under the hero on the shore and fades into mist around him', (): void => {
  assert.equal(rockAlpha({ x: 10, z: 0 }, frame), SHORE_ROCK.opacity);
  assert.ok(rockAlpha({ x: 10, z: SHORE_ROCK.outer + 1 }, frame) === 0);
  const half: number = rockAlpha({ x: 10, z: (SHORE_ROCK.inner + SHORE_ROCK.outer) / 2 }, frame);
  assert.ok(half > 0 && half < SHORE_ROCK.opacity);
});

void test('there is no rock on the mist side of the shore line, and none before the shore shows', (): void => {
  assert.equal(rockAlpha({ x: SHORE_ROCK.lineFrom - 1, z: 0 }, { ...frame, hero: { x: SHORE_ROCK.lineFrom - 1, z: 0 } }), 0);
  assert.equal(rockAlpha({ x: 10, z: 0 }, { ...frame, shown: 0 }), 0);
});

void test('the rock follows the hero in whole texture tiles so its pattern stays put', (): void => {
  assert.equal(snapped(7.1, 3.4), 6.8);
  assert.equal(snapped(-1.6, 3.4), -0);
});

void test('the rock only ever adds light: it keeps the brighter of itself and the ground, faded by its own alpha', (): void => {
  const shared: MeshStandardMaterial = new MeshStandardMaterial({ transparent: true });
  const rock: MeshStandardMaterial = brighterOnly(shared, SHORE_ROCK.wet);
  assert.notEqual(rock, shared);
  assert.equal(rock.blending, CustomBlending);
  assert.equal(rock.blendEquation, MaxEquation);
  assert.equal(rock.premultipliedAlpha, true);
  assert.equal(rock.transparent, true);
  assert.notEqual(shared.blendEquation, MaxEquation);
});
