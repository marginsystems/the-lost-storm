import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import type { Accessor, Document, Node, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { convexHull, simplifyOutline } from '../sim/nav/outline.ts';
import type { ReadonlyVec2 } from '../sim/math.ts';
import { outlineArea } from '../sim/content/footprints.ts';
import { fields, items, numeric, text } from '../sim/content/read.ts';

export const FOOTPRINT_TOOL = {
  bodyHeight: 2.2,
  bodyRadius: 0.5,
  skirt: 0.05,
  cell: 0.05,
  least: 0.02,
  concave: 1.6,
  splitFrom: 1,
  depth: 3,
  pieces: 10,
  most: 8,
  places: 100,
  out: 'data/footprints.json',
} as const;

interface Measured {
  readonly height: number;
  readonly outlines: readonly (readonly ReadonlyVec2[])[];
}

type Matrix = readonly number[];
type Point = readonly [number, number, number];

function transformPoint(matrix: Matrix, x: number, y: number, z: number): Point {
  const at = (index: number): number => matrix[index] ?? 0;
  return [at(0) * x + at(4) * y + at(8) * z + at(12), at(1) * x + at(5) * y + at(9) * z + at(13), at(2) * x + at(6) * y + at(10) * z + at(14)];
}

function rounded(value: number): number {
  return Math.round(value * FOOTPRINT_TOOL.places) / FOOTPRINT_TOOL.places;
}

function triangles(document: Document): Point[][] {
  const found: Point[][] = [];
  const element: number[] = [0, 0, 0];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh === null) continue;
    const matrix: Matrix = (node satisfies Node).getWorldMatrix();
    for (const primitive of mesh.listPrimitives() satisfies Primitive[]) {
      const position: Accessor | null = primitive.getAttribute('POSITION');
      if (position === null) continue;
      const points: Point[] = [];
      for (let index: number = 0; index < position.getCount(); index += 1) {
        position.getElement(index, element);
        points.push(transformPoint(matrix, element[0] ?? 0, element[1] ?? 0, element[2] ?? 0));
      }
      const indices: Accessor | null = primitive.getIndices();
      const order: number[] = indices === null ? points.map((_point: Point, index: number): number => index) : Array.from({ length: indices.getCount() }, (_value: unknown, index: number): number => indices.getScalar(index));
      for (let index: number = 0; index + 2 < order.length; index += 3) {
        const a: Point | undefined = points[order[index] ?? -1];
        const b: Point | undefined = points[order[index + 1] ?? -1];
        const c: Point | undefined = points[order[index + 2] ?? -1];
        if (a !== undefined && b !== undefined && c !== undefined) found.push([a, b, c]);
      }
    }
  }
  return found;
}

class Occupancy {
  readonly cells: Set<string> = new Set<string>();
  readonly size: number;
  constructor(size: number) {
    this.size = size;
  }
  key(column: number, row: number): string {
    return `${column},${row}`;
  }
  mark(x: number, z: number): void {
    this.cells.add(this.key(Math.floor(x / this.size), Math.floor(z / this.size)));
  }
  fill(a: Point, b: Point, c: Point, low: number, high: number): void {
    const steps: number = Math.max(1, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[2] - a[2]), Math.hypot(c[0] - a[0], c[2] - a[2]), Math.hypot(c[0] - b[0], c[2] - b[2])) / (this.size / 2)));
    for (let i: number = 0; i <= steps; i += 1) {
      for (let j: number = 0; j <= steps - i; j += 1) {
        const u: number = i / steps;
        const v: number = j / steps;
        const y: number = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
        if (y >= low && y <= high) this.mark(a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v);
      }
    }
  }
  patches(): [number, number][][] {
    const seen: Set<string> = new Set<string>();
    const found: [number, number][][] = [];
    for (const start of this.cells) {
      if (seen.has(start)) continue;
      seen.add(start);
      const patch: [number, number][] = [];
      const queue: string[] = [start];
      while (queue.length > 0) {
        const current: string | undefined = queue.pop();
        if (current === undefined) break;
        const [column, row] = current.split(',').map(Number);
        if (column === undefined || row === undefined) continue;
        patch.push([column, row]);
        for (let dc: number = -1; dc <= 1; dc += 1) {
          for (let dr: number = -1; dr <= 1; dr += 1) {
            const next: string = this.key(column + dc, row + dr);
            if (this.cells.has(next) && !seen.has(next)) {
              seen.add(next);
              queue.push(next);
            }
          }
        }
      }
      found.push(patch);
    }
    return found;
  }
}

function distances(width: number, height: number, seeds: Uint8Array): Float32Array {
  const far: Float32Array = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY);
  seeds.forEach((seed: number, index: number): void => {
    if (seed === 1) far[index] = 0;
  });
  const reach = (index: number, column: number, row: number, dc: number, dr: number): void => {
    const nextColumn: number = column + dc;
    const nextRow: number = row + dr;
    if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) return;
    far[index] = Math.min(far[index] ?? 0, (far[nextRow * width + nextColumn] ?? 0) + Math.hypot(dc, dr));
  };
  for (let row: number = 0; row < height; row += 1) {
    for (let column: number = 0; column < width; column += 1) {
      const index: number = row * width + column;
      reach(index, column, row, -1, 0);
      reach(index, column, row, 0, -1);
      reach(index, column, row, -1, -1);
      reach(index, column, row, 1, -1);
    }
  }
  for (let row: number = height - 1; row >= 0; row -= 1) {
    for (let column: number = width - 1; column >= 0; column -= 1) {
      const index: number = row * width + column;
      reach(index, column, row, 1, 0);
      reach(index, column, row, 0, 1);
      reach(index, column, row, 1, 1);
      reach(index, column, row, -1, 1);
    }
  }
  return far;
}

function outOfReach(cells: ReadonlySet<string>, reachCells: number): [number, number][] {
  const listed: [number, number][] = [...cells].map((key: string): [number, number] => {
    const [column, row] = key.split(',').map(Number);
    return [column ?? 0, row ?? 0];
  });
  if (listed.length === 0) return listed;
  const margin: number = Math.ceil(reachCells) + 2;
  const left: number = Math.min(...listed.map(([column]: [number, number]): number => column)) - margin;
  const top: number = Math.min(...listed.map(([, row]: [number, number]): number => row)) - margin;
  const width: number = Math.max(...listed.map(([column]: [number, number]): number => column)) - left + margin + 1;
  const height: number = Math.max(...listed.map(([, row]: [number, number]): number => row)) - top + margin + 1;
  const solid: Uint8Array = new Uint8Array(width * height);
  for (const [column, row] of listed) solid[(row - top) * width + (column - left)] = 1;
  const fromSolid: Float32Array = distances(width, height, solid);
  const outside: Uint8Array = new Uint8Array(width * height);
  const queue: number[] = [0];
  outside[0] = 1;
  while (queue.length > 0) {
    const current: number | undefined = queue.pop();
    if (current === undefined) break;
    const column: number = current % width;
    const row: number = Math.floor(current / width);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nextColumn: number = column + dc;
      const nextRow: number = row + dr;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= width || nextRow >= height) continue;
      const next: number = nextRow * width + nextColumn;
      if (outside[next] === 1 || (fromSolid[next] ?? 0) <= reachCells) continue;
      outside[next] = 1;
      queue.push(next);
    }
  }
  const fromOutside: Float32Array = distances(width, height, outside);
  const kept: [number, number][] = [];
  fromOutside.forEach((gap: number, index: number): void => {
    if (gap > reachCells) kept.push([(index % width) + left, Math.floor(index / width) + top]);
  });
  return kept;
}

function corners(patch: readonly (readonly [number, number])[], size: number): ReadonlyVec2[] {
  return patch.flatMap(([column, row]: readonly [number, number]): ReadonlyVec2[] => [
    { x: column * size, z: row * size },
    { x: (column + 1) * size, z: row * size },
    { x: column * size, z: (row + 1) * size },
    { x: (column + 1) * size, z: (row + 1) * size },
  ]);
}

function hulls(patch: readonly (readonly [number, number])[], size: number, scale: number, depth: number): ReadonlyVec2[][] {
  const hull: ReadonlyVec2[] = convexHull(corners(patch, size));
  const filled: number = patch.length * size * size;
  const columns: number[] = patch.map(([column]: readonly [number, number]): number => column);
  const rows: number[] = patch.map(([, row]: readonly [number, number]): number => row);
  const wide: number = (Math.max(...columns) - Math.min(...columns) + 1) * size;
  const deep: number = (Math.max(...rows) - Math.min(...rows) + 1) * size;
  if (depth <= 0 || outlineArea(hull) <= filled * FOOTPRINT_TOOL.concave || Math.max(wide, deep) * scale < FOOTPRINT_TOOL.splitFrom) return [hull];
  const byColumn: boolean = wide >= deep;
  const values: number[] = (byColumn ? columns : rows).toSorted((a: number, b: number): number => a - b);
  const middle: number = values[Math.floor(values.length / 2)] ?? 0;
  const first: [number, number][] = patch.filter(([column, row]: readonly [number, number]): boolean => (byColumn ? column : row) < middle).map(([column, row]: readonly [number, number]): [number, number] => [column, row]);
  const second: [number, number][] = patch.filter(([column, row]: readonly [number, number]): boolean => (byColumn ? column : row) >= middle).map(([column, row]: readonly [number, number]): [number, number] => [column, row]);
  if (first.length === 0 || second.length === 0) return [hull];
  return [...hulls(first, size, scale, depth - 1), ...hulls(second, size, scale, depth - 1)];
}

function measure(document: Document, scale: number, reachScale: number): Measured | null {
  const found: Point[][] = triangles(document);
  if (found.length === 0) return null;
  const heights: number[] = found.flatMap((triangle: Point[]): number[] => triangle.map((point: Point): number => point[1]));
  const floor: number = Math.min(...heights);
  const top: number = Math.max(...heights);
  const ground: number = Math.max(0, floor);
  const ceiling: number = ground + FOOTPRINT_TOOL.bodyHeight / scale;
  const skirt: number = ground + FOOTPRINT_TOOL.skirt / scale;
  const size: number = FOOTPRINT_TOOL.cell / scale;
  const occupancy: Occupancy = new Occupancy(size);
  for (const [a, b, c] of found) {
    if (a === undefined || b === undefined || c === undefined) continue;
    if (Math.min(a[1], b[1], c[1]) > ceiling || Math.max(a[1], b[1], c[1]) < skirt) continue;
    occupancy.fill(a, b, c, skirt, ceiling);
  }
  const filled: Occupancy = new Occupancy(size);
  for (const [column, row] of outOfReach(occupancy.cells, FOOTPRINT_TOOL.bodyRadius / reachScale / size)) filled.cells.add(filled.key(column, row));
  const pieces: ReadonlyVec2[][] = filled
    .patches()
    .filter((patch: [number, number][]): boolean => patch.length * size * size * scale * scale >= FOOTPRINT_TOOL.least)
    .flatMap((patch: [number, number][]): ReadonlyVec2[][] => hulls(patch, size, scale, FOOTPRINT_TOOL.depth))
    .toSorted((a: ReadonlyVec2[], b: ReadonlyVec2[]): number => outlineArea(b) - outlineArea(a));
  const kept: ReadonlyVec2[][] = pieces.slice(0, FOOTPRINT_TOOL.pieces - 1);
  const rest: ReadonlyVec2[] = pieces.slice(FOOTPRINT_TOOL.pieces - 1).flat();
  if (rest.length >= 3) kept.push(convexHull(rest));
  const outlines: ReadonlyVec2[][] = kept.map((hull: ReadonlyVec2[]): ReadonlyVec2[] => simplifyOutline(hull, FOOTPRINT_TOOL.most).map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: rounded(point.x), z: rounded(point.z) })));
  return { height: rounded(top - Math.max(0, floor)), outlines };
}

async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const props: readonly unknown[] = items(JSON.parse(readFileSync('data/props.json', 'utf8')), 'props');
  const smallest: Map<string, number> = new Map<string, number>();
  const largest: Map<string, number> = new Map<string, number>();
  props.forEach((prop: unknown, index: number): void => {
    const source: Record<string, unknown> = fields(prop, `props[${index}]`);
    const model: string = text(source, 'model', `props[${index}]`);
    const scale: number = numeric(source, 'scale', `props[${index}]`);
    smallest.set(model, Math.min(smallest.get(model) ?? scale, scale));
    largest.set(model, Math.max(largest.get(model) ?? scale, scale));
  });
  const models: string[] = [...smallest.keys()].toSorted();
  const measured: (Measured | null)[] = await Promise.all(models.map(async (model: string): Promise<Measured | null> => measure(await io.read(`public/${model}`), smallest.get(model) ?? 1, largest.get(model) ?? 1)));
  const result: Record<string, { height: number; outlines: number[][][] }> = {};
  models.forEach((model: string, index: number): void => {
    const entry: Measured | null | undefined = measured[index];
    if (entry === null || entry === undefined || entry.outlines.length === 0) return;
    result[model] = { height: entry.height, outlines: entry.outlines.map((outline: readonly ReadonlyVec2[]): number[][] => outline.map((point: ReadonlyVec2): number[] => [point.x, point.z])) };
  });
  const lines: string[] = Object.entries(result).map(([model, entry]): string => `  ${JSON.stringify(model)}: ${JSON.stringify(entry)}`);
  writeFileSync(FOOTPRINT_TOOL.out, `{\n${lines.join(',\n')}\n}\n`);
}

await main();
