import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, DoubleSide, MeshStandardMaterial } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { createGhostUniforms, GHOST_SHADE, makeGhost } from './ghost-material.ts';

void test('the ghost rim never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(GHOST_SHADE), []);
});

void test('a ghost fades out by its alpha, with no screen-space noise pattern', (): void => {
  assert.ok(!GHOST_SHADE.includes('gl_FragCoord'));
  assert.ok(GHOST_SHADE.includes('diffuseColor.a *='));
});

void test('a double-sided ghost draws in one pass, so three never marks it for a program rebuild mid-frame', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial({ side: DoubleSide });
  makeGhost(material, { flash: { value: new Color() }, hover: { value: new Color() } }, createGhostUniforms(new Color(), 0.5));
  assert.equal(material.transparent, true);
  assert.equal(material.forceSinglePass, true);
});

void test('a hovered ghost glows at its edge, never as a flat fill', (): void => {
  assert.match(GHOST_SHADE, /uHover \* pow\(ghostFacing,/);
});
