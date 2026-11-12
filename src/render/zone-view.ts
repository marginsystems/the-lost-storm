import type { Object3D, Scene } from 'three';
import { BufferGeometry, Color, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, Vector3 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, PropDef, PropLight, ZoneDef, ZoneProp, ZoneWalls } from '../../sim/content/types.ts';
import { wallCorners, wallEdges, zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { World } from '../../sim/world/types.ts';
import { forgetModel, loadModel } from './character-loader.ts';
import { buildGround } from './ground.ts';
import { buildVoidView } from './void-view.ts';
import type { Vec2 } from '../../sim/math.ts';
import type { QualityName } from '../mobile/quality.ts';
import type { Ground } from './ground.ts';
import { dressed, preloadSurfaces, releaseSurfaces } from './surfaces.ts';
import { zoneModels, zoneSurfaces } from './zone-assets.ts';
import { renderBudget } from '../mobile/quality.ts';

export const ZONE_VIEW = {
  abyssDepth: -1.06,
  abyssMargin: 160,
  flickerSpeed: 9,
  flickerDepth: 0.22,
  lightDecay: 1.7,
  torchReach: 0.8,
  lightBudget: 6,
  lightFadeBand: 7,
  appearRate: 2.4,
  settledWithin: 0.004,
} as const;

interface Placement {
  readonly matrix: Matrix4;
  readonly castShadow: boolean;
}

interface Conditional {
  readonly placed: ZoneProp;
  readonly def: PropDef;
  readonly point: Vector3 | null;
  readonly materials: MeshStandardMaterial[];
  object: Object3D | null;
  shown: number;
  on: boolean | null;
}

interface Source {
  readonly point: Vector3;
  readonly color: Color;
  readonly intensity: number;
  readonly distance: number;
  readonly phase: number;
  readonly conditional: Conditional | null;
  score: number;
}

export interface ViewFocus {
  readonly look: Vec2 | null;
  readonly figure: number;
}

export interface ZoneView {
  readonly zone: ZoneDef;
  readonly group: Group;
  readonly torches: readonly Vector3[];
  readonly lightsVersion: number;
  setLightBudget(count: number): void;
  update(time: number, dt: number, world: World, focus: ViewFocus): void;
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

export async function preloadZones(loader: GLTFLoader, content: Content, zones: readonly ZoneDef[]): Promise<void> {
  const models: Set<string> = new Set<string>();
  const surfaces: Set<string> = new Set<string>();
  for (const zone of zones) {
    for (const model of zoneModels(content, zone)) models.add(model);
    for (const id of zoneSurfaces(content, zone)) surfaces.add(id);
  }
  await Promise.allSettled([preloadSurfaces(content, surfaces), ...[...models].map((model: string): Promise<GLTF> => loadModel(loader, model))]);
}

export function releaseOtherZones(content: Content, kept: ZoneDef): void {
  releaseSurfaces(zoneSurfaces(content, kept));
  const keep: Set<string> = zoneModels(content, kept);
  for (const zone of content.zones.values()) {
    if (zone.id === kept.id) continue;
    for (const model of zoneModels(content, zone)) if (!keep.has(model)) forgetModel(model);
  }
}

function lightPoint(light: PropLight, x: number, y: number, z: number, yaw: number): Vector3 {
  return new Vector3(x + Math.sin(yaw) * ZONE_VIEW.torchReach, y + light.height, z + Math.cos(yaw) * ZONE_VIEW.torchReach);
}

function standardMaterials(value: unknown): MeshStandardMaterial[] {
  if (value instanceof MeshStandardMaterial) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown): entry is MeshStandardMaterial => entry instanceof MeshStandardMaterial);
}

export async function buildZoneView(loader: GLTFLoader, content: Content, zone: ZoneDef, scene: Scene, quality: QualityName): Promise<ZoneView> {
  if (zone.kind === 'void') {
    const empty: ZoneView = buildVoidView(zone, quality);
    scene.add(empty.group);
    return empty;
  }
  const placements: Map<string, Placement[]> = new Map<string, Placement[]>();
  const group: Group = new Group();
  const sources: Source[] = [];
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
    sources.push({ point: lightPoint(def.light, x, y, z, yaw), color: new Color(def.light.color), intensity: def.light.intensity, distance: def.light.distance, phase: hash(x, z, 1) * 40, conditional: null, score: 0 });
  };

  const ground: Ground = buildGround(content, zone);
  for (const mesh of ground.meshes) group.add(mesh);
  const walls: ZoneWalls | null = zone.walls;
  for (const edge of walls === null ? [] : wallEdges(zone)) {
    const alongZ: boolean = edge.side === 'west' || edge.side === 'east';
    const variant: string | undefined = walls === null ? undefined : edge.tall ? walls.tall[Math.floor(hash(edge.column, edge.row, alongZ ? 7 : 9) * walls.tall.length)] : walls.low;
    if (variant !== undefined) place(variant, edge.x, 0, edge.z, alongZ ? Math.PI / 2 : 0, true);
  }
  if (walls !== null) for (const corner of wallCorners(zone)) place(walls.corner, corner.x, 0, corner.z, 0, true);
  for (const prop of zone.props) {
    if (prop.when.length === 0) {
      place(prop.prop, prop.x, prop.y, prop.z, prop.rotationDegrees * DEGREES, true);
      continue;
    }
    const def: PropDef | undefined = content.props.get(prop.prop);
    if (def === undefined) continue;
    const point: Vector3 | null = def.light === null ? null : lightPoint(def.light, prop.x, prop.y, prop.z, prop.rotationDegrees * DEGREES);
    const conditional: Conditional = { placed: prop, def, point, materials: [], object: null, shown: 0, on: null };
    conditionals.push(conditional);
    if (def.light !== null && point !== null) sources.push({ point, color: new Color(def.light.color), intensity: def.light.intensity, distance: def.light.distance, phase: hash(prop.x, prop.z, 1) * 40, conditional, score: 0 });
  }

  const pool: PointLight[] = [];
  for (let index: number = 0; index < Math.min(ZONE_VIEW.lightBudget, renderBudget().zoneLights, sources.length); index += 1) {
    const light: PointLight = new PointLight(0xffffff, 0, 1, ZONE_VIEW.lightDecay);
    pool.push(light);
    group.add(light);
  }
  const ranked: Source[] = [...sources];
  let activeLights: number = pool.length;

  const loaded: [string, GLTF][] = await Promise.all(
    [...placements.keys()].map(async (propId: string): Promise<[string, GLTF]> => {
      const def: PropDef | undefined = content.props.get(propId);
      return [propId, await loadModel(loader, def?.model ?? '')];
    }),
  );

  for (const [propId, gltf] of loaded) {
    const list: Placement[] = placements.get(propId) ?? [];
    const dress: Readonly<Record<string, string>> = content.props.get(propId)?.surfaces ?? {};
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object: Object3D): void => {
      if (!(object instanceof Mesh)) return;
      const geometry: unknown = object.geometry;
      const material: unknown = object.material;
      if (!(material instanceof MeshStandardMaterial) || !isGeometry(geometry)) return;
      const instanced: InstancedMesh = new InstancedMesh(geometry, dressed(content, dress, material), list.length);
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
        const own: MeshStandardMaterial[] = standardMaterials(shared).map((material: MeshStandardMaterial): MeshStandardMaterial => standardMaterials(dressed(content, conditional.def.surfaces, material)).map((worn: MeshStandardMaterial): MeshStandardMaterial => worn.clone())[0] ?? material.clone());
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
    setLightBudget(count: number): void {
      activeLights = Math.min(pool.length, Math.max(0, count));
    },
    get torches(): readonly Vector3[] {
      return sources.flatMap((source: Source): Vector3[] => (source.conditional === null || source.conditional.on === true ? [source.point] : []));
    },
    get lightsVersion(): number {
      return lightsVersion;
    },
    dispose(): void {
      group.removeFromParent();
      ground.dispose();
      for (const instanced of instances) instanced.dispose();
      for (const light of pool) light.dispose();
      for (const conditional of conditionals) {
        for (const material of conditional.materials) material.dispose();
      }
      abyss.geometry.dispose();
      if (abyss.material instanceof MeshStandardMaterial) abyss.material.dispose();
    },
    update(time: number, dt: number, world: World): void {
      ground.update(world.time);
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
      }
      const player = world.player.pos;
      for (const source of ranked) {
        const lit: boolean = source.conditional === null || source.conditional.shown > 0;
        source.score = lit ? Math.hypot(source.point.x - player.x, source.point.z - player.z) - source.distance : Number.POSITIVE_INFINITY;
      }
      ranked.sort((a: Source, b: Source): number => a.score - b.score);
      const cutoff: number = ranked[activeLights]?.score ?? Number.POSITIVE_INFINITY;
      pool.forEach((light: PointLight, index: number): void => {
        const source: Source | undefined = ranked[index];
        light.visible = index < activeLights;
        if (index >= activeLights || source === undefined || source.score === Number.POSITIVE_INFINITY) {
          light.intensity = 0;
          return;
        }
        const fade: number = cutoff === Number.POSITIVE_INFINITY ? 1 : Math.min(1, Math.max(0, (cutoff - source.score) / ZONE_VIEW.lightFadeBand));
        const shown: number = source.conditional === null ? 1 : source.conditional.shown;
        light.position.copy(source.point);
        light.color.copy(source.color);
        light.distance = source.distance;
        light.intensity = source.intensity * fade * shown * flicker(time, source.phase);
      });
    },
  };
}
