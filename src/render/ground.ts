import { warnInConsole } from '../backend/console-log.ts';
import type { WebGLRenderer } from 'three';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Uint16BufferAttribute, Uint32BufferAttribute } from 'three';
import type { ZoneDrift } from '../../sim/content/road-types.ts';
import { driftShown } from '../../sim/nav/drift.ts';
import type { Content, SurfaceDef, ZoneDef, ZoneProp } from '../../sim/content/types.ts';
import { distanceToCell, floorCells, isFloorCell, outsideCells, tileAtCell, zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import type { FloorCell, OutsideCell } from '../../sim/nav/layout.ts';
import { floorArraySizeNow, floorRoughness, floorSources, metalSurface, surfaceMaterial } from './surfaces.ts';
import type { FloorStack, ShapedFloor } from './floor-stack.ts';
import { createFloorStack, shapedFloor, surfaceLayer } from './floor-stack.ts';
import type { FloorLayerLook, FloorLayout, FloorMaterial } from './floor-material.ts';
import { createFloorMaterial } from './floor-material.ts';
import type { FloorArrays, FloorSource } from './floor-arrays.ts';
import { bakeFloorArrays } from './floor-arrays.ts';
import { buildCliffs } from './ground-cliffs.ts';
import { buildTerrainGround } from './ground-terrain.ts';
import { tileLift } from './terrain-lift.ts';
import { wetGround } from './wet-ground.ts';
import { fringeShare, spreadsOnto } from './ground-spill.ts';
import type { SurfaceUse } from './surfaces.ts';
import type { GroundLayer } from './ground-terrain.ts';
import { zoneCache, type ZoneCache } from '../../sim/zone-cache.ts';

export const GROUND = {
  divisions: 8,
  macroScale: 0.085,
  macroDepth: 0.34,
  detailScale: 0.42,
  detailDepth: 0.12,
  wallShade: 0.42,
  wallReach: 1.7,
  fringeReach: 1.9,
  fringeNoise: 0.75,
  fringeNoiseScale: 0.9,
  outsideShade: 0.8,
  outsideLift: -0.015,
  overlayLift: 0.012,
  driftSink: 0.35,
  driftBedDepth: 0.03,
  openEdgeOverlap: 0.08,
  driftBedShade: 0.7,
  propShade: 0.45,
  propReach: 1.6,
} as const;

const GROUND_GRID = { spillMargin: 2 } as const;

export const GROUND_ORDER = { solid: 0, fringe: 0.5, overlay: 1 } as const;

const GROUND_INDEX = { narrowLimit: 65535 } as const;

export interface Occluder {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export function occlusionAt(occluders: readonly Occluder[], x: number, z: number): number {
  let shade: number = 1;
  for (const occluder of occluders) {
    const reach: number = occluder.radius * GROUND.propReach;
    const dx: number = x - occluder.x;
    if (dx > reach || dx < -reach) continue;
    const dz: number = z - occluder.z;
    if (dz > reach || dz < -reach) continue;
    const near: number = 1 - smooth(Math.hypot(dx, dz) / reach);
    shade = Math.min(shade, 1 - (1 - GROUND.propShade) * near);
  }
  return shade;
}

export interface Batch {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly colors: number[];
  readonly indices: number[];
}

export interface ShapedBatch {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  readonly wideIndices: boolean;
}

export function shapedBatch(batch: Batch): ShapedBatch {
  const indices: Uint32Array = Uint32Array.from(batch.indices);
  let widest: number = 0;
  for (const index of indices) widest = Math.max(widest, index);
  return {
    positions: Float32Array.from(batch.positions),
    normals: Float32Array.from(batch.normals),
    uvs: Float32Array.from(batch.uvs),
    colors: Float32Array.from(batch.colors),
    indices,
    wideIndices: widest >= GROUND_INDEX.narrowLimit,
  };
}

function shapedBatches(batches: ReadonlyMap<string, Batch>): ReadonlyMap<string, ShapedBatch> {
  return new Map<string, ShapedBatch>([...batches].map(([surface, batch]: [string, Batch]): [string, ShapedBatch] => [surface, shapedBatch(batch)]));
}

export interface Grow {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const NO_GROW: Grow = { left: 0, top: 0, right: 0, bottom: 0 };

export function growAt(zone: ZoneDef, column: number, row: number): Grow {
  if (zone.walls !== null) return NO_GROW;
  const own: ZoneDrift | null = driftAt(zone, column, row);
  const edge = (dc: number, dr: number): number => (isFloorCell(zone, column + dc, row + dr) && driftAt(zone, column + dc, row + dr) === own ? 0 : GROUND.openEdgeOverlap);
  return { left: edge(-1, 0), top: edge(0, -1), right: edge(1, 0), bottom: edge(0, 1) };
}

interface Corner {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly shade: number;
  readonly alpha: number;
}

export interface DriftGround {
  readonly drift: ZoneDrift;
  readonly meshes: readonly Mesh[];
  readonly materials: readonly MeshStandardMaterial[];
}

export interface Ground {
  readonly meshes: readonly Mesh[];
  readonly drifts: readonly DriftGround[];
  prepare(renderer: WebGLRenderer): Promise<void>;
  update(time: number): void;
  dispose(): void;
}

function driftAt(zone: ZoneDef, column: number, row: number): ZoneDrift | null {
  return zone.drifts.find((drift: ZoneDrift): boolean => column >= drift.column && column < drift.column + drift.columns && row >= drift.row && row < drift.row + drift.rows) ?? null;
}

function driftGround(content: Content, drift: ZoneDrift, batches: ReadonlyMap<string, ShapedBatch>, wet: number): DriftGround {
  const meshes: Mesh[] = [];
  const materials: MeshStandardMaterial[] = [];
  for (const [surfaceId, batch] of batches) {
    const mesh: Mesh | null = toMesh(content, surfaceId, 'ground', batch, wet);
    if (mesh === null || !(mesh.material instanceof MeshStandardMaterial)) continue;
    const own: MeshStandardMaterial = mesh.material.clone();
    wetGround(own, wet);
    own.transparent = true;
    mesh.material = own;
    meshes.push(mesh);
    materials.push(own);
  }
  return { drift, meshes, materials };
}

function lattice(x: number, z: number): number {
  const value: number = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function smooth(t: number): number {
  const clamped: number = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function noise(x: number, z: number): number {
  const baseX: number = Math.floor(x);
  const baseZ: number = Math.floor(z);
  const blendX: number = smooth(x - baseX);
  const blendZ: number = smooth(z - baseZ);
  const near: number = lattice(baseX, baseZ) * (1 - blendX) + lattice(baseX + 1, baseZ) * blendX;
  const far: number = lattice(baseX, baseZ + 1) * (1 - blendX) + lattice(baseX + 1, baseZ + 1) * blendX;
  return near * (1 - blendZ) + far * blendZ;
}

export interface FloorGrid {
  floor(column: number, row: number): boolean;
}

export function floorGrid(zone: ZoneDef): FloorGrid {
  const columns: number = Math.max(zoneColumns(zone), ...zone.tiles.map((line: string): number => line.length));
  const rows: number = zoneRows(zone);
  const cells: Uint8Array = new Uint8Array(columns * rows);
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) cells[row * columns + column] = isFloorCell(zone, column, row) ? 1 : 0;
  }
  return {
    floor(column: number, row: number): boolean {
      if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
      return cells[row * columns + column] === 1;
    },
  };
}

interface Shading {
  readonly zone: ZoneDef;
  readonly occluders: readonly Occluder[];
  readonly grid: FloorGrid;
}

function nearest(zone: ZoneDef, x: number, z: number, span: number, wanted: (column: number, row: number) => boolean): number {
  const column: number = Math.floor(x / zone.cellSize);
  const row: number = Math.floor(z / zone.cellSize);
  let best: number = Number.POSITIVE_INFINITY;
  for (let dr: number = -span; dr <= span; dr += 1) {
    for (let dc: number = -span; dc <= span; dc += 1) {
      if (!wanted(column + dc, row + dr)) continue;
      best = Math.min(best, distanceToCell(x, z, column + dc, row + dr, zone.cellSize));
    }
  }
  return best;
}

function shadeAt(shading: Shading, x: number, z: number): number {
  const { zone, occluders, grid } = shading;
  const macro: number = 1 - GROUND.macroDepth * noise(x * GROUND.macroScale, z * GROUND.macroScale);
  const detail: number = 1 - GROUND.detailDepth * noise(x * GROUND.detailScale + 31.7, z * GROUND.detailScale + 11.3);
  const occluded: number = occlusionAt(occluders, x, z);
  if (zone.walls === null) return macro * detail * occluded;
  const toWall: number = nearest(zone, x, z, 1, (column: number, row: number): boolean => !grid.floor(column, row));
  const toFloor: number = nearest(zone, x, z, 1, (column: number, row: number): boolean => grid.floor(column, row));
  const edge: number = Math.max(toWall, toFloor);
  const wall: number = GROUND.wallShade + (1 - GROUND.wallShade) * smooth(edge / GROUND.wallReach);
  return macro * detail * wall * occluded;
}

function emit(batch: Batch, corners: readonly [Corner, Corner, Corner, Corner]): void {
  const base: number = batch.positions.length / 3;
  for (const corner of corners) {
    batch.positions.push(corner.x, corner.y, corner.z);
    batch.normals.push(0, 1, 0);
    batch.uvs.push(corner.x, corner.z);
    batch.colors.push(corner.shade, corner.shade, corner.shade, corner.alpha);
  }
  batch.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

export function coverLines(origin: number, cellSize: number, before: number, after: number): number[] {
  const step: number = cellSize / GROUND.divisions;
  const lines: number[] = [];
  for (let index: number = 0; index <= GROUND.divisions; index += 1) {
    const at: number = origin * cellSize + index * step;
    lines.push(index === 0 ? at - before : index === GROUND.divisions ? at + after : at);
  }
  return lines;
}

function cover(shading: Shading, batch: Batch, column: number, row: number, y: number, tone: number, alphaAt: ((x: number, z: number) => number) | null, grow: Grow = NO_GROW): void {
  const { zone } = shading;
  const xs: number[] = coverLines(column, zone.cellSize, grow.left, grow.right);
  const zs: number[] = coverLines(row, zone.cellSize, grow.top, grow.bottom);
  const size: number = GROUND.divisions + 1;
  const grid: Corner[] = [];
  for (const z of zs) {
    for (const x of xs) grid.push({ x, y: y + tileLift(zone, column, row, x, z), z, shade: shadeAt(shading, x, z) * tone, alpha: alphaAt === null ? 1 : alphaAt(x, z) });
  }
  const at = (i: number, j: number): Corner => {
    const found: Corner | undefined = grid[j * size + i];
    if (found === undefined) throw new Error('ground corner out of range');
    return found;
  };
  for (let j: number = 0; j < GROUND.divisions; j += 1) {
    for (let i: number = 0; i < GROUND.divisions; i += 1) {
      const corners: [Corner, Corner, Corner, Corner] = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)];
      if (corners.every((entry: Corner): boolean => entry.alpha <= 0)) continue;
      emit(batch, corners);
    }
  }
}

function batchFor(batches: Map<string, Batch>, key: string): Batch {
  const found: Batch | undefined = batches.get(key);
  if (found !== undefined) return found;
  const made: Batch = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  batches.set(key, made);
  return made;
}

function spillOf(content: Content, zone: ZoneDef, column: number, row: number): SurfaceDef | null {
  const surfaceId: string | undefined = zone.floors[tileAtCell(zone, column, row)];
  return surfaceId === undefined ? null : (content.surfaces.get(surfaceId) ?? null);
}

export interface SpillGrid {
  at(column: number, row: number): SurfaceDef | null;
}

export function spillGrid(content: Content, zone: ZoneDef): SpillGrid {
  const margin: number = GROUND_GRID.spillMargin;
  const columns: number = Math.max(zoneColumns(zone), ...zone.tiles.map((line: string): number => line.length)) + 2 * margin;
  const rows: number = zoneRows(zone) + 2 * margin;
  const cells: (SurfaceDef | null)[] = [];
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) cells.push(spillOf(content, zone, column - margin, row - margin));
  }
  return {
    at(column: number, row: number): SurfaceDef | null {
      const c: number = column + margin;
      const r: number = row + margin;
      if (c < 0 || r < 0 || c >= columns || r >= rows) return spillOf(content, zone, column, row);
      return cells[r * columns + c] ?? null;
    },
  };
}

function fringes(spills: SpillGrid, cell: FloorCell, own: SurfaceDef): SurfaceDef[] {
  const found: Map<string, SurfaceDef> = new Map<string, SurfaceDef>();
  for (let dr: number = -1; dr <= 1; dr += 1) {
    for (let dc: number = -1; dc <= 1; dc += 1) {
      const other: SurfaceDef | null = spills.at(cell.column + dc, cell.row + dr);
      if (other !== null && spreadsOnto(other, own)) found.set(other.id, other);
    }
  }
  return [...found.values()];
}

function toMesh(content: Content, surfaceId: string, use: SurfaceUse, batch: ShapedBatch, wet: number, order: number = use === 'overlay' ? GROUND_ORDER.overlay : GROUND_ORDER.solid): Mesh | null {
  const def: SurfaceDef | undefined = content.surfaces.get(surfaceId);
  if (def === undefined || batch.indices.length === 0) return null;
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(batch.uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(batch.colors, 4));
  geometry.setAttribute('normal', new Float32BufferAttribute(batch.normals, 3));
  geometry.setIndex(batch.wideIndices ? new Uint32BufferAttribute(batch.indices, 1) : new Uint16BufferAttribute(batch.indices, 1));
  const mesh: Mesh = new Mesh(geometry, surfaceMaterial(def, use, wet));
  mesh.receiveShadow = true;
  mesh.renderOrder = order;
  return mesh;
}

export interface GroundBatches {
  readonly solid: ReadonlyMap<string, ShapedBatch>;
  readonly fringe: ReadonlyMap<string, ShapedBatch>;
  readonly overlay: ReadonlyMap<string, ShapedBatch>;
  readonly drifting: ReadonlyMap<ZoneDrift, ReadonlyMap<string, ShapedBatch>>;
  readonly floor: ShapedFloor | null;
}

interface BuiltGround {
  readonly content: Content;
  readonly batches: GroundBatches;
}

const builtBatches: ZoneCache<BuiltGround> = zoneCache<BuiltGround>('ground', { keepsStanding: false });

export function groundBatches(content: Content, zone: ZoneDef): GroundBatches {
  const found: BuiltGround | undefined = builtBatches.get(zone);
  if (found !== undefined && found.content === content) return found.batches;
  const batches: GroundBatches = shapeGround(content, zone);
  builtBatches.set(zone, { content, batches });
  return batches;
}

function shapeGround(content: Content, zone: ZoneDef): GroundBatches {
  const { solid, fringe, overlay, drifting, floor } = rawGround(content, zone);
  return {
    floor: floor === null || floor.indices.length === 0 ? null : shapedFloor(floor),
    solid: shapedBatches(solid),
    fringe: shapedBatches(fringe),
    overlay: shapedBatches(overlay),
    drifting: new Map<ZoneDrift, ReadonlyMap<string, ShapedBatch>>([...drifting].map(([drift, batches]: [ZoneDrift, ReadonlyMap<string, Batch>]): [ZoneDrift, ReadonlyMap<string, ShapedBatch>] => [drift, shapedBatches(batches)])),
  };
}

interface RawGround {
  readonly floor: FloorStack | null;
  readonly solid: ReadonlyMap<string, Batch>;
  readonly fringe: ReadonlyMap<string, Batch>;
  readonly overlay: ReadonlyMap<string, Batch>;
  readonly drifting: ReadonlyMap<ZoneDrift, ReadonlyMap<string, Batch>>;
}

function rawGround(content: Content, zone: ZoneDef): RawGround {
  const solid: Map<string, Batch> = new Map<string, Batch>();
  const fringe: Map<string, Batch> = new Map<string, Batch>();
  const overlay: Map<string, Batch> = new Map<string, Batch>();
  const layers: Readonly<Record<GroundLayer, Map<string, Batch>>> = { solid, fringe, overlay };
  const floorY: number = zone.floorHeight;
  const occluders: Occluder[] = zone.props.flatMap((placed: ZoneProp): Occluder[] => {
    const radius: number = content.props.get(placed.prop)?.blockRadius ?? 0;
    return radius > 0 && placed.when.length === 0 ? [{ x: placed.x, z: placed.z, radius }] : [];
  });
  const grid: FloorGrid = floorGrid(zone);
  const spills: SpillGrid = spillGrid(content, zone);
  const shading: Shading = { zone, occluders, grid };

  const drifting: Map<ZoneDrift, Map<string, Batch>> = new Map<ZoneDrift, Map<string, Batch>>();
  if (zone.terrain !== null && zone.terrain.rough !== null) {
    let floor: FloorStack | null = null;
    const plainFloor = (ids: readonly string[]): boolean =>
      ids.every((id: string): boolean => {
        const def: SurfaceDef | undefined = content.surfaces.get(id);
        return def !== undefined && !metalSurface(def);
      });
    buildTerrainGround(
      zone,
      {
        batchFor: (surface: string, layer: GroundLayer): Batch => batchFor(layers[layer], surface),
        floor: (solids: readonly string[], fringeIds: readonly string[], blendIds: readonly string[]): FloorStack | null => {
          floor = plainFloor([...solids, ...fringeIds, ...blendIds]) ? createFloorStack(solids, fringeIds, blendIds) : null;
          return floor;
        },
      },
      (surface: string): number => content.surfaces.get(surface)?.spill ?? 0,
    );
    return { solid, fringe, overlay, drifting, floor };
  }
  for (const cell of floorCells(zone)) {
    const own: SurfaceDef | null = spills.at(cell.column, cell.row);
    if (own === null) continue;
    const drift: ZoneDrift | null = driftAt(zone, cell.column, cell.row);
    if (drift !== null) {
      const batches: Map<string, Batch> = drifting.get(drift) ?? new Map<string, Batch>();
      drifting.set(drift, batches);
      const grow: Grow = growAt(zone, cell.column, cell.row);
      cover(shading, batchFor(batches, own.id), cell.column, cell.row, floorY, 1, null, grow);
      const bed: string = zone.outside?.surface ?? own.id;
      cover(shading, batchFor(solid, bed), cell.column, cell.row, floorY - GROUND.driftBedDepth, GROUND.driftBedShade, null, grow);
      continue;
    }
    cover(shading, batchFor(solid, own.id), cell.column, cell.row, floorY, 1, null, growAt(zone, cell.column, cell.row));
    for (const other of fringes(spills, cell, own)) {
      const alphaAt = (x: number, z: number): number => {
        const distance: number = nearest(zone, x, z, 1, (column: number, row: number): boolean => spills.at(column, row)?.id === other.id);
        const ragged: number = (noise(x * GROUND.fringeNoiseScale + 7.3, z * GROUND.fringeNoiseScale + 3.1) - 0.5) * GROUND.fringeNoise;
        return fringeShare(distance, GROUND.fringeReach, ragged);
      };
      cover(shading, batchFor(fringe, other.id), cell.column, cell.row, floorY + GROUND.overlayLift, 1, alphaAt);
    }
  }

  const outside = zone.outside;
  if (outside !== null) {
    const reach: number = outside.reach * zone.cellSize;
    const span: number = Math.ceil(outside.reach);
    const alphaAt = (x: number, z: number): number => {
      const distance: number = nearest(zone, x, z, span, (column: number, row: number): boolean => grid.floor(column, row));
      return smooth(1 - distance / reach);
    };
    const cells: OutsideCell[] = outsideCells(zone, outside.reach);
    for (const cell of cells) cover(shading, batchFor(overlay, outside.surface), cell.column, cell.row, floorY + GROUND.outsideLift, GROUND.outsideShade, alphaAt);
  }
  if (zone.terrain !== null) buildCliffs(zone, batchFor(solid, zone.terrain.cliff));
  return { solid, fringe, overlay, drifting, floor: null };
}

function floorLayout(content: Content, zone: ZoneDef, floor: ShapedFloor): FloorLayout | null {
  const layers: FloorLayerLook[] = [];
  for (const id of floor.surfaces) {
    const def: SurfaceDef | undefined = content.surfaces.get(id);
    if (def === undefined) return null;
    layers.push({ tint: def.tint, roughness: floorRoughness(def, zone.weather.wet), normalScale: def.normalScale, scale: 1 / def.metres, glow: def.glow });
  }
  const layerOf = (id: string): number => surfaceLayer(floor, id) ?? 0;
  return { layers, fringes: floor.fringes.map(layerOf), blends: floor.blends.map(layerOf), fringeOrder: floor.fringeOrder, blendOrder: floor.blendOrder, wet: zone.weather.wet };
}

function floorGeometry(floor: ShapedFloor): BufferGeometry {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(floor.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(floor.normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(floor.uvs, 2));
  geometry.setAttribute('floorShade', new Float32BufferAttribute(floor.shades, 1));
  geometry.setAttribute('floorSolid', new Float32BufferAttribute(floor.solid, 1));
  geometry.setAttribute('floorFringeLow', new Float32BufferAttribute(floor.fringeLow, 4));
  geometry.setAttribute('floorFringeHigh', new Float32BufferAttribute(floor.fringeHigh, 4));
  geometry.setAttribute('floorBlendLow', new Float32BufferAttribute(floor.blendLow, 4));
  geometry.setAttribute('floorBlendHigh', new Float32BufferAttribute(floor.blendHigh, 4));
  let widest: number = 0;
  for (const index of floor.indices) widest = Math.max(widest, index);
  geometry.setIndex(widest >= GROUND_INDEX.narrowLimit ? new Uint32BufferAttribute(floor.indices, 1) : new Uint16BufferAttribute(floor.indices, 1));
  return geometry;
}

interface LayeredFloor {
  readonly mesh: Mesh;
  prepare(renderer: WebGLRenderer): Promise<void>;
  dispose(): void;
}

function layeredFloor(content: Content, zone: ZoneDef, floor: ShapedFloor): LayeredFloor | null {
  const layout: FloorLayout | null = floorLayout(content, zone, floor);
  if (layout === null) return null;
  const look: FloorMaterial = createFloorMaterial(layout);
  const mesh: Mesh = new Mesh(floorGeometry(floor), look.material);
  mesh.receiveShadow = true;
  mesh.renderOrder = GROUND_ORDER.solid;
  mesh.visible = false;
  const state: { arrays: FloorArrays | null; gone: boolean } = { arrays: null, gone: false };
  const settled = (): boolean => state.arrays !== null || state.gone;
  return {
    mesh,
    async prepare(renderer: WebGLRenderer): Promise<void> {
      if (settled()) return;
      const defs: SurfaceDef[] = floor.surfaces.flatMap((id: string): SurfaceDef[] => {
        const def: SurfaceDef | undefined = content.surfaces.get(id);
        return def === undefined ? [] : [def];
      });
      const sources: FloorSource[] = await floorSources(defs);
      if (settled()) return;
      try {
        const baked: FloorArrays = bakeFloorArrays(renderer, sources, floorArraySizeNow());
        state.arrays = baked;
        look.useArrays(baked.colour, baked.detail);
        mesh.visible = true;
      } catch (error: unknown) {
        warnInConsole(`The floor of ${zone.id} could not be drawn into its texture arrays: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    dispose(): void {
      state.gone = true;
      mesh.geometry.dispose();
      look.material.dispose();
      state.arrays?.dispose();
    },
  };
}

export function buildGround(content: Content, zone: ZoneDef): Ground {
  const { solid, fringe, overlay, drifting, floor } = groundBatches(content, zone);
  const layered: LayeredFloor | null = floor === null ? null : layeredFloor(content, zone, floor);
  const zoneWet: number = zone.weather.wet;

  const meshes: Mesh[] = [];
  for (const [surfaceId, batch] of solid) {
    const mesh: Mesh | null = toMesh(content, surfaceId, 'ground', batch, zoneWet);
    if (mesh !== null) meshes.push(mesh);
  }
  for (const [surfaceId, batch] of fringe) {
    const mesh: Mesh | null = toMesh(content, surfaceId, 'overlay', batch, zoneWet, GROUND_ORDER.fringe);
    if (mesh !== null) meshes.push(mesh);
  }
  for (const [surfaceId, batch] of overlay) {
    const mesh: Mesh | null = toMesh(content, surfaceId, 'overlay', batch, zoneWet);
    if (mesh !== null) meshes.push(mesh);
  }
  const drifts: DriftGround[] = [...drifting].map(([drift, batches]: [ZoneDrift, ReadonlyMap<string, ShapedBatch>]): DriftGround => driftGround(content, drift, batches, zoneWet));
  if (layered !== null) meshes.push(layered.mesh);
  return {
    meshes: [...meshes, ...drifts.flatMap((entry: DriftGround): readonly Mesh[] => entry.meshes)],
    drifts,
    async prepare(renderer: WebGLRenderer): Promise<void> {
      await layered?.prepare(renderer);
    },
    update(time: number): void {
      for (const entry of drifts) {
        const shown: number = driftShown(entry.drift, time);
        for (const material of entry.materials) material.opacity = shown;
        for (const mesh of entry.meshes) {
          mesh.visible = shown > 0;
          mesh.position.y = -GROUND.driftSink * (1 - shown);
        }
      }
    },
    dispose(): void {
      layered?.dispose();
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const entry of drifts) {
        for (const mesh of entry.meshes) mesh.geometry.dispose();
        for (const material of entry.materials) material.dispose();
      }
    },
  };
}
