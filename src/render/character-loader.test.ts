import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { CHARACTER_SHADE } from './character-loader.ts';

void test('a character\'s shading never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(CHARACTER_SHADE), []);
});

void test('the hover glow lights only a character\'s edge, so a hovered person keeps their shading instead of turning into a flat cut-out', (): void => {
  assert.match(CHARACTER_SHADE, /uHover \* pow\( edgeFacing,/);
  assert.doesNotMatch(CHARACTER_SHADE, /uHover \+|\+ uHover;|uHover\s*;/);
});
