import assert from 'node:assert/strict';
import { test } from 'node:test';
import { framebufferBytes, MEMORY, textureBytes } from './memory.ts';

void test('a texture costs four bytes a texel and a third more with mipmaps', (): void => {
  assert.equal(textureBytes(1024, 1024, false), 1024 * 1024 * MEMORY.bytesPerTexel);
  assert.equal(textureBytes(1024, 1024, true), 1024 * 1024 * MEMORY.bytesPerTexel * MEMORY.mipShare);
  assert.equal(textureBytes(-1, 10, false), 0);
});

void test('a framebuffer scales with its samples', (): void => {
  assert.equal(framebufferBytes(10, 10, 8, 4), 10 * 10 * 8 * 4);
  assert.equal(framebufferBytes(10, 10, 8, 0), 10 * 10 * 8);
});
