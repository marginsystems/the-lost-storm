import type { ZoneDef } from '../content/types.ts';

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

export function tileAtCell(zone: ZoneDef, column: number, row: number): string {
  return zone.tiles[row]?.charAt(column) ?? '';
}

export function isFloorTile(zone: ZoneDef, tile: string): boolean {
  return tile !== '' && zone.floors[tile] !== undefined;
}

export function isFloorCell(zone: ZoneDef, column: number, row: number): boolean {
  return isFloorTile(zone, tileAtCell(zone, column, row));
}

export function zoneColumns(zone: ZoneDef): number {
  return zone.tiles[0]?.length ?? 0;
}

export function zoneRows(zone: ZoneDef): number {
  return zone.tiles.length;
}

export function floorCells(zone: ZoneDef): FloorCell[] {
  const cells: FloorCell[] = [];
  for (let row: number = 0; row < zoneRows(zone); row += 1) {
    for (let column: number = 0; column < zoneColumns(zone); column += 1) {
      const tile: string = tileAtCell(zone, column, row);
      if (isFloorTile(zone, tile)) cells.push({ x: (column + 0.5) * zone.cellSize, z: (row + 0.5) * zone.cellSize, column, row, tile });
    }
  }
  return cells;
}

export function wallEdges(zone: ZoneDef): WallEdge[] {
  const edges: WallEdge[] = [];
  const half: number = zone.cellSize / 2;
  for (const cell of floorCells(zone)) {
    for (const neighbour of NEIGHBOURS) {
      if (isFloorCell(zone, cell.column + neighbour.dc, cell.row + neighbour.dr)) continue;
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

export function wallCorners(zone: ZoneDef): WallCorner[] {
  const corners: WallCorner[] = [];
  for (let row: number = 0; row <= zoneRows(zone); row += 1) {
    for (let column: number = 0; column <= zoneColumns(zone); column += 1) {
      const northWest: boolean = isFloorCell(zone, column - 1, row - 1);
      const northEast: boolean = isFloorCell(zone, column, row - 1);
      const southWest: boolean = isFloorCell(zone, column - 1, row);
      const southEast: boolean = isFloorCell(zone, column, row);
      const tallAlongX: boolean = (southEast && !northEast) || (southWest && !northWest);
      const tallAlongZ: boolean = (southEast && !southWest) || (northEast && !northWest);
      if (tallAlongX && tallAlongZ) corners.push({ x: column * zone.cellSize, z: row * zone.cellSize });
    }
  }
  return corners;
}
