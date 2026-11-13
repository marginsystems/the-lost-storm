import type { BarrierFace, BarrierRow, BarrierSide, PropDef, ZoneBarrier, ZoneDef, ZoneExit } from '../content/types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import type { WallEdge } from './layout.ts';
import { isFloorCell, wallEdges } from './layout.ts';
import { outlineGap } from './outline.ts';

export const BARRIER = {
  tolerance: 0.25,
  slide: 0.25,
  reachCells: 2,
  joint: 1e-6,
  sample: 0.5,
  sizes: [1, 0.72, 0.5],
  fill: 0.2,
} as const;

export interface BarrierPiece {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
  readonly size: number;
  readonly side: BarrierSide;
  readonly row: number;
  readonly collide: boolean;
  readonly shadow: boolean;
}

export interface BarrierRun {
  readonly side: BarrierSide;
  readonly line: number;
  readonly from: number;
  readonly to: number;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function noise(a: number, b: number, salt: number): number {
  const x: number = fract(a * 0.1031 + salt * 0.3713);
  const y: number = fract(b * 0.103 + salt * 0.1597);
  const mixed: number = x * (y + 33.33) + y * (x + 33.33);
  return fract((x + mixed) * (y + mixed));
}

export function outwardOf(side: BarrierSide): ReadonlyVec2 {
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

function alongX(side: BarrierSide): boolean {
  return side === 'north' || side === 'south';
}

export function runPoint(run: BarrierRun, along: number): ReadonlyVec2 {
  return alongX(run.side) ? { x: along, z: run.line } : { x: run.line, z: along };
}

export function barrierRuns(zone: ZoneDef): BarrierRun[] {
  const half: number = zone.cellSize / 2;
  const pieces: BarrierRun[] = wallEdges(zone).map((edge: WallEdge): BarrierRun => {
    const across: boolean = alongX(edge.side);
    const middle: number = across ? edge.x : edge.z;
    return { side: edge.side, line: across ? edge.z : edge.x, from: middle - half, to: middle + half };
  });
  pieces.sort((a: BarrierRun, b: BarrierRun): number => (a.side === b.side ? (a.line === b.line ? a.from - b.from : a.line - b.line) : a.side.localeCompare(b.side)));
  const runs: BarrierRun[] = [];
  for (const piece of pieces) {
    const last: BarrierRun | undefined = runs[runs.length - 1];
    if (last !== undefined && last.side === piece.side && Math.abs(last.line - piece.line) < BARRIER.joint && Math.abs(last.to - piece.from) < BARRIER.joint) runs[runs.length - 1] = { ...last, to: piece.to };
    else runs.push(piece);
  }
  return runs;
}

export function floorDepth(zone: ZoneDef, x: number, z: number): number {
  const size: number = zone.cellSize;
  const column: number = Math.floor(x / size);
  const row: number = Math.floor(z / size);
  if (!isFloorCell(zone, column, row)) return 0;
  let depth: number = BARRIER.reachCells * size;
  for (let dr: number = -BARRIER.reachCells; dr <= BARRIER.reachCells; dr += 1) {
    for (let dc: number = -BARRIER.reachCells; dc <= BARRIER.reachCells; dc += 1) {
      if (isFloorCell(zone, column + dc, row + dr)) continue;
      const left: number = (column + dc) * size;
      const top: number = (row + dr) * size;
      const gapX: number = Math.max(left - x, 0, x - (left + size));
      const gapZ: number = Math.max(top - z, 0, z - (top + size));
      depth = Math.min(depth, Math.hypot(gapX, gapZ));
    }
  }
  return depth;
}

export function sizedProp(def: PropDef, size: number): PropDef {
  return { ...def, footprints: def.footprints.map((outline: readonly ReadonlyVec2[]): ReadonlyVec2[] => outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: point.x * size, z: point.z * size }))), height: def.height * size };
}

function turned(outlines: readonly (readonly ReadonlyVec2[])[], rotationDegrees: number): ReadonlyVec2[][] {
  const angle: number = (rotationDegrees * Math.PI) / 180;
  const cos: number = Math.cos(angle);
  const sin: number = Math.sin(angle);
  return outlines.map((outline: readonly ReadonlyVec2[]): ReadonlyVec2[] => outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: point.x * cos + point.z * sin, z: -point.x * sin + point.z * cos })));
}

function coveredPoints(outline: readonly ReadonlyVec2[]): ReadonlyVec2[] {
  const xs: number[] = outline.map((point: ReadonlyVec2): number => point.x);
  const zs: number[] = outline.map((point: ReadonlyVec2): number => point.z);
  const points: ReadonlyVec2[] = [...outline];
  for (let x: number = Math.min(...xs); x <= Math.max(...xs); x += BARRIER.sample) {
    for (let z: number = Math.min(...zs); z <= Math.max(...zs); z += BARRIER.sample) if (outlineGap(outline, x, z) <= 0) points.push({ x, z });
  }
  for (let index: number = 0; index < outline.length; index += 1) {
    const from: ReadonlyVec2 | undefined = outline[index];
    const to: ReadonlyVec2 | undefined = outline[(index + 1) % outline.length];
    if (from === undefined || to === undefined) continue;
    const steps: number = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / BARRIER.sample);
    for (let step: number = 1; step < steps; step += 1) points.push({ x: from.x + ((to.x - from.x) * step) / steps, z: from.z + ((to.z - from.z) * step) / steps });
  }
  return points;
}

function pieceOutlines(props: ReadonlyMap<string, PropDef>, piece: BarrierPiece): ReadonlyVec2[][] {
  const def: PropDef | undefined = props.get(piece.prop);
  if (def === undefined) return [];
  return turned(sizedProp(def, piece.size).footprints, piece.rotationDegrees).map((outline: readonly ReadonlyVec2[]): ReadonlyVec2[] => outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: piece.x + point.x, z: piece.z + point.z })));
}

function nearExit(exits: readonly ZoneExit[], points: readonly ReadonlyVec2[], clear: number): boolean {
  return exits.some((exit: ZoneExit): boolean => points.some((point: ReadonlyVec2): boolean => Math.hypot(point.x - exit.x, point.z - exit.z) < exit.radius + clear));
}

function fitted(zone: ZoneDef, barrier: ZoneBarrier, face: BarrierFace, def: PropDef, run: BarrierRun, along: number, rotationDegrees: number): ReadonlyVec2 | null {
  const outlines: ReadonlyVec2[][] = turned(def.footprints, rotationDegrees);
  const shape: ReadonlyVec2[] = outlines.flat();
  if (shape.length === 0) return null;
  const out: ReadonlyVec2 = outwardOf(run.side);
  const inner: number = Math.min(...shape.map((point: ReadonlyVec2): number => point.x * out.x + point.z * out.z));
  const base: ReadonlyVec2 = runPoint(run, along);
  const centre: ReadonlyVec2 = { x: base.x + out.x * (face.out - inner), z: base.z + out.z * (face.out - inner) };
  const world: ReadonlyVec2[] = outlines.flatMap((outline: readonly ReadonlyVec2[]): ReadonlyVec2[] => coveredPoints(outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: centre.x + point.x, z: centre.z + point.z }))));
  const allowance: number = Math.max(0, -face.out) + BARRIER.tolerance;
  if (world.some((point: ReadonlyVec2): boolean => floorDepth(zone, point.x, point.z) > allowance)) return null;
  if (nearExit(zone.exits, [...world, centre], barrier.exitClear)) return null;
  return centre;
}

function firstFit(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, barrier: ZoneBarrier, face: BarrierFace, run: BarrierRun, along: number, rotationDegrees: number, first: number): BarrierPiece | null {
  for (const size of BARRIER.sizes) {
    for (let attempt: number = 0; attempt < face.props.length; attempt += 1) {
      const prop: string | undefined = face.props[(first + attempt) % face.props.length];
      const def: PropDef | undefined = prop === undefined ? undefined : props.get(prop);
      if (prop === undefined || def === undefined) continue;
      const centre: ReadonlyVec2 | null = fitted(zone, barrier, face, sizedProp(def, size), run, along, rotationDegrees);
      if (centre !== null) return { prop, x: centre.x, z: centre.z, rotationDegrees, size, side: run.side, row: 0, collide: false, shadow: false };
    }
  }
  return null;
}

function rowPieces(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, barrier: ZoneBarrier, row: BarrierRow, rowIndex: number, run: BarrierRun, runIndex: number): BarrierPiece[] {
  const face: BarrierFace = barrier.nearSides.includes(run.side) ? row.near : row.far;
  if (face.props.length === 0) return [];
  const placed: BarrierPiece[] = [];
  const start: number = run.from - face.step / 2;
  const count: number = Math.ceil((run.to - run.from + face.step) / face.step);
  for (let index: number = 0; index <= count; index += 1) {
    const along: number = start + index * face.step + (noise(runIndex, index, rowIndex + 3) - 0.5) * face.step * BARRIER.slide;
    const rotationDegrees: number = (noise(index, runIndex + 7, rowIndex + 5) - 0.5) * face.turn;
    const first: number = Math.floor(noise(runIndex + 11, index, rowIndex + 9) * face.props.length);
    const piece: BarrierPiece | null = firstFit(zone, props, barrier, face, run, along, rotationDegrees, first);
    if (piece !== null) placed.push({ ...piece, row: rowIndex, collide: row.collide, shadow: row.shadow });
  }
  if (!row.collide) return placed;
  const out: ReadonlyVec2 = outwardOf(run.side);
  const shapes: ReadonlyVec2[][] = placed.flatMap((piece: BarrierPiece): ReadonlyVec2[][] => pieceOutlines(props, piece));
  for (let along: number = run.from; along <= run.to; along += BARRIER.sample) {
    const base: ReadonlyVec2 = runPoint(run, along);
    const probe: ReadonlyVec2 = { x: base.x + out.x * face.out, z: base.z + out.z * face.out };
    const gap: number = Math.min(Infinity, ...shapes.map((outline: readonly ReadonlyVec2[]): number => outlineGap(outline, probe.x, probe.z)));
    if (gap <= BARRIER.fill) continue;
    const salt: number = Math.round(along / BARRIER.sample);
    const rotationDegrees: number = (noise(salt, runIndex + 13, rowIndex + 5) - 0.5) * face.turn;
    const piece: BarrierPiece | null = firstFit(zone, props, barrier, face, run, along, rotationDegrees, Math.floor(noise(runIndex + 17, salt, rowIndex) * face.props.length));
    if (piece === null) continue;
    const filled: BarrierPiece = { ...piece, row: rowIndex, collide: row.collide, shadow: row.shadow };
    placed.push(filled);
    shapes.push(...pieceOutlines(props, filled));
  }
  return placed;
}

export function barrierPieces(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): BarrierPiece[] {
  const barrier: ZoneBarrier | null = zone.outside?.barrier ?? null;
  if (barrier === null) return [];
  const runs: BarrierRun[] = barrierRuns(zone);
  return barrier.rows.flatMap((row: BarrierRow, rowIndex: number): BarrierPiece[] => runs.flatMap((run: BarrierRun, runIndex: number): BarrierPiece[] => rowPieces(zone, props, barrier, row, rowIndex, run, runIndex)));
}
