import { liftAt, useTerrain } from './terrain-lift.ts';
import type { FigureSize } from './figure-gauge.ts';
import { propCell } from './prop-cells.ts';
import { claimCutaway, isTall, resetCutaway, withCutaway } from './prop-cutaway.ts';
import type { Material, Object3D, Scene, WebGLRenderer } from 'three';
import { BufferGeometry, Color, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Quaternion, Vector3 } from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content, PropCache, PropDef, PropLight, ZoneDef, ZoneProp, ZoneScatter, ZoneWalls } from '../../sim/content/types.ts';
import { wallCorners, wallEdges, zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import { allHold } from '../../sim/world/conditions.ts';
import type { ShoreState, World } from '../../sim/world/types.ts';
import { forgetModel, loadModel } from './character-loader.ts';
import type { TerrainSight } from './terrain-sight.ts';
import { createTerrainSight } from './terrain-sight.ts';
import { buildGround } from './ground.ts';
import type { MistWallView } from './mist-wall.ts';
import { buildMistWall } from './mist-wall.ts';
import { buildVoidView } from './void-view.ts';
import type { ShoreProps } from './shore-props.ts';
import { createShoreProps } from './shore-props.ts';
import type { VoidGlimpses } from './void-glimpse.ts';
import { createVoidGlimpses } from './void-glimpse.ts';
import type { ReadonlyVec2, Vec2 } from '../../sim/math.ts';
import type { QualityName } from '../mobile/quality.ts';
import type { Ground } from './ground.ts';
import type { PropDressing } from './surfaces.ts';
import { dressedProp, looseDressing, preloadSurfaces, propDressing, releaseSurfaces } from './surfaces.ts';
import type { PropLook } from './prop-surface.ts';
import { lookOf, withPropLook } from './prop-surface.ts';
import { edgeRocks } from './zone-edge.ts';
import { tintProp } from './prop-tint.ts';
import { browserPacer, workPaced } from './paced-work.ts';
import { barrierPieces } from '../../sim/nav/barrier.ts';
import { cliffRocks } from '../../sim/nav/cliff-rocks.ts';
import { scatterStones } from './zone-scatter.ts';
import { momentSurfaces, zoneModels, zoneSurfaces } from './zone-assets.ts';
import { renderBudget } from '../mobile/quality.ts';
import type { GraphicsPreset } from '../settings/settings.ts';
import type { LifeEvent, LifeView } from './life-view.ts';
import { createLifeView, lifeDensity } from './life-view.ts';
import { LIFE } from './life-data.ts';
import { placesFor } from './life-kinds.ts';
import type { TunnelRoofs } from './tunnel-roofs.ts';
import { createTunnelRoofs } from './tunnel-roofs.ts';
import { tickGlow } from './surface-glow.ts';
import type { LavaFalls } from './lava-falls.ts';
import { buildLavaFalls } from './lava-falls.ts';
import type { Embers } from './embers.ts';
import { createEmbers } from './embers.ts';
import type { Hero } from './life-motion.ts';
import type { LiddedPlacement, LiddedProps } from './lidded-props.ts';
import { createLiddedProps } from './lidded-props.ts';
import { flamePoint, lightLevel, lightPoint } from './prop-lights.ts';

export const ZONE_VIEW = {
  abyssDepth: -1.06,
  abyssMargin: 160,
  lightBudget: 6,
  lightFadeBand: 7,
  appearRate: 2.4,
  settledWithin: 0.004,
} as const;

interface Placement {
  readonly matrix: Matrix4;
}

interface Batch {
  readonly prop: string;
  readonly castShadow: boolean;
  readonly list: Placement[];
}

interface Conditional {
  readonly placed: ZoneProp;
  readonly wanted: (world: World) => boolean;
  readonly def: PropDef;
  readonly materials: MeshStandardMaterial[];
  object: Object3D | null;
  shown: number;
  on: boolean | null;
}

interface Source {
  readonly point: Vector3;
  readonly flame: Vector3 | null;
  readonly color: Color;
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
  readonly form: PropLight['form'];
  readonly phase: number;
  readonly conditional: Conditional | null;
  score: number;
}

export interface ViewFocus {
  readonly look: Vec2 | null;
  readonly figure: FigureSize;
  readonly flash: number;
}

export interface ZoneView {
  readonly zone: ZoneDef;
  readonly group: Group;
  readonly torches: readonly Vector3[];
  readonly lightsVersion: number;
  readonly ready: Promise<void>;
  setGraphics(preset: GraphicsPreset): void;
  update(time: number, dt: number, world: World, focus: ViewFocus): void;
  takeLifeEvents(): LifeEvent[];
  dispose(): void;
}

const DEGREES: number = Math.PI / 180;

function loosePlacement(def: PropDef): boolean {
  return def.footprints.length === 0 && def.blockRadius === 0 && !def.shadow && def.light === null && !isTall(def.height);
}

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

export function fightsInto(world: World, out: Vec2[]): Vec2[] {
  out.length = 0;
  for (const monster of world.monsters) {
    if (monster.alive && monster.aggro) out.push(monster.pos);
  }
  return out;
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
  releaseSurfaces(new Set<string>([...zoneSurfaces(content, kept), ...momentSurfaces(content)]));
  const keep: Set<string> = zoneModels(content, kept);
  for (const zone of content.zones.values()) {
    if (zone.id === kept.id) continue;
    for (const model of zoneModels(content, zone)) if (!keep.has(model)) forgetModel(model);
  }
}

function lightSource(light: PropLight, x: number, y: number, z: number, yaw: number, conditional: Conditional | null): Source {
  return { point: lightPoint(light, x, y, z, yaw), flame: flamePoint(light, x, y, z, yaw), color: new Color(light.color), intensity: light.intensity, distance: light.distance, decay: light.decay, form: light.form, phase: hash(x, z, 1) * 40, conditional, score: 0 };
}

function standardMaterials(value: unknown): MeshStandardMaterial[] {
  if (value instanceof MeshStandardMaterial) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry: unknown): entry is MeshStandardMaterial => entry instanceof MeshStandardMaterial);
}

function carryLook(from: MeshStandardMaterial, to: MeshStandardMaterial): MeshStandardMaterial {
  const look: PropLook | undefined = lookOf(from);
  return look === undefined ? to : withPropLook(to, look);
}

function propWidth(def: PropDef): number {
  const points: readonly ReadonlyVec2[] = def.footprints.flat();
  if (points.length === 0) return Infinity;
  const xs: number[] = points.map((point: ReadonlyVec2): number => point.x);
  const zs: number[] = points.map((point: ReadonlyVec2): number => point.z);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
}

function flatGround(): number {
  return 0;
}

export function shoreLocal(at: ReadonlyVec2, facing: ReadonlyVec2, point: ReadonlyVec2): Hero {
  const dx: number = point.x - at.x;
  const dz: number = point.z - at.z;
  return { x: dx * facing.z - dz * facing.x, z: dx * facing.x + dz * facing.z };
}

export async function buildZoneView(loader: GLTFLoader, content: Content, zone: ZoneDef, scene: Scene, quality: QualityName, renderer: WebGLRenderer | null = null): Promise<ZoneView> {
  if (zone.kind === 'void') {
    const rockId: string | null = zone.void?.shore?.surface ?? null;
    const glimpses: VoidGlimpses = createVoidGlimpses(loader, content, zone.void?.glimpses ?? [], zone.floorHeight);
    const empty: ZoneView = buildVoidView(zone, quality, rockId === null ? null : (content.surfaces.get(rockId) ?? null), glimpses);
    const rocks: ShoreProps = createShoreProps(loader, content, zone.void?.shore ?? null, zone.floorHeight, quality === 'mobile');
    empty.group.add(rocks.group);
    const shoreLife: LifeView = createLifeView(LIFE, placesFor(LIFE, zone.id, 'shore'), lifeDensity(1, quality === 'mobile'));
    rocks.group.add(shoreLife.group);
    scene.add(empty.group);
    return {
      zone: empty.zone,
      group: empty.group,
      torches: empty.torches,
      lightsVersion: empty.lightsVersion,
      ready: Promise.all([empty.ready, rocks.ready]).then((): void => undefined),
      setGraphics(preset: GraphicsPreset): void {
        empty.setGraphics(preset);
        shoreLife.setDensity(lifeDensity(preset.effectsDensity, quality === 'mobile'));
      },
      update(time: number, dt: number, world: World, focus: ViewFocus): void {
        rocks.follow(world);
        empty.update(time, dt, world, focus);
        const shore: ShoreState | null = world.shore;
        if (shore !== null) shoreLife.update(time, dt, shoreLocal(shore.at, shore.facing, world.player.pos), flatGround, []);
      },
      takeLifeEvents(): LifeEvent[] {
        return shoreLife.takeEvents();
      },
      dispose(): void {
        shoreLife.dispose();
        rocks.dispose();
        empty.dispose();
      },
    };
  }
  const placements: Map<string, Batch> = new Map<string, Batch>();
  const latePlacements: Map<string, Batch> = new Map<string, Batch>();
  const group: Group = new Group();
  const sources: Source[] = [];
  const instances: InstancedMesh[] = [];
  const conditionals: Conditional[] = [];
  const tintedMaterials: MeshStandardMaterial[] = [];
  const occluders: Object3D[] = [];
  const cutFor = (def: PropDef | undefined, material: Material): Material => {
    if (def === undefined || !isTall(def.height) || !(material instanceof MeshStandardMaterial)) return material;
    const own: MeshStandardMaterial = carryLook(material, material.clone());
    tintedMaterials.push(own);
    return withCutaway(own, propWidth(def));
  };
  let lightsVersion: number = 0;

  const dressing: PropDressing = propDressing(zone);
  const loose: PropDressing = looseDressing(zone);
  const scattered: Set<string> = new Set<string>(zone.scatter.flatMap((rule: ZoneScatter): readonly string[] => rule.props));
  const finish = (def: PropDef | undefined, material: Material): Material => {
    if (def === undefined || def.tint === null || !(material instanceof MeshStandardMaterial)) return material;
    const own: MeshStandardMaterial = tintProp(carryLook(material, material.clone()), def.tint);
    tintedMaterials.push(own);
    return own;
  };

  const place = (propId: string, x: number, y: number, z: number, yaw: number, castShadow: boolean, size: number = 1): void => {
    const def: PropDef | undefined = content.props.get(propId);
    if (def === undefined) return;
    const casts: boolean = castShadow && def.shadow;
    const target: Map<string, Batch> = loosePlacement(def) ? latePlacements : placements;
    const key: string = `${propId}:${String(casts)}:${propCell(x, z)}`;
    const batch: Batch = target.get(key) ?? { prop: propId, castShadow: casts, list: [] };
    const lifted: number = y + liftAt(zone, x, z);
    batch.list.push({ matrix: transform(x, lifted, z, yaw, def.scale * size) });
    target.set(key, batch);
    if (def.light === null) return;
    sources.push(lightSource(def.light, x, lifted, z, yaw, null));
  };

  useTerrain(zone, content.props);
  const ground: Ground = buildGround(content, zone);
  for (const mesh of ground.meshes) group.add(mesh);
  if (renderer !== null) await ground.prepare(renderer);
  const falls: LavaFalls = buildLavaFalls(content, zone);
  group.add(falls.group);
  const terrainSight: TerrainSight | null = createTerrainSight(zone);
  if (terrainSight !== null) for (const mesh of ground.meshes) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) withCutaway(material);
  const walls: ZoneWalls | null = zone.walls;
  for (const edge of walls === null ? [] : wallEdges(zone)) {
    const alongZ: boolean = edge.side === 'west' || edge.side === 'east';
    const variant: string | undefined = walls === null ? undefined : edge.tall ? walls.tall[Math.floor(hash(edge.column, edge.row, alongZ ? 7 : 9) * walls.tall.length)] : walls.low;
    if (variant !== undefined) place(variant, edge.x, 0, edge.z, alongZ ? Math.PI / 2 : 0, true);
  }
  if (walls !== null) for (const corner of wallCorners(zone)) place(walls.corner, corner.x, 0, corner.z, 0, true);
  for (const rock of edgeRocks(content, zone)) place(rock.prop, rock.x, 0, rock.z, rock.yaw, true);
  for (const piece of barrierPieces(zone, content.props)) if (piece.collide || piece.row < renderBudget().barrierRows) place(piece.prop, piece.x, 0, piece.z, piece.rotationDegrees * DEGREES, piece.shadow, piece.size);
  for (const rock of cliffRocks(zone, content.props)) place(rock.prop, rock.x, 0, rock.z, rock.rotationDegrees * DEGREES, true, rock.size);
  for (const stone of scatterStones(content, zone)) place(stone.prop, stone.x, 0, stone.z, stone.yaw, false, stone.size);
  const showWhen = (prop: ZoneProp, def: PropDef, wanted: (world: World) => boolean): void => {
    const conditional: Conditional = { placed: prop, wanted, def, materials: [], object: null, shown: 0, on: null };
    conditionals.push(conditional);
    if (def.light !== null) sources.push(lightSource(def.light, prop.x, prop.y + liftAt(zone, prop.x, prop.z), prop.z, prop.rotationDegrees * DEGREES, conditional));
  };
  const lidded: LiddedPlacement[] = [];
  zone.props.forEach((prop: ZoneProp, index: number): void => {
    const def: PropDef | undefined = content.props.get(prop.prop);
    if (def === undefined) return;
    const cache: PropCache | null = def.cache;
    if (prop.when.length === 0 && cache === null && def.lid !== null) {
      const lifted: number = prop.y + liftAt(zone, prop.x, prop.z);
      lidded.push({ def, lid: def.lid, x: prop.x, y: lifted, z: prop.z, yaw: prop.rotationDegrees * DEGREES });
      if (def.light !== null) sources.push(lightSource(def.light, prop.x, lifted, prop.z, prop.rotationDegrees * DEGREES, null));
      return;
    }
    if (prop.when.length === 0 && cache === null) {
      place(prop.prop, prop.x, prop.y, prop.z, prop.rotationDegrees * DEGREES, true);
      return;
    }
    showWhen(prop, def, (world: World): boolean => allHold(world, prop.when) && !world.cachesOpened.includes(index));
    const opened: PropDef | undefined = cache?.opened === null || cache?.opened === undefined ? undefined : content.props.get(cache.opened);
    if (opened !== undefined) showWhen({ ...prop, prop: opened.id }, opened, (world: World): boolean => allHold(world, prop.when) && world.cachesOpened.includes(index));
  });

  const pool: PointLight[] = [];
  for (let index: number = 0; index < Math.min(ZONE_VIEW.lightBudget, renderBudget().zoneLights, sources.length); index += 1) {
    const light: PointLight = new PointLight(0xffffff, 0, 1);
    pool.push(light);
    group.add(light);
  }
  const ranked: Source[] = [...sources];
  let activeLights: number = pool.length;

  const loaded: [Batch, GLTF][] = await Promise.all(
    [...placements.values()].map(async (batch: Batch): Promise<[Batch, GLTF]> => {
      const def: PropDef | undefined = content.props.get(batch.prop);
      return [batch, await loadModel(loader, def?.model ?? '')];
    }),
  );

  const looks: Map<string, Material> = new Map<string, Material>();
  const addBatch = (batch: Batch, gltf: GLTF): void => {
    const propId: string = batch.prop;
    const list: Placement[] = batch.list;
    const dress: Readonly<Record<string, string>> = content.props.get(propId)?.surfaces ?? {};
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((object: Object3D): void => {
      if (!(object instanceof Mesh)) return;
      const geometry: unknown = object.geometry;
      const material: unknown = object.material;
      if (!(material instanceof MeshStandardMaterial) || !isGeometry(geometry)) return;
      const lookKey: string = `${propId}:${object.uuid}`;
      const look: Material = looks.get(lookKey) ?? cutFor(content.props.get(propId), finish(content.props.get(propId), dressedProp(content, dress, material, scattered.has(propId) ? loose : dressing)));
      looks.set(lookKey, look);
      const instanced: InstancedMesh = new InstancedMesh(geometry, look, list.length);
      list.forEach((placement: Placement, index: number): void => {
        instanced.setMatrixAt(index, new Matrix4().multiplyMatrices(placement.matrix, object.matrixWorld));
      });
      instanced.instanceMatrix.needsUpdate = true;
      instanced.castShadow = batch.castShadow;
      instanced.receiveShadow = true;
      instanced.computeBoundingSphere();
      if (isTall(content.props.get(propId)?.height ?? 0)) occluders.push(instanced);
      instances.push(instanced);
      group.add(instanced);
    });
  };
  for (const [batch, gltf] of loaded) addBatch(batch, gltf);
  let live: boolean = true;
  const dressLate = async (): Promise<void> => {
    const batches: Batch[] = [...latePlacements.values()];
    const surfaceIds: Set<string> = new Set<string>(batches.flatMap((batch: Batch): string[] => Object.values(content.props.get(batch.prop)?.surfaces ?? {})));
    const [models]: [[Batch, GLTF][], void] = await Promise.all([
      Promise.all(
        batches.map(async (batch: Batch): Promise<[Batch, GLTF]> => [batch, await loadModel(loader, content.props.get(batch.prop)?.model ?? '')]),
      ),
      preloadSurfaces(content, surfaceIds),
    ]);
    if (!live) return;
    await workPaced(models, ([batch, gltf]: [Batch, GLTF]): void => (live ? addBatch(batch, gltf) : undefined), browserPacer());
  };

  await Promise.all(
    conditionals.map(async (conditional: Conditional): Promise<void> => {
      const gltf: GLTF = await loadModel(loader, conditional.def.model);
      const object: Object3D = gltf.scene.clone(true);
      object.position.set(conditional.placed.x, conditional.placed.y + liftAt(zone, conditional.placed.x, conditional.placed.z), conditional.placed.z);
      object.rotation.y = conditional.placed.rotationDegrees * DEGREES;
      object.scale.setScalar(conditional.def.scale);
      object.traverse((child: Object3D): void => {
        if (!(child instanceof Mesh)) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const shared: unknown = child.material;
        const own: MeshStandardMaterial[] = standardMaterials(shared).map((material: MeshStandardMaterial): MeshStandardMaterial => standardMaterials(dressedProp(content, conditional.def.surfaces, material, dressing)).map((worn: MeshStandardMaterial): MeshStandardMaterial => tintProp(carryLook(worn, worn.clone()), conditional.def.tint))[0] ?? tintProp(material.clone(), conditional.def.tint));
        const first: MeshStandardMaterial | undefined = own[0];
        if (Array.isArray(shared)) {
          if (own.length !== shared.length) return;
          child.material = own;
        } else if (first !== undefined) {
          child.material = first;
        } else {
          return;
        }
        for (const material of own) material.transparent = true;
        if (isTall(conditional.def.height)) {
          for (const material of own) withCutaway(material, propWidth(conditional.def));
          occluders.push(child);
        }
        conditional.materials.push(...own);
      });
      object.visible = false;
      group.add(object);
      conditional.object = object;
    }),
  );

  const lids: LiddedProps = createLiddedProps(loader, lidded, (def: PropDef, material: MeshStandardMaterial): Material => cutFor(def, finish(def, dressedProp(content, def.surfaces, material, dressing))));
  await lids.ready;
  group.add(lids.group);

  const roofs: TunnelRoofs = createTunnelRoofs(loader, content, zone, (def: PropDef, material: MeshStandardMaterial): MeshStandardMaterial[] => standardMaterials(dressedProp(content, def.surfaces, material, dressing)).map((worn: MeshStandardMaterial): MeshStandardMaterial => carryLook(worn, worn.clone())));
  await roofs.ready;
  group.add(roofs.group);

  const width: number = zoneColumns(zone) * zone.cellSize;
  const depth: number = zoneRows(zone) * zone.cellSize;
  const abyss: Mesh = new Mesh(new PlaneGeometry(width + ZONE_VIEW.abyssMargin, depth + ZONE_VIEW.abyssMargin), new MeshStandardMaterial({ color: new Color(zone.ambience.abyss), roughness: 1, metalness: 0 }));
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.set(width / 2, ZONE_VIEW.abyssDepth, depth / 2);
  abyss.receiveShadow = true;
  group.add(abyss);
  const mistWall: MistWallView | null = zone.weather.mistWall === null ? null : buildMistWall(zone.weather.mistWall);
  if (mistWall !== null) group.add(mistWall.group);
  const embers: Embers = createEmbers(zone.weather.embers);
  if (embers.points !== null) group.add(embers.points);
  scene.add(group);
  void dressLate().catch((): void => undefined);

  const cutaway: symbol = claimCutaway(occluders, terrainSight);
  const life: LifeView = createLifeView(LIFE, placesFor(LIFE, zone.id, 'zone'), lifeDensity(1, quality === 'mobile'));
  const fights: Vec2[] = [];
  group.add(life.group);
  const groundAt = (x: number, z: number): number => zone.floorHeight + liftAt(zone, x, z);
  return {
    zone,
    group,
    ready: Promise.resolve(),
    setGraphics(preset: GraphicsPreset): void {
      activeLights = Math.min(pool.length, Math.max(0, preset.lights));
      life.setDensity(lifeDensity(preset.effectsDensity, quality === 'mobile'));
    },
    get torches(): readonly Vector3[] {
      return sources.flatMap((source: Source): Vector3[] => (source.flame !== null && (source.conditional === null || source.conditional.on === true) ? [source.flame] : []));
    },
    get lightsVersion(): number {
      return lightsVersion;
    },
    takeLifeEvents(): LifeEvent[] {
      return [...life.takeEvents(), ...lids.takeEvents()];
    },
    dispose(): void {
      live = false;
      resetCutaway(cutaway);
      lids.dispose();
      roofs.dispose();
      life.dispose();
      group.removeFromParent();
      ground.dispose();
      falls.dispose();
      for (const instanced of instances) instanced.dispose();
      for (const material of tintedMaterials) material.dispose();
      for (const light of pool) light.dispose();
      for (const conditional of conditionals) {
        for (const material of conditional.materials) material.dispose();
      }
      abyss.geometry.dispose();
      if (abyss.material instanceof MeshStandardMaterial) abyss.material.dispose();
      mistWall?.dispose();
      embers.dispose();
    },
    update(time: number, dt: number, world: World, focus: ViewFocus): void {
      ground.update(world.time);
      tickGlow(time);
      embers.update(time, world.player.pos.x, groundAt(world.player.pos.x, world.player.pos.z), world.player.pos.z);
      mistWall?.update(time, focus.flash);
      life.update(time, dt, world.player.pos, groundAt, fightsInto(world, fights));
      roofs.update(world.player.pos.x, world.player.pos.z, dt);
      lids.update(world.service, time, dt);
      for (const conditional of conditionals) {
        const wanted: boolean = conditional.wanted(world);
        if (conditional.on === null) conditional.shown = wanted ? 1 : 0;
        if (wanted !== conditional.on) {
          conditional.on = wanted;
          lightsVersion += 1;
        }
        const target: number = wanted ? 1 : 0;
        conditional.shown += (target - conditional.shown) * (1 - Math.exp(-ZONE_VIEW.appearRate * dt));
        if (Math.abs(target - conditional.shown) < ZONE_VIEW.settledWithin) conditional.shown = target;
        for (const material of conditional.materials) material.opacity = conditional.shown;
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
        light.decay = source.decay;
        light.intensity = source.intensity * fade * shown * lightLevel(source.form, time, source.phase);
      });
    },
  };
}
