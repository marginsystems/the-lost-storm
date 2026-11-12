import type { Object3D } from 'three';
import { Mesh } from 'three';
import { fittedSize } from './quality.ts';

type Drawable = HTMLImageElement | ImageBitmap | HTMLCanvasElement;

function drawable(image: unknown): Drawable | null {
  if (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) return image;
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) return image;
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) return image;
  return null;
}

export interface ImageHolder {
  image: unknown;
  needsUpdate: boolean;
}

function isImageHolder(value: unknown): value is ImageHolder {
  return value !== null && typeof value === 'object' && Reflect.get(value, 'isTexture') === true && 'image' in value;
}

export function shrinkTexture(texture: ImageHolder, maxSize: number): boolean {
  const image: Drawable | null = drawable(texture.image);
  if (image === null) return false;
  const size = fittedSize(image.width, image.height, maxSize);
  if (size.width === image.width && size.height === image.height) return false;
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (context === null) return false;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size.width, size.height);
  if (image instanceof ImageBitmap) image.close();
  texture.image = canvas;
  texture.needsUpdate = true;
  return true;
}

const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const;

function mapsOf(material: object): ImageHolder[] {
  const found: ImageHolder[] = [];
  for (const key of MAP_KEYS) {
    const value: unknown = Reflect.get(material, key);
    if (isImageHolder(value)) found.push(value);
  }
  return found;
}

export function shrinkModelTextures(root: Object3D, maxSize: number): void {
  const seen: Set<ImageHolder> = new Set<ImageHolder>();
  root.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const materials: unknown = object.material;
    const list: unknown[] = Array.isArray(materials) ? materials : [materials];
    for (const material of list) {
      if (material === null || typeof material !== 'object') continue;
      for (const texture of mapsOf(material)) {
        if (seen.has(texture)) continue;
        seen.add(texture);
        shrinkTexture(texture, maxSize);
      }
    }
  });
}
