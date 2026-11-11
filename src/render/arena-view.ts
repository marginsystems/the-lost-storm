import type { Object3D, Scene } from 'three';
import { BufferGeometry, Color, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, Vector3 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, PropDef } from '../../sim/content/types.ts';
import { arenaColumns, arenaRows, floorCells, wallCorners, wallEdges } from '../../sim/nav/layout.ts';
import { assetUrl } from './character-loader.ts';

export const ARENA = {
  abyssDepth: -1.06,
  abyssColor: 0x04060a,
  abyssMargin: 160,
  flickerSpeed: 9,
  flickerDepth: 0.22,
  lightDecay: 1.7,
  torchReach: 0.45,
} as const;

interface Placement {
  readonly matrix: Matrix4;
  readonly castShadow: boolean;
}

interface Torch {
  readonly light: PointLight;
  readonly intensity: number;
  readonly phase: number;
}

export interface ArenaView {
  readonly group: Group;
  readonly torches: readonly Vector3[];
  update(time: number): void;
}

const DEGREES: number = Math.PI / 180;

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

function hash(a: number, b: number, c: number): number {
  const value: number = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function transform(x: number, y: number, z: number, yaw: number, scale: number): Matrix4 {
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(scale, scale, scale));
}

export async function buildArena(loader: GLTFLoader, content: Content, scene: Scene): Promise<ArenaView> {
  const arena = content.arena;
  const placements: Map<string, Placement[]> = new Map<string, Placement[]>();
  const group: Group = new Group();
  const torches: Torch[] = [];
  const torchPoints: Vector3[] = [];

  const place = (propId: string, x: number, y: number, z: number, yaw: number, castShadow: boolean): void => {
    const def: PropDef | undefined = content.props.get(propId);
    if (def === undefined) return;
    const list: Placement[] = placements.get(propId) ?? [];
    list.push({ matrix: transform(x, y, z, yaw, def.scale), castShadow });
    placements.set(propId, list);
    if (def.light === null) return;
    const forward: Vector3 = new Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(ARENA.torchReach);
    const light: PointLight = new PointLight(new Color(def.light.color), def.light.intensity, def.light.distance, ARENA.lightDecay);
    light.position.set(x + forward.x, y + def.light.height, z + forward.z);
    group.add(light);
    torches.push({ light, intensity: def.light.intensity, phase: hash(x, z, 1) * 40 });
    torchPoints.push(light.position.clone());
  };

  for (const cell of floorCells(arena)) {
    const variants: readonly string[] = arena.floors[cell.tile] ?? [];
    const variant: string | undefined = variants[Math.floor(hash(cell.column, cell.row, 3) * variants.length)];
    if (variant !== undefined) place(variant, cell.x, 0, cell.z, Math.floor(hash(cell.column, cell.row, 5) * 4) * (Math.PI / 2), false);
  }
  for (const edge of wallEdges(arena)) {
    const alongZ: boolean = edge.side === 'west' || edge.side === 'east';
    const variant: string | undefined = edge.tall ? arena.walls.tall[Math.floor(hash(edge.column, edge.row, alongZ ? 7 : 9) * arena.walls.tall.length)] : arena.walls.low;
    if (variant !== undefined) place(variant, edge.x, 0, edge.z, alongZ ? Math.PI / 2 : 0, true);
  }
  for (const corner of wallCorners(arena)) place(arena.walls.corner, corner.x, 0, corner.z, 0, true);
  for (const prop of arena.props) place(prop.prop, prop.x, prop.y, prop.z, prop.rotationDegrees * DEGREES, true);

  const loaded: [string, GLTF][] = await Promise.all(
    [...placements.keys()].map(async (propId: string): Promise<[string, GLTF]> => {
      const def: PropDef | undefined = content.props.get(propId);
      return [propId, await loader.loadAsync(assetUrl(def?.model ?? ''))];
    }),
  );

  for (const [propId, gltf] of loaded) {
    const list: Placement[] = placements.get(propId) ?? [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object: Object3D): void => {
      if (!(object instanceof Mesh)) return;
      const geometry: unknown = object.geometry;
      const material: unknown = object.material;
      if (!(material instanceof MeshStandardMaterial) || !isGeometry(geometry)) return;
      const instanced: InstancedMesh = new InstancedMesh(geometry, material, list.length);
      list.forEach((placement: Placement, index: number): void => {
        instanced.setMatrixAt(index, new Matrix4().multiplyMatrices(placement.matrix, object.matrixWorld));
      });
      instanced.instanceMatrix.needsUpdate = true;
      instanced.castShadow = list[0]?.castShadow ?? false;
      instanced.receiveShadow = true;
      instanced.computeBoundingSphere();
      group.add(instanced);
    });
  }

  const width: number = arenaColumns(arena) * arena.cellSize;
  const depth: number = arenaRows(arena) * arena.cellSize;
  const abyss: Mesh = new Mesh(new PlaneGeometry(width + ARENA.abyssMargin, depth + ARENA.abyssMargin), new MeshStandardMaterial({ color: ARENA.abyssColor, roughness: 1, metalness: 0 }));
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.set(width / 2, ARENA.abyssDepth, depth / 2);
  abyss.receiveShadow = true;
  group.add(abyss);
  scene.add(group);

  return {
    group,
    torches: torchPoints,
    update(time: number): void {
      for (const torch of torches) {
        const wobble: number = Math.sin(time * ARENA.flickerSpeed + torch.phase) * 0.6 + Math.sin(time * ARENA.flickerSpeed * 2.7 + torch.phase * 1.7) * 0.4;
        torch.light.intensity = torch.intensity * (1 - ARENA.flickerDepth * 0.5 + wobble * ARENA.flickerDepth * 0.5);
      }
    },
  };
}
