import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { createPlaceVeil } from './place-veil.ts';
import type { PlaceVeil } from './place-veil.ts';

const arch: PlaceVeil = createPlaceVeil({ node: 'veil', shape: 'arch', flow: 'rise', edge: '#6f7ff0', core: '#eef1ff' }, 1.4, new Color(0x888888));
const well: PlaceVeil = createPlaceVeil({ node: 'veil', shape: 'well', flow: 'sink', edge: '#4c6cf0', core: '#c6d4ff' }, 1, new Color(0x888888));

void test('the veil shaders never take pow of an unclamped value or smoothstep with reversed edges', (): void => {
  for (const veil of [arch, well]) {
    assert.deepEqual(unsafeGlsl(veil.material.vertexShader), []);
    assert.deepEqual(unsafeGlsl(veil.material.fragmentShader), []);
  }
});

void test('a way up glows through its arch and a way down is a dark well that hides the floor', (): void => {
  assert.equal(arch.material.transparent, true);
  assert.equal(arch.material.depthWrite, false);
  assert.equal(well.material.transparent, false);
  assert.equal(well.material.depthWrite, true);
  assert.equal(arch.uniforms.uFlow.value, 1);
  assert.equal(well.uniforms.uFlow.value, -1);
  assert.equal(arch.uniforms.uAspect.value, 1.4);
});
