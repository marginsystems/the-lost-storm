import type { ZoneDef, PropDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { CORNER_PILLAR_RADIUS, isFloorCell, wallCorners } from './layout.ts';

export interface NavGrid {
  readonly cellSize: number;
  readonly columns: number;
  readonly rows: number;
  readonly walkable: Uint8Array;
  readonly solid: Uint8Array;
}

interface Blocker {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

const NAV = {
  cellSize: 0.5,
  lineStep: 0.25,
  searchStep: 0.5,
} as const;

function blockers(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): Blocker[] {
  const list: Blocker[] = [];
  for (const placed of zone.props) {
    const radius: number = props.get(placed.prop)?.blockRadius ?? 0;
    if (radius > 0) list.push({ x: placed.x, z: placed.z, radius });
  }
  for (const corner of wallCorners(zone)) list.push({ x: corner.x, z: corner.z, radius: CORNER_PILLAR_RADIUS });
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

function fill(zone: ZoneDef, obstacles: readonly Blocker[], columns: number, rows: number, agentRadius: number): Uint8Array {
  const cells: Uint8Array = new Uint8Array(columns * rows);
  const margin: number = zone.walls.halfThickness + agentRadius;
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) {
      const x: number = (column + 0.5) * NAV.cellSize;
      const z: number = (row + 0.5) * NAV.cellSize;
      const open: boolean = insideFloor(zone, x, z, margin) && obstacles.every((blocker: Blocker): boolean => Math.hypot(blocker.x - x, blocker.z - z) >= blocker.radius + agentRadius);
      cells[row * columns + column] = open ? 1 : 0;
    }
  }
  return cells;
}

export function buildNavGrid(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, agentRadius: number): NavGrid {
  const columns: number = Math.ceil(((zone.tiles[0]?.length ?? 0) * zone.cellSize) / NAV.cellSize);
  const rows: number = Math.ceil((zone.tiles.length * zone.cellSize) / NAV.cellSize);
  const obstacles: Blocker[] = blockers(zone, props);
  const open: Uint8Array = fill(zone, obstacles, columns, rows, 0);
  const solid: Uint8Array = open.map((value: number): number => 1 - value);
  return { cellSize: NAV.cellSize, columns, rows, walkable: fill(zone, obstacles, columns, rows, agentRadius), solid };
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
