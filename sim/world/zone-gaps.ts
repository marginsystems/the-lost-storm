import type { Content, PropDef, ZoneDef } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import type { Blocker, NavGrid } from '../nav/grid.ts';
import { blockerGap, bodyGap, cellCenter, cellIndex } from '../nav/grid.ts';
import { floorAt, heightAt } from '../nav/terrain.ts';
import { createWorld } from './create.ts';
import { raiseShore, shoreBlockers, shorePlacements } from './shore-props.ts';
import type { World } from './types.ts';
import { enterZone } from './zones.ts';

export const STAGE = {
  shoreAt: { x: 80, z: 40 },
  facing: { x: 0, z: 1 },
  seed: 1,
  startAhead: 3,
  behind: 2,
} as const;

export const GAPS = {
  sample: 0.125,
  margin: 1,
  longest: 2,
  least: 0.25,
  perchReach: 2.5,
  perchRise: 0.9,
  perchTallest: 2.5,
} as const;

export interface StagedWorld {
  readonly world: World;
  readonly stamped: readonly Blocker[];
  readonly floor: Uint8Array;
  readonly walls: Uint8Array;
  readonly reached: Uint8Array;
  readonly start: Vec2;
}

export type GapKind = 'pinch' | 'narrow' | 'pocket' | 'unexplained' | 'perched';

export interface GapFinding {
  readonly kind: GapKind;
  readonly x: number;
  readonly z: number;
  readonly length: number;
  readonly area: number;
  readonly prop: string | null;
}

export interface Field {
  readonly origin: ReadonlyVec2;
  readonly frame: ReadonlyVec2;
  readonly columns: number;
  readonly rows: number;
}

function flood(grid: NavGrid, start: Vec2): Uint8Array {
  const reached: Uint8Array = new Uint8Array(grid.columns * grid.rows);
  const first: number = cellIndex(grid, start.x, start.z);
  if (first < 0 || grid.walkable[first] !== 1) return reached;
  reached[first] = 1;
  const queue: number[] = [first];
  while (queue.length > 0) {
    const at: number | undefined = queue.pop();
    if (at === undefined) break;
    const column: number = at % grid.columns;
    const row: number = Math.floor(at / grid.columns);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const c: number = column + dc;
      const r: number = row + dr;
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue;
      const next: number = r * grid.columns + c;
      if (reached[next] === 1 || grid.walkable[next] !== 1) continue;
      reached[next] = 1;
      queue.push(next);
    }
  }
  return reached;
}

export function stageWorld(content: Content, zoneId: string): StagedWorld {
  const zone: ZoneDef | undefined = content.zones.get(zoneId);
  if (zone === undefined) throw new Error(`no zone ${zoneId}`);
  const world: World = createWorld(content, { seed: STAGE.seed, save: null });
  enterZone(world, zone, { type: 'start' });
  const floor: Uint8Array = world.grid.ground.slice();
  const walls: Uint8Array = world.grid.solid.map((solid: number, index: number): number => {
    if (solid !== 1) return 0;
    const centre: Vec2 = cellCenter(world.grid, index);
    return bodyGap(world.grid, centre.x, centre.z) >= 0 ? 1 : 0;
  });
  let start: Vec2 = { x: zone.playerStart.x, z: zone.playerStart.z };
  let stamped: Blocker[] = [];
  if (zone.void?.shore !== null && zone.void?.shore !== undefined) {
    world.wake = null;
    world.shore = { at: { x: STAGE.shoreAt.x, z: STAGE.shoreAt.z }, facing: { x: STAGE.facing.x, z: STAGE.facing.z }, returned: false };
    start = { x: STAGE.shoreAt.x, z: STAGE.shoreAt.z + STAGE.startAhead };
    world.player.pos = { x: start.x, z: start.z };
    stamped = shoreBlockers(world);
    raiseShore(world);
  }
  return { world, stamped, floor, walls, reached: flood(world.grid, start), start };
}

function fieldOf(staged: StagedWorld): Field {
  const zone: ZoneDef = staged.world.zone;
  const room = zone.void?.shore?.room ?? null;
  const shore = staged.world.shore;
  if (room !== null && shore !== null) {
    return { origin: { x: shore.at.x - room.half, z: shore.at.z - STAGE.behind }, frame: shore.at, columns: Math.ceil((room.half * 2) / GAPS.sample), rows: Math.ceil((room.depth + STAGE.behind) / GAPS.sample) };
  }
  return { origin: { x: 0, z: 0 }, frame: { x: 0, z: 0 }, columns: Math.ceil(((zone.tiles[0]?.length ?? 0) * zone.cellSize) / GAPS.sample), rows: Math.ceil((zone.tiles.length * zone.cellSize) / GAPS.sample) };
}

export function sampleAt(field: Field, column: number, row: number): Vec2 {
  return { x: field.origin.x + (column + 0.5) * GAPS.sample, z: field.origin.z + (row + 0.5) * GAPS.sample };
}

function solidField(field: Field, staged: StagedWorld, bodies: readonly Blocker[]): Uint8Array {
  const solid: Uint8Array = new Uint8Array(field.columns * field.rows);
  const grid: NavGrid = staged.world.grid;
  for (let row: number = 0; row < field.rows; row += 1) {
    for (let column: number = 0; column < field.columns; column += 1) {
      const at: Vec2 = sampleAt(field, column, row);
      const cell: number = cellIndex(grid, at.x, at.z);
      if (cell < 0 || staged.walls[cell] === 1) solid[row * field.columns + column] = 1;
    }
  }
  for (const body of bodies) {
    const points: readonly ReadonlyVec2[] = body.kind === 'outline' ? body.outline : [body.from, body.to];
    const pad: number = body.kind === 'capsule' ? body.radius : 0;
    const toColumn = (x: number): number => Math.min(field.columns - 1, Math.max(0, Math.floor((x - field.origin.x) / GAPS.sample)));
    const toRow = (z: number): number => Math.min(field.rows - 1, Math.max(0, Math.floor((z - field.origin.z) / GAPS.sample)));
    const xs: number[] = points.map((point: ReadonlyVec2): number => point.x);
    const zs: number[] = points.map((point: ReadonlyVec2): number => point.z);
    for (let row: number = toRow(Math.min(...zs) - pad); row <= toRow(Math.max(...zs) + pad); row += 1) {
      for (let column: number = toColumn(Math.min(...xs) - pad); column <= toColumn(Math.max(...xs) + pad); column += 1) {
        const at: Vec2 = sampleAt(field, column, row);
        if (blockerGap(body, at.x, at.z) < 0) solid[row * field.columns + column] = 1;
      }
    }
  }
  return solid;
}

function lowerEnvelope(values: Float64Array, length: number, out: Float64Array, spots: Int32Array, bounds: Float64Array): void {
  let k: number = 0;
  spots[0] = 0;
  bounds[0] = -Infinity;
  bounds[1] = Infinity;
  for (let q: number = 1; q < length; q += 1) {
    const fq: number = values[q] ?? Infinity;
    if (fq === Infinity) continue;
    let s: number = 0;
    for (;;) {
      const v: number = spots[k] ?? 0;
      const fv: number = values[v] ?? Infinity;
      s = fv === Infinity ? -Infinity : (fq + q * q - (fv + v * v)) / (2 * q - 2 * v);
      if (s <= (bounds[k] ?? -Infinity) && k > 0) k -= 1;
      else break;
    }
    if ((values[spots[k] ?? 0] ?? Infinity) === Infinity) {
      spots[k] = q;
      bounds[k] = -Infinity;
      bounds[k + 1] = Infinity;
      continue;
    }
    k += 1;
    spots[k] = q;
    bounds[k] = s;
    bounds[k + 1] = Infinity;
  }
  k = 0;
  for (let q: number = 0; q < length; q += 1) {
    while ((bounds[k + 1] ?? Infinity) < q) k += 1;
    const v: number = spots[k] ?? 0;
    const fv: number = values[v] ?? Infinity;
    out[q] = fv === Infinity ? Infinity : (q - v) * (q - v) + fv;
  }
}

export function distanceField(seeds: Uint8Array, columns: number, rows: number): Float64Array {
  const squared: Float64Array = new Float64Array(columns * rows);
  for (let index: number = 0; index < squared.length; index += 1) squared[index] = seeds[index] === 1 ? 0 : Infinity;
  const longest: number = Math.max(columns, rows);
  const line: Float64Array = new Float64Array(longest);
  const out: Float64Array = new Float64Array(longest);
  const spots: Int32Array = new Int32Array(longest);
  const bounds: Float64Array = new Float64Array(longest + 1);
  for (let column: number = 0; column < columns; column += 1) {
    for (let row: number = 0; row < rows; row += 1) line[row] = squared[row * columns + column] ?? Infinity;
    lowerEnvelope(line, rows, out, spots, bounds);
    for (let row: number = 0; row < rows; row += 1) squared[row * columns + column] = out[row] ?? Infinity;
  }
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) line[column] = squared[row * columns + column] ?? Infinity;
    lowerEnvelope(line, columns, out, spots, bounds);
    for (let column: number = 0; column < columns; column += 1) squared[row * columns + column] = Math.sqrt(out[column] ?? Infinity);
  }
  return squared;
}

function opening(free: Float64Array, radius: number, columns: number, rows: number): Uint8Array {
  const core: Uint8Array = Uint8Array.from(free, (gap: number): number => (gap * GAPS.sample >= radius ? 1 : 0));
  const reach: Float64Array = distanceField(core, columns, rows);
  return Uint8Array.from(reach, (gap: number): number => (gap * GAPS.sample <= radius ? 1 : 0));
}

function components(mask: Uint8Array, field: Field, kind: GapKind): GapFinding[] {
  const seen: Uint8Array = new Uint8Array(mask.length);
  const found: GapFinding[] = [];
  for (let start: number = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    seen[start] = 1;
    const queue: number[] = [start];
    let count: number = 0;
    let left: number = Infinity;
    let right: number = -Infinity;
    let top: number = Infinity;
    let bottom: number = -Infinity;
    let sumColumn: number = 0;
    let sumRow: number = 0;
    while (queue.length > 0) {
      const at: number | undefined = queue.pop();
      if (at === undefined) break;
      const column: number = at % field.columns;
      const row: number = Math.floor(at / field.columns);
      count += 1;
      sumColumn += column;
      sumRow += row;
      left = Math.min(left, column);
      right = Math.max(right, column);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const c: number = column + dc;
        const r: number = row + dr;
        if (c < 0 || r < 0 || c >= field.columns || r >= field.rows) continue;
        const next: number = r * field.columns + c;
        if (seen[next] === 1 || mask[next] !== 1) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    const area: number = count * GAPS.sample * GAPS.sample;
    const length: number = Math.hypot(right - left + 1, bottom - top + 1) * GAPS.sample;
    if (area < GAPS.least || length < GAPS.longest) continue;
    const centre: Vec2 = sampleAt(field, sumColumn / count, sumRow / count);
    found.push({ kind, x: rounded(centre.x - field.frame.x), z: rounded(centre.z - field.frame.z), length: rounded(length), area: rounded(area), prop: null });
  }
  return found;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function reachFrom(walk: Uint8Array, field: Field, start: Vec2): Uint8Array {
  const reached: Uint8Array = new Uint8Array(walk.length);
  const column: number = Math.floor((start.x - field.origin.x) / GAPS.sample);
  const row: number = Math.floor((start.z - field.origin.z) / GAPS.sample);
  const first: number = row * field.columns + column;
  if (column < 0 || row < 0 || column >= field.columns || row >= field.rows || walk[first] !== 1) return reached;
  reached[first] = 1;
  const queue: number[] = [first];
  while (queue.length > 0) {
    const at: number | undefined = queue.pop();
    if (at === undefined) break;
    const c0: number = at % field.columns;
    const r0: number = Math.floor(at / field.columns);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const c: number = c0 + dc;
      const r: number = r0 + dr;
      if (c < 0 || r < 0 || c >= field.columns || r >= field.rows) continue;
      const next: number = r * field.columns + c;
      if (reached[next] === 1 || walk[next] !== 1) continue;
      reached[next] = 1;
      queue.push(next);
    }
  }
  return reached;
}

interface Placed {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
}

function unexplained(staged: StagedWorld, content: Content, field: Field): GapFinding[] {
  const placed: Placed[] = [...staged.world.zone.props.filter((prop): boolean => prop.when.length === 0), ...shorePlacements(staged.world)];
  return placed.flatMap((at: Placed): GapFinding[] => {
    const def: PropDef | undefined = content.props.get(at.prop);
    if (def === undefined || def.blockRadius <= 0 || def.footprints.length > 0) return [];
    return [{ kind: 'unexplained', x: rounded(at.x - field.frame.x), z: rounded(at.z - field.frame.z), length: rounded(def.blockLength + def.blockRadius * 2), area: rounded(Math.PI * def.blockRadius * def.blockRadius + def.blockLength * def.blockRadius * 2), prop: at.prop }];
  });
}

function extent(def: PropDef): number {
  return Math.max(0, ...def.footprints.flat().map((point: ReadonlyVec2): number => Math.hypot(point.x, point.z)));
}

interface FloorNear {
  readonly any: boolean;
  readonly level: boolean;
}

function floorNear(staged: StagedWorld, at: ReadonlyVec2, base: number, reach: number): FloorNear {
  const grid: NavGrid = staged.world.grid;
  const zone: ZoneDef = staged.world.zone;
  const height: number = heightAt(zone, at.x, at.z) + base;
  const first: number = Math.max(0, Math.floor((at.x - reach) / grid.cellSize));
  const last: number = Math.min(grid.columns - 1, Math.floor((at.x + reach) / grid.cellSize));
  const top: number = Math.max(0, Math.floor((at.z - reach) / grid.cellSize));
  const bottom: number = Math.min(grid.rows - 1, Math.floor((at.z + reach) / grid.cellSize));
  let any: boolean = false;
  for (let row: number = top; row <= bottom; row += 1) {
    for (let column: number = first; column <= last; column += 1) {
      if (staged.reached[row * grid.columns + column] !== 1) continue;
      const centre: Vec2 = { x: (column + 0.5) * grid.cellSize, z: (row + 0.5) * grid.cellSize };
      if (Math.hypot(centre.x - at.x, centre.z - at.z) > reach) continue;
      any = true;
      if (Math.abs(heightAt(zone, centre.x, centre.z) - height) <= GAPS.perchRise) return { any, level: true };
    }
  }
  return { any, level: false };
}

function perched(staged: StagedWorld, content: Content, field: Field): GapFinding[] {
  return staged.world.zone.props.filter((prop): boolean => prop.when.length === 0).flatMap((at): GapFinding[] => {
    const def: PropDef | undefined = content.props.get(at.prop);
    if (def === undefined || def.walkOn || def.height > GAPS.perchTallest || at.y > 0) return [];
    const near: FloorNear = floorNear(staged, at, at.y, GAPS.perchReach + extent(def));
    if (!near.any || near.level) return [];
    return [{ kind: 'perched', x: rounded(at.x - field.frame.x), z: rounded(at.z - field.frame.z), length: rounded(def.height), area: 0, prop: at.prop }];
  });
}

export interface GapAnalysis {
  readonly field: Field;
  readonly pinch: Uint8Array;
  readonly narrow: Uint8Array;
  readonly pocket: Uint8Array;
  readonly findings: readonly GapFinding[];
}

export function zoneGaps(content: Content, zoneId: string): readonly GapFinding[] {
  return analyseGaps(content, stageWorld(content, zoneId)).findings;
}

export function analyseGaps(content: Content, staged: StagedWorld): GapAnalysis {
  const field: Field = fieldOf(staged);
  const solid: Uint8Array = solidField(field, staged, [...staged.world.grid.bodies, ...staged.stamped]);
  const clearance: Float64Array = distanceField(solid, field.columns, field.rows);
  const radius: number = content.player.radius;
  const widest: number = radius + GAPS.margin / 2;
  const body: Uint8Array = opening(clearance, radius, field.columns, field.rows);
  const roomy: Uint8Array = opening(clearance, widest, field.columns, field.rows);
  const count: number = field.columns * field.rows;
  const pinch: Uint8Array = new Uint8Array(count);
  const narrow: Uint8Array = new Uint8Array(count);
  const stand: Uint8Array = new Uint8Array(count);
  for (let index: number = 0; index < count; index += 1) {
    if (solid[index] === 1) continue;
    if ((clearance[index] ?? 0) * GAPS.sample >= radius) stand[index] = 1;
    if (body[index] === 1 && roomy[index] === 1) continue;
    const at: Vec2 = sampleAt(field, index % field.columns, Math.floor(index / field.columns));
    if (!floorAt(staged.world.zone, at.x, at.z)) continue;
    const lane: Uint8Array = body[index] === 1 ? narrow : pinch;
    lane[index] = 1;
  }
  const reached: Uint8Array = reachFrom(stand, field, staged.start);
  const pocket: Uint8Array = stand.map((value: number, index: number): number => (value === 1 && reached[index] !== 1 ? 1 : 0));
  const findings: GapFinding[] = [...components(pinch, field, 'pinch'), ...components(narrow, field, 'narrow'), ...components(pocket, field, 'pocket'), ...unexplained(staged, content, field), ...perched(staged, content, field)];
  return { field, pinch, narrow, pocket, findings };
}
