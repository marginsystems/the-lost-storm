import type { Bone, InterleavedBufferAttribute, Object3D, Skeleton } from 'three';
import { BufferAttribute, BufferGeometry, PropertyBinding, SkinnedMesh } from 'three';

type Attribute = BufferAttribute | InterleavedBufferAttribute;

export const WEARABLES = {
  influences: 4,
  partVotes: 2,
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

export function groupBodyParts(mesh: SkinnedMesh, bodyParts: Readonly<Record<string, readonly string[]>>): string[] {
  const names: string[] = Object.keys(bodyParts);
  const index: BufferAttribute | null = mesh.geometry.getIndex();
  if (names.length === 0 || index === null || Array.isArray(mesh.material)) return [];
  const partOfBone: number[] = mesh.skeleton.bones.map((bone: Bone): number =>
    names.findIndex((name: string): boolean => (bodyParts[name] ?? []).some((joint: string): boolean => PropertyBinding.sanitizeNodeName(joint) === bone.name || joint === bone.name)),
  );
  const vertexPart: Int16Array = partOfVertex(mesh, partOfBone, names.length);
  const buckets: number[][] = Array.from({ length: names.length + 1 }, (): number[] => []);
  for (let corner: number = 0; corner + 2 < index.count; corner += 3) {
    const corners: [number, number, number] = [index.getX(corner), index.getX(corner + 1), index.getX(corner + 2)];
    let bucket: number = 0;
    for (let part: number = 0; part < names.length; part += 1) {
      const votes: number = corners.filter((vertex: number): boolean => vertexPart[vertex] === part).length;
      if (votes >= WEARABLES.partVotes) bucket = part + 1;
    }
    buckets[bucket]?.push(...corners);
  }
  const ordered: number[] = buckets.flat();
  const vertices: number = mesh.geometry.getAttribute('position').count;
  const geometry: BufferGeometry = sharing(mesh.geometry);
  geometry.setIndex(new BufferAttribute(vertices >= WEARABLES.wideIndexFrom ? new Uint32Array(ordered) : new Uint16Array(ordered), 1));
  let start: number = 0;
  buckets.forEach((bucket: number[], materialIndex: number): void => {
    if (bucket.length > 0) geometry.addGroup(start, bucket.length, materialIndex);
    start += bucket.length;
  });
  mesh.geometry = geometry;
  return names;
}
