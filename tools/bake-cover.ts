import type { Accessor, Primitive } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';
import { COVER_REACH, SNUG_COVER_REACH, coveredTriangles, coveredVertices, triangleRanges, withSeams } from './cover-bake.ts';
import type { BodyMesh, CoverReach, TriangleMesh, TriangleRange } from './cover-bake.ts';

interface BakedCover {
  readonly body: string;
  readonly mesh: string;
  readonly wearable: string;
  readonly triangles: number;
  readonly hidden: readonly TriangleRange[];
}

function floats(accessor: Accessor | null, what: string): Float32Array {
  if (accessor === null) throw new Error(`${what} is missing`);
  const values: Float32Array = new Float32Array(accessor.getCount() * 3);
  const element: number[] = [];
  for (let index: number = 0; index < accessor.getCount(); index += 1) {
    accessor.getElement(index, element);
    values.set([element[0] ?? 0, element[1] ?? 0, element[2] ?? 0], index * 3);
  }
  return values;
}

function indices(primitive: Primitive, what: string): Uint32Array {
  const accessor: Accessor | null = primitive.getIndices();
  if (accessor === null) throw new Error(`${what} has no indices`);
  return Uint32Array.from({ length: accessor.getCount() }, (_: unknown, index: number): number => accessor.getScalar(index));
}

interface NamedPrimitive {
  readonly mesh: string;
  readonly primitive: Primitive;
}

async function primitives(io: NodeIO, path: string): Promise<NamedPrimitive[]> {
  const document = await io.read(path);
  return document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives().map((primitive: Primitive): NamedPrimitive => ({ mesh: mesh.getName(), primitive })));
}

function merged(parts: readonly TriangleMesh[]): TriangleMesh {
  let offset: number = 0;
  const positions: number[] = [];
  const corners: number[] = [];
  for (const part of parts) {
    positions.push(...part.positions);
    corners.push(...Array.from(part.indices, (corner: number): number => corner + offset));
    offset += part.positions.length / 3;
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(corners) };
}

const MESH_OPTION: string = 'mesh=';

async function wearableMesh(io: NodeIO, path: string): Promise<TriangleMesh> {
  return merged((await primitives(io, path)).map(({ primitive }: NamedPrimitive): TriangleMesh => ({ positions: floats(primitive.getAttribute('POSITION'), 'wearable POSITION'), indices: indices(primitive, path) })));
}

async function main(): Promise<void> {
  const [bodyPath, wearablePath, outPath, ...options] = process.argv.slice(2);
  const fit: string | undefined = options.find((option: string): boolean => option === 'snug');
  const meshName: string | undefined = options.find((option: string): boolean => option.startsWith(MESH_OPTION))?.slice(MESH_OPTION.length);
  const seamPaths: string[] = options.filter((option: string): boolean => option.endsWith('.glb'));
  if (bodyPath === undefined || wearablePath === undefined || outPath === undefined) throw new Error('usage: bake-cover <body.glb> <wearable.glb> <out.json> [snug] [mesh=<name>] [seam-partner.glb...]');
  await MeshoptDecoder.ready;
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const first: NamedPrimitive | undefined = (await primitives(io, bodyPath)).find((candidate: NamedPrimitive): boolean => meshName === undefined || candidate.mesh === meshName);
  if (first === undefined) throw new Error(`${bodyPath} has no mesh`);
  const skin: Primitive = first.primitive;
  const body: BodyMesh = { positions: floats(skin.getAttribute('POSITION'), 'body POSITION'), normals: floats(skin.getAttribute('NORMAL'), 'body NORMAL'), indices: indices(skin, bodyPath) };
  const cover: TriangleMesh = await wearableMesh(io, wearablePath);
  const reach: CoverReach = fit === 'snug' ? SNUG_COVER_REACH : COVER_REACH;
  const own: boolean[] = coveredVertices(body, cover, reach);
  const partners: TriangleMesh[] = await Promise.all(seamPaths.map((path: string): Promise<TriangleMesh> => wearableMesh(io, path)));
  const joint: boolean[] = partners.length === 0 ? own : coveredVertices(body, merged([cover, ...partners]), reach);
  const hidden: boolean[] = withSeams(body, coveredTriangles(body, own, reach), coveredTriangles(body, joint, reach), own);
  const baked: BakedCover = { body: bodyPath.replace(/^.*public\//, ''), mesh: first.mesh, wearable: wearablePath.replace(/^.*public\//, ''), triangles: hidden.length, hidden: triangleRanges(hidden) };
  writeFileSync(outPath, `${JSON.stringify(baked)}\n`);
  process.stdout.write(`${outPath}: ${hidden.filter(Boolean).length} of ${hidden.length} triangles hidden in ${baked.hidden.length} ranges\n`);
}

await main();
