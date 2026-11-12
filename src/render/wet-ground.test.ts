import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshStandardMaterial } from 'three';
import { clampedWet, wetGround, wetGroundFragment, wetGroundKey } from './wet-ground.ts';
import type { WetGroundParts } from './wet-ground.ts';

void test('wetness is clamped and rounded so nearby values share one program', (): void => {
  assert.equal(clampedWet(-1), 0);
  assert.equal(clampedWet(3), 1);
  assert.equal(wetGroundKey(0.6), wetGroundKey(0.601));
  assert.notEqual(wetGroundKey(0), wetGroundKey(0.6));
});

void test('a dry ground has no puddles and no wet cracks', (): void => {
  const parts: WetGroundParts = wetGroundFragment(0);
  assert.match(parts.map, /\* 0\.0;/);
  assert.match(parts.head, /groundTurned/);
});

void test('the ground material gets the wet patch and a shared cache key', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  wetGround(material, 0.6);
  assert.equal(material.customProgramCacheKey(), wetGroundKey(0.6));
});
