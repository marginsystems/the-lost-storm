import type { Object3D, Scene, WebGLRenderer } from 'three';
import { BufferGeometry, Mesh, Points } from 'three';

export const MEMORY = {
  bytesPerTexel: 4,
  mipShare: 4 / 3,
  megabyte: 1024 * 1024,
} as const;

export interface MemoryReport {
  readonly textures: number;
  readonly textureMegabytes: number;
  readonly geometries: number;
  readonly geometryMegabytes: number;
  readonly framebufferMegabytes: number;
  readonly gpuMegabytes: number;
  readonly heapMegabytes: number | null;
  readonly pixelRatio: number;
  readonly drawCalls: number;
}

export function textureBytes(width: number, height: number, mipmapped: boolean): number {
  const base: number = Math.max(0, width) * Math.max(0, height) * MEMORY.bytesPerTexel;
  return mipmapped ? base * MEMORY.mipShare : base;
}

export function framebufferBytes(width: number, height: number, bytesPerPixel: number, samples: number): number {
  return width * height * bytesPerPixel * Math.max(1, samples);
}

function sizeOf(image: unknown): { readonly width: number; readonly height: number } | null {
  if (image === null || typeof image !== 'object') return null;
  const width: unknown = Reflect.get(image, 'width');
  const height: unknown = Reflect.get(image, 'height');
  return typeof width === 'number' && typeof height === 'number' ? { width, height } : null;
}

function arrayBytes(value: unknown): number {
  return ArrayBuffer.isView(value) ? value.byteLength : 0;
}

function attributeBytes(attribute: unknown): number {
  if (attribute === null || typeof attribute !== 'object') return 0;
  const data: unknown = Reflect.get(attribute, 'data');
  if (data !== null && typeof data === 'object') return arrayBytes(Reflect.get(data, 'array'));
  return arrayBytes(Reflect.get(attribute, 'array'));
}

function isTexture(value: unknown): value is object {
  return value !== null && typeof value === 'object' && Reflect.get(value, 'isTexture') === true;
}

function heapMegabytes(): number | null {
  const memory: unknown = Reflect.get(performance, 'memory');
  if (memory === null || typeof memory !== 'object') return null;
  const used: unknown = Reflect.get(memory, 'usedJSHeapSize');
  return typeof used === 'number' ? used / MEMORY.megabyte : null;
}

export function measureMemory(renderer: WebGLRenderer, scene: Scene): MemoryReport {
  const textures: Set<object> = new Set<object>();
  const geometries: Map<string, number> = new Map<string, number>();
  scene.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh) && !(object instanceof Points)) return;
    const geometry: unknown = object.geometry;
    if (geometry instanceof BufferGeometry && !geometries.has(geometry.uuid)) {
      let bytes: number = 0;
      const attributes: unknown = Reflect.get(geometry, 'attributes');
      if (attributes !== null && typeof attributes === 'object') for (const attribute of Object.values(attributes)) bytes += attributeBytes(attribute);
      bytes += attributeBytes(Reflect.get(geometry, 'index'));
      geometries.set(geometry.uuid, bytes);
    }
    const materials: unknown = object.material;
    const list: unknown[] = Array.isArray(materials) ? materials : [materials];
    for (const material of list) {
      if (material === null || typeof material !== 'object') continue;
      for (const value of Object.values(material)) if (isTexture(value)) textures.add(value);
    }
  });
  let textureTotal: number = 0;
  for (const texture of textures) {
    const size = sizeOf(Reflect.get(texture, 'image'));
    if (size !== null) textureTotal += textureBytes(size.width, size.height, Reflect.get(texture, 'generateMipmaps') === true);
  }
  const geometryTotal: number = [...geometries.values()].reduce((sum: number, bytes: number): number => sum + bytes, 0);
  const canvas: HTMLCanvasElement = renderer.domElement;
  const framebuffer: number = framebufferBytes(canvas.width, canvas.height, MEMORY.bytesPerTexel * 2, 1);
  const heap: number | null = heapMegabytes();
  const megabytes = (bytes: number): number => Math.round((bytes / MEMORY.megabyte) * 10) / 10;
  return {
    textures: textures.size,
    textureMegabytes: megabytes(textureTotal),
    geometries: geometries.size,
    geometryMegabytes: megabytes(geometryTotal),
    framebufferMegabytes: megabytes(framebuffer),
    gpuMegabytes: megabytes(textureTotal + geometryTotal + framebuffer),
    heapMegabytes: heap === null ? null : megabytes(heap * MEMORY.megabyte),
    pixelRatio: renderer.getPixelRatio(),
    drawCalls: renderer.info.render.calls,
  };
}
