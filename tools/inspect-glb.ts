import { readFileSync } from 'node:fs';

interface GltfAccessor {
  readonly min: readonly number[] | undefined;
  readonly max: readonly number[] | undefined;
}

interface GltfNode {
  readonly name: string | undefined;
  readonly mesh: number | undefined;
  readonly skin: number | undefined;
}

interface GltfMesh {
  readonly name: string | undefined;
  readonly position: number | undefined;
}

interface GltfAnimation {
  readonly name: string | undefined;
  readonly input: number | undefined;
}

interface GltfDocument {
  readonly nodes: readonly GltfNode[];
  readonly meshes: readonly GltfMesh[];
  readonly animations: readonly GltfAnimation[];
  readonly accessors: readonly GltfAccessor[];
  readonly materials: readonly (string | undefined)[];
}

type Fields = Readonly<Record<string, unknown>>;

const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listOf(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) return [];
  const list: readonly unknown[] = value;
  return list;
}

function entriesOf(source: Fields, key: string): readonly Fields[] {
  return listOf(source[key]).filter(isFields);
}

function textOf(source: Fields, key: string): string | undefined {
  const value: unknown = source[key];
  return typeof value === 'string' ? value : undefined;
}

function indexOf(source: Fields, key: string): number | undefined {
  const value: unknown = source[key];
  return typeof value === 'number' ? value : undefined;
}

function numbersOf(source: Fields, key: string): readonly number[] | undefined {
  const value: unknown = source[key];
  if (!Array.isArray(value)) return undefined;
  const list: readonly unknown[] = value;
  return list.filter((entry: unknown): entry is number => typeof entry === 'number');
}

function positionOf(mesh: Fields): number | undefined {
  const primitive: Fields | undefined = entriesOf(mesh, 'primitives')[0];
  if (primitive === undefined) return undefined;
  const attributes: unknown = primitive['attributes'];
  return isFields(attributes) ? indexOf(attributes, 'POSITION') : undefined;
}

function inputOf(animation: Fields): number | undefined {
  const sampler: Fields | undefined = entriesOf(animation, 'samplers')[0];
  return sampler === undefined ? undefined : indexOf(sampler, 'input');
}

function toDocument(parsed: unknown): GltfDocument {
  const source: Fields = isFields(parsed) ? parsed : {};
  return {
    nodes: entriesOf(source, 'nodes').map((node: Fields): GltfNode => ({ name: textOf(node, 'name'), mesh: indexOf(node, 'mesh'), skin: indexOf(node, 'skin') })),
    meshes: entriesOf(source, 'meshes').map((mesh: Fields): GltfMesh => ({ name: textOf(mesh, 'name'), position: positionOf(mesh) })),
    animations: entriesOf(source, 'animations').map((animation: Fields): GltfAnimation => ({ name: textOf(animation, 'name'), input: inputOf(animation) })),
    accessors: entriesOf(source, 'accessors').map((accessor: Fields): GltfAccessor => ({ min: numbersOf(accessor, 'min'), max: numbersOf(accessor, 'max') })),
    materials: entriesOf(source, 'materials').map((material: Fields): string | undefined => textOf(material, 'name')),
  };
}

function readDocument(path: string): GltfDocument {
  const buffer = readFileSync(path);
  const jsonLength = buffer.readUInt32LE(GLB_HEADER_BYTES);
  const start = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES;
  const parsed: unknown = JSON.parse(buffer.subarray(start, start + jsonLength).toString('utf8'));
  return toDocument(parsed);
}

function format(values: readonly number[] | undefined): string {
  return (values ?? []).map((value: number): string => value.toFixed(2)).join(',');
}

function describe(path: string): void {
  const doc = readDocument(path);
  console.log(`# ${path}`);
  for (const mesh of doc.meshes) {
    const accessor = mesh.position === undefined ? undefined : doc.accessors[mesh.position];
    console.log(`mesh ${mesh.name ?? '?'} min[${format(accessor?.min)}] max[${format(accessor?.max)}]`);
  }
  const meshNodes = doc.nodes.filter((node: GltfNode): boolean => node.mesh !== undefined).map((node: GltfNode): string => `${node.name ?? '?'}${node.skin === undefined ? '' : '*'}`);
  console.log(`mesh nodes (* skinned): ${meshNodes.join(' ')}`);
  console.log(`materials: ${doc.materials.map((name: string | undefined): string => name ?? '?').join(' ')}`);
  for (const animation of doc.animations) {
    const duration = animation.input === undefined ? undefined : doc.accessors[animation.input]?.max?.[0];
    console.log(`clip ${animation.name ?? '?'} ${duration === undefined ? '?' : duration.toFixed(2)}s`);
  }
}

for (const path of process.argv.slice(2)) describe(path);
