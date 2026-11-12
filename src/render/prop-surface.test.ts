import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IUniform } from 'three';
import { MeshStandardMaterial, ShaderLib } from 'three';
import { lookOf, patchPropShader, PROP_SURFACE, propLookKey, propUniforms, withPropLook } from './prop-surface.ts';
import type { PropLook, PropUniforms, ShaderSource } from './prop-surface.ts';

const TRIPLANAR: PropLook = { tileMetres: 2, wet: 0.8, ground: 0.5 };
const OWN_UVS: PropLook = { tileMetres: null, wet: 0.8, ground: 0 };

function physical(): ShaderSource {
  const uniforms: Record<string, IUniform> = {};
  return { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader, uniforms };
}

void test('one program per mapping mode, whatever the wetness, tile size or ground height', (): void => {
  assert.equal(propLookKey(TRIPLANAR), propLookKey({ tileMetres: 0.5, wet: 0, ground: 3 }));
  assert.notEqual(propLookKey(TRIPLANAR), propLookKey(OWN_UVS));
});

void test('the uniforms carry the tile as a frequency, wetness clamped, and the ground height', (): void => {
  const uniforms: PropUniforms = propUniforms({ tileMetres: 4, wet: 3, ground: 1.5 });
  assert.equal(uniforms.uPropTile.value, 0.25);
  assert.equal(uniforms.uPropWet.value, 1);
  assert.equal(uniforms.uPropGround.value, 1.5);
  assert.equal(propUniforms(OWN_UVS).uPropTile.value, 1);
});

void test('a triplanar prop samples colour, normal and ORM in world space and never reads the mesh UVs for them', (): void => {
  const shader: ShaderSource = physical();
  patchPropShader(shader, TRIPLANAR);
  assert.match(shader.vertexShader, /vPropWorld = propWorld\.xyz;/);
  assert.match(shader.vertexShader, /instanceMatrix \* propWorld/);
  assert.doesNotMatch(shader.fragmentShader, /#include <map_fragment>/);
  assert.doesNotMatch(shader.fragmentShader, /#include <normal_fragment_maps>/);
  assert.doesNotMatch(shader.fragmentShader, /#include <aomap_fragment>/);
  assert.match(shader.fragmentShader, /texture2D\( map, vPropWorld\.xz \* uPropTile \)/);
  assert.match(shader.fragmentShader, /texture2D\( normalMap, vPropWorld\.zy \* uPropTile \)/);
  assert.match(shader.fragmentShader, /propRough = propOrm\.g;/);
  assert.ok(shader.uniforms['uPropTile'] !== undefined);
});

void test('a prop with its own textures keeps its UV mapping and still gets wetness and contact darkening', (): void => {
  const shader: ShaderSource = physical();
  patchPropShader(shader, OWN_UVS);
  assert.match(shader.fragmentShader, /#include <map_fragment>/);
  assert.match(shader.fragmentShader, /#include <normal_fragment_maps>/);
  assert.match(shader.fragmentShader, /propContact/);
  assert.match(shader.fragmentShader, /propPuddle/);
});

void test('wet stone never goes below the least roughness except in a puddle on a flat top', (): void => {
  const shader: ShaderSource = physical();
  patchPropShader(shader, TRIPLANAR);
  assert.ok(shader.fragmentShader.includes(`${PROP_SURFACE.leastRoughness}`));
  assert.match(shader.fragmentShader, new RegExp(`propUp = smoothstep\\( ${PROP_SURFACE.puddleUp}`));
  assert.match(shader.fragmentShader, new RegExp(`roughnessFactor, ${PROP_SURFACE.puddleRoughness}, propPuddle`));
});

void test('the look is remembered on the material and sets its compile hook and key', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  withPropLook(material, TRIPLANAR);
  assert.equal(lookOf(material), TRIPLANAR);
  assert.equal(material.customProgramCacheKey(), propLookKey(TRIPLANAR));
  assert.equal(lookOf(material.clone()), undefined);
});
