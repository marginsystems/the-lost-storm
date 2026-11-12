import { readFileSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import type { Accessor, Document, Node, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { convexHull, simplifyOutline } from '../sim/nav/outline.ts';
import type { ReadonlyVec2 } from '../sim/math.ts';
import { fields, items, text } from '../sim/content/read.ts';

export const FOOTPRINT_TOOL = {
  bodyHeight: 1.5,
  floorSlack: 0.5,
  most: 12,
  places: 100,
  out: 'data/footprints.json',
} as const;

interface Measured {
  readonly height: number;
  readonly outline: readonly ReadonlyVec2[];
}

type Matrix = readonly number[];

function transformPoint(matrix: Matrix, x: number, y: number, z: number): readonly [number, number, number] {
  const at = (index: number): number => matrix[index] ?? 0;
  return [at(0) * x + at(4) * y + at(8) * z + at(12), at(1) * x + at(5) * y + at(9) * z + at(13), at(2) * x + at(6) * y + at(10) * z + at(14)];
}

function rounded(value: number): number {
  return Math.round(value * FOOTPRINT_TOOL.places) / FOOTPRINT_TOOL.places;
}

function measure(document: Document): Measured | null {
  const points: [number, number, number][] = [];
  const element: number[] = [0, 0, 0];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh === null) continue;
    const matrix: Matrix = (node satisfies Node).getWorldMatrix();
    for (const primitive of mesh.listPrimitives() satisfies Primitive[]) {
      const position: Accessor | null = primitive.getAttribute('POSITION');
      if (position === null) continue;
      for (let index: number = 0; index < position.getCount(); index += 1) {
        position.getElement(index, element);
        points.push([...transformPoint(matrix, element[0] ?? 0, element[1] ?? 0, element[2] ?? 0)]);
      }
    }
  }
  if (points.length === 0) return null;
  const floor: number = Math.min(...points.map((point: readonly number[]): number => point[1] ?? 0));
  const top: number = Math.max(...points.map((point: readonly number[]): number => point[1] ?? 0));
  const low: ReadonlyVec2[] = points
    .filter((point: readonly number[]): boolean => (point[1] ?? 0) <= Math.max(0, floor) + FOOTPRINT_TOOL.bodyHeight && (point[1] ?? 0) >= floor - FOOTPRINT_TOOL.floorSlack)
    .map((point: readonly number[]): ReadonlyVec2 => ({ x: point[0] ?? 0, z: point[2] ?? 0 }));
  const outline: readonly ReadonlyVec2[] = simplifyOutline(convexHull(low), FOOTPRINT_TOOL.most).map((point: ReadonlyVec2): ReadonlyVec2 => ({ x: rounded(point.x), z: rounded(point.z) }));
  return { height: rounded(top - Math.max(0, floor)), outline };
}

async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const props: readonly unknown[] = items(JSON.parse(readFileSync('data/props.json', 'utf8')), 'props');
  const models: string[] = [...new Set<string>(props.map((prop: unknown, index: number): string => text(fields(prop, `props[${index}]`), 'model', `props[${index}]`)))].toSorted();
  const measured: (Measured | null)[] = await Promise.all(models.map(async (model: string): Promise<Measured | null> => measure(await io.read(`public/${model}`))));
  const result: Record<string, { height: number; outline: number[][] }> = {};
  models.forEach((model: string, index: number): void => {
    const entry: Measured | null | undefined = measured[index];
    if (entry === null || entry === undefined) return;
    result[model] = { height: entry.height, outline: entry.outline.map((point: ReadonlyVec2): number[] => [point.x, point.z]) };
  });
  const lines: string[] = Object.entries(result).map(([model, entry]): string => `  ${JSON.stringify(model)}: ${JSON.stringify(entry)}`);
  writeFileSync(FOOTPRINT_TOOL.out, `{\n${lines.join(',\n')}\n}\n`);
}

await main();
