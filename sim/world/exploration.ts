import type { ZoneDef } from '../content/types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import type { World } from './types.ts';

export const EXPLORE = {
  cellSize: 1,
  revealRadius: 14,
  runSeparator: '.',
} as const;

export interface ExploreGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
}

export function exploreGrid(zone: ZoneDef): ExploreGrid {
  return {
    columns: Math.ceil(((zone.tiles[0]?.length ?? 0) * zone.cellSize) / EXPLORE.cellSize),
    rows: Math.ceil((zone.tiles.length * zone.cellSize) / EXPLORE.cellSize),
    cellSize: EXPLORE.cellSize,
  };
}

export function exploredCells(world: World, zone: ZoneDef): Uint8Array {
  const known: Uint8Array | undefined = world.explored[zone.id];
  if (known !== undefined) return known;
  const grid: ExploreGrid = exploreGrid(zone);
  const fresh: Uint8Array = new Uint8Array(grid.columns * grid.rows);
  world.explored[zone.id] = fresh;
  return fresh;
}

export function isExplored(world: World, x: number, z: number): boolean {
  const grid: ExploreGrid = exploreGrid(world.zone);
  const column: number = Math.floor(x / grid.cellSize);
  const row: number = Math.floor(z / grid.cellSize);
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return false;
  return world.explored[world.zone.id]?.[row * grid.columns + column] === 1;
}

export function revealAround(world: World, centre: ReadonlyVec2): boolean {
  const grid: ExploreGrid = exploreGrid(world.zone);
  const cells: Uint8Array = exploredCells(world, world.zone);
  const reach: number = Math.ceil(EXPLORE.revealRadius / grid.cellSize);
  const centreColumn: number = Math.floor(centre.x / grid.cellSize);
  const centreRow: number = Math.floor(centre.z / grid.cellSize);
  let changed: boolean = false;
  for (let row: number = Math.max(0, centreRow - reach); row <= Math.min(grid.rows - 1, centreRow + reach); row += 1) {
    for (let column: number = Math.max(0, centreColumn - reach); column <= Math.min(grid.columns - 1, centreColumn + reach); column += 1) {
      const index: number = row * grid.columns + column;
      if (cells[index] === 1) continue;
      const dx: number = (column + 0.5) * grid.cellSize - centre.x;
      const dz: number = (row + 0.5) * grid.cellSize - centre.z;
      if (Math.hypot(dx, dz) > EXPLORE.revealRadius) continue;
      cells[index] = 1;
      changed = true;
    }
  }
  if (changed) world.exploredRevision += 1;
  return changed;
}

export function shiftExplored(world: World, by: ReadonlyVec2): void {
  const grid: ExploreGrid = exploreGrid(world.zone);
  const known: Uint8Array | undefined = world.explored[world.zone.id];
  if (known === undefined) return;
  const columns: number = Math.round(by.x / grid.cellSize);
  const rows: number = Math.round(by.z / grid.cellSize);
  if (columns === 0 && rows === 0) return;
  const moved: Uint8Array = new Uint8Array(known.length);
  for (let row: number = Math.max(0, rows); row < Math.min(grid.rows, grid.rows + rows); row += 1) {
    for (let column: number = Math.max(0, columns); column < Math.min(grid.columns, grid.columns + columns); column += 1) {
      moved[row * grid.columns + column] = known[(row - rows) * grid.columns + (column - columns)] ?? 0;
    }
  }
  world.explored[world.zone.id] = moved;
  world.exploredRevision += 1;
}

export function stepExploration(world: World): void {
  if (world.player.alive && revealAround(world, world.player.pos)) world.events.push({ type: 'explored', zone: world.zone.id });
}

export function encodeExplored(cells: Uint8Array): string {
  const runs: number[] = [];
  let current: number = 0;
  let run: number = 0;
  for (const cell of cells) {
    if (cell === current) {
      run += 1;
      continue;
    }
    runs.push(run);
    current = cell;
    run = 1;
  }
  runs.push(run);
  return runs.join(EXPLORE.runSeparator);
}

export function decodeExplored(text: unknown, size: number): Uint8Array | null {
  if (typeof text !== 'string' || text === '') return null;
  const cells: Uint8Array = new Uint8Array(size);
  let at: number = 0;
  let value: number = 0;
  for (const part of text.split(EXPLORE.runSeparator)) {
    const run: number = Number(part);
    if (!Number.isInteger(run) || run < 0 || at + run > size) return null;
    cells.fill(value, at, at + run);
    at += run;
    value = 1 - value;
  }
  return at === size ? cells : null;
}

export function exploredSize(zone: ZoneDef): number {
  const grid: ExploreGrid = exploreGrid(zone);
  return grid.columns * grid.rows;
}
