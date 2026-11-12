import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, ShaderLib } from 'three';
import { aimCutaway, CUTAWAY, CUTAWAY_UNIFORMS, patchCutawayShader, withCutaway } from './prop-cutaway.ts';

void test('a prop material is set up for the cutaway once, before it is ever drawn, so nothing recompiles in play', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const key: string = material.customProgramCacheKey();
  assert.equal(withCutaway(material), material);
  assert.equal(material.transparent, true);
  assert.equal(material.forceSinglePass, true);
  const once: string = material.customProgramCacheKey();
  assert.notEqual(once, key);
  withCutaway(material);
  assert.equal(material.customProgramCacheKey(), once);
  const basic: MeshBasicMaterial = new MeshBasicMaterial();
  withCutaway(basic);
  assert.equal(basic.transparent, false);
});

void test('the cutaway reaches the real standard shader and only thins fragments in front of the hero, near him on screen', (): void => {
  const shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> } = { fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} };
  patchCutawayShader(shader);
  assert.match(shader.fragmentShader, /uniform vec2 uCutCentre;/);
  assert.ok(shader.fragmentShader.indexOf('gl_FragColor.a *=') > shader.fragmentShader.indexOf('#include <dithering_fragment>'));
  assert.match(shader.fragmentShader, /vViewPosition\.z/);
  assert.equal(shader.uniforms['uCutDepth'], CUTAWAY_UNIFORMS.uCutDepth);
});

void test('aiming at a hero in the middle of the view puts the cutaway in the middle of the screen at his depth', (): void => {
  const camera: PerspectiveCamera = new PerspectiveCamera(30, 2, 1, 220);
  camera.position.set(20, 20 + CUTAWAY.heroHeight, 20);
  camera.lookAt(0, CUTAWAY.heroHeight, 0);
  aimCutaway(camera, 0, 0, 1600, 800);
  assert.ok(Math.abs(CUTAWAY_UNIFORMS.uCutCentre.value.x - 800) < 0.5);
  assert.ok(Math.abs(CUTAWAY_UNIFORMS.uCutCentre.value.y - 400) < 0.5);
  assert.ok(Math.abs(CUTAWAY_UNIFORMS.uCutDepth.value - Math.hypot(20, 20, 20)) < 1e-6);
  assert.equal(CUTAWAY_UNIFORMS.uCutRadius.value, CUTAWAY.radius * 800);
});
