import type { TerrainBlend, ZoneTerrain } from '../../sim/content/terrain-types.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { isFloorCell, tileAtCell, zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import type { NoiseLattice, TerrainCell } from '../../sim/nav/terrain.ts';
import { latticeNoise, noiseLattice, rampAt, terrainCell, terrainNoise, tileHeight } from '../../sim/nav/terrain.ts';
import type { Batch } from './ground.ts';
import { fringeShare, spreadsOnto } from './ground-spill.ts';
import type { CornerAlphas, FloorStack } from './floor-stack.ts';
import { floorQuad } from './floor-stack.ts';

export const GROUND_TERRAIN = {
  step: 0.5,
  steep: 0.9,
  bump: 0.05,
  bumpScale: 0.6,
  rock: 1.4,
  rockScale: 0.22,
  rockFine: 0.35,
  rockFineScale: 0.9,
  jitter: 0.32,
  jitterScale: 0.7,
  overhang: 0.05,
  blendSoft: 0.34,
  latticeFrom: 3,
  blendLift: 0.012,
  shadeScale: 0.09,
  shadeDepth: 0.3,
  footReach: 2,
  footShade: 0.5,
  faceTop: 0.78,
  faceFoot: 0.32,
  outsideShade: 0.72,
  fringeReach: 1.9,
  fringeNoise: 0.38,
  fringeNoiseScale: 0.45,
  fringeLeast: 0.01,
  blendLeast: 0.01,
  nearNoise: 0.45,
  nearNoiseScale: 0.35,
} as const;

const TERRAIN_SALT = { fringe: 51, near: 61 } as const;

export interface Field {
  readonly columns: number;
  readonly rows: number;
  readonly heights: Float32Array;
  readonly floor: Uint8Array;
  readonly surfaces: readonly string[];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function smooth(t: number): number {
  const c: number = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function groundHeight(zone: ZoneDef, cell: TerrainCell, floor: boolean, x: number, z: number): number {
  const base: number = tileHeight(zone, cell.column, cell.row, x, z) - zone.floorHeight;
  if (floor) return base - (rampAt(zone, cell.column, cell.row) ? 0 : (GROUND_TERRAIN.bump * (terrainNoise(x * GROUND_TERRAIN.bumpScale, z * GROUND_TERRAIN.bumpScale, 5) + 1)) / 2);
  const broad: number = (terrainNoise(x * GROUND_TERRAIN.rockScale, z * GROUND_TERRAIN.rockScale, 6) + 1) / 2;
  const fine: number = terrainNoise(x * GROUND_TERRAIN.rockFineScale, z * GROUND_TERRAIN.rockFineScale, 7);
  return base + GROUND_TERRAIN.rock * broad + GROUND_TERRAIN.rockFine * fine;
}

export function drawnGround(zone: ZoneDef, x: number, z: number): number {
  const cell: TerrainCell = terrainCell(zone, x, z);
  return groundHeight(zone, cell, isFloorCell(zone, cell.column, cell.row), x, z);
}

export function sampleField(zone: ZoneDef): Field {
  const step: number = GROUND_TERRAIN.step;
  const columns: number = Math.round((zoneColumns(zone) * zone.cellSize) / step) + 1;
  const rows: number = Math.round((zoneRows(zone) * zone.cellSize) / step) + 1;
  const heights: Float32Array = new Float32Array(columns * rows);
  const floor: Uint8Array = new Uint8Array(columns * rows);
  const surfaces: string[] = [];
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) {
      const x: number = column * step;
      const z: number = row * step;
      const cell: TerrainCell = terrainCell(zone, x, z);
      const solid: boolean = isFloorCell(zone, cell.column, cell.row);
      const index: number = row * columns + column;
      heights[index] = groundHeight(zone, cell, solid, x, z);
      floor[index] = solid ? 1 : 0;
      surfaces.push(solid ? (zone.floors[tileAtCell(zone, cell.column, cell.row)] ?? '') : '');
    }
  }
  return { columns, rows, heights, floor, surfaces };
}

export function shownTiles(zone: ZoneDef, reach: number): Uint8Array {
  const columns: number = zoneColumns(zone);
  const rows: number = zoneRows(zone);
  const shown: Uint8Array = new Uint8Array(columns * rows);
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) {
      if (!isFloorCell(zone, column, row)) continue;
      for (let dr: number = -reach; dr <= reach; dr += 1) {
        for (let dc: number = -reach; dc <= reach; dc += 1) {
          const c: number = column + dc;
          const r: number = row + dr;
          if (c >= 0 && r >= 0 && c < columns && r < rows) shown[r * columns + c] = 1;
        }
      }
    }
  }
  return shown;
}

type TileHit = (column: number, row: number) => boolean;

function nearTile(zone: ZoneDef, hit: TileHit, x: number, z: number, reach: number): number {
  const size: number = zone.cellSize;
  const span: number = Math.ceil(reach / size);
  const column: number = Math.floor(x / size);
  const row: number = Math.floor(z / size);
  let best: number = Number.POSITIVE_INFINITY;
  for (let dr: number = -span; dr <= span; dr += 1) {
    for (let dc: number = -span; dc <= span; dc += 1) {
      const c: number = column + dc;
      const r: number = row + dr;
      if (!hit(c, r)) continue;
      best = Math.min(best, Math.hypot(Math.max(c * size - x, 0, x - (c + 1) * size), Math.max(r * size - z, 0, z - (r + 1) * size)));
    }
  }
  return best;
}

function markHit(zone: ZoneDef, mark: string): TileHit {
  return (column: number, row: number): boolean => (mark === '/' ? rampAt(zone, column, row) : tileAtCell(zone, column, row) === mark);
}

function signedNear(zone: ZoneDef, mark: string, x: number, z: number, reach: number): number {
  const hit: TileHit = markHit(zone, mark);
  const outside: number = nearTile(zone, hit, x, z, reach);
  if (outside > 0) return outside;
  const inside: number = nearTile(zone, (column: number, row: number): boolean => !hit(column, row), x, z, reach);
  return Number.isFinite(inside) ? -inside : -reach;
}

export function blendLattice(zone: ZoneDef, blend: TerrainBlend, salt: number): NoiseLattice | null {
  if (blend.scale < GROUND_TERRAIN.latticeFrom) return null;
  return noiseLattice(zoneColumns(zone) * zone.cellSize, zoneRows(zone) * zone.cellSize, blend.scale, 11 + salt);
}

export function blendShare(zone: ZoneDef, blend: TerrainBlend, salt: number, x: number, z: number, lattice: NoiseLattice | null = null): number {
  const field: number = ((lattice === null ? terrainNoise(x / blend.scale, z / blend.scale, 11 + salt) : latticeNoise(lattice, x, z)) + 1) / 2;
  const mask: number = smooth((field - (1 - blend.cover)) / GROUND_TERRAIN.blendSoft + 0.5);
  if (blend.near === null) return mask;
  const ragged: number = terrainNoise(x * GROUND_TERRAIN.nearNoiseScale, z * GROUND_TERRAIN.nearNoiseScale, TERRAIN_SALT.near + salt) * GROUND_TERRAIN.nearNoise;
  return mask * smooth(1 - signedNear(zone, blend.near, x, z, blend.reach) / blend.reach + ragged);
}

interface Vertex {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly shade: number;
}

function heightOf(field: Field, column: number, row: number): number {
  const c: number = clamp(column, 0, field.columns - 1);
  const r: number = clamp(row, 0, field.rows - 1);
  return field.heights[r * field.columns + c] ?? 0;
}

function fieldHeight(field: Field, x: number, z: number): number {
  const u: number = x / GROUND_TERRAIN.step;
  const v: number = z / GROUND_TERRAIN.step;
  const column: number = Math.floor(u);
  const row: number = Math.floor(v);
  const fu: number = u - column;
  const fv: number = v - row;
  const near: number = heightOf(field, column, row) * (1 - fu) + heightOf(field, column + 1, row) * fu;
  const far: number = heightOf(field, column, row + 1) * (1 - fu) + heightOf(field, column + 1, row + 1) * fu;
  return near * (1 - fv) + far * fv;
}

function vertexAt(field: Field, column: number, row: number): Vertex {
  const step: number = GROUND_TERRAIN.step;
  const here: number = heightOf(field, column, row);
  const gx: number = (heightOf(field, column + 1, row) - heightOf(field, column - 1, row)) / (2 * step);
  const gz: number = (heightOf(field, column, row + 1) - heightOf(field, column, row - 1)) / (2 * step);
  const length: number = Math.hypot(gx, 1, gz);
  const steepness: number = smooth((Math.hypot(gx, gz) * step) / GROUND_TERRAIN.steep);
  const x0: number = column * step;
  const z0: number = row * step;
  const slope: number = Math.max(Math.hypot(gx, gz), Number.EPSILON);
  const push: number = GROUND_TERRAIN.jitter * steepness;
  const along: number = push * terrainNoise(x0 * GROUND_TERRAIN.jitterScale, z0 * GROUND_TERRAIN.jitterScale + here, 21);
  const uphill: number = (push * (terrainNoise(x0 * GROUND_TERRAIN.jitterScale + here, z0 * GROUND_TERRAIN.jitterScale, 22) + 1)) / 2;
  const pushedX: number = x0 + (gx * uphill - gz * along) / slope;
  const pushedZ: number = z0 + (gz * uphill + gx * along) / slope;
  const slid: boolean = field.floor[row * field.columns + column] !== 1 && fieldHeight(field, pushedX, pushedZ) >= here - GROUND_TERRAIN.overhang;
  const x: number = slid ? pushedX : x0;
  const z: number = slid ? pushedZ : z0;
  let above: number = 0;
  for (let dr: number = -GROUND_TERRAIN.footReach; dr <= GROUND_TERRAIN.footReach; dr += 1) {
    for (let dc: number = -GROUND_TERRAIN.footReach; dc <= GROUND_TERRAIN.footReach; dc += 1) above = Math.max(above, heightOf(field, column + dc, row + dr) - here);
  }
  const foot: number = 1 - (1 - GROUND_TERRAIN.footShade) * smooth(above / GROUND_TERRAIN.steep - 0.5);
  const macro: number = 1 - GROUND_TERRAIN.shadeDepth * (terrainNoise(x0 * GROUND_TERRAIN.shadeScale, z0 * GROUND_TERRAIN.shadeScale, 31) + 1) / 2;
  return { x, y: here, z, nx: -gx / length, ny: 1 / length, nz: -gz / length, shade: foot * macro };
}

function pushVertex(batch: Batch, vertex: Vertex, u: number, v: number, shade: number, alpha: number, lift: number): void {
  batch.positions.push(vertex.x, vertex.y + lift, vertex.z);
  batch.normals.push(vertex.nx, vertex.ny, vertex.nz);
  batch.uvs.push(u, v);
  batch.colors.push(shade, shade, shade, alpha);
}

function quad(batch: Batch, corners: readonly [Vertex, Vertex, Vertex, Vertex], uvs: readonly number[], shades: readonly number[], alphas: readonly number[], lift: number): void {
  const base: number = batch.positions.length / 3;
  corners.forEach((vertex: Vertex, index: number): void => pushVertex(batch, vertex, uvs[index * 2] ?? 0, uvs[index * 2 + 1] ?? 0, shades[index] ?? 1, alphas[index] ?? 1, lift));
  batch.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

export type GroundLayer = 'solid' | 'fringe' | 'overlay';

export interface TerrainBatches {
  batchFor(surface: string, layer: GroundLayer): Batch;
  floor?(solids: readonly string[], fringes: readonly string[], blends: readonly string[]): FloorStack | null;
}

function cornerAlphas(values: readonly number[]): CornerAlphas {
  return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0];
}

export type SpillOf = (surface: string) => number;

export function surfaceReach(field: Field, surface: string, cap: number): Float32Array {
  const step: number = GROUND_TERRAIN.step;
  const diagonal: number = step * Math.SQRT2;
  const { columns, rows } = field;
  const reach: Float32Array = new Float32Array(columns * rows).fill(cap);
  for (let at: number = 0; at < reach.length; at += 1) if (field.surfaces[at] === surface) reach[at] = 0;
  const relax = (at: number, from: number, cost: number): void => {
    const through: number = (reach[from] ?? cap) + cost;
    if (through < (reach[at] ?? cap)) reach[at] = through;
  };
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) {
      const at: number = row * columns + column;
      if (column > 0) relax(at, at - 1, step);
      if (row > 0) {
        relax(at, at - columns, step);
        if (column > 0) relax(at, at - columns - 1, diagonal);
        if (column < columns - 1) relax(at, at - columns + 1, diagonal);
      }
    }
  }
  for (let row: number = rows - 1; row >= 0; row -= 1) {
    for (let column: number = columns - 1; column >= 0; column -= 1) {
      const at: number = row * columns + column;
      if (column < columns - 1) relax(at, at + 1, step);
      if (row < rows - 1) {
        relax(at, at + columns, step);
        if (column < columns - 1) relax(at, at + columns + 1, diagonal);
        if (column > 0) relax(at, at + columns - 1, diagonal);
      }
    }
  }
  return reach;
}

export interface SurfaceFringe {
  readonly surface: string;
  readonly reach: Float32Array;
}

export function surfaceFringes(field: Field, spill: SpillOf): SurfaceFringe[] {
  const present: string[] = [...new Set(field.surfaces)].filter((id: string): boolean => id !== '');
  const spreading: string[] = present.filter((id: string): boolean => present.some((own: string): boolean => spreadsOnto({ id, spill: spill(id) }, { id: own, spill: spill(own) })));
  return spreading.map((surface: string): SurfaceFringe => ({ surface, reach: surfaceReach(field, surface, GROUND_TERRAIN.fringeReach) }));
}

export function fringeAt(distance: number, x: number, z: number): number {
  const ragged: number = terrainNoise(x * GROUND_TERRAIN.fringeNoiseScale, z * GROUND_TERRAIN.fringeNoiseScale, TERRAIN_SALT.fringe) * GROUND_TERRAIN.fringeNoise;
  return fringeShare(distance, GROUND_TERRAIN.fringeReach, ragged);
}

const NO_SPILL: SpillOf = (): number => 0;

export function buildTerrainGround(zone: ZoneDef, batches: TerrainBatches, spill: SpillOf = NO_SPILL): void {
  const terrain: ZoneTerrain | null = zone.terrain;
  if (terrain === null) return;
  const field: Field = sampleField(zone);
  const reachTiles: number = Math.ceil(zone.outside?.reach ?? 2);
  const shown: Uint8Array = shownTiles(zone, reachTiles);
  const tileColumns: number = zoneColumns(zone);
  const step: number = GROUND_TERRAIN.step;
  const perTile: number = zone.cellSize / step;
  const bed: string = zone.outside?.surface ?? terrain.cliff;
  const fringes: SurfaceFringe[] = surfaceFringes(field, spill);
  const lattices: (NoiseLattice | null)[] = terrain.blends.map((blend: TerrainBlend, salt: number): NoiseLattice | null => blendLattice(zone, blend, salt));
  const solids: string[] = [...new Set([...field.surfaces.filter((id: string): boolean => id !== ''), bed])];
  const stack: FloorStack | null = batches.floor?.(solids, fringes.map((fringe: SurfaceFringe): string => fringe.surface), terrain.blends.map((blend: TerrainBlend): string => blend.surface)) ?? null;
  const vertices: Map<number, Vertex> = new Map<number, Vertex>();
  const vertex = (column: number, row: number): Vertex => {
    const key: number = row * field.columns + column;
    const known: Vertex | undefined = vertices.get(key);
    if (known !== undefined) return known;
    const made: Vertex = vertexAt(field, column, row);
    vertices.set(key, made);
    return made;
  };
  for (let row: number = 0; row < field.rows - 1; row += 1) {
    for (let column: number = 0; column < field.columns - 1; column += 1) {
      if (shown[Math.floor(row / perTile) * tileColumns + Math.floor(column / perTile)] !== 1) continue;
      const corners: [Vertex, Vertex, Vertex, Vertex] = [vertex(column, row), vertex(column + 1, row), vertex(column, row + 1), vertex(column + 1, row + 1)];
      const ys: number[] = corners.map((entry: Vertex): number => entry.y);
      const low: number = Math.min(...ys);
      const high: number = Math.max(...ys);
      const index: number = row * field.columns + column;
      const floors: number = [index, index + 1, index + field.columns, index + field.columns + 1].filter((at: number): boolean => field.floor[at] === 1).length;
      if (high - low > GROUND_TERRAIN.steep) {
        const gx: number = corners[1].y + corners[3].y - corners[0].y - corners[2].y;
        const gz: number = corners[2].y + corners[3].y - corners[0].y - corners[1].y;
        const span: number = Math.max(Math.hypot(gx, gz), Number.EPSILON);
        const uvs: number[] = corners.flatMap((entry: Vertex): number[] => [(-gz * entry.x + gx * entry.z) / span, entry.y]);
        const shades: number[] = corners.map((entry: Vertex): number => (GROUND_TERRAIN.faceFoot + (GROUND_TERRAIN.faceTop - GROUND_TERRAIN.faceFoot) * smooth((entry.y - low) / (high - low))) * entry.shade);
        quad(batches.batchFor(terrain.cliff, 'solid'), corners, uvs, shades, [1, 1, 1, 1], 0);
        continue;
      }
      const uvs: number[] = corners.flatMap((entry: Vertex): number[] => [entry.x, entry.z]);
      const shades: number[] = corners.map((entry: Vertex): number => entry.shade);
      if (floors === 0) {
        quad(batches.batchFor(bed, 'solid'), corners, uvs, shades.map((shade: number): number => shade * GROUND_TERRAIN.outsideShade), [1, 1, 1, 1], 0);
        continue;
      }
      const surface: string = [index, index + 1, index + field.columns, index + field.columns + 1].map((at: number): string => field.surfaces[at] ?? '').find((id: string): boolean => id !== '') ?? bed;
      const at: readonly number[] = [index, index + 1, index + field.columns, index + field.columns + 1];
      if (stack !== null) {
        const fringeAlphas: (CornerAlphas | null)[] = fringes.map((fringe: SurfaceFringe): CornerAlphas | null => {
          if (!spreadsOnto({ id: fringe.surface, spill: spill(fringe.surface) }, { id: surface, spill: spill(surface) })) return null;
          const distances: number[] = at.map((sample: number): number => fringe.reach[sample] ?? GROUND_TERRAIN.fringeReach);
          if (Math.min(...distances) >= GROUND_TERRAIN.fringeReach) return null;
          const alphas: number[] = corners.map((entry: Vertex, corner: number): number => fringeAt(distances[corner] ?? GROUND_TERRAIN.fringeReach, entry.x, entry.z));
          return alphas.every((alpha: number): boolean => alpha <= GROUND_TERRAIN.fringeLeast) ? null : cornerAlphas(alphas);
        });
        const blendAlphas: (CornerAlphas | null)[] = terrain.blends.map((blend: TerrainBlend, salt: number): CornerAlphas | null => {
          const alphas: number[] = corners.map((entry: Vertex): number => blendShare(zone, blend, salt, entry.x, entry.z, lattices[salt] ?? null));
          return alphas.every((alpha: number): boolean => alpha <= GROUND_TERRAIN.blendLeast) ? null : cornerAlphas(alphas);
        });
        if (floorQuad(stack, corners, uvs, shades, surface, fringeAlphas, blendAlphas)) continue;
      }
      quad(batches.batchFor(surface, 'solid'), corners, uvs, shades, [1, 1, 1, 1], 0);
      for (const fringe of fringes) {
        if (!spreadsOnto({ id: fringe.surface, spill: spill(fringe.surface) }, { id: surface, spill: spill(surface) })) continue;
        const distances: number[] = at.map((sample: number): number => fringe.reach[sample] ?? GROUND_TERRAIN.fringeReach);
        if (Math.min(...distances) >= GROUND_TERRAIN.fringeReach) continue;
        const alphas: number[] = corners.map((entry: Vertex, corner: number): number => fringeAt(distances[corner] ?? GROUND_TERRAIN.fringeReach, entry.x, entry.z));
        if (alphas.every((alpha: number): boolean => alpha <= GROUND_TERRAIN.fringeLeast)) continue;
        quad(batches.batchFor(fringe.surface, 'fringe'), corners, uvs, shades, alphas, GROUND_TERRAIN.blendLift);
      }
      terrain.blends.forEach((blend: TerrainBlend, salt: number): void => {
        const alphas: number[] = corners.map((entry: Vertex): number => blendShare(zone, blend, salt, entry.x, entry.z, lattices[salt] ?? null));
        if (alphas.every((alpha: number): boolean => alpha <= GROUND_TERRAIN.blendLeast)) return;
        quad(batches.batchFor(blend.surface, 'overlay'), corners, uvs, shades, alphas, GROUND_TERRAIN.blendLift * (salt + 2));
      });
    }
  }
}
