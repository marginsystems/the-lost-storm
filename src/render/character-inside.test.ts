import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHARACTER_INSIDE, INSIDE_LIGHT } from './character-inside.ts';

void test('the inside of a garment takes only a little direct light, so a fold seen from behind stays dark cloth instead of catching the rim light', (): void => {
  assert.match(CHARACTER_INSIDE, /^#include <lights_fragment_end>\nif \( ! gl_FrontFacing \)/);
  assert.match(CHARACTER_INSIDE, new RegExp(`directDiffuse \\*= ${INSIDE_LIGHT.direct.toFixed(2)}`));
  assert.match(CHARACTER_INSIDE, new RegExp(`directSpecular \\*= ${INSIDE_LIGHT.direct.toFixed(2)}`));
});
