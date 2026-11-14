import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { LOBBY_MIST, MIST_FRAGMENT, mistSize } from './lobby-mist.ts';
import type { MistSize } from './lobby-mist.ts';

void test('the storm backdrop draws at half size and never past its pixel budget, so a big screen stays smooth', (): void => {
  assert.deepEqual(mistSize(800, 600, 1), { width: 400, height: 300 });
  const big: MistSize = mistSize(2560, 1440, 2);
  assert.ok(big.width * big.height <= LOBBY_MIST.maxPixels * 1.01, `${String(big.width)}x${String(big.height)}`);
  assert.deepEqual(mistSize(0, 0, 0), { width: 1, height: 1 });
});

void test('the backdrop holds no shaft of light: the shaft stands in the world, so the sky behind it never has to follow the hero', (): void => {
  for (const gone of ['uLight', 'uTarget', 'shaft', 'cone']) assert.ok(!MIST_FRAGMENT.includes(gone), gone);
});

void test('the backdrop shader has no unclamped pow and no reversed smoothstep', (): void => {
  assert.deepEqual(unsafeGlsl(MIST_FRAGMENT), []);
});
