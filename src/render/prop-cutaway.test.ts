import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, ShaderLib, Vector3 } from 'three';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { CutSpring } from './prop-cutaway.ts';
import { aimCutaway, CUTAWAY, CUTAWAY_UNIFORMS, cutawayChunk, ghostKeep, heroBehind, isTall, patchCutawayShader, setOccluders, springCut, windowMetres, withCutaway } from './prop-cutaway.ts';

function rock(x: number, z: number, height: number): Mesh {
  const mesh: Mesh = new Mesh(new BoxGeometry(2, height, 2), new MeshStandardMaterial());
  mesh.position.set(x, height / 2, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

const EYE: Vector3 = new Vector3(20, 21, 20);

function cutLevel(): number {
  return CUTAWAY_UNIFORMS.uCutLevel.value;
}

void test('a prop material is set up for the cutaway once and stays opaque, so it sorts by depth with the hero', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  const key: string = material.customProgramCacheKey();
  assert.equal(withCutaway(material), material);
  assert.equal(material.transparent, false);
  const once: string = material.customProgramCacheKey();
  assert.notEqual(once, key);
  withCutaway(material);
  assert.equal(material.customProgramCacheKey(), once);
  const basic: MeshBasicMaterial = new MeshBasicMaterial();
  assert.equal(withCutaway(basic), basic);
  assert.equal(basic.customProgramCacheKey(), new MeshBasicMaterial().customProgramCacheKey());
});

void test('the cutaway opens a dithered window in the real standard shader, only in front of the hero and only as far as the spring has opened it', (): void => {
  const shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> } = { fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} };
  patchCutawayShader(shader);
  assert.match(shader.fragmentShader, /uniform vec2 uCutCentre;/);
  assert.match(shader.fragmentShader, /uniform float uCutLevel;/);
  assert.ok(shader.fragmentShader.indexOf('discard;') > shader.fragmentShader.indexOf('#include <dithering_fragment>'));
  assert.doesNotMatch(shader.fragmentShader, /gl_FragColor\.a \*=/);
  assert.match(shader.fragmentShader, /vViewPosition\.z/);
  assert.equal(shader.uniforms['uCutLevel'], CUTAWAY_UNIFORMS.uCutLevel);
});

void test('only a prop that can hide his head and chest is tall enough to cut away', (): void => {
  assert.equal(isTall(0.47), false);
  assert.equal(isTall(1.2), false);
  assert.equal(isTall(2.42), true);
  assert.equal(isTall(5.28), true);
});

void test('he is behind a rock only where it rises between his chest or head and the camera, never behind a low one, one at his back, or a hidden one', (): void => {
  const hero: ReadonlyVec2 = { x: 0, z: 0 };
  assert.equal(heroBehind(hero, EYE, [rock(1.5, 1.5, 3.4)]), true);
  assert.equal(heroBehind(hero, EYE, [rock(1.5, 1.5, 1)]), false);
  assert.equal(heroBehind(hero, EYE, [rock(-1.5, -1.5, 5)]), false);
  assert.equal(heroBehind(hero, EYE, []), false);
  const hidden: Mesh = rock(1.5, 1.5, 3.4);
  const holder: Group = new Group();
  holder.add(hidden);
  holder.visible = false;
  assert.equal(heroBehind(hero, EYE, [hidden]), false);
});

void test('the window eases open on the spring and closes back to nothing', (): void => {
  let state: CutSpring = { level: 0, velocity: 0 };
  const opened: number[] = [];
  for (let frame: number = 0; frame < 60; frame += 1) {
    state = springCut(state, 1, 1 / 60);
    opened.push(state.level);
  }
  assert.ok((opened[0] ?? 1) < 0.1);
  assert.ok(opened.every((level: number, index: number): boolean => index === 0 || level >= (opened[index - 1] ?? 0) - 1e-9));
  assert.ok(state.level > 0.95);
  for (let frame: number = 0; frame < 120; frame += 1) state = springCut(state, 0, 1 / 60);
  assert.equal(state.level, 0);
});

void test('aiming at a hero in the middle of the view puts the cutaway in the middle of the screen at his depth, closed while nothing hides him', (): void => {
  setOccluders([]);
  const camera: PerspectiveCamera = new PerspectiveCamera(30, 2, 1, 220);
  camera.position.set(20, 20 + CUTAWAY.heroHeight, 20);
  camera.lookAt(0, CUTAWAY.heroHeight, 0);
  aimCutaway(camera, 0, 0, 1600, 800, 1 / 60);
  assert.ok(Math.abs(CUTAWAY_UNIFORMS.uCutCentre.value.x - 800) < 0.5);
  assert.ok(Math.abs(CUTAWAY_UNIFORMS.uCutCentre.value.y - 400) < 0.5);
  assert.ok(Math.abs(CUTAWAY_UNIFORMS.uCutDepth.value - Math.hypot(20, 20, 20)) < 1e-6);
  assert.equal(CUTAWAY_UNIFORMS.uCutRadius.value, CUTAWAY.radius * 800);
  assert.equal(cutLevel(), 0);
  setOccluders([rock(1.5, 1.5, 3.4)]);
  for (let frame: number = 0; frame < 30; frame += 1) aimCutaway(camera, 0, 0, 1600, 800, 1 / 60);
  assert.ok(cutLevel() > 0.5);
  setOccluders([]);
});

void test('a prop narrower than the window keeps a faint ghost through its core, and a wide prop opens fully', (): void => {
  assert.equal(ghostKeep(1.6, 3), CUTAWAY.ghost);
  assert.equal(ghostKeep(6, 3), 0);
  assert.equal(ghostKeep(Infinity, 3), 0);
  const camera: PerspectiveCamera = new PerspectiveCamera(30, 2, 1, 220);
  assert.ok(Math.abs(windowMetres(camera, 20) - (4 * CUTAWAY.radius * 20 * Math.tan(Math.PI / 12)) / CUTAWAY.narrow) < 1e-9);
  const shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> } = { fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} };
  const keep = { value: 0.2 };
  patchCutawayShader(shader, keep);
  assert.equal(shader.uniforms['uCutKeep'], keep);
  assert.match(shader.fragmentShader, /uniform float uCutKeep;/);
});

void test('the ghosted remainder of a cut prop is dimmed and capped, so wet highlights on it never sparkle over the hero', (): void => {
  const chunk: string = cutawayChunk();
  assert.match(chunk, /min\( gl_FragColor\.rgb, vec3\( /);
  assert.match(chunk, /cutWeight \* step\( 0\.0001, uCutKeep \)/);
});
