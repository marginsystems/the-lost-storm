import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { LOBBY_MIST, MIST_FRAGMENT, mistAnchor, mistSize } from './lobby-mist.ts';
import type { MistSize } from './lobby-mist.ts';

void test('the storm backdrop draws at half size and never past its pixel budget, so a big screen stays smooth', (): void => {
  assert.deepEqual(mistSize(800, 600, 1), { width: 400, height: 300 });
  const big: MistSize = mistSize(2560, 1440, 2);
  assert.ok(big.width * big.height <= LOBBY_MIST.maxPixels * 1.01, `${String(big.width)}x${String(big.height)}`);
  assert.deepEqual(mistSize(0, 0, 0), { width: 1, height: 1 });
});

void test('the shaft of light falls from above the screen, leaning in, onto the hero', (): void => {
  const anchor = mistAnchor([0.5, 0.6]);
  assert.deepEqual(anchor.target, [0.5, 0.6]);
  assert.equal(anchor.light[0], 0.5 + LOBBY_MIST.lightLean);
  assert.equal(anchor.light[1], 1 + LOBBY_MIST.lightAboveTop);
});

void test('the backdrop shader has no unclamped pow and no reversed smoothstep', (): void => {
  assert.deepEqual(unsafeGlsl(MIST_FRAGMENT), []);
});
