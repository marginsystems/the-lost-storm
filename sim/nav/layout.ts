import type { ArenaDef } from '../content/types.ts';

export type WallSide = 'north' | 'south' | 'east' | 'west';

export interface WallEdge {
  readonly x: number;
  readonly z: number;
  readonly side: WallSide;
  readonly tall: boolean;
  readonly column: number;
  readonly row: number;
}

export interface WallCorner {
  readonly x: number;
  readonly z: number;
}

export interface FloorCell {
  readonly x: number;
  readonly z: number;
  readonly column: number;
  readonly row: number;
  readonly tile: string;
}

interface Neighbour {
  readonly side: WallSide;
  readonly dc: number;
  readonly dr: number;
}

const NEIGHBOURS: readonly Neighbour[] = [
  { side: 'north', dc: 0, dr: -1 },
  { side: 'south', dc: 0, dr: 1 },
  { side: 'west', dc: -1, dr: 0 },
  { side: 'east', dc: 1, dr: 0 },
];

export const CORNER_PILLAR_RADIUS: number = 0.95;

export function tileAtCell(arena: ArenaDef, column: number, row: number): string {
  return arena.tiles[row]?.charAt(column) ?? '';
}

export function isFloorTile(arena: ArenaDef, tile: string): boolean {
  return tile !== '' && arena.floors[tile] !== undefined;
}

export function isFloorCell(arena: ArenaDef, column: number, row: number): boolean {
  return isFloorTile(arena, tileAtCell(arena, column, row));
}

export function arenaColumns(arena: ArenaDef): number {
  return arena.tiles[0]?.length ?? 0;
}

export function arenaRows(arena: ArenaDef): number {
  return arena.tiles.length;
}

export function floorCells(arena: ArenaDef): FloorCell[] {
  const cells: FloorCell[] = [];
  for (let row: number = 0; row < arenaRows(arena); row += 1) {
    for (let column: number = 0; column < arenaColumns(arena); column += 1) {
      const tile: string = tileAtCell(arena, column, row);
      if (isFloorTile(arena, tile)) cells.push({ x: (column + 0.5) * arena.cellSize, z: (row + 0.5) * arena.cellSize, column, row, tile });
    }
  }
  return cells;
}

export function wallEdges(arena: ArenaDef): WallEdge[] {
  const edges: WallEdge[] = [];
  const half: number = arena.cellSize / 2;
  for (const cell of floorCells(arena)) {
    for (const neighbour of NEIGHBOURS) {
      if (isFloorCell(arena, cell.column + neighbour.dc, cell.row + neighbour.dr)) continue;
      edges.push({
        x: cell.x + neighbour.dc * half,
        z: cell.z + neighbour.dr * half,
        side: neighbour.side,
        tall: neighbour.side === 'north' || neighbour.side === 'west',
        column: cell.column,
        row: cell.row,
      });
    }
  }
  return edges;
}

export function wallCorners(arena: ArenaDef): WallCorner[] {
  const corners: WallCorner[] = [];
  for (let row: number = 0; row <= arenaRows(arena); row += 1) {
    for (let column: number = 0; column <= arenaColumns(arena); column += 1) {
      const northWest: boolean = isFloorCell(arena, column - 1, row - 1);
      const northEast: boolean = isFloorCell(arena, column, row - 1);
      const southWest: boolean = isFloorCell(arena, column - 1, row);
      const southEast: boolean = isFloorCell(arena, column, row);
      const tallAlongX: boolean = (southEast && !northEast) || (southWest && !northWest);
      const tallAlongZ: boolean = (southEast && !southWest) || (northEast && !northWest);
      if (tallAlongX && tallAlongZ) corners.push({ x: column * arena.cellSize, z: row * arena.cellSize });
    }
  }
  return corners;
}
