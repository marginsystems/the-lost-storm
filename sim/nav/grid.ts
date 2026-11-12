import type { ZoneDef, PropDef, SurfaceDef } from '../content/types.ts';
import type { ZoneDrift } from '../content/road-types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { outlineGap } from './outline.ts';
import { CORNER_PILLAR_RADIUS, isFloorCell, tileAtCell, wallCorners } from './layout.ts';

export interface NavGrid {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly walkable: Uint8Array;
  readonly solid: Uint8Array;
  readonly pace: Float32Array;
  readonly drifts: readonly DriftCells[];
}

export interface DriftCells {
  readonly drift: ZoneDrift;
  readonly cells: Int32Array;
  readonly walkable: Uint8Array;
  open: boolean;
}

export type Blocker = { readonly kind: 'capsule'; readonly from: Vec2; readonly to: Vec2; readonly radius: number } | { readonly kind: 'outline'; readonly outline: readonly ReadonlyVec2[] };

export interface GridStamp {
  readonly cells: Int32Array;
  readonly walkable: Uint8Array;
  readonly solid: Uint8Array;
}

export function propBlocker(def: PropDef, x: number, z: number, rotationDegrees: number): Blocker | null {
  if (def.blockRadius <= 0) return null;
  const angle: number = (rotationDegrees * Math.PI) / 180;
  const half: number = def.blockLength / 2;
  const ax: number = Math.cos(angle) * half;
  const az: number = -Math.sin(angle) * half;
  return { kind: 'capsule', from: { x: x - ax, z: z - az }, to: { x: x + ax, z: z + az }, radius: def.blockRadius };
}

export function propOutline(def: PropDef, x: number, z: number, rotationDegrees: number): Blocker | null {
  if (def.footprint.length < 3) return null;
  const angle: number = (rotationDegrees * Math.PI) / 180;
  const cos: number = Math.cos(angle);
  const sin: number = Math.sin(angle);
  return { kind: 'outline', outline: def.footprint.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: x + point.x * cos + point.z * sin, z: z - point.x * sin + point.z * cos })) };
}

export function propBlockers(def: PropDef, x: number, z: number, rotationDegrees: number): Blocker[] {
  return [propBlocker(def, x, z, rotationDegrees), propOutline(def, x, z, rotationDegrees)].filter((blocker: Blocker | null): blocker is Blocker => blocker !== null);
}

export function blockerGap(blocker: Blocker, x: number, z: number): number {
  if (blocker.kind === 'outline') return outlineGap(blocker.outline, x, z);
  const dx: number = blocker.to.x - blocker.from.x;
  const dz: number = blocker.to.z - blocker.from.z;
  const span: number = dx * dx + dz * dz;
  const t: number = span <= 0 ? 0 : Math.min(1, Math.max(0, ((x - blocker.from.x) * dx + (z - blocker.from.z) * dz) / span));
  return Math.hypot(x - (blocker.from.x + dx * t), z - (blocker.from.z + dz * t)) - blocker.radius;
}

const NAV = {
  cellSize: 0.5,
  lineStep: 0.25,
  searchStep: 0.5,
} as const;

export function blockerClearance(blocker: Blocker, agentRadius: number): number {
  return blocker.kind === 'outline' && agentRadius > 0 ? agentRadius + NAV.cellSize * Math.SQRT1_2 : agentRadius;
}

function blockers(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): Blocker[] {
  const list: Blocker[] = [];
  for (const placed of zone.props) {
    if (placed.when.length > 0) continue;
    const def: PropDef | undefined = props.get(placed.prop);
    if (def !== undefined) list.push(...propBlockers(def, placed.x, placed.z, placed.rotationDegrees));
  }
  if (zone.walls !== null) for (const corner of wallCorners(zone)) list.push({ kind: 'capsule', from: { x: corner.x, z: corner.z }, to: { x: corner.x, z: corner.z }, radius: CORNER_PILLAR_RADIUS });
  return list;
}

function insideFloor(zone: ZoneDef, x: number, z: number, margin: number): boolean {
  const size: number = zone.cellSize;
  const column: number = Math.floor(x / size);
  const row: number = Math.floor(z / size);
  if (!isFloorCell(zone, column, row)) return false;
  const localX: number = x - column * size;
  const localZ: number = z - row * size;
  const nearWest: boolean = localX < margin;
  const nearEast: boolean = size - localX < margin;
  const nearNorth: boolean = localZ < margin;
  const nearSouth: boolean = size - localZ < margin;
  if (nearWest && !isFloorCell(zone, column - 1, row)) return false;
  if (nearEast && !isFloorCell(zone, column + 1, row)) return false;
  if (nearNorth && !isFloorCell(zone, column, row - 1)) return false;
  if (nearSouth && !isFloorCell(zone, column, row + 1)) return false;
  if (nearWest && nearNorth && !isFloorCell(zone, column - 1, row - 1)) return false;
  if (nearEast && nearNorth && !isFloorCell(zone, column + 1, row - 1)) return false;
  if (nearWest && nearSouth && !isFloorCell(zone, column - 1, row + 1)) return false;
  if (nearEast && nearSouth && !isFloorCell(zone, column + 1, row + 1)) return false;
  return true;
}

interface Bounds {
  readonly fromColumn: number;
  readonly toColumn: number;
  readonly fromRow: number;
  readonly toRow: number;
}

function blockerBounds(blocker: Blocker, pad: number, columns: number, rows: number): Bounds {
  const points: readonly ReadonlyVec2[] = blocker.kind === 'outline' ? blocker.outline : [blocker.from, blocker.to];
  const reach: number = pad + (blocker.kind === 'outline' ? 0 : blocker.radius);
  const xs: number[] = points.map((point: ReadonlyVec2): number => point.x);
  const zs: number[] = points.map((point: ReadonlyVec2): number => point.z);
  const clampColumn = (value: number): number => Math.min(columns - 1, Math.max(0, Math.floor(value / NAV.cellSize)));
  const clampRow = (value: number): number => Math.min(rows - 1, Math.max(0, Math.floor(value / NAV.cellSize)));
  return { fromColumn: clampColumn(Math.min(...xs) - reach), toColumn: clampColumn(Math.max(...xs) + reach), fromRow: clampRow(Math.min(...zs) - reach), toRow: clampRow(Math.max(...zs) + reach) };
}

function fill(zone: ZoneDef, obstacles: readonly Blocker[], columns: number, rows: number, agentRadius: number): Uint8Array {
  const cells: Uint8Array = new Uint8Array(columns * rows);
  const margin: number = (zone.walls?.halfThickness ?? 0) + agentRadius;
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) cells[row * columns + column] = insideFloor(zone, (column + 0.5) * NAV.cellSize, (row + 0.5) * NAV.cellSize, margin) ? 1 : 0;
  }
  for (const blocker of obstacles) {
    const clearance: number = blockerClearance(blocker, agentRadius);
    const bounds: Bounds = blockerBounds(blocker, clearance, columns, rows);
    for (let row: number = bounds.fromRow; row <= bounds.toRow; row += 1) {
      for (let column: number = bounds.fromColumn; column <= bounds.toColumn; column += 1) {
        if (cells[row * columns + column] === 1 && blockerGap(blocker, (column + 0.5) * NAV.cellSize, (row + 0.5) * NAV.cellSize) < clearance) cells[row * columns + column] = 0;
      }
    }
  }
  return cells;
}

function paceOf(zone: ZoneDef, surfaces: ReadonlyMap<string, SurfaceDef>, columns: number, rows: number): Float32Array {
  const pace: Float32Array = new Float32Array(columns * rows).fill(1);
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) {
      const surfaceId: string | undefined = zone.floors[tileAtCell(zone, Math.floor(((column + 0.5) * NAV.cellSize) / zone.cellSize), Math.floor(((row + 0.5) * NAV.cellSize) / zone.cellSize))];
      pace[row * columns + column] = surfaceId === undefined ? 1 : (surfaces.get(surfaceId)?.pace ?? 1);
    }
  }
  return pace;
}

function driftCells(zone: ZoneDef, drift: ZoneDrift, walkable: Uint8Array, columns: number, rows: number): DriftCells {
  const cells: number[] = [];
  const fromX: number = drift.column * zone.cellSize;
  const fromZ: number = drift.row * zone.cellSize;
  const toX: number = (drift.column + drift.columns) * zone.cellSize;
  const toZ: number = (drift.row + drift.rows) * zone.cellSize;
  for (let row: number = 0; row < rows; row += 1) {
    const z: number = (row + 0.5) * NAV.cellSize;
    if (z < fromZ || z >= toZ) continue;
    for (let column: number = 0; column < columns; column += 1) {
      const x: number = (column + 0.5) * NAV.cellSize;
      if (x >= fromX && x < toX) cells.push(row * columns + column);
    }
  }
  const indices: Int32Array = Int32Array.from(cells);
  return { drift, cells: indices, walkable: Uint8Array.from(indices, (index: number): number => walkable[index] ?? 0), open: true };
}

export function buildNavGrid(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, surfaces: ReadonlyMap<string, SurfaceDef>, agentRadius: number): NavGrid {
  const columns: number = Math.ceil(((zone.tiles[0]?.length ?? 0) * zone.cellSize) / NAV.cellSize);
  const rows: number = Math.ceil((zone.tiles.length * zone.cellSize) / NAV.cellSize);
  const obstacles: Blocker[] = blockers(zone, props);
  const open: Uint8Array = fill(zone, obstacles, columns, rows, 0);
  const solid: Uint8Array = open.map((value: number): number => 1 - value);
  const walkable: Uint8Array = fill(zone, obstacles, columns, rows, agentRadius);
  const drifts: DriftCells[] = zone.drifts.map((drift: ZoneDrift): DriftCells => driftCells(zone, drift, walkable, columns, rows));
  return { cellSize: NAV.cellSize, columns, rows, walkable, solid, pace: paceOf(zone, surfaces, columns, rows), drifts };
}

export function stampBlockers(grid: NavGrid, stamped: readonly Blocker[], agentRadius: number): GridStamp {
  const gaps: Map<number, number> = new Map<number, number>();
  for (const blocker of stamped) {
    const extra: number = blockerClearance(blocker, agentRadius) - agentRadius;
    const bounds: Bounds = blockerBounds(blocker, agentRadius + extra, grid.columns, grid.rows);
    for (let row: number = bounds.fromRow; row <= bounds.toRow; row += 1) {
      for (let column: number = bounds.fromColumn; column <= bounds.toColumn; column += 1) {
        const index: number = row * grid.columns + column;
        const centre: Vec2 = cellCenter(grid, index);
        gaps.set(index, Math.min(gaps.get(index) ?? Infinity, blockerGap(blocker, centre.x, centre.z) - extra));
      }
    }
  }
  const touched: [number, number][] = [...gaps].filter(([, gap]: [number, number]): boolean => gap < agentRadius).toSorted((a: [number, number], b: [number, number]): number => a[0] - b[0]);
  const indices: Int32Array = Int32Array.from(touched, ([index]: [number, number]): number => index);
  const stamp: GridStamp = { cells: indices, walkable: Uint8Array.from(indices, (index: number): number => grid.walkable[index] ?? 0), solid: Uint8Array.from(indices, (index: number): number => grid.solid[index] ?? 0) };
  touched.forEach(([index, gap]: [number, number]): void => {
    grid.walkable[index] = 0;
    if (gap < 0) grid.solid[index] = 1;
  });
  return stamp;
}

export function liftStamp(grid: NavGrid, stamp: GridStamp): void {
  stamp.cells.forEach((index: number, at: number): void => {
    grid.walkable[index] = stamp.walkable[at] ?? 0;
    grid.solid[index] = stamp.solid[at] ?? 0;
  });
}

export function paceAt(grid: NavGrid, x: number, z: number): number {
  const index: number = cellIndex(grid, x, z);
  return index < 0 ? 1 : (grid.pace[index] ?? 1);
}

export function setDriftOpen(grid: NavGrid, patch: DriftCells, open: boolean): void {
  patch.open = open;
  patch.cells.forEach((index: number, at: number): void => {
    grid.walkable[index] = open ? (patch.walkable[at] ?? 0) : 0;
  });
}

export function cellIndex(grid: NavGrid, x: number, z: number): number {
  const column: number = Math.floor(x / grid.cellSize);
  const row: number = Math.floor(z / grid.cellSize);
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return -1;
  return row * grid.columns + column;
}

export function cellCenter(grid: NavGrid, index: number): Vec2 {
  return { x: ((index % grid.columns) + 0.5) * grid.cellSize, z: (Math.floor(index / grid.columns) + 0.5) * grid.cellSize };
}

export function isWalkable(grid: NavGrid, x: number, z: number): boolean {
  const index: number = cellIndex(grid, x, z);
  return index >= 0 && grid.walkable[index] === 1;
}

export function isSolid(grid: NavGrid, x: number, z: number): boolean {
  const index: number = cellIndex(grid, x, z);
  return index < 0 || grid.solid[index] === 1;
}

function lineOpen(from: ReadonlyVec2, to: ReadonlyVec2, open: (x: number, z: number) => boolean): boolean {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const steps: number = Math.max(1, Math.ceil(Math.hypot(dx, dz) / NAV.lineStep));
  for (let step: number = 0; step <= steps; step += 1) {
    const t: number = step / steps;
    if (!open(from.x + dx * t, from.z + dz * t)) return false;
  }
  return true;
}

export function lineWalkable(grid: NavGrid, from: ReadonlyVec2, to: ReadonlyVec2): boolean {
  return lineOpen(from, to, (x: number, z: number): boolean => isWalkable(grid, x, z));
}

export function linePace(grid: NavGrid, from: ReadonlyVec2, to: ReadonlyVec2): number {
  let pace: number = Number.POSITIVE_INFINITY;
  lineOpen(from, to, (x: number, z: number): boolean => {
    pace = Math.min(pace, paceAt(grid, x, z));
    return true;
  });
  return pace;
}

export function lineOfSight(grid: NavGrid, from: ReadonlyVec2, to: ReadonlyVec2): boolean {
  return lineOpen(from, to, (x: number, z: number): boolean => !isSolid(grid, x, z));
}

export function nearestWalkable(grid: NavGrid, point: ReadonlyVec2, maxRadius: number): Vec2 | null {
  if (isWalkable(grid, point.x, point.z)) return { x: point.x, z: point.z };
  for (let radius: number = NAV.searchStep; radius <= maxRadius; radius += NAV.searchStep) {
    const samples: number = Math.max(8, Math.ceil((2 * Math.PI * radius) / NAV.searchStep));
    let best: Vec2 | null = null;
    for (let sample: number = 0; sample < samples; sample += 1) {
      const angle: number = (sample / samples) * Math.PI * 2;
      const x: number = point.x + Math.cos(angle) * radius;
      const z: number = point.z + Math.sin(angle) * radius;
      if (isWalkable(grid, x, z)) {
        best = { x, z };
        break;
      }
    }
    if (best !== null) return best;
  }
  return null;
}

export function moveWithCollision(grid: NavGrid, pos: Vec2, dx: number, dz: number): void {
  if (isWalkable(grid, pos.x + dx, pos.z + dz)) {
    pos.x += dx;
    pos.z += dz;
    return;
  }
  if (isWalkable(grid, pos.x + dx, pos.z)) {
    pos.x += dx;
    return;
  }
  if (isWalkable(grid, pos.x, pos.z + dz)) pos.z += dz;
}
