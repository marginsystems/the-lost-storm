import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ImageHolder } from './textures.ts';
import { shrinkTexture } from './textures.ts';

void test('a webview can downsize an image element without an ImageBitmap constructor', (): void => {
  class ImageElement {
    readonly width: number = 1024;
    readonly height: number = 512;
  }
  const canvas = { width: 0, height: 0, getContext: (): object => ({ drawImage: (): void => {} }) };
  const replacements = { HTMLImageElement: ImageElement, document: { createElement: (): typeof canvas => canvas }, ImageBitmap: undefined };
  const previous = Object.keys(replacements).map((key: string) => ({ key, descriptor: Object.getOwnPropertyDescriptor(globalThis, key) }));
  try {
    for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true });
    const texture: ImageHolder = { image: new ImageElement(), needsUpdate: false };
    assert.equal(shrinkTexture(texture, 256), true);
    assert.equal(texture.image, canvas);
    assert.deepEqual([canvas.width, canvas.height], [256, 128]);
    assert.equal(texture.needsUpdate, true);
  } finally {
    for (const { key, descriptor } of previous) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
      else Object.defineProperty(globalThis, key, descriptor);
    }
  }
});
