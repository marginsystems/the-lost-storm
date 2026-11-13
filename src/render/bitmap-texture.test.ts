import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Texture } from 'three';
import { BITMAP_DECODE, createBitmapTextures } from './bitmap-texture.ts';
import type { BitmapSource, BitmapTextures, ImageLoad } from './bitmap-texture.ts';

interface FakeBitmap {
  readonly width: number;
  readonly height: number;
  open: boolean;
}

interface FakeImage {
  readonly src: string;
}

interface Fakes {
  readonly fetched: string[];
  readonly decodedWith: ImageBitmapOptions[];
  readonly bitmaps: FakeBitmap[];
  readonly images: string[];
}

interface Behaviour {
  readonly decodes: boolean;
  readonly flips: boolean;
  readonly imagesLoad: boolean;
}

const WORKS: Behaviour = { decodes: true, flips: true, imagesLoad: true };

function fakes(): Fakes {
  return { fetched: [], decodedWith: [], bitmaps: [], images: [] };
}

function source(seen: Fakes, behaviour: Behaviour): BitmapSource<FakeBitmap> {
  return {
    fetch(url: string): Promise<Blob> {
      seen.fetched.push(url);
      return Promise.resolve(new Blob([]));
    },
    decode(_blob: Blob, options: ImageBitmapOptions): Promise<FakeBitmap> {
      seen.decodedWith.push(options);
      if (!behaviour.decodes) throw new TypeError('createImageBitmap is not supported for this image');
      const bitmap: FakeBitmap = { width: 4, height: 4, open: true };
      seen.bitmaps.push(bitmap);
      return Promise.resolve(bitmap);
    },
    flipsRows(): Promise<boolean> {
      return Promise.resolve(behaviour.flips);
    },
    close(decoded: FakeBitmap): void {
      decoded.open = false;
    },
  };
}

function imageLoad(seen: Fakes, behaviour: Behaviour): ImageLoad {
  return (url: string, loaded: (texture: Texture) => void, failed: () => void): Texture => {
    seen.images.push(url);
    const texture: Texture = new Texture();
    queueMicrotask((): void => {
      if (!behaviour.imagesLoad) {
        failed();
        return;
      }
      const image: FakeImage = { src: url };
      texture.image = image;
      loaded(texture);
    });
    return texture;
  };
}

const SETTLE_ROUNDS = 6;

const settle = (rounds: number = SETTLE_ROUNDS): Promise<void> =>
  rounds === 0
    ? Promise.resolve()
    : new Promise<void>((resolve: () => void): void => {
        setImmediate(resolve);
      }).then((): Promise<void> => settle(rounds - 1));

interface Loaded {
  readonly texture: Texture;
  readonly arrivals: Texture[];
  readonly failures: number[];
}

function load(textures: BitmapTextures, url: string): Loaded {
  const arrivals: Texture[] = [];
  const failures: number[] = [];
  const texture: Texture = textures.load(
    url,
    (done: Texture): void => {
      arrivals.push(done);
    },
    (): void => {
      failures.push(1);
    },
  );
  return { texture, arrivals, failures };
}

function uploaded(texture: Texture): void {
  texture.onUpdate?.(texture);
}

void test('a surface texture is decoded off the main thread and uploaded the right way up', async (): Promise<void> => {
  const seen: Fakes = fakes();
  const loaded: Loaded = load(createBitmapTextures(source(seen, WORKS), imageLoad(seen, WORKS)), 'textures/dirt_color.webp');
  assert.equal(loaded.texture.version, 0);
  await settle();
  assert.deepEqual(seen.decodedWith, [BITMAP_DECODE]);
  assert.deepEqual(seen.images, []);
  assert.deepEqual(loaded.arrivals, [loaded.texture]);
  assert.equal(loaded.texture.image, seen.bitmaps[0]);
  assert.equal(loaded.texture.flipY, false);
  assert.equal(loaded.texture.version, 1);
});

void test('when createImageBitmap throws, the texture falls back to the image path, flipped by WebGL, and is never left blank', async (): Promise<void> => {
  const seen: Fakes = fakes();
  const behaviour: Behaviour = { ...WORKS, decodes: false };
  const loaded: Loaded = load(createBitmapTextures(source(seen, behaviour), imageLoad(seen, behaviour)), 'textures/dirt_color.webp');
  await settle();
  assert.deepEqual(seen.images, ['textures/dirt_color.webp']);
  assert.deepEqual(loaded.texture.image, { src: 'textures/dirt_color.webp' });
  assert.equal(loaded.texture.flipY, true);
  assert.equal(loaded.texture.version, 1);
  assert.deepEqual(loaded.arrivals, [loaded.texture]);
  assert.deepEqual(loaded.failures, []);
});

void test('a browser that ignores the flip option never decodes bitmaps, so every texture comes out the same way up', async (): Promise<void> => {
  const seen: Fakes = fakes();
  const behaviour: Behaviour = { ...WORKS, flips: false };
  const textures: BitmapTextures = createBitmapTextures(source(seen, behaviour), imageLoad(seen, behaviour));
  const first: Loaded = load(textures, 'textures/a.webp');
  const second: Loaded = load(textures, 'textures/b.webp');
  await settle();
  assert.deepEqual(seen.decodedWith, []);
  assert.deepEqual(seen.images, ['textures/a.webp', 'textures/b.webp']);
  assert.equal(first.texture.flipY, true);
  assert.equal(second.texture.flipY, true);
});

void test('a texture neither path can load reports one failure and is not marked for upload', async (): Promise<void> => {
  const seen: Fakes = fakes();
  const behaviour: Behaviour = { decodes: false, flips: true, imagesLoad: false };
  const loaded: Loaded = load(createBitmapTextures(source(seen, behaviour), imageLoad(seen, behaviour)), 'textures/missing.webp');
  await settle();
  assert.deepEqual(loaded.failures, [1]);
  assert.equal(loaded.texture.version, 0);
  assert.deepEqual(loaded.arrivals, []);
});

void test('a bitmap is closed once it is uploaded, and a restored context decodes it again', async (): Promise<void> => {
  const seen: Fakes = fakes();
  const textures: BitmapTextures = createBitmapTextures(source(seen, WORKS), imageLoad(seen, WORKS));
  const loaded: Loaded = load(textures, 'textures/dirt_color.webp');
  await settle();
  const first: FakeBitmap | undefined = seen.bitmaps[0];
  uploaded(loaded.texture);
  assert.equal(first?.open, false);
  assert.equal(loaded.texture.image, null);
  assert.equal(textures.restore(), 1);
  await settle();
  assert.equal(seen.bitmaps.length, 2);
  assert.equal(loaded.texture.image, seen.bitmaps[1]);
  assert.equal(loaded.texture.version, 2);
  assert.equal(loaded.arrivals.length, 2);
  assert.equal(textures.restore(), 0);
});

void test('a released texture is forgotten and never decoded again on a restored context', async (): Promise<void> => {
  const seen: Fakes = fakes();
  const textures: BitmapTextures = createBitmapTextures(source(seen, WORKS), imageLoad(seen, WORKS));
  const loaded: Loaded = load(textures, 'textures/dirt_color.webp');
  await settle();
  uploaded(loaded.texture);
  loaded.texture.dispose();
  assert.equal(textures.restore(), 0);
});

void test('without createImageBitmap the old image loader is used as it is', (): void => {
  const seen: Fakes = fakes();
  const textures: BitmapTextures = createBitmapTextures(null, imageLoad(seen, WORKS));
  textures.load('textures/a.webp', (): void => undefined, (): void => undefined);
  assert.deepEqual(seen.images, ['textures/a.webp']);
  assert.equal(textures.restore(), 0);
});
