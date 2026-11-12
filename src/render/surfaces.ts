import type { Material, Texture } from 'three';
import { Color, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector2 } from 'three';
import type { Content, SurfaceDef, ZoneDef } from '../../sim/content/types.ts';
import { renderBudget, texturePath } from '../mobile/quality.ts';
import { shrinkTexture } from '../mobile/textures.ts';
import { assetUrl } from './character-loader.ts';
import { PROP_SURFACE, withPropLook } from './prop-surface.ts';
import { wetGround } from './wet-ground.ts';

export const SURFACES = {
  anisotropy: 4,
  overlayOffset: -2,
  metalFrom: 0.5,
  matteRoughness: 1,
  wetGloss: 0.62,
} as const;

export function wetRoughness(roughness: number, wet: number): number {
  return roughness * (1 - SURFACES.wetGloss * Math.min(1, Math.max(0, wet)));
}

export function matte(material: Material): Material {
  if (!(material instanceof MeshStandardMaterial) || material.metalness >= SURFACES.metalFrom) return material;
  material.roughness = Math.max(material.roughness, SURFACES.matteRoughness);
  material.roughnessMap = null;
  material.metalness = 0;
  material.metalnessMap = null;
  return material;
}

export type SurfaceUse = 'solid' | 'ground' | 'overlay';

interface Loading {
  readonly texture: Texture;
  readonly done: Promise<void>;
}

const loader: TextureLoader = new TextureLoader();
const textures: Map<string, Loading> = new Map<string, Loading>();
interface Made {
  readonly surface: string;
  readonly material: MeshStandardMaterial;
  readonly textures: readonly string[];
}

const materials: Map<string, Made> = new Map<string, Made>();

function textureKey(path: string, metres: number): string {
  return `${path}@${metres}`;
}

function loadTexture(path: string, metres: number, colour: boolean): Texture {
  const key: string = textureKey(path, metres);
  const cached: Loading | undefined = textures.get(key);
  if (cached !== undefined) return cached.texture;
  const started: Texture[] = [];
  const done: Promise<void> = new Promise<void>((resolve: () => void): void => {
    started.push(
      loader.load(
        assetUrl(texturePath(path, renderBudget().halfTextures)),
        (loaded: Texture): void => {
          shrinkTexture(loaded, renderBudget().maxTextureSize);
          resolve();
        },
        undefined,
        resolve,
      ),
    );
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

export function surfaceMaterial(def: SurfaceDef, use: SurfaceUse, wet: number = 0): MeshStandardMaterial {
  const key: string = wet > 0 ? `${def.id}:${use}:wet${wet}` : `${def.id}:${use}`;
  const cached: Made | undefined = materials.get(key);
  if (cached !== undefined) return cached.material;
  const orm: Texture | null = def.orm === null ? null : loadTexture(def.orm, def.metres, false);
  const metal: boolean = def.metalness >= SURFACES.metalFrom;
  const made: MeshStandardMaterial = new MeshStandardMaterial({
    name: key,
    color: new Color(def.tint),
    map: loadTexture(def.color, def.metres, true),
    normalMap: def.normal === null ? null : loadTexture(def.normal, def.metres, false),
    normalScale: new Vector2(def.normalScale, def.normalScale),
    aoMap: orm,
    roughnessMap: metal ? orm : null,
    metalnessMap: metal ? orm : null,
    roughness: wetRoughness(metal ? def.roughness : Math.max(def.roughness, SURFACES.matteRoughness), wet),
    metalness: metal ? def.metalness : 0,
    vertexColors: use !== 'solid',
  });
  if (use !== 'solid') wetGround(made, wet);
  if (use === 'overlay') {
    made.transparent = true;
    made.depthWrite = false;
    made.polygonOffset = true;
    made.polygonOffsetFactor = SURFACES.overlayOffset;
    made.polygonOffsetUnits = SURFACES.overlayOffset;
  }
  const used: string[] = [def.color, def.normal, def.orm].filter((path: string | null): path is string => path !== null).map((path: string): string => textureKey(path, def.metres));
  materials.set(key, { surface: def.id, material: made, textures: used });
  return made;
}

export interface PropDressing {
  readonly wet: number;
  readonly ground: number;
}

export function propDressing(zone: ZoneDef): PropDressing {
  return { wet: zone.weather.wet, ground: zone.floorHeight };
}

export function looseDressing(zone: ZoneDef): PropDressing {
  return { wet: zone.weather.wet, ground: zone.floorHeight - PROP_SURFACE.contactHeight };
}

export function propSurfaceMaterial(def: SurfaceDef, dressing: PropDressing): MeshStandardMaterial {
  const key: string = `${def.id}:prop:${dressing.wet}:${dressing.ground}`;
  const cached: Made | undefined = materials.get(key);
  if (cached !== undefined) return cached.material;
  const made: MeshStandardMaterial = surfaceMaterial(def, 'solid').clone();
  made.name = key;
  withPropLook(made, { tileMetres: def.metres, wet: dressing.wet, ground: dressing.ground });
  const used: string[] = [def.color, def.normal, def.orm].filter((path: string | null): path is string => path !== null).map((path: string): string => textureKey(path, def.metres));
  materials.set(key, { surface: def.id, material: made, textures: used });
  return made;
}

const ownLooks: WeakMap<MeshStandardMaterial, Map<string, MeshStandardMaterial>> = new WeakMap<MeshStandardMaterial, Map<string, MeshStandardMaterial>>();

export function dressedProp(content: Content, dress: Readonly<Record<string, string>>, material: Material, dressing: PropDressing): Material {
  const surfaceId: string | undefined = dress[material.name];
  const def: SurfaceDef | undefined = surfaceId === undefined ? undefined : content.surfaces.get(surfaceId);
  if (def !== undefined) return propSurfaceMaterial(def, dressing);
  const plain: Material = matte(material);
  if (!(plain instanceof MeshStandardMaterial)) return plain;
  const key: string = `${dressing.wet}:${dressing.ground}`;
  const known: Map<string, MeshStandardMaterial> = ownLooks.get(plain) ?? new Map<string, MeshStandardMaterial>();
  ownLooks.set(plain, known);
  const cached: MeshStandardMaterial | undefined = known.get(key);
  if (cached !== undefined) return cached;
  const own: MeshStandardMaterial = withPropLook(plain.clone(), { tileMetres: null, wet: dressing.wet, ground: dressing.ground });
  known.set(key, own);
  return own;
}

export function dressed(content: Content, dress: Readonly<Record<string, string>>, material: Material, wet: number = 0): Material {
  const surfaceId: string | undefined = dress[material.name];
  const def: SurfaceDef | undefined = surfaceId === undefined ? undefined : content.surfaces.get(surfaceId);
  return def === undefined ? matte(material) : surfaceMaterial(def, 'solid', wet);
}

export async function preloadSurfaces(content: Content, ids: ReadonlySet<string>): Promise<void> {
  for (const def of content.surfaces.values()) if (ids.has(def.id)) surfaceMaterial(def, 'solid');
  await Promise.all([...textures.values()].map((loading: Loading): Promise<void> => loading.done));
}

export function releaseSurfaces(keep: ReadonlySet<string>): void {
  for (const [key, made] of materials) {
    if (keep.has(made.surface)) continue;
    made.material.dispose();
    materials.delete(key);
  }
  const used: Set<string> = new Set<string>([...materials.values()].flatMap((made: Made): readonly string[] => made.textures));
  for (const [key, loading] of textures) {
    if (used.has(key)) continue;
    loading.texture.dispose();
    textures.delete(key);
  }
}
