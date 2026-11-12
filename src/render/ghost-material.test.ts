import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { GHOST_SHADE } from './ghost-material.ts';

void test('the ghost rim never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(GHOST_SHADE), []);
});

void test('a ghost fades out by its alpha, with no screen-space noise pattern', (): void => {
  assert.ok(!GHOST_SHADE.includes('gl_FragCoord'));
  assert.ok(GHOST_SHADE.includes('diffuseColor.a *='));
});
