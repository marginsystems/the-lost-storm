import type { BufferAttribute, BufferGeometry, Intersection, Material, Object3D, Raycaster } from 'three';
import { BackSide, Box3, FrontSide, InterleavedBufferAttribute, Matrix4, Mesh, Ray, SkinnedMesh, Vector3 } from 'three';

export const TRIANGLE_TREE = {
  leafSize: 8,
} as const;

interface TreeNode {
  readonly box: Box3;
  readonly start: number;
  readonly end: number;
  readonly left: TreeNode | null;
  readonly right: TreeNode | null;
}

interface TriangleTree {
  readonly root: TreeNode;
  readonly order: Uint32Array;
  readonly corners: Uint32Array;
  readonly groups: Int32Array;
  readonly position: BufferAttribute | InterleavedBufferAttribute;
  readonly positionVersion: number;
  readonly index: BufferAttribute | null;
  readonly indexVersion: number;
  readonly drawStart: number;
  readonly drawCount: number;
  readonly groupCount: number;
}

const singleTrees: WeakMap<BufferGeometry, TriangleTree> = new WeakMap<BufferGeometry, TriangleTree>();
const groupedTrees: WeakMap<BufferGeometry, TriangleTree> = new WeakMap<BufferGeometry, TriangleTree>();
const corner: Vector3 = new Vector3();
const pointA: Vector3 = new Vector3();
const pointB: Vector3 = new Vector3();
const pointC: Vector3 = new Vector3();
const crossing: Vector3 = new Vector3();
const crossingWorld: Vector3 = new Vector3();
const inverse: Matrix4 = new Matrix4();
const localRay: Ray = new Ray();
const pending: TreeNode[] = [];

function positionOf(geometry: BufferGeometry): BufferAttribute | InterleavedBufferAttribute | undefined {
  const position: BufferAttribute | InterleavedBufferAttribute | undefined = geometry.attributes['position'];
  return position;
}

function versionOf(attribute: BufferAttribute | InterleavedBufferAttribute): number {
  return attribute instanceof InterleavedBufferAttribute ? attribute.data.version : attribute.version;
}

function current(tree: TriangleTree, geometry: BufferGeometry, position: BufferAttribute | InterleavedBufferAttribute): boolean {
  return tree.position === position && tree.positionVersion === versionOf(position) && tree.index === geometry.index && tree.indexVersion === (geometry.index?.version ?? -1) && tree.drawStart === geometry.drawRange.start && tree.drawCount === geometry.drawRange.count && tree.groupCount === geometry.groups.length;
}

function listTriangles(geometry: BufferGeometry, count: number, grouped: boolean, corners: number[], groups: number[]): void {
  const index: BufferAttribute | null = geometry.index;
  const draw: { readonly start: number; readonly count: number } = geometry.drawRange;
  const add = (from: number, to: number, group: number): void => {
    for (let at: number = from; at < to; at += 3) {
      corners.push(index === null ? at : index.getX(at), index === null ? at + 1 : index.getX(at + 1), index === null ? at + 2 : index.getX(at + 2));
      groups.push(group);
    }
  };
  if (!grouped) {
    add(Math.max(0, draw.start), Math.min(count, draw.start + draw.count), -1);
    return;
  }
  for (const group of geometry.groups) add(Math.max(group.start, draw.start), Math.min(count, Math.min(group.start + group.count, draw.start + draw.count)), group.materialIndex ?? 0);
}

function buildNode(position: BufferAttribute | InterleavedBufferAttribute, tree: { readonly order: Uint32Array; readonly corners: Uint32Array; readonly centres: Float64Array }, start: number, end: number): TreeNode {
  const box: Box3 = new Box3();
  const spread: Box3 = new Box3();
  for (let at: number = start; at < end; at += 1) {
    const triangle: number = tree.order[at] ?? 0;
    for (let side: number = 0; side < 3; side += 1) box.expandByPoint(corner.fromBufferAttribute(position, tree.corners[triangle * 3 + side] ?? 0));
    spread.expandByPoint(corner.set(tree.centres[triangle * 3] ?? 0, tree.centres[triangle * 3 + 1] ?? 0, tree.centres[triangle * 3 + 2] ?? 0));
  }
  if (end - start <= TRIANGLE_TREE.leafSize) return { box, start, end, left: null, right: null };
  const size: Vector3 = spread.getSize(new Vector3());
  const axis: number = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  tree.order.subarray(start, end).sort((first: number, second: number): number => (tree.centres[first * 3 + axis] ?? 0) - (tree.centres[second * 3 + axis] ?? 0));
  const middle: number = (start + end) >> 1;
  return { box, start, end, left: buildNode(position, tree, start, middle), right: buildNode(position, tree, middle, end) };
}

function buildTree(geometry: BufferGeometry, position: BufferAttribute | InterleavedBufferAttribute, grouped: boolean): TriangleTree {
  const cornerList: number[] = [];
  const groupList: number[] = [];
  listTriangles(geometry, geometry.index === null ? position.count : geometry.index.count, grouped, cornerList, groupList);
  const corners: Uint32Array = Uint32Array.from(cornerList);
  const count: number = groupList.length;
  const centres: Float64Array = new Float64Array(count * 3);
  for (let triangle: number = 0; triangle < count; triangle += 1) {
    for (let side: number = 0; side < 3; side += 1) {
      corner.fromBufferAttribute(position, corners[triangle * 3 + side] ?? 0);
      centres[triangle * 3] = (centres[triangle * 3] ?? 0) + corner.x / 3;
      centres[triangle * 3 + 1] = (centres[triangle * 3 + 1] ?? 0) + corner.y / 3;
      centres[triangle * 3 + 2] = (centres[triangle * 3 + 2] ?? 0) + corner.z / 3;
    }
  }
  const order: Uint32Array = Uint32Array.from({ length: count }, (_: unknown, at: number): number => at);
  return {
    root: buildNode(position, { order, corners, centres }, 0, count),
    order,
    corners,
    groups: Int32Array.from(groupList),
    position,
    positionVersion: versionOf(position),
    index: geometry.index,
    indexVersion: geometry.index?.version ?? -1,
    drawStart: geometry.drawRange.start,
    drawCount: geometry.drawRange.count,
    groupCount: geometry.groups.length,
  };
}

function treeOf(geometry: BufferGeometry, grouped: boolean): TriangleTree | null {
  const position: BufferAttribute | InterleavedBufferAttribute | undefined = positionOf(geometry);
  if (position === undefined || geometry.morphAttributes['position'] !== undefined) return null;
  const trees: WeakMap<BufferGeometry, TriangleTree> = grouped ? groupedTrees : singleTrees;
  const cached: TriangleTree | undefined = trees.get(geometry);
  if (cached !== undefined && current(cached, geometry, position)) return cached;
  const built: TriangleTree = buildTree(geometry, position, grouped);
  trees.set(geometry, built);
  return built;
}

function treeable(object: Object3D): object is Mesh {
  return object instanceof Mesh && !(object instanceof SkinnedMesh);
}

export function prepareTrees(objects: readonly Object3D[]): number {
  let built: number = 0;
  for (const object of objects) {
    if (!treeable(object)) continue;
    const material: Material | Material[] = object.material;
    if (treeOf(object.geometry, Array.isArray(material)) !== null) built += 1;
  }
  return built;
}

function triangleHits(tree: TriangleTree, material: Material | Material[], mesh: Mesh, raycaster: Raycaster, at: number): boolean {
  const triangle: number = tree.order[at] ?? 0;
  const used: Material | undefined = Array.isArray(material) ? material[tree.groups[triangle] ?? 0] : material;
  if (used === undefined) return false;
  pointA.fromBufferAttribute(tree.position, tree.corners[triangle * 3] ?? 0);
  pointB.fromBufferAttribute(tree.position, tree.corners[triangle * 3 + 1] ?? 0);
  pointC.fromBufferAttribute(tree.position, tree.corners[triangle * 3 + 2] ?? 0);
  const hit: Vector3 | null = used.side === BackSide ? localRay.intersectTriangle(pointC, pointB, pointA, true, crossing) : localRay.intersectTriangle(pointA, pointB, pointC, used.side === FrontSide, crossing);
  if (hit === null) return false;
  const distance: number = raycaster.ray.origin.distanceTo(crossingWorld.copy(crossing).applyMatrix4(mesh.matrixWorld));
  return distance >= raycaster.near && distance <= raycaster.far;
}

export function meshBlocks(mesh: Mesh, raycaster: Raycaster, hits: Intersection[]): boolean {
  const material: Material | Material[] = mesh.material;
  const tree: TriangleTree | null = treeable(mesh) ? treeOf(mesh.geometry, Array.isArray(material)) : null;
  if (tree === null) {
    hits.length = 0;
    mesh.raycast(raycaster, hits);
    return hits.length > 0;
  }
  localRay.copy(raycaster.ray).applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
  pending.length = 0;
  pending.push(tree.root);
  for (let node: TreeNode | undefined = pending.pop(); node !== undefined; node = pending.pop()) {
    if (!localRay.intersectsBox(node.box)) continue;
    if (node.left !== null && node.right !== null) {
      pending.push(node.left, node.right);
      continue;
    }
    for (let at: number = node.start; at < node.end; at += 1) {
      if (triangleHits(tree, material, mesh, raycaster, at)) {
        pending.length = 0;
        return true;
      }
    }
  }
  return false;
}
