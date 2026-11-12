import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshStandardMaterial, ShaderChunk, ShaderLib } from 'three';
import { clampedWet, patchGroundShader, wetGround, wetGroundFragment, wetGroundKey } from './wet-ground.ts';
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

void test('the patch reaches the real standard shader: map, roughness and both normal samples are rewritten', (): void => {
  assert.ok(ShaderChunk.normal_fragment_maps.includes('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;'));
  const shader: { vertexShader: string; fragmentShader: string } = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
  patchGroundShader(shader, 0.6);
  assert.match(shader.vertexShader, /vGroundXZ = uv;/);
  assert.doesNotMatch(shader.fragmentShader, /#include <map_fragment>/);
  assert.doesNotMatch(shader.fragmentShader, /#include <normal_fragment_maps>/);
  assert.match(shader.fragmentShader, /groundTurned\( vNormalMapUv \)/);
  assert.match(shader.fragmentShader, /groundPuddle \* 0\.85/);
  assert.match(shader.fragmentShader, /1\.0 - smoothstep\( 0\.45, 0\.85/);
});
