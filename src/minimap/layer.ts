import type { NavGrid } from '../../sim/nav/grid.ts';
import type { ExploreGrid } from '../../sim/world/exploration.ts';
import { exploreGrid } from '../../sim/world/exploration.ts';
import type { World } from '../../sim/world/types.ts';

const LAYER = {
  floor: [112, 118, 126, 84],
  wall: [214, 204, 184, 235],
  rubble: [84, 80, 76, 96],
  channels: 4,
  softCells: 1,
} as const;

type Rgba = readonly [number, number, number, number];

export interface LayerRect {
  readonly column: number;
  readonly row: number;
  readonly columns: number;
  readonly rows: number;
}

export interface LayerPixels {
  readonly columns: number;
  readonly rows: number;
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  update(world: World): LayerRect | null;
}

export interface MapLayer {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  refresh(world: World): boolean;
}

function solidAt(grid: NavGrid, column: number, row: number): boolean {
  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return true;
  return grid.solid[row * grid.columns + column] === 1;
}

function edgeOf(grid: NavGrid, column: number, row: number): boolean {
  return !solidAt(grid, column - 1, row) || !solidAt(grid, column + 1, row) || !solidAt(grid, column, row - 1) || !solidAt(grid, column, row + 1);
}

function paint(grid: NavGrid, column: number, row: number): Rgba | null {
  const index: number = row * grid.columns + column;
  if (grid.solid[index] === 1) return edgeOf(grid, column, row) ? LAYER.wall : null;
  return grid.walkable[index] === 1 ? LAYER.floor : LAYER.rubble;
}

function seenAround(seen: Uint8Array, explore: ExploreGrid, column: number, row: number): number {
  if (seen[row * explore.columns + column] !== 1) return 0;
  let lit: number = 0;
  let total: number = 0;
  for (let dz: number = -LAYER.softCells; dz <= LAYER.softCells; dz += 1) {
    for (let dx: number = -LAYER.softCells; dx <= LAYER.softCells; dx += 1) {
      const x: number = column + dx;
      const z: number = row + dz;
      total += 1;
      if (x >= 0 && z >= 0 && x < explore.columns && z < explore.rows && seen[z * explore.columns + x] === 1) lit += 1;
    }
  }
  return lit / total;
}

function changedCells(before: Uint8Array, after: Uint8Array, explore: ExploreGrid): LayerRect | null {
  let left: number = explore.columns;
  let top: number = explore.rows;
  let right: number = -1;
  let bottom: number = -1;
  for (let row: number = 0; row < explore.rows; row += 1) {
    const start: number = row * explore.columns;
    for (let column: number = 0; column < explore.columns; column += 1) {
      if (before[start + column] === after[start + column]) continue;
      left = Math.min(left, column);
      right = Math.max(right, column);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
    }
  }
  if (right < 0) return null;
  return { column: left, row: top, columns: right - left + 1, rows: bottom - top + 1 };
}

function navRect(cells: LayerRect, nav: NavGrid, explore: ExploreGrid): LayerRect {
  const ratio: number = nav.cellSize / explore.cellSize;
  const left: number = Math.max(0, Math.floor((cells.column - LAYER.softCells) / ratio));
  const top: number = Math.max(0, Math.floor((cells.row - LAYER.softCells) / ratio));
  const right: number = Math.min(nav.columns, Math.ceil((cells.column + cells.columns + LAYER.softCells) / ratio));
  const bottom: number = Math.min(nav.rows, Math.ceil((cells.row + cells.rows + LAYER.softCells) / ratio));
  return { column: left, row: top, columns: Math.max(0, right - left), rows: Math.max(0, bottom - top) };
}

export function createLayerPixels(): LayerPixels {
  let grid: NavGrid | null = null;
  let revision: number = -1;
  let drawnSeen: Uint8Array = new Uint8Array(0);
  let data: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(0);
  let columns: number = 0;
  let rows: number = 0;

  const fill = (nav: NavGrid, explore: ExploreGrid, seen: Uint8Array, rect: LayerRect): void => {
    const ratio: number = nav.cellSize / explore.cellSize;
    for (let row: number = rect.row; row < rect.row + rect.rows; row += 1) {
      const exploreRow: number = Math.floor(row * ratio);
      for (let column: number = rect.column; column < rect.column + rect.columns; column += 1) {
        const at: number = (row * nav.columns + column) * LAYER.channels;
        const light: number = seenAround(seen, explore, Math.floor(column * ratio), exploreRow);
        const colour: Rgba | null = light <= 0 ? null : paint(nav, column, row);
        if (colour === null) {
          data.fill(0, at, at + LAYER.channels);
          continue;
        }
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
        data[at + 3] = Math.round(colour[3] * light);
      }
    }
  };

  return {
    get columns(): number {
      return columns;
    },
    get rows(): number {
      return rows;
    },
    get data(): Uint8ClampedArray<ArrayBuffer> {
      return data;
    },
    update(world: World): LayerRect | null {
      if (grid === world.grid && revision === world.exploredRevision) return null;
      const nav: NavGrid = world.grid;
      const explore: ExploreGrid = exploreGrid(world.zone);
      const seen: Uint8Array = world.explored[world.zone.id] ?? new Uint8Array(explore.columns * explore.rows);
      revision = world.exploredRevision;
      if (grid !== nav || drawnSeen.length !== seen.length) {
        grid = nav;
        columns = nav.columns;
        rows = nav.rows;
        data = new Uint8ClampedArray(columns * rows * LAYER.channels);
        drawnSeen = seen.slice();
        const whole: LayerRect = { column: 0, row: 0, columns, rows };
        fill(nav, explore, seen, whole);
        return whole;
      }
      const cells: LayerRect | null = changedCells(drawnSeen, seen, explore);
      if (cells === null) return null;
      drawnSeen.set(seen);
      const rect: LayerRect = navRect(cells, nav, explore);
      fill(nav, explore, seen, rect);
      return rect;
    },
  };
}

export function createMapLayer(): MapLayer {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const pixels: LayerPixels = createLayerPixels();
  let image: ImageData | null = null;
  let width: number = 0;
  let height: number = 0;

  return {
    canvas,
    get width(): number {
      return width;
    },
    get height(): number {
      return height;
    },
    refresh(world: World): boolean {
      const rect: LayerRect | null = pixels.update(world);
      if (rect === null) return false;
      if (image === null || image.data !== pixels.data) {
        canvas.width = pixels.columns;
        canvas.height = pixels.rows;
        image = new ImageData(pixels.data, pixels.columns, pixels.rows);
      }
      const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
      if (context === null) return false;
      context.putImageData(image, 0, 0, rect.column, rect.row, rect.columns, rect.rows);
      width = world.grid.columns * world.grid.cellSize;
      height = world.grid.rows * world.grid.cellSize;
      return true;
    },
  };
}
