import { Texture, TextureLoader } from 'three';

export const BITMAP_DECODE: ImageBitmapOptions = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

const ROW_PROBE = {
  top: [255, 0, 0, 255],
  bottom: [0, 0, 255, 255],
} as const;

export interface BitmapSource<Decoded extends object> {
  fetch(url: string): Promise<Blob>;
  decode(blob: Blob, options: ImageBitmapOptions): Promise<Decoded>;
  flipsRows(): Promise<boolean>;
  close(decoded: Decoded): void;
}

export type ImageLoad = (url: string, loaded: (texture: Texture) => void, failed: () => void) => Texture;

export interface BitmapTextures {
  load(url: string, loaded: (texture: Texture) => void, failed: () => void): Texture;
  restore(): number;
}

async function browserFlipsRows(): Promise<boolean> {
  const pixels: ImageData = new ImageData(new Uint8ClampedArray([...ROW_PROBE.top, ...ROW_PROBE.bottom]), 1, 2);
  const bitmap: ImageBitmap = await createImageBitmap(pixels, BITMAP_DECODE);
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 2;
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    return false;
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const top: Uint8ClampedArray = context.getImageData(0, 0, 1, 1).data;
  return top[0] === ROW_PROBE.bottom[0] && top[2] === ROW_PROBE.bottom[2];
}

export function browserBitmaps(): BitmapSource<ImageBitmap> | null {
  if (typeof createImageBitmap === 'undefined' || typeof fetch === 'undefined' || typeof ImageData === 'undefined') return null;
  return {
    async fetch(url: string): Promise<Blob> {
      const response: Response = await fetch(url);
      if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
      return response.blob();
    },
    decode(blob: Blob, options: ImageBitmapOptions): Promise<ImageBitmap> {
      return createImageBitmap(blob, options);
    },
    flipsRows(): Promise<boolean> {
      return browserFlipsRows().catch((): boolean => false);
    },
    close(decoded: ImageBitmap): void {
      decoded.close();
    },
  };
}

const imageLoader: TextureLoader = new TextureLoader();

export function browserImageLoad(url: string, loaded: (texture: Texture) => void, failed: () => void): Texture {
  return imageLoader.load(url, loaded, undefined, failed);
}

interface Restorable {
  readonly url: string;
  readonly loaded: (texture: Texture) => void;
}

export function createBitmapTextures<Decoded extends object>(source: BitmapSource<Decoded> | null, image: ImageLoad): BitmapTextures {
  if (source === null) return { load: image, restore: (): number => 0 };
  let flips: Promise<boolean> | null = null;
  const closed: Map<Texture, Restorable> = new Map<Texture, Restorable>();

  const fromImage = (texture: Texture, url: string, loaded: (texture: Texture) => void, failed: () => void): void => {
    image(
      url,
      (from: Texture): void => {
        texture.image = from.image;
        texture.flipY = true;
        texture.needsUpdate = true;
        loaded(texture);
      },
      failed,
    );
  };

  const decodeInto = async (texture: Texture, url: string, loaded: (texture: Texture) => void): Promise<boolean> => {
    flips ??= source.flipsRows().catch((): boolean => false);
    if (!(await flips)) return false;
    let decoded: Decoded;
    try {
      decoded = await source.decode(await source.fetch(url), BITMAP_DECODE);
    } catch {
      return false;
    }
    texture.flipY = false;
    texture.image = decoded;
    texture.onUpdate = (): void => {
      if (texture.image !== decoded) return;
      source.close(decoded);
      texture.image = null;
      closed.set(texture, { url, loaded });
    };
    texture.needsUpdate = true;
    loaded(texture);
    return true;
  };

  const arrive = async (texture: Texture, url: string, loaded: (texture: Texture) => void, failed: () => void): Promise<void> => {
    if (await decodeInto(texture, url, loaded)) return;
    fromImage(texture, url, loaded, failed);
  };

  return {
    load(url: string, loaded: (texture: Texture) => void, failed: () => void): Texture {
      const texture: Texture = new Texture();
      texture.addEventListener('dispose', (): void => {
        closed.delete(texture);
      });
      void arrive(texture, url, loaded, failed);
      return texture;
    },
    restore(): number {
      const waiting: [Texture, Restorable][] = [...closed];
      closed.clear();
      for (const [texture, kept] of waiting) {
        void arrive(texture, kept.url, kept.loaded, (): void => undefined);
      }
      return waiting.length;
    },
  };
}
