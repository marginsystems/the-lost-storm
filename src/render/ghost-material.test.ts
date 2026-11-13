import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, DoubleSide, MeshStandardMaterial } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { createGhostUniforms, createRigGlow, flashLift, GHOST_SHADE, makeGhost } from './ghost-material.ts';

void test('the ghost rim never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(GHOST_SHADE), []);
});

void test('a ghost fades out by its alpha, with no screen-space noise pattern', (): void => {
  assert.ok(!GHOST_SHADE.includes('gl_FragCoord'));
  assert.ok(GHOST_SHADE.includes('diffuseColor.a *='));
});

void test('a double-sided ghost draws in one pass, so three never marks it for a program rebuild mid-frame', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial({ side: DoubleSide });
  makeGhost(material, createRigGlow(), createGhostUniforms(new Color(), 0.5));
  assert.equal(material.transparent, true);
  assert.equal(material.forceSinglePass, true);
});

void test('a hovered ghost glows at its edge, never as a flat fill', (): void => {
  assert.match(GHOST_SHADE, /uHover \* pow\(ghostFacing,/);
});

void test('a struck ghost flashes at its edge and brightens in its own tint, never a flat white fill', (): void => {
  assert.match(GHOST_SHADE, /uFlash \* \( 0\.15 \+ 0\.85 \* pow\( ghostFacing,/);
  assert.match(GHOST_SHADE, /uGhostTint \* uFlashLift/);
  assert.doesNotMatch(GHOST_SHADE, /\+= uFlash \+/);
});

void test('the flash lift peaks on a hit\'s first frames and eases faster than the flash itself, so a landed hit pops and settles', (): void => {
  assert.ok(flashLift(1) > 0);
  assert.ok(flashLift(0.5) < flashLift(1) * 0.5 * 0.5);
  assert.equal(flashLift(0), 0);
});
