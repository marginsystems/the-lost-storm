import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { CHARACTER_SHADE, flashLevel } from './character-loader.ts';

void test('a character\'s shading never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(CHARACTER_SHADE), []);
});

void test('the hover glow lights only a character\'s edge, so a hovered person keeps their shading instead of turning into a flat cut-out', (): void => {
  assert.match(CHARACTER_SHADE, /uHover \* pow\( edgeFacing,/);
  assert.doesNotMatch(CHARACTER_SHADE, /uHover \+|\+ uHover;|uHover\s*;/);
});

void test('a hit flash lights a character mostly at the edge, so a struck figure keeps its shading instead of filling flat white', (): void => {
  assert.match(CHARACTER_SHADE, /uFlash \* \( 0\.30 \+ 0\.70 \* pow\( edgeFacing,/);
});

void test('a hit flash peaks hard on its first frames and eases faster than it would linearly, so a landed hit still pops', (): void => {
  const peak: number = flashLevel(1);
  const half: number = flashLevel(0.5);
  assert.ok(peak > 2 * half);
  assert.equal(flashLevel(0), 0);
});
