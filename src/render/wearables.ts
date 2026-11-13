import type { Bone, InterleavedBufferAttribute, Object3D, Skeleton } from 'three';
import { BufferAttribute, BufferGeometry, PropertyBinding, SkinnedMesh } from 'three';
import type { BodyGroup } from './body-covers.ts';

type Attribute = BufferAttribute | InterleavedBufferAttribute;

export const WEARABLES = {
  influences: 4,
  wideIndexFrom: 65536,
} as const;

function isSkinned(object: Object3D): object is SkinnedMesh {
  return object instanceof SkinnedMesh;
}

export function skinnedMeshes(root: Object3D): SkinnedMesh[] {
  const found: SkinnedMesh[] = [];
  root.traverse((object: Object3D): void => {
    if (isSkinned(object)) found.push(object);
  });
  return found;
}

function component(attribute: Attribute, vertex: number, slot: number): number {
  return attribute.getComponent(vertex, slot);
}

export function groupByCovers(geometry: BufferGeometry, triangleCovers: readonly (readonly string[])[]): readonly (readonly string[])[] {
  const index: BufferAttribute | null = geometry.getIndex();
  if (index === null || triangleCovers.every((covers: readonly string[]): boolean => covers.length === 0)) return [];
  const buckets: Map<string, { readonly covers: readonly string[]; readonly corners: number[] }> = new Map<string, { readonly covers: readonly string[]; readonly corners: number[] }>([['', { covers: [], corners: [] }]]);
  for (let corner: number = 0; corner + 2 < index.count; corner += 3) {
    const covers: readonly string[] = triangleCovers[corner / 3] ?? [];
    const key: string = covers.join(',');
    const bucket: { readonly covers: readonly string[]; readonly corners: number[] } = buckets.get(key) ?? { covers: [...covers], corners: [] };
    bucket.corners.push(index.getX(corner), index.getX(corner + 1), index.getX(corner + 2));
    buckets.set(key, bucket);
  }
  const ordered: readonly { readonly covers: readonly string[]; readonly corners: number[] }[] = [...buckets.values()];
  const flat: number[] = ordered.flatMap((bucket: { readonly covers: readonly string[]; readonly corners: number[] }): number[] => bucket.corners);
  const vertices: number = geometry.getAttribute('position').count;
  geometry.setIndex(new BufferAttribute(vertices >= WEARABLES.wideIndexFrom ? new Uint32Array(flat) : new Uint16Array(flat), 1));
  geometry.clearGroups();
  let start: number = 0;
  ordered.forEach((bucket: { readonly covers: readonly string[]; readonly corners: number[] }, materialIndex: number): void => {
    geometry.addGroup(start, bucket.corners.length, materialIndex);
    start += bucket.corners.length;
  });
  return ordered.map((bucket: { readonly covers: readonly string[]; readonly corners: number[] }): readonly string[] => bucket.covers);
}

function sharing(source: BufferGeometry): BufferGeometry {
  const copy: BufferGeometry = new BufferGeometry();
  for (const name of Object.keys(source.attributes)) copy.setAttribute(name, source.getAttribute(name));
  copy.setIndex(source.getIndex());
  copy.boundingBox = source.boundingBox;
  copy.boundingSphere = source.boundingSphere;
  return copy;
}

export function fitToSkeleton(piece: SkinnedMesh, body: Skeleton, label: string): BufferGeometry {
  const indexOfBone: Map<string, number> = new Map<string, number>(body.bones.map((bone: Bone, index: number): [string, number] => [bone.name, index]));
  const remap: number[] = piece.skeleton.bones.map((bone: Bone): number => indexOfBone.get(bone.name) ?? -1);
  const joints: Attribute = piece.geometry.getAttribute('skinIndex');
  const weights: Attribute = piece.geometry.getAttribute('skinWeight');
  const fitted: Uint16Array = new Uint16Array(joints.count * WEARABLES.influences);
  for (let vertex: number = 0; vertex < joints.count; vertex += 1) {
    for (let slot: number = 0; slot < WEARABLES.influences; slot += 1) {
      const from: number = component(joints, vertex, slot);
      const to: number = remap[from] ?? -1;
      if (to >= 0) {
        fitted[vertex * WEARABLES.influences + slot] = to;
        continue;
      }
      if (component(weights, vertex, slot) > 0) throw new Error(`${label} is skinned to joint "${piece.skeleton.bones[from]?.name ?? String(from)}", which the wearer's skeleton does not have`);
    }
  }
  const geometry: BufferGeometry = sharing(piece.geometry);
  geometry.setAttribute('skinIndex', new BufferAttribute(fitted, WEARABLES.influences));
  return geometry;
}

function partOfVertex(mesh: SkinnedMesh, partOfBone: readonly number[], partCount: number): Int16Array {
  const joints: Attribute = mesh.geometry.getAttribute('skinIndex');
  const weights: Attribute = mesh.geometry.getAttribute('skinWeight');
  const parts: Int16Array = new Int16Array(joints.count).fill(-1);
  const share: number[] = Array.from({ length: partCount }, (): number => 0);
  for (let vertex: number = 0; vertex < joints.count; vertex += 1) {
    share.fill(0);
    let total: number = 0;
    for (let slot: number = 0; slot < WEARABLES.influences; slot += 1) {
      const weight: number = component(weights, vertex, slot);
      const part: number = partOfBone[component(joints, vertex, slot)] ?? -1;
      total += weight;
      if (part >= 0) share[part] = (share[part] ?? 0) + weight;
    }
    let best: number = -1;
    let owned: number = 0;
    for (let part: number = 0; part < partCount; part += 1) {
      const held: number = share[part] ?? 0;
      owned += held;
      if (held > (share[best] ?? 0)) best = part;
    }
    if (best >= 0 && (share[best] ?? 0) > total - owned) parts[vertex] = best;
  }
  return parts;
}

export function partMasks(partCount: number): number {
  return 2 ** partCount;
}

export function cornerMask(cornerParts: readonly number[]): number {
  if (cornerParts.some((part: number): boolean => part < 0)) return 0;
  return cornerParts.reduce((mask: number, part: number): number => mask | (1 << part), 0);
}

export function maskHidden(mask: number, names: readonly string[], hidden: readonly string[]): boolean {
  if (mask === 0) return false;
  return names.every((name: string, part: number): boolean => (mask & (1 << part)) === 0 || hidden.includes(name));
}

export interface BodyGrouping {
  readonly names: readonly string[];
  readonly groups: readonly BodyGroup[];
}

interface Bucket {
  readonly group: BodyGroup;
  readonly corners: number[];
}

export interface BodyGroupings {
  readonly names: readonly string[];
  readonly groups: ReadonlyMap<string, readonly BodyGroup[]>;
}

export function groupBodies(meshes: readonly SkinnedMesh[], bodyParts: Readonly<Record<string, readonly string[]>>, coversFor: (mesh: SkinnedMesh) => readonly (readonly string[])[]): BodyGroupings {
  let names: readonly string[] = [];
  const groups: Map<string, readonly BodyGroup[]> = new Map<string, readonly BodyGroup[]>();
  for (const mesh of meshes) {
    const grouped: BodyGrouping = groupBodyParts(mesh, bodyParts, coversFor(mesh));
    if (grouped.names.length === 0) continue;
    names = grouped.names;
    groups.set(mesh.name, grouped.groups);
  }
  return { names, groups };
}

export function groupBodyParts(mesh: SkinnedMesh, bodyParts: Readonly<Record<string, readonly string[]>>, triangleCovers: readonly (readonly string[])[] = []): BodyGrouping {
  const names: string[] = Object.keys(bodyParts);
  const index: BufferAttribute | null = mesh.geometry.getIndex();
  if (names.length === 0 || index === null || Array.isArray(mesh.material)) return { names: [], groups: [] };
  const partOfBone: number[] = mesh.skeleton.bones.map((bone: Bone): number =>
    names.findIndex((name: string): boolean => (bodyParts[name] ?? []).some((joint: string): boolean => PropertyBinding.sanitizeNodeName(joint) === bone.name || joint === bone.name)),
  );
  const vertexPart: Int16Array = partOfVertex(mesh, partOfBone, names.length);
  const buckets: Map<string, Bucket> = new Map<string, Bucket>();
  for (let mask: number = 0; mask < partMasks(names.length); mask += 1) buckets.set(`${String(mask)}|`, { group: { mask, covers: [] }, corners: [] });
  for (let corner: number = 0; corner + 2 < index.count; corner += 3) {
    const corners: [number, number, number] = [index.getX(corner), index.getX(corner + 1), index.getX(corner + 2)];
    const mask: number = cornerMask(corners.map((vertex: number): number => vertexPart[vertex] ?? -1));
    const covers: readonly string[] = triangleCovers[corner / 3] ?? [];
    const key: string = `${String(mask)}|${covers.join(',')}`;
    const bucket: Bucket = buckets.get(key) ?? { group: { mask, covers: [...covers] }, corners: [] };
    bucket.corners.push(...corners);
    buckets.set(key, bucket);
  }
  const ordered: readonly Bucket[] = [...buckets.values()];
  const vertices: number = mesh.geometry.getAttribute('position').count;
  const flat: number[] = ordered.flatMap((bucket: Bucket): number[] => bucket.corners);
  const geometry: BufferGeometry = sharing(mesh.geometry);
  geometry.setIndex(new BufferAttribute(vertices >= WEARABLES.wideIndexFrom ? new Uint32Array(flat) : new Uint16Array(flat), 1));
  let start: number = 0;
  ordered.forEach((bucket: Bucket, materialIndex: number): void => {
    if (bucket.corners.length > 0) geometry.addGroup(start, bucket.corners.length, materialIndex);
    start += bucket.corners.length;
  });
  mesh.geometry = geometry;
  return { names, groups: ordered.map((bucket: Bucket): BodyGroup => bucket.group) };
}
