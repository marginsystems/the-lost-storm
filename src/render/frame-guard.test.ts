import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { FRAME_GUARD_FRAGMENT, FRAME_GUARD_VERTEX } from './frame-guard.ts';

void test('the frame guard shader is itself safe and replaces a broken pixel before bloom can spread it', (): void => {
  for (const source of [FRAME_GUARD_VERTEX, FRAME_GUARD_FRAGMENT]) assert.deepEqual(unsafeGlsl(source), []);
  assert.match(FRAME_GUARD_FRAGMENT, /floatBitsToUint\(texel\)/);
  assert.match(FRAME_GUARD_FRAGMENT, /clamp\(texel\.rgb/);
});
