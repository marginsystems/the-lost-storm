import type { Content, PropDef, ZoneDef, ZoneEdge, ZoneExit } from '../../sim/content/types.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { WallEdge, WallSide } from '../../sim/nav/layout.ts';
import { isFloorCell, wallEdges } from '../../sim/nav/layout.ts';

export const ZONE_EDGE = {
  slide: 0.35,
  spread: 0.6,
  turn: Math.PI * 2,
  probes: 16,
} as const;

export interface EdgeRock {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

export function edgeNoise(a: number, b: number, salt: number): number {
  const x: number = fract(a * 0.1031 + salt * 0.3713);
  const y: number = fract(b * 0.1030 + salt * 0.1597);
  const mixed: number = x * (y + 33.33) + y * (x + 33.33);
  return fract((x + mixed) * (y + mixed));
}

export function propReach(def: PropDef): number {
  const outline: number = Math.max(0, ...def.footprint.map((point: ReadonlyVec2): number => Math.hypot(point.x, point.z)));
  return Math.max(outline, def.blockRadius + def.blockLength / 2);
}

function outward(side: WallSide): ReadonlyVec2 {
  let direction: ReadonlyVec2;
  switch (side) {
    case 'north':
      direction = { x: 0, z: -1 };
      break;
    case 'south':
      direction = { x: 0, z: 1 };
      break;
    case 'west':
      direction = { x: -1, z: 0 };
      break;
    case 'east':
      direction = { x: 1, z: 0 };
      break;
  }
  return direction;
}

function nearExit(exits: readonly ZoneExit[], x: number, z: number, clear: number): boolean {
  return exits.some((exit: ZoneExit): boolean => Math.hypot(exit.x - x, exit.z - z) < exit.radius + clear);
}

function clearOfFloor(zone: ZoneDef, x: number, z: number, reach: number): boolean {
  for (let probe: number = 0; probe <= ZONE_EDGE.probes; probe += 1) {
    const angle: number = (probe / ZONE_EDGE.probes) * Math.PI * 2;
    const distance: number = probe === ZONE_EDGE.probes ? 0 : reach;
    const px: number = x + Math.cos(angle) * distance;
    const pz: number = z + Math.sin(angle) * distance;
    if (isFloorCell(zone, Math.floor(px / zone.cellSize), Math.floor(pz / zone.cellSize))) return false;
  }
  return true;
}

function placed(content: Content, zone: ZoneDef, side: WallEdge, prop: string, gap: number): EdgeRock | null {
  const def: PropDef | undefined = content.props.get(prop);
  if (def === undefined) return null;
  const away: ReadonlyVec2 = outward(side.side);
  const along: number = (edgeNoise(side.row, side.column, 3) - 0.5) * zone.cellSize * ZONE_EDGE.slide;
  const reach: number = propReach(def);
  const depth: number = reach + gap + edgeNoise(side.column + 7, side.row, 5) * ZONE_EDGE.spread;
  const x: number = side.x + away.x * depth + away.z * along;
  const z: number = side.z + away.z * depth + away.x * along;
  if (!clearOfFloor(zone, x, z, reach + gap)) return null;
  return { prop, x, z, yaw: edgeNoise(side.column, side.row + 11, 9) * ZONE_EDGE.turn };
}

export function edgeRocks(content: Content, zone: ZoneDef): EdgeRock[] {
  const edge: ZoneEdge | null = zone.outside?.edge ?? null;
  if (edge === null || edge.props.length === 0) return [];
  const rocks: EdgeRock[] = [];
  for (const side of wallEdges(zone) satisfies WallEdge[]) {
    if (nearExit(zone.exits, side.x, side.z, edge.exitClear)) continue;
    const first: number = Math.floor(edgeNoise(side.column, side.row, side.side.length) * edge.props.length);
    for (let offset: number = 0; offset < edge.props.length; offset += 1) {
      const prop: string | undefined = edge.props[(first + offset) % edge.props.length];
      const rock: EdgeRock | null = prop === undefined ? null : placed(content, zone, side, prop, edge.gap);
      if (rock === null) continue;
      rocks.push(rock);
      break;
    }
  }
  return rocks;
}
