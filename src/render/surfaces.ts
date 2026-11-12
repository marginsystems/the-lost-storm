import type { Material, Texture } from 'three';
import { Color, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2 } from 'three';
import type { Content, SurfaceDef } from '../../sim/content/types.ts';
import { assetUrl } from './character-loader.ts';

export const SURFACES = {
  anisotropy: 4,
  overlayOffset: -2,
} as const;

export type SurfaceUse = 'solid' | 'ground' | 'overlay';

interface Loading {
  readonly texture: Texture;
  readonly done: Promise<void>;
}

const loader: TextureLoader = new TextureLoader();
const textures: Map<string, Loading> = new Map<string, Loading>();
const materials: Map<string, MeshStandardMaterial> = new Map<string, MeshStandardMaterial>();

function loadTexture(path: string, metres: number, colour: boolean): Texture {
  const key: string = `${path}@${metres}`;
  const cached: Loading | undefined = textures.get(key);
  if (cached !== undefined) return cached.texture;
  const started: Texture[] = [];
  const done: Promise<void> = new Promise<void>((resolve: () => void): void => {
    started.push(loader.load(assetUrl(path), resolve, undefined, resolve));
  });
  const texture: Texture | undefined = started[0];
  if (texture === undefined) throw new Error(`Texture ${path} did not start loading`);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1 / metres, 1 / metres);
  texture.anisotropy = SURFACES.anisotropy;
  texture.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  textures.set(key, { texture, done });
  return texture;
}

export function surfaceMaterial(def: SurfaceDef, use: SurfaceUse): MeshStandardMaterial {
  const key: string = `${def.id}:${use}`;
  const cached: MeshStandardMaterial | undefined = materials.get(key);
  if (cached !== undefined) return cached;
  const orm: Texture | null = def.orm === null ? null : loadTexture(def.orm, def.metres, false);
  const made: MeshStandardMaterial = new MeshStandardMaterial({
    name: key,
    color: new Color(def.tint),
    map: loadTexture(def.color, def.metres, true),
    normalMap: def.normal === null ? null : loadTexture(def.normal, def.metres, false),
    normalScale: new Vector2(def.normalScale, def.normalScale),
    aoMap: orm,
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: def.roughness,
    metalness: def.metalness,
    vertexColors: use !== 'solid',
  });
  if (use === 'overlay') {
    made.transparent = true;
    made.depthWrite = false;
    made.polygonOffset = true;
    made.polygonOffsetFactor = SURFACES.overlayOffset;
    made.polygonOffsetUnits = SURFACES.overlayOffset;
  }
  materials.set(key, made);
  return made;
}

export function dressed(content: Content, dress: Readonly<Record<string, string>>, material: Material): Material {
  const surfaceId: string | undefined = dress[material.name];
  const def: SurfaceDef | undefined = surfaceId === undefined ? undefined : content.surfaces.get(surfaceId);
  return def === undefined ? material : surfaceMaterial(def, 'solid');
}

export async function preloadSurfaces(content: Content): Promise<void> {
  for (const def of content.surfaces.values()) surfaceMaterial(def, 'solid');
  await Promise.all([...textures.values()].map((loading: Loading): Promise<void> => loading.done));
}
