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

export function createMapLayer(): MapLayer {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  let grid: NavGrid | null = null;
  let revision: number = -1;
  let width: number = 0;
  let height: number = 0;

  const draw = (world: World): void => {
    const nav: NavGrid = world.grid;
    const explore: ExploreGrid = exploreGrid(world.zone);
    const seen: Uint8Array | undefined = world.explored[world.zone.id];
    if (canvas.width !== nav.columns || canvas.height !== nav.rows) {
      canvas.width = nav.columns;
      canvas.height = nav.rows;
    }
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (context === null) return;
    const image: ImageData = context.createImageData(nav.columns, nav.rows);
    const ratio: number = nav.cellSize / explore.cellSize;
    for (let row: number = 0; row < nav.rows; row += 1) {
      const exploreRow: number = Math.floor(row * ratio);
      for (let column: number = 0; column < nav.columns; column += 1) {
        const light: number = seen === undefined ? 0 : seenAround(seen, explore, Math.floor(column * ratio), exploreRow);
        if (light <= 0) continue;
        const colour: Rgba | null = paint(nav, column, row);
        if (colour === null) continue;
        const [red, green, blue, alpha]: Rgba = colour;
        image.data.set([red, green, blue, Math.round(alpha * light)], (row * nav.columns + column) * LAYER.channels);
      }
    }
    context.putImageData(image, 0, 0);
    width = nav.columns * nav.cellSize;
    height = nav.rows * nav.cellSize;
  };

  return {
    canvas,
    get width(): number {
      return width;
    },
    get height(): number {
      return height;
    },
    refresh(world: World): boolean {
      if (grid === world.grid && revision === world.exploredRevision) return false;
      grid = world.grid;
      revision = world.exploredRevision;
      draw(world);
      return true;
    },
  };
}
