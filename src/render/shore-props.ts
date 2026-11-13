import type { Material, Object3D } from 'three';
import { BufferAttribute, BufferGeometry, Color, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ShorePath, ShoreProp, VoidShore } from '../../sim/content/story-types.ts';
import type { Content, PropDef, SurfaceDef } from '../../sim/content/types.ts';
import type { ShoreState, World } from '../../sim/world/types.ts';
import { loadModel } from './character-loader.ts';
import { isTall, resetCutaway, setOccluders, withCutaway } from './prop-cutaway.ts';
import { lookOf, withPropLook } from './prop-surface.ts';
import type { PropLook } from './prop-surface.ts';
import { dressedProp, surfaceMaterial } from './surfaces.ts';
import { wetStone } from './shore-rock.ts';
import type { PropDressing } from './surfaces.ts';

export const SHORE_PROPS: { readonly dressing: PropDressing } = {
  dressing: { wet: 0.6, ground: 0 },
};

export const SHORE_PATH = {
  across: 6,
  edge: 0.35,
  strength: 0.4,
  step: 1,
  start: 1,
  fadeIn: 5,
  fadeOut: 12,
  wave: 0.11,
  lift: 0.03,
  wet: 0.6,
  renderOrder: 3,
} as const;

function smoothstep(from: number, to: number, value: number): number {
  const t: number = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function pathAlpha(across: number, along: number, length: number): number {
  const side: number = Math.abs(across * 2 - 1);
  return SHORE_PATH.strength * (1 - smoothstep(SHORE_PATH.edge, 1, side)) * smoothstep(0, SHORE_PATH.fadeIn, along) * (1 - smoothstep(length - SHORE_PATH.fadeOut, length, along));
}

export function pathGeometry(path: ShorePath): BufferGeometry {
  const rows: number = Math.max(1, Math.round(path.length / SHORE_PATH.step));
  const columns: number = SHORE_PATH.across;
  const count: number = (rows + 1) * (columns + 1);
  const positions: Float32Array = new Float32Array(count * 3);
  const uvs: Float32Array = new Float32Array(count * 2);
  const colours: Float32Array = new Float32Array(count * 4).fill(1);
  const index: number[] = [];
  for (let row: number = 0; row <= rows; row += 1) {
    const along: number = (row / rows) * path.length;
    const sway: number = path.sway * Math.sin(along * SHORE_PATH.wave);
    for (let column: number = 0; column <= columns; column += 1) {
      const at: number = row * (columns + 1) + column;
      const across: number = column / columns;
      const x: number = (across - 0.5) * path.width + sway;
      const z: number = SHORE_PATH.start + along;
      positions.set([x, 0, z], at * 3);
      uvs.set([x, -z], at * 2);
      colours[at * 4 + 3] = pathAlpha(across, along, path.length);
      if (row < rows && column < columns) {
        const next: number = at + columns + 1;
        index.push(at, next, at + 1, at + 1, next, next + 1);
      }
    }
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new BufferAttribute(colours, 4));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function pathMesh(path: ShorePath, surface: SurfaceDef): Mesh {
  const mesh: Mesh = new Mesh(pathGeometry(path), wetStone(surfaceMaterial(surface, 'overlay', SHORE_PATH.wet), SHORE_PATH.wet));
  mesh.position.y = SHORE_PATH.lift;
  mesh.renderOrder = SHORE_PATH.renderOrder;
  return mesh;
}

const RADIANS: number = Math.PI / 180;

export interface ShoreProps {
  readonly group: Group;
  follow(world: World): void;
  dispose(): void;
}

function dress(content: Content, def: PropDef, material: Material): Material {
  const made: Material = dressedProp(content, def.surfaces, material, SHORE_PROPS.dressing);
  if (def.tint === null || !(made instanceof MeshStandardMaterial)) return made;
  const look: PropLook | undefined = lookOf(made);
  const own: MeshStandardMaterial = look === undefined ? made.clone() : withPropLook(made.clone(), look);
  own.color.multiply(new Color(def.tint));
  return own;
}

export function shoreMatrix(placed: ShoreProp, scale: number): Matrix4 {
  return new Matrix4().compose(new Vector3(placed.x, 0, placed.z), new Quaternion().setFromEuler(new Euler(0, placed.rotationDegrees * RADIANS, 0)), new Vector3(scale, scale, scale));
}

function propWidth(def: PropDef): number {
  const xs: number[] = def.footprints.flat().map((point): number => point.x);
  const zs: number[] = def.footprints.flat().map((point): number => point.z);
  return xs.length === 0 ? Infinity : Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
}

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

function instanced(content: Content, def: PropDef, gltf: GLTF, list: readonly ShoreProp[]): InstancedMesh[] {
  const made: InstancedMesh[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node: Object3D): void => {
    if (!(node instanceof Mesh)) return;
    const geometry: unknown = node.geometry;
    const source: unknown = node.material;
    if (!(source instanceof MeshStandardMaterial) || !isGeometry(geometry)) return;
    const dressed: Material = dress(content, def, source);
    const material: Material = isTall(def.height) && dressed instanceof MeshStandardMaterial ? withCutaway(dressed.clone(), propWidth(def)) : dressed;
    const mesh: InstancedMesh = new InstancedMesh(geometry, material, list.length);
    list.forEach((placed: ShoreProp, index: number): void => {
      mesh.setMatrixAt(index, new Matrix4().multiplyMatrices(shoreMatrix(placed, def.scale), node.matrixWorld));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    made.push(mesh);
  });
  return made;
}

export function createShoreProps(loader: GLTFLoader, content: Content, rules: VoidShore | null, floorHeight: number): ShoreProps {
  const group: Group = new Group();
  group.visible = false;
  const path: ShorePath | null = rules?.path ?? null;
  const surface: SurfaceDef | undefined = path === null ? undefined : content.surfaces.get(path.surface);
  const worn: Mesh | null = path === null || surface === undefined ? null : pathMesh(path, surface);
  if (worn !== null) group.add(worn);
  const occluders: InstancedMesh[] = [];
  const byProp: Map<string, ShoreProp[]> = new Map<string, ShoreProp[]>();
  for (const placed of rules?.props ?? []) byProp.set(placed.prop, [...(byProp.get(placed.prop) ?? []), placed]);
  let shown: boolean = false;
  void Promise.all(
    [...byProp].map(async ([propId, list]: [string, ShoreProp[]]): Promise<void> => {
      const def: PropDef | undefined = content.props.get(propId);
      if (def === undefined) return;
      const gltf: GLTF | null = await loadModel(loader, def.model).catch((): null => null);
      if (gltf === null) return;
      for (const mesh of instanced(content, def, gltf, list)) {
        group.add(mesh);
        if (isTall(def.height)) occluders.push(mesh);
      }
      if (shown) setOccluders(occluders);
    }),
  );
  return {
    group,
    follow(world: World): void {
      const shore: ShoreState | null = world.shore;
      if (shown !== (shore !== null)) setOccluders(shore === null ? [] : occluders);
      shown = shore !== null;
      group.visible = shown;
      if (shore === null) return;
      group.position.set(shore.at.x, floorHeight, shore.at.z);
      group.rotation.y = Math.atan2(shore.facing.x, shore.facing.z);
    },
    dispose(): void {
      resetCutaway();
      group.removeFromParent();
      worn?.geometry.dispose();
      if (worn !== null && worn.material instanceof MeshStandardMaterial) worn.material.dispose();
    },
  };
}
