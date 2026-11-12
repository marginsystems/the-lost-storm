import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import type { ZoneDrift } from '../../sim/content/road-types.ts';
import { driftShown } from '../../sim/nav/drift.ts';
import type { Content, SurfaceDef, ZoneDef } from '../../sim/content/types.ts';
import { distanceToCell, floorCells, isFloorCell, outsideCells, tileAtCell } from '../../sim/nav/layout.ts';
import type { FloorCell, OutsideCell } from '../../sim/nav/layout.ts';
import { surfaceMaterial } from './surfaces.ts';
import type { SurfaceUse } from './surfaces.ts';

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
} as const;

interface Batch {
  readonly positions: number[];
  readonly uvs: number[];
  readonly colors: number[];
  readonly indices: number[];
}

interface Corner {
  readonly x: number;
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
  update(time: number): void;
  dispose(): void;
}

function driftAt(zone: ZoneDef, column: number, row: number): ZoneDrift | null {
  return zone.drifts.find((drift: ZoneDrift): boolean => column >= drift.column && column < drift.column + drift.columns && row >= drift.row && row < drift.row + drift.rows) ?? null;
}

function driftGround(content: Content, drift: ZoneDrift, batches: ReadonlyMap<string, Batch>): DriftGround {
  const meshes: Mesh[] = [];
  const materials: MeshStandardMaterial[] = [];
  for (const [surfaceId, batch] of batches) {
    const mesh: Mesh | null = toMesh(content, surfaceId, 'ground', batch);
    if (mesh === null || !(mesh.material instanceof MeshStandardMaterial)) continue;
    const own: MeshStandardMaterial = mesh.material.clone();
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

function shadeAt(zone: ZoneDef, x: number, z: number): number {
  const macro: number = 1 - GROUND.macroDepth * noise(x * GROUND.macroScale, z * GROUND.macroScale);
  const detail: number = 1 - GROUND.detailDepth * noise(x * GROUND.detailScale + 31.7, z * GROUND.detailScale + 11.3);
  if (zone.walls === null) return macro * detail;
  const toWall: number = nearest(zone, x, z, 1, (column: number, row: number): boolean => !isFloorCell(zone, column, row));
  const toFloor: number = nearest(zone, x, z, 1, (column: number, row: number): boolean => isFloorCell(zone, column, row));
  const edge: number = Math.max(toWall, toFloor);
  const wall: number = GROUND.wallShade + (1 - GROUND.wallShade) * smooth(edge / GROUND.wallReach);
  return macro * detail * wall;
}

function emit(batch: Batch, corners: readonly [Corner, Corner, Corner, Corner], y: number): void {
  const base: number = batch.positions.length / 3;
  for (const corner of corners) {
    batch.positions.push(corner.x, y, corner.z);
    batch.uvs.push(corner.x, corner.z);
    batch.colors.push(corner.shade, corner.shade, corner.shade, corner.alpha);
  }
  batch.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function cover(zone: ZoneDef, batch: Batch, column: number, row: number, y: number, tone: number, alphaAt: ((x: number, z: number) => number) | null, grow: number = 0): void {
  const step: number = zone.cellSize / GROUND.divisions;
  const corner = (x: number, z: number): Corner => ({ x, z, shade: shadeAt(zone, x, z) * tone, alpha: alphaAt === null ? 1 : alphaAt(x, z) });
  for (let j: number = 0; j < GROUND.divisions; j += 1) {
    for (let i: number = 0; i < GROUND.divisions; i += 1) {
      const x: number = column * zone.cellSize + i * step - (i === 0 ? grow : 0);
      const z: number = row * zone.cellSize + j * step - (j === 0 ? grow : 0);
      const right: number = column * zone.cellSize + (i + 1) * step + (i === GROUND.divisions - 1 ? grow : 0);
      const bottom: number = row * zone.cellSize + (j + 1) * step + (j === GROUND.divisions - 1 ? grow : 0);
      const corners: [Corner, Corner, Corner, Corner] = [corner(x, z), corner(right, z), corner(x, bottom), corner(right, bottom)];
      if (corners.every((entry: Corner): boolean => entry.alpha <= 0)) continue;
      emit(batch, corners, y);
    }
  }
}

function batchFor(batches: Map<string, Batch>, key: string): Batch {
  const found: Batch | undefined = batches.get(key);
  if (found !== undefined) return found;
  const made: Batch = { positions: [], uvs: [], colors: [], indices: [] };
  batches.set(key, made);
  return made;
}

function spillOf(content: Content, zone: ZoneDef, column: number, row: number): SurfaceDef | null {
  const surfaceId: string | undefined = zone.floors[tileAtCell(zone, column, row)];
  return surfaceId === undefined ? null : (content.surfaces.get(surfaceId) ?? null);
}

function fringes(content: Content, zone: ZoneDef, cell: FloorCell, own: SurfaceDef): SurfaceDef[] {
  const found: Map<string, SurfaceDef> = new Map<string, SurfaceDef>();
  for (let dr: number = -1; dr <= 1; dr += 1) {
    for (let dc: number = -1; dc <= 1; dc += 1) {
      const other: SurfaceDef | null = spillOf(content, zone, cell.column + dc, cell.row + dr);
      if (other !== null && other.id !== own.id && other.spill > own.spill) found.set(other.id, other);
    }
  }
  return [...found.values()];
}

function toMesh(content: Content, surfaceId: string, use: SurfaceUse, batch: Batch): Mesh | null {
  const def: SurfaceDef | undefined = content.surfaces.get(surfaceId);
  if (def === undefined || batch.indices.length === 0) return null;
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(batch.positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(batch.uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(batch.colors, 4));
  geometry.setAttribute('normal', new Float32BufferAttribute(batch.positions.map((_: number, index: number): number => (index % 3 === 1 ? 1 : 0)), 3));
  geometry.setIndex(batch.indices);
  const mesh: Mesh = new Mesh(geometry, surfaceMaterial(def, use));
  mesh.receiveShadow = true;
  mesh.renderOrder = use === 'overlay' ? 1 : 0;
  return mesh;
}

export function buildGround(content: Content, zone: ZoneDef): Ground {
  const solid: Map<string, Batch> = new Map<string, Batch>();
  const overlay: Map<string, Batch> = new Map<string, Batch>();
  const floorY: number = zone.floorHeight;

  const drifting: Map<ZoneDrift, Map<string, Batch>> = new Map<ZoneDrift, Map<string, Batch>>();
  for (const cell of floorCells(zone)) {
    const own: SurfaceDef | null = spillOf(content, zone, cell.column, cell.row);
    if (own === null) continue;
    const drift: ZoneDrift | null = driftAt(zone, cell.column, cell.row);
    if (drift !== null) {
      const batches: Map<string, Batch> = drifting.get(drift) ?? new Map<string, Batch>();
      drifting.set(drift, batches);
      const grow: number = zone.walls === null ? GROUND.openEdgeOverlap : 0;
      cover(zone, batchFor(batches, own.id), cell.column, cell.row, floorY, 1, null, grow);
      const bed: string = zone.outside?.surface ?? own.id;
      cover(zone, batchFor(solid, bed), cell.column, cell.row, floorY - GROUND.driftBedDepth, GROUND.driftBedShade, null, grow);
      continue;
    }
    cover(zone, batchFor(solid, own.id), cell.column, cell.row, floorY, 1, null, zone.walls === null ? GROUND.openEdgeOverlap : 0);
    for (const other of fringes(content, zone, cell, own)) {
      const alphaAt = (x: number, z: number): number => {
        const distance: number = nearest(zone, x, z, 1, (column: number, row: number): boolean => spillOf(content, zone, column, row)?.id === other.id);
        const ragged: number = (noise(x * GROUND.fringeNoiseScale + 7.3, z * GROUND.fringeNoiseScale + 3.1) - 0.5) * GROUND.fringeNoise;
        return smooth(1 - distance / GROUND.fringeReach + ragged);
      };
      cover(zone, batchFor(overlay, other.id), cell.column, cell.row, floorY + GROUND.overlayLift, 1, alphaAt);
    }
  }

  const outside = zone.outside;
  if (outside !== null) {
    const reach: number = outside.reach * zone.cellSize;
    const span: number = Math.ceil(outside.reach);
    const alphaAt = (x: number, z: number): number => {
      const distance: number = nearest(zone, x, z, span, (column: number, row: number): boolean => isFloorCell(zone, column, row));
      return smooth(1 - distance / reach);
    };
    const cells: OutsideCell[] = outsideCells(zone, outside.reach);
    for (const cell of cells) cover(zone, batchFor(overlay, outside.surface), cell.column, cell.row, floorY + GROUND.outsideLift, GROUND.outsideShade, alphaAt);
  }

  const meshes: Mesh[] = [];
  for (const [surfaceId, batch] of solid) {
    const mesh: Mesh | null = toMesh(content, surfaceId, 'ground', batch);
    if (mesh !== null) meshes.push(mesh);
  }
  for (const [surfaceId, batch] of overlay) {
    const mesh: Mesh | null = toMesh(content, surfaceId, 'overlay', batch);
    if (mesh !== null) meshes.push(mesh);
  }
  const drifts: DriftGround[] = [...drifting].map(([drift, batches]: [ZoneDrift, Map<string, Batch>]): DriftGround => driftGround(content, drift, batches));
  return {
    meshes: [...meshes, ...drifts.flatMap((entry: DriftGround): readonly Mesh[] => entry.meshes)],
    drifts,
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
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const entry of drifts) {
        for (const mesh of entry.meshes) mesh.geometry.dispose();
        for (const material of entry.materials) material.dispose();
      }
    },
  };
}
