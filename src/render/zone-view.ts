import type { Object3D, Scene } from 'three';
import { BufferGeometry, Color, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, Vector3 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, PropDef, PropLight, ZoneDef, ZoneProp } from '../../sim/content/types.ts';
import { floorCells, wallCorners, wallEdges, zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { World } from '../../sim/world/types.ts';
import { loadModel } from './character-loader.ts';

export const ZONE_VIEW = {
  abyssDepth: -1.06,
  abyssMargin: 160,
  flickerSpeed: 9,
  flickerDepth: 0.22,
  lightDecay: 1.7,
  torchReach: 0.45,
  appearRate: 2.4,
  settledWithin: 0.004,
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

interface Conditional {
  readonly placed: ZoneProp;
  readonly def: PropDef;
  readonly light: PointLight | null;
  readonly point: Vector3 | null;
  readonly phase: number;
  readonly materials: MeshStandardMaterial[];
  object: Object3D | null;
  shown: number;
  on: boolean | null;
}

export interface ZoneView {
  readonly zone: ZoneDef;
  readonly group: Group;
  readonly torches: readonly Vector3[];
  readonly lightsVersion: number;
  update(time: number, dt: number, world: World): void;
  dispose(): void;
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

function zoneProps(zone: ZoneDef): string[] {
  return [...Object.values(zone.floors).flat(), ...zone.walls.tall, zone.walls.low, zone.walls.corner, ...zone.props.map((placed): string => placed.prop)];
}

export async function preloadZones(loader: GLTFLoader, content: Content): Promise<void> {
  const models: Set<string> = new Set<string>();
  for (const zone of content.zones.values()) {
    for (const propId of zoneProps(zone)) {
      const def: PropDef | undefined = content.props.get(propId);
      if (def !== undefined) models.add(def.model);
    }
  }
  await Promise.allSettled([...models].map((model: string): Promise<GLTF> => loadModel(loader, model)));
}

function lightPoint(light: PropLight, x: number, y: number, z: number, yaw: number): Vector3 {
  return new Vector3(x + Math.sin(yaw) * ZONE_VIEW.torchReach, y + light.height, z + Math.cos(yaw) * ZONE_VIEW.torchReach);
}

function standardMaterials(value: unknown): MeshStandardMaterial[] {
  if (value instanceof MeshStandardMaterial) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown): entry is MeshStandardMaterial => entry instanceof MeshStandardMaterial);
}

export async function buildZoneView(loader: GLTFLoader, content: Content, zone: ZoneDef, scene: Scene): Promise<ZoneView> {
  const placements: Map<string, Placement[]> = new Map<string, Placement[]>();
  const group: Group = new Group();
  const torches: Torch[] = [];
  const torchPoints: Vector3[] = [];
  const instances: InstancedMesh[] = [];
  const conditionals: Conditional[] = [];
  let lightsVersion: number = 0;

  const place = (propId: string, x: number, y: number, z: number, yaw: number, castShadow: boolean): void => {
    const def: PropDef | undefined = content.props.get(propId);
    if (def === undefined) return;
    const list: Placement[] = placements.get(propId) ?? [];
    list.push({ matrix: transform(x, y, z, yaw, def.scale), castShadow });
    placements.set(propId, list);
    if (def.light === null) return;
    const light: PointLight = new PointLight(new Color(def.light.color), def.light.intensity, def.light.distance, ZONE_VIEW.lightDecay);
    light.position.copy(lightPoint(def.light, x, y, z, yaw));
    group.add(light);
    torches.push({ light, intensity: def.light.intensity, phase: hash(x, z, 1) * 40 });
    torchPoints.push(light.position.clone());
  };

  for (const cell of floorCells(zone)) {
    const variants: readonly string[] = zone.floors[cell.tile] ?? [];
    const variant: string | undefined = variants[Math.floor(hash(cell.column, cell.row, 3) * variants.length)];
    if (variant !== undefined) place(variant, cell.x, 0, cell.z, Math.floor(hash(cell.column, cell.row, 5) * 4) * (Math.PI / 2), false);
  }
  for (const edge of wallEdges(zone)) {
    const alongZ: boolean = edge.side === 'west' || edge.side === 'east';
    const variant: string | undefined = edge.tall ? zone.walls.tall[Math.floor(hash(edge.column, edge.row, alongZ ? 7 : 9) * zone.walls.tall.length)] : zone.walls.low;
    if (variant !== undefined) place(variant, edge.x, 0, edge.z, alongZ ? Math.PI / 2 : 0, true);
  }
  for (const corner of wallCorners(zone)) place(zone.walls.corner, corner.x, 0, corner.z, 0, true);
  for (const prop of zone.props) {
    if (prop.when.length === 0) {
      place(prop.prop, prop.x, prop.y, prop.z, prop.rotationDegrees * DEGREES, true);
      continue;
    }
    const def: PropDef | undefined = content.props.get(prop.prop);
    if (def === undefined) continue;
    const light: PointLight | null = def.light === null ? null : new PointLight(new Color(def.light.color), 0, def.light.distance, ZONE_VIEW.lightDecay);
    if (light !== null && def.light !== null) {
      light.position.copy(lightPoint(def.light, prop.x, prop.y, prop.z, prop.rotationDegrees * DEGREES));
      group.add(light);
    }
    conditionals.push({ placed: prop, def, light, point: light === null ? null : light.position.clone(), phase: hash(prop.x, prop.z, 1) * 40, materials: [], object: null, shown: 0, on: null });
  }

  const loaded: [string, GLTF][] = await Promise.all(
    [...placements.keys()].map(async (propId: string): Promise<[string, GLTF]> => {
      const def: PropDef | undefined = content.props.get(propId);
      return [propId, await loadModel(loader, def?.model ?? '')];
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
      instances.push(instanced);
      group.add(instanced);
    });
  }

  await Promise.all(
    conditionals.map(async (conditional: Conditional): Promise<void> => {
      const gltf: GLTF = await loadModel(loader, conditional.def.model);
      const object: Object3D = gltf.scene.clone(true);
      object.position.set(conditional.placed.x, conditional.placed.y, conditional.placed.z);
      object.rotation.y = conditional.placed.rotationDegrees * DEGREES;
      object.scale.setScalar(conditional.def.scale);
      object.traverse((child: Object3D): void => {
        if (!(child instanceof Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const shared: unknown = child.material;
        const own: MeshStandardMaterial[] = standardMaterials(shared).map((material: MeshStandardMaterial): MeshStandardMaterial => material.clone());
        const first: MeshStandardMaterial | undefined = own[0];
        if (Array.isArray(shared)) {
          if (own.length !== shared.length) return;
          child.material = own;
        } else if (first !== undefined) {
          child.material = first;
        } else {
          return;
        }
        conditional.materials.push(...own);
      });
      object.visible = false;
      group.add(object);
      conditional.object = object;
    }),
  );

  const flicker = (time: number, phase: number): number => {
    const wobble: number = Math.sin(time * ZONE_VIEW.flickerSpeed + phase) * 0.6 + Math.sin(time * ZONE_VIEW.flickerSpeed * 2.7 + phase * 1.7) * 0.4;
    return 1 - ZONE_VIEW.flickerDepth * 0.5 + wobble * ZONE_VIEW.flickerDepth * 0.5;
  };

  const width: number = zoneColumns(zone) * zone.cellSize;
  const depth: number = zoneRows(zone) * zone.cellSize;
  const abyss: Mesh = new Mesh(new PlaneGeometry(width + ZONE_VIEW.abyssMargin, depth + ZONE_VIEW.abyssMargin), new MeshStandardMaterial({ color: new Color(zone.ambience.abyss), roughness: 1, metalness: 0 }));
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.set(width / 2, ZONE_VIEW.abyssDepth, depth / 2);
  abyss.receiveShadow = true;
  group.add(abyss);
  scene.add(group);

  return {
    zone,
    group,
    get torches(): readonly Vector3[] {
      return [...torchPoints, ...conditionals.flatMap((conditional: Conditional): Vector3[] => (conditional.on === true && conditional.point !== null ? [conditional.point] : []))];
    },
    get lightsVersion(): number {
      return lightsVersion;
    },
    dispose(): void {
      group.removeFromParent();
      for (const instanced of instances) instanced.dispose();
      for (const torch of torches) torch.light.dispose();
      for (const conditional of conditionals) {
        conditional.light?.dispose();
        for (const material of conditional.materials) material.dispose();
      }
      abyss.geometry.dispose();
      if (abyss.material instanceof MeshStandardMaterial) abyss.material.dispose();
    },
    update(time: number, dt: number, world: World): void {
      for (const torch of torches) torch.light.intensity = torch.intensity * flicker(time, torch.phase);
      for (const conditional of conditionals) {
        const wanted: boolean = allHold(world, conditional.placed.when);
        if (conditional.on === null) conditional.shown = wanted ? 1 : 0;
        if (wanted !== conditional.on) {
          conditional.on = wanted;
          lightsVersion += 1;
        }
        const target: number = wanted ? 1 : 0;
        conditional.shown += (target - conditional.shown) * (1 - Math.exp(-ZONE_VIEW.appearRate * dt));
        if (Math.abs(target - conditional.shown) < ZONE_VIEW.settledWithin) conditional.shown = target;
        const solid: boolean = conditional.shown === 1;
        for (const material of conditional.materials) {
          material.transparent = !solid;
          material.opacity = conditional.shown;
        }
        if (conditional.object !== null) conditional.object.visible = conditional.shown > 0;
        if (conditional.light !== null && conditional.def.light !== null) conditional.light.intensity = conditional.def.light.intensity * conditional.shown * flicker(time, conditional.phase);
      }
    },
  };
}
