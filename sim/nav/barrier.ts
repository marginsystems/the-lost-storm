import type { BarrierFace, BarrierRow, BarrierSide, ZoneBarrier } from '../content/barrier-types.ts';
import type { PropDef, ZoneDef, ZoneExit } from '../content/types.ts';
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
  sizes: [1, 0.72, 0.5, 0.35, 0.25],
  fill: 0.2,
  propClear: 0.3,
  corridor: 40,
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

export const BARRIER_WORK: { placements: number; gaps: number } = { placements: 0, gaps: 0 };

function gapAt(outline: readonly ReadonlyVec2[], x: number, z: number): number {
  BARRIER_WORK.gaps += 1;
  return outlineGap(outline, x, z);
}

interface Bounds {
  readonly low: ReadonlyVec2;
  readonly high: ReadonlyVec2;
}

function boundsOf(outline: readonly ReadonlyVec2[]): Bounds {
  let lowX: number = Infinity;
  let lowZ: number = Infinity;
  let highX: number = -Infinity;
  let highZ: number = -Infinity;
  for (const point of outline) {
    lowX = Math.min(lowX, point.x);
    lowZ = Math.min(lowZ, point.z);
    highX = Math.max(highX, point.x);
    highZ = Math.max(highZ, point.z);
  }
  return { low: { x: lowX, z: lowZ }, high: { x: highX, z: highZ } };
}

function boundsGap(bounds: Bounds, point: ReadonlyVec2): number {
  return Math.hypot(Math.max(bounds.low.x - point.x, 0, point.x - bounds.high.x), Math.max(bounds.low.z - point.z, 0, point.z - bounds.high.z));
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

function coveredUnless(outline: readonly ReadonlyVec2[], refuse: (point: ReadonlyVec2) => boolean): ReadonlyVec2[] | null {
  const points: ReadonlyVec2[] = [];
  for (const point of outline) {
    if (refuse(point)) return null;
    points.push(point);
  }
  for (let index: number = 0; index < outline.length; index += 1) {
    const from: ReadonlyVec2 | undefined = outline[index];
    const to: ReadonlyVec2 | undefined = outline[(index + 1) % outline.length];
    if (from === undefined || to === undefined) continue;
    const steps: number = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / BARRIER.sample);
    for (let step: number = 1; step < steps; step += 1) {
      const point: ReadonlyVec2 = { x: from.x + ((to.x - from.x) * step) / steps, z: from.z + ((to.z - from.z) * step) / steps };
      if (refuse(point)) return null;
      points.push(point);
    }
  }
  const bounds: Bounds = boundsOf(outline);
  for (let x: number = bounds.low.x; x <= bounds.high.x; x += BARRIER.sample) {
    for (let z: number = bounds.low.z; z <= bounds.high.z; z += BARRIER.sample) {
      if (gapAt(outline, x, z) > 0) continue;
      const point: ReadonlyVec2 = { x, z };
      if (refuse(point)) return null;
      points.push(point);
    }
  }
  return points;
}

function pieceOutlines(props: ReadonlyMap<string, PropDef>, piece: BarrierPiece): ReadonlyVec2[][] {
  const def: PropDef | undefined = props.get(piece.prop);
  if (def === undefined) return [];
  return turned(sizedProp(def, piece.size).footprints, piece.rotationDegrees).map((outline: readonly ReadonlyVec2[]): ReadonlyVec2[] => outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: piece.x + point.x, z: piece.z + point.z })));
}

interface Lane {
  readonly from: ReadonlyVec2;
  readonly to: ReadonlyVec2;
  readonly clear: number;
}

interface Keepout {
  readonly lanes: readonly Lane[];
  readonly outlines: readonly (readonly ReadonlyVec2[])[];
  readonly discs: readonly Lane[];
}

function segmentGap(point: ReadonlyVec2, from: ReadonlyVec2, to: ReadonlyVec2): number {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const span: number = dx * dx + dz * dz;
  const t: number = span <= 0 ? 0 : Math.min(1, Math.max(0, ((point.x - from.x) * dx + (point.z - from.z) * dz) / span));
  return Math.hypot(point.x - (from.x + dx * t), point.z - (from.z + dz * t));
}

function runGap(run: BarrierRun, point: ReadonlyVec2): number {
  return segmentGap(point, runPoint(run, run.from), runPoint(run, run.to));
}

function exitLane(runs: readonly BarrierRun[], exit: ZoneExit, clear: number): Lane {
  const from: ReadonlyVec2 = { x: exit.x, z: exit.z };
  const nearest: BarrierRun | undefined = runs.toSorted((a: BarrierRun, b: BarrierRun): number => runGap(a, from) - runGap(b, from))[0];
  const out: ReadonlyVec2 = nearest === undefined ? { x: 0, z: 0 } : outwardOf(nearest.side);
  return { from, to: { x: exit.x + out.x * BARRIER.corridor, z: exit.z + out.z * BARRIER.corridor }, clear: exit.radius + clear };
}

function keepout(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, barrier: ZoneBarrier, runs: readonly BarrierRun[]): Keepout {
  const outlines: ReadonlyVec2[][] = [];
  const discs: Lane[] = [];
  for (const placed of zone.props) {
    if (placed.when.length > 0) continue;
    const def: PropDef | undefined = props.get(placed.prop);
    if (def === undefined) continue;
    const shapes: ReadonlyVec2[][] = turned(def.footprints, placed.rotationDegrees).filter((outline: readonly ReadonlyVec2[]): boolean => outline.length >= 3);
    const touches: boolean = [{ x: 0, z: 0 }, ...shapes.flat()].some((point: ReadonlyVec2): boolean => isFloorCell(zone, Math.floor((placed.x + point.x) / zone.cellSize), Math.floor((placed.z + point.z) / zone.cellSize)));
    if (!touches) continue;
    for (const outline of shapes) outlines.push(outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: placed.x + point.x, z: placed.z + point.z })));
    if (shapes.length === 0 && def.blockRadius > 0) discs.push({ from: { x: placed.x, z: placed.z }, to: { x: placed.x, z: placed.z }, clear: def.blockRadius + def.blockLength / 2 + BARRIER.propClear });
  }
  return { lanes: zone.exits.map((exit: ZoneExit): Lane => exitLane(runs, exit, barrier.exitClear)), outlines, discs };
}

function blocked(keep: Keepout, points: readonly ReadonlyVec2[]): boolean {
  const xs: number[] = points.map((point: ReadonlyVec2): number => point.x);
  const zs: number[] = points.map((point: ReadonlyVec2): number => point.z);
  const low: ReadonlyVec2 = { x: Math.min(...xs), z: Math.min(...zs) };
  const high: ReadonlyVec2 = { x: Math.max(...xs), z: Math.max(...zs) };
  const lanes: readonly Lane[] = [...keep.lanes, ...keep.discs];
  if (points.some((point: ReadonlyVec2): boolean => lanes.some((lane: Lane): boolean => segmentGap(point, lane.from, lane.to) < lane.clear))) return true;
  const near: readonly (readonly ReadonlyVec2[])[] = keep.outlines.filter((outline: readonly ReadonlyVec2[]): boolean => outline.some((point: ReadonlyVec2): boolean => point.x > low.x - BARRIER.propClear && point.x < high.x + BARRIER.propClear && point.z > low.z - BARRIER.propClear && point.z < high.z + BARRIER.propClear));
  return near.some((outline: readonly ReadonlyVec2[]): boolean => points.some((point: ReadonlyVec2): boolean => gapAt(outline, point.x, point.z) < BARRIER.propClear));
}

function fitted(zone: ZoneDef, keep: Keepout, face: BarrierFace, def: PropDef, run: BarrierRun, along: number, rotationDegrees: number): ReadonlyVec2 | null {
  const outlines: ReadonlyVec2[][] = turned(def.footprints, rotationDegrees);
  const shape: ReadonlyVec2[] = outlines.flat();
  if (shape.length === 0) return null;
  const out: ReadonlyVec2 = outwardOf(run.side);
  const inner: number = Math.min(...shape.map((point: ReadonlyVec2): number => point.x * out.x + point.z * out.z));
  const base: ReadonlyVec2 = runPoint(run, along);
  const centre: ReadonlyVec2 = { x: base.x + out.x * (face.out - inner), z: base.z + out.z * (face.out - inner) };
  const placed: ReadonlyVec2[][] = outlines.map((outline: readonly ReadonlyVec2[]): ReadonlyVec2[] => outline.map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: centre.x + point.x, z: centre.z + point.z })));
  const allowance: number = Math.max(0, -face.out) + BARRIER.tolerance;
  const onFloor = (point: ReadonlyVec2): boolean => floorDepth(zone, point.x, point.z) > allowance;
  const corners: ReadonlyVec2[] = placed.flat();
  if (corners.some(onFloor)) return null;
  if (blocked(keep, [...corners, centre])) return null;
  const world: ReadonlyVec2[] = [];
  for (const outline of placed) {
    const covered: ReadonlyVec2[] | null = coveredUnless(outline, onFloor);
    if (covered === null) return null;
    world.push(...covered);
  }
  if (blocked(keep, [...world, centre])) return null;
  return centre;
}

const sizedCache: WeakMap<PropDef, Map<number, PropDef>> = new WeakMap<PropDef, Map<number, PropDef>>();

function sizedOnce(def: PropDef, size: number): PropDef {
  const sizes: Map<number, PropDef> = sizedCache.get(def) ?? new Map<number, PropDef>();
  sizedCache.set(def, sizes);
  const known: PropDef | undefined = sizes.get(size);
  if (known !== undefined) return known;
  const made: PropDef = sizedProp(def, size);
  sizes.set(size, made);
  return made;
}

function firstFit(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, keep: Keepout, face: BarrierFace, run: BarrierRun, along: number, rotationDegrees: number, first: number): BarrierPiece | null {
  for (const size of BARRIER.sizes) {
    for (let attempt: number = 0; attempt < face.props.length; attempt += 1) {
      const prop: string | undefined = face.props[(first + attempt) % face.props.length];
      const def: PropDef | undefined = prop === undefined ? undefined : props.get(prop);
      if (prop === undefined || def === undefined) continue;
      const centre: ReadonlyVec2 | null = fitted(zone, keep, face, sizedOnce(def, size), run, along, rotationDegrees);
      if (centre !== null) return { prop, x: centre.x, z: centre.z, rotationDegrees, size, side: run.side, row: 0, collide: false, shadow: false };
    }
  }
  return null;
}

function rowPieces(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, barrier: ZoneBarrier, keep: Keepout, row: BarrierRow, rowIndex: number, run: BarrierRun, runIndex: number): BarrierPiece[] {
  const face: BarrierFace = barrier.nearSides.includes(run.side) ? row.near : row.far;
  if (face.props.length === 0) return [];
  const placed: BarrierPiece[] = [];
  const start: number = run.from - face.step / 2;
  const count: number = Math.ceil((run.to - run.from + face.step) / face.step);
  for (let index: number = 0; index <= count; index += 1) {
    const along: number = start + index * face.step + (noise(runIndex, index, rowIndex + 3) - 0.5) * face.step * BARRIER.slide;
    const rotationDegrees: number = (noise(index, runIndex + 7, rowIndex + 5) - 0.5) * face.turn;
    const first: number = Math.floor(noise(runIndex + 11, index, rowIndex + 9) * face.props.length);
    const piece: BarrierPiece | null = firstFit(zone, props, keep, face, run, along, rotationDegrees, first);
    if (piece !== null) placed.push({ ...piece, row: rowIndex, collide: row.collide, shadow: row.shadow });
  }
  if (!row.collide) return placed;
  const out: ReadonlyVec2 = outwardOf(run.side);
  const shapes: ReadonlyVec2[][] = placed.flatMap((piece: BarrierPiece): ReadonlyVec2[][] => pieceOutlines(props, piece));
  const boxes: Bounds[] = shapes.map(boundsOf);
  for (let along: number = run.from; along <= run.to; along += BARRIER.sample) {
    const base: ReadonlyVec2 = runPoint(run, along);
    const probe: ReadonlyVec2 = { x: base.x + out.x * face.out, z: base.z + out.z * face.out };
    const gap: number = Math.min(Infinity, ...shapes.filter((_outline: readonly ReadonlyVec2[], index: number): boolean => { const box: Bounds | undefined = boxes[index]; return box === undefined || boundsGap(box, probe) <= BARRIER.fill; }).map((outline: readonly ReadonlyVec2[]): number => gapAt(outline, probe.x, probe.z)));
    if (gap <= BARRIER.fill) continue;
    const salt: number = Math.round(along / BARRIER.sample);
    const rotationDegrees: number = (noise(salt, runIndex + 13, rowIndex + 5) - 0.5) * face.turn;
    const piece: BarrierPiece | null = firstFit(zone, props, keep, face, run, along, rotationDegrees, Math.floor(noise(runIndex + 17, salt, rowIndex) * face.props.length));
    if (piece === null) continue;
    const filled: BarrierPiece = { ...piece, row: rowIndex, collide: row.collide, shadow: row.shadow };
    placed.push(filled);
    const added: ReadonlyVec2[][] = pieceOutlines(props, filled);
    shapes.push(...added);
    boxes.push(...added.map(boundsOf));
  }
  return placed;
}

const placedCache: WeakMap<ZoneDef, WeakMap<ReadonlyMap<string, PropDef>, readonly BarrierPiece[]>> = new WeakMap<ZoneDef, WeakMap<ReadonlyMap<string, PropDef>, readonly BarrierPiece[]>>();


export function barrierPieces(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): readonly BarrierPiece[] {
  const byProps: WeakMap<ReadonlyMap<string, PropDef>, readonly BarrierPiece[]> = placedCache.get(zone) ?? new WeakMap<ReadonlyMap<string, PropDef>, readonly BarrierPiece[]>();
  placedCache.set(zone, byProps);
  const known: readonly BarrierPiece[] | undefined = byProps.get(props);
  if (known !== undefined) return known;
  const made: readonly BarrierPiece[] = placeBarrier(zone, props);
  byProps.set(props, made);
  return made;
}

function placeBarrier(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): BarrierPiece[] {
  const barrier: ZoneBarrier | null = zone.outside?.barrier ?? null;
  if (barrier === null) return [];
  BARRIER_WORK.placements += 1;
  const runs: BarrierRun[] = barrierRuns(zone);
  const keep: Keepout = keepout(zone, props, barrier, runs);
  return barrier.rows.flatMap((row: BarrierRow, rowIndex: number): BarrierPiece[] => runs.flatMap((run: BarrierRun, runIndex: number): BarrierPiece[] => rowPieces(zone, props, barrier, keep, row, rowIndex, run, runIndex)));
}
