import type { ZoneDef, PropDef, SurfaceDef } from '../content/types.ts';
import type { ZoneDrift } from '../content/road-types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { outlineGap } from './outline.ts';
import { barrierPieces, sizedProp } from './barrier.ts';
import { CORNER_PILLAR_RADIUS, isFloorCell, tileAtCell, wallCorners } from './layout.ts';

export interface NavGrid {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly walkable: Uint8Array;
  readonly solid: Uint8Array;
  readonly pace: Float32Array;
  readonly drifts: readonly DriftCells[];
  readonly ground: Uint8Array;
  readonly bodies: readonly Blocker[];
  readonly near: ReadonlyMap<number, readonly number[]>;
  readonly radius: number;
  readonly routed: boolean;
}

export interface DriftCells {
  readonly drift: ZoneDrift;
  readonly cells: Int32Array;
  readonly walkable: Uint8Array;
  readonly ground: Uint8Array;
  open: boolean;
}

export type Blocker = { readonly kind: 'capsule'; readonly from: Vec2; readonly to: Vec2; readonly radius: number } | { readonly kind: 'outline'; readonly outline: readonly ReadonlyVec2[] };

export interface GridStamp {
  readonly cells: Int32Array;
  readonly walkable: Uint8Array;
  readonly solid: Uint8Array;
  readonly ground: Uint8Array;
}

export function propBlocker(def: PropDef, x: number, z: number, rotationDegrees: number): Blocker | null {
  if (def.blockRadius <= 0) return null;
  const angle: number = (rotationDegrees * Math.PI) / 180;
  const half: number = def.blockLength / 2;
  const ax: number = Math.cos(angle) * half;
  const az: number = -Math.sin(angle) * half;
  return { kind: 'capsule', from: { x: x - ax, z: z - az }, to: { x: x + ax, z: z + az }, radius: def.blockRadius };
}

export function propOutlines(def: PropDef, x: number, z: number, rotationDegrees: number): Blocker[] {
  const angle: number = (rotationDegrees * Math.PI) / 180;
  const cos: number = Math.cos(angle);
  const sin: number = Math.sin(angle);
  return def.footprints
    .filter((outline: readonly ReadonlyVec2[]): boolean => outline.length >= 3)
    .map((outline: readonly ReadonlyVec2[]): Blocker => ({ kind: 'outline', outline: outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: x + point.x * cos + point.z * sin, z: z - point.x * sin + point.z * cos })) }));
}

export function propBlockers(def: PropDef, x: number, z: number, rotationDegrees: number): Blocker[] {
  const outlines: Blocker[] = propOutlines(def, x, z, rotationDegrees);
  if (outlines.length > 0) return outlines;
  const capsule: Blocker | null = propBlocker(def, x, z, rotationDegrees);
  return capsule === null ? [] : [capsule];
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
  normalStep: 0.01,
  touch: 1e-9,
  backOut: 1e-6,
  slideLeast: 0.2,
  slideShares: [1, 0.5],
  groundRings: 4,
} as const;

function blockers(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): Blocker[] {
  const list: Blocker[] = [];
  for (const placed of zone.props) {
    if (placed.when.length > 0) continue;
    const def: PropDef | undefined = props.get(placed.prop);
    if (def !== undefined) list.push(...propBlockers(def, placed.x, placed.z, placed.rotationDegrees));
  }
  for (const piece of barrierPieces(zone, props)) {
    if (!piece.collide) continue;
    const def: PropDef | undefined = props.get(piece.prop);
    if (def !== undefined) list.push(...propBlockers(sizedProp(def, piece.size), piece.x, piece.z, piece.rotationDegrees));
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
    const bounds: Bounds = blockerBounds(blocker, agentRadius, columns, rows);
    for (let row: number = bounds.fromRow; row <= bounds.toRow; row += 1) {
      for (let column: number = bounds.fromColumn; column <= bounds.toColumn; column += 1) {
        if (cells[row * columns + column] === 1 && blockerGap(blocker, (column + 0.5) * NAV.cellSize, (row + 0.5) * NAV.cellSize) < agentRadius) cells[row * columns + column] = 0;
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

function driftCells(zone: ZoneDef, drift: ZoneDrift, walkable: Uint8Array, ground: Uint8Array, columns: number, rows: number): DriftCells {
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
  return { drift, cells: indices, walkable: Uint8Array.from(indices, (index: number): number => walkable[index] ?? 0), ground: Uint8Array.from(indices, (index: number): number => ground[index] ?? 0), open: true };
}

export function buildNavGrid(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, surfaces: ReadonlyMap<string, SurfaceDef>, agentRadius: number): NavGrid {
  const columns: number = Math.ceil(((zone.tiles[0]?.length ?? 0) * zone.cellSize) / NAV.cellSize);
  const rows: number = Math.ceil((zone.tiles.length * zone.cellSize) / NAV.cellSize);
  const obstacles: Blocker[] = blockers(zone, props);
  const open: Uint8Array = fill(zone, obstacles, columns, rows, 0);
  const solid: Uint8Array = open.map((value: number): number => 1 - value);
  const walkable: Uint8Array = fill(zone, obstacles, columns, rows, agentRadius);
  const ground: Uint8Array = fill(zone, [], columns, rows, agentRadius);
  const drifts: DriftCells[] = zone.drifts.map((drift: ZoneDrift): DriftCells => driftCells(zone, drift, walkable, ground, columns, rows));
  return { cellSize: NAV.cellSize, columns, rows, walkable, solid, pace: paceOf(zone, surfaces, columns, rows), drifts, ground, bodies: obstacles, near: nearBodies(obstacles, agentRadius, columns, rows), radius: agentRadius, routed: false };
}

function nearBodies(bodies: readonly Blocker[], agentRadius: number, columns: number, rows: number): Map<number, number[]> {
  const near: Map<number, number[]> = new Map<number, number[]>();
  const reach: number = agentRadius + NAV.cellSize * Math.SQRT1_2;
  bodies.forEach((body: Blocker, at: number): void => {
    const bounds: Bounds = blockerBounds(body, reach, columns, rows);
    for (let row: number = bounds.fromRow; row <= bounds.toRow; row += 1) {
      for (let column: number = bounds.fromColumn; column <= bounds.toColumn; column += 1) {
        if (blockerGap(body, (column + 0.5) * NAV.cellSize, (row + 0.5) * NAV.cellSize) >= reach) continue;
        const index: number = row * columns + column;
        const list: number[] | undefined = near.get(index);
        if (list === undefined) near.set(index, [at]);
        else list.push(at);
      }
    }
  });
  return near;
}

export function stampBlockers(grid: NavGrid, stamped: readonly Blocker[], agentRadius: number): GridStamp {
  const gaps: Map<number, number> = new Map<number, number>();
  for (const blocker of stamped) {
    const bounds: Bounds = blockerBounds(blocker, agentRadius, grid.columns, grid.rows);
    for (let row: number = bounds.fromRow; row <= bounds.toRow; row += 1) {
      for (let column: number = bounds.fromColumn; column <= bounds.toColumn; column += 1) {
        const index: number = row * grid.columns + column;
        const centre: Vec2 = cellCenter(grid, index);
        gaps.set(index, Math.min(gaps.get(index) ?? Infinity, blockerGap(blocker, centre.x, centre.z)));
      }
    }
  }
  const touched: [number, number][] = [...gaps].filter(([, gap]: [number, number]): boolean => gap < agentRadius).toSorted((a: [number, number], b: [number, number]): number => a[0] - b[0]);
  const indices: Int32Array = Int32Array.from(touched, ([index]: [number, number]): number => index);
  const stamp: GridStamp = { cells: indices, walkable: Uint8Array.from(indices, (index: number): number => grid.walkable[index] ?? 0), solid: Uint8Array.from(indices, (index: number): number => grid.solid[index] ?? 0), ground: Uint8Array.from(indices, (index: number): number => grid.ground[index] ?? 0) };
  touched.forEach(([index, gap]: [number, number]): void => {
    grid.walkable[index] = 0;
    grid.ground[index] = 0;
    if (gap < 0) grid.solid[index] = 1;
  });
  return stamp;
}

export function liftStamp(grid: NavGrid, stamp: GridStamp): void {
  stamp.cells.forEach((index: number, at: number): void => {
    grid.walkable[index] = stamp.walkable[at] ?? 0;
    grid.solid[index] = stamp.solid[at] ?? 0;
    grid.ground[index] = stamp.ground[at] ?? 0;
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
    grid.ground[index] = open ? (patch.ground[at] ?? 0) : 0;
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

export function bodyGap(grid: NavGrid, x: number, z: number): number {
  const index: number = cellIndex(grid, x, z);
  let gap: number = Number.POSITIVE_INFINITY;
  for (const at of grid.near.get(index) ?? []) {
    const body: Blocker | undefined = grid.bodies[at];
    if (body !== undefined) gap = Math.min(gap, blockerGap(body, x, z));
  }
  return gap;
}

function onGround(grid: NavGrid, x: number, z: number): boolean {
  const index: number = cellIndex(grid, x, z);
  return index >= 0 && grid.ground[index] === 1;
}

export function isWalkable(grid: NavGrid, x: number, z: number): boolean {
  return onGround(grid, x, z) && (!grid.routed || grid.walkable[cellIndex(grid, x, z)] === 1) && bodyGap(grid, x, z) >= grid.radius - NAV.touch;
}

const ROUTED: WeakMap<NavGrid, NavGrid> = new WeakMap<NavGrid, NavGrid>();

export function routedGrid(grid: NavGrid): NavGrid {
  if (grid.routed) return grid;
  const known: NavGrid | undefined = ROUTED.get(grid);
  if (known !== undefined) return known;
  const routed: NavGrid = { ...grid, routed: true };
  ROUTED.set(grid, routed);
  return routed;
}

export function groundReach(grid: NavGrid, x: number, z: number): number {
  if (onGround(grid, x, z)) return 0;
  const column: number = Math.floor(x / grid.cellSize);
  const row: number = Math.floor(z / grid.cellSize);
  let best: number = Infinity;
  for (let dr: number = -NAV.groundRings; dr <= NAV.groundRings; dr += 1) {
    for (let dc: number = -NAV.groundRings; dc <= NAV.groundRings; dc += 1) {
      const c: number = column + dc;
      const r: number = row + dr;
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows || grid.ground[r * grid.columns + c] !== 1) continue;
      const nx: number = Math.min(Math.max(x, c * grid.cellSize), (c + 1) * grid.cellSize);
      const nz: number = Math.min(Math.max(z, r * grid.cellSize), (r + 1) * grid.cellSize);
      best = Math.min(best, Math.hypot(x - nx, z - nz));
    }
  }
  return best;
}

function canStep(grid: NavGrid, pos: Vec2, x: number, z: number): boolean {
  if (isWalkable(grid, x, z)) return true;
  if (grid.routed && isWalkable(grid, pos.x, pos.z)) return false;
  if (!onGround(grid, pos.x, pos.z)) return groundReach(grid, x, z) < groundReach(grid, pos.x, pos.z) && bodyGap(grid, x, z) >= Math.min(grid.radius - NAV.touch, bodyGap(grid, pos.x, pos.z));
  return onGround(grid, x, z) && bodyGap(grid, x, z) > bodyGap(grid, pos.x, pos.z);
}

function bodyNormal(grid: NavGrid, x: number, z: number): Vec2 | null {
  let nearest: Blocker | null = null;
  let gap: number = grid.radius;
  for (const at of grid.near.get(cellIndex(grid, x, z)) ?? []) {
    const body: Blocker | undefined = grid.bodies[at];
    if (body === undefined) continue;
    const here: number = blockerGap(body, x, z);
    if (here < gap) {
      gap = here;
      nearest = body;
    }
  }
  if (nearest === null) return null;
  const step: number = NAV.normalStep;
  const gx: number = blockerGap(nearest, x + step, z) - blockerGap(nearest, x - step, z);
  const gz: number = blockerGap(nearest, x, z + step) - blockerGap(nearest, x, z - step);
  const length: number = Math.hypot(gx, gz);
  return length <= 0 ? null : { x: gx / length, z: gz / length };
}

export function slideAlong(grid: NavGrid, pos: ReadonlyVec2, dx: number, dz: number): Vec2 | null {
  const normal: Vec2 | null = bodyNormal(grid, pos.x + dx, pos.z + dz) ?? bodyNormal(grid, pos.x, pos.z);
  if (normal === null) return null;
  const into: number = dx * normal.x + dz * normal.z;
  if (into >= 0) return null;
  const along: Vec2 = { x: dx - normal.x * into, z: dz - normal.z * into };
  return Math.hypot(along.x, along.z) < Math.hypot(dx, dz) * NAV.slideLeast ? null : along;
}

export function slideOnBody(grid: NavGrid, pos: Vec2, dx: number, dz: number): boolean {
  const along: Vec2 | null = slideAlong(grid, pos, dx, dz);
  if (along === null) return false;
  for (const share of NAV.slideShares) {
    const target: Vec2 = backOut(grid, { x: pos.x + along.x * share, z: pos.z + along.z * share });
    if (!canStep(grid, pos, target.x, target.z)) continue;
    pos.x = target.x;
    pos.z = target.z;
    return true;
  }
  return false;
}

function backOut(grid: NavGrid, point: Vec2): Vec2 {
  const short: number = grid.radius - bodyGap(grid, point.x, point.z);
  if (short <= 0) return point;
  const normal: Vec2 | null = bodyNormal(grid, point.x, point.z);
  if (normal === null) return point;
  const push: number = short + NAV.backOut;
  return { x: point.x + normal.x * push, z: point.z + normal.z * push };
}

export function stepClear(grid: NavGrid, pos: Vec2, dx: number, dz: number): boolean {
  if (!canStep(grid, pos, pos.x + dx, pos.z + dz)) return false;
  pos.x += dx;
  pos.z += dz;
  return true;
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
  if (stepClear(grid, pos, dx, dz) || slideOnBody(grid, pos, dx, dz)) return;
  if (stepClear(grid, pos, dx, 0)) return;
  stepClear(grid, pos, 0, dz);
}
