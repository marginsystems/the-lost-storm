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
  across: 16,
  edge: 0.72,
  feather: 0.1,
  strength: 1,
  faint: 0.8,
  breakEvery: 0.37,
  breakDepth: 0.85,
  widthEvery: 0.23,
  widthSpread: 0.45,
  edgeEvery: 1.9,
  edgeSpread: 0.24,
  edgeTwist: 5.3,
  widthPhase: 4.1,
  breakFrom: 0.35,
  breakTo: 0.9,
  noise: { fast: 1.7, slow: 0.63, phase: 1.3 },
  step: 0.5,
  start: 1,
  fadeIn: 5,
  fadeOut: 12,
  wave: 0.11,
  lift: 0.03,
  wet: 0.35,
  renderOrder: 3,
} as const;

export const SHORE_RUBBLE = {
  every: 0.8,
  keep: 0.55,
  outside: 0.5,
  inside: 0.1,
  scaleFrom: 0.6,
  scaleTo: 1.8,
  turns: 360,
  seed: { a: 12.9898, b: 78.233, c: 43758.5453 },
} as const;

export interface PathStone {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
  readonly scale: number;
}

function smoothstep(from: number, to: number, value: number): number {
  const t: number = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export function wobble(t: number): number {
  return 0.5 + 0.5 * Math.sin(t * SHORE_PATH.noise.fast) * Math.sin(t * SHORE_PATH.noise.slow + SHORE_PATH.noise.phase);
}

export function pathWidth(path: ShorePath, along: number): number {
  return path.width * (1 + SHORE_PATH.widthSpread * (wobble(along * SHORE_PATH.widthEvery + SHORE_PATH.widthPhase) * 2 - 1));
}

export function pathAlpha(across: number, along: number, length: number): number {
  const side: number = Math.abs(across * 2 - 1);
  const ragged: number = SHORE_PATH.edge + SHORE_PATH.edgeSpread * (wobble(along * SHORE_PATH.edgeEvery + Math.round(across) * SHORE_PATH.edgeTwist) * 2 - 1);
  const broken: number = 1 - SHORE_PATH.breakDepth * smoothstep(SHORE_PATH.breakFrom, SHORE_PATH.breakTo, wobble(along * SHORE_PATH.breakEvery));
  const toward: number = SHORE_PATH.faint + (1 - SHORE_PATH.faint) * smoothstep(0, length, along);
  return SHORE_PATH.strength * toward * broken * (1 - smoothstep(ragged - SHORE_PATH.feather, ragged, side)) * smoothstep(0, SHORE_PATH.fadeIn, along) * (1 - smoothstep(length - SHORE_PATH.fadeOut, length, along));
}

function chance(n: number, salt: number): number {
  const v: number = Math.sin(n * SHORE_RUBBLE.seed.a + salt * SHORE_RUBBLE.seed.b) * SHORE_RUBBLE.seed.c;
  return v - Math.floor(v);
}

export function pathStones(path: ShorePath): PathStone[] {
  const stones: PathStone[] = [];
  if (path.rubble.length === 0) return stones;
  const count: number = Math.floor(path.length / SHORE_RUBBLE.every);
  for (let index: number = 0; index < count; index += 1) {
    for (const side of [-1, 1]) {
      const n: number = index * 2 + (side > 0 ? 1 : 0);
      if (chance(n, 1) > SHORE_RUBBLE.keep) continue;
      const along: number = (index + chance(n, 2)) * SHORE_RUBBLE.every;
      if (pathAlpha(0.5, along, path.length) <= 0) continue;
      const half: number = (pathWidth(path, along) * SHORE_PATH.edge) / 2;
      const offset: number = -SHORE_RUBBLE.inside + chance(n, 3) * (SHORE_RUBBLE.inside + SHORE_RUBBLE.outside);
      const prop: string = path.rubble[Math.floor(chance(n, 4) * path.rubble.length)] ?? path.rubble[0] ?? '';
      stones.push({ prop, x: path.sway * Math.sin(along * SHORE_PATH.wave) + side * (half + offset), z: SHORE_PATH.start + along, rotationDegrees: chance(n, 5) * SHORE_RUBBLE.turns, scale: SHORE_RUBBLE.scaleFrom + chance(n, 6) * (SHORE_RUBBLE.scaleTo - SHORE_RUBBLE.scaleFrom) });
    }
  }
  return stones;
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
      const x: number = (across - 0.5) * pathWidth(path, along) + sway;
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

interface Placed {
  readonly placed: ShoreProp;
  readonly scale: number;
}

function instanced(content: Content, def: PropDef, gltf: GLTF, list: readonly Placed[]): InstancedMesh[] {
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
    list.forEach((item: Placed, index: number): void => {
      mesh.setMatrixAt(index, new Matrix4().multiplyMatrices(shoreMatrix(item.placed, def.scale * item.scale), node.matrixWorld));
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
  const byProp: Map<string, Placed[]> = new Map<string, Placed[]>();
  const strewn: Placed[] = (path === null ? [] : pathStones(path)).map((stone: PathStone): Placed => ({ placed: { prop: stone.prop, x: stone.x, z: stone.z, rotationDegrees: stone.rotationDegrees }, scale: stone.scale }));
  for (const item of [...(rules?.props ?? []).map((placed: ShoreProp): Placed => ({ placed, scale: 1 })), ...strewn]) byProp.set(item.placed.prop, [...(byProp.get(item.placed.prop) ?? []), item]);
  let shown: boolean = false;
  void Promise.all(
    [...byProp].map(async ([propId, list]: [string, Placed[]]): Promise<void> => {
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
