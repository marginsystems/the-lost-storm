import type { Accessor, Document, Node, Primitive } from '@gltf-transform/core';
import { Matrix4, Triangle, Vector3 } from 'three';

export interface Influence {
  readonly joint: string;
  readonly weight: number;
}

export interface BodySurface {
  readonly positions: readonly number[];
  readonly indices: readonly number[];
  readonly influences: readonly (readonly Influence[])[];
}

export interface FitOptions {
  readonly gap: number;
  readonly depth: number;
  readonly reach: number;
  readonly blend: number;
  readonly follow: number;
}

export interface Contact {
  readonly depth: number;
  readonly normal: Vector3;
}

const FIT = {
  weldGrid: 1e5,
  onEdge: 1e-7,
  corners: 3,
  underEdge: 0.7,
  tie: 1e-7,
  influences: 4,
} as const;

interface BodyTriangle {
  readonly corners: readonly [number, number, number];
  readonly open: readonly [boolean, boolean, boolean];
  readonly min: Vector3;
  readonly max: Vector3;
}

export interface PreparedBody {
  readonly surface: BodySurface;
  readonly normals: readonly Vector3[];
  readonly triangles: readonly BodyTriangle[];
}

function vertexAt(values: readonly number[], index: number, into: Vector3): Vector3 {
  return into.set(values[index * 3] ?? 0, values[index * 3 + 1] ?? 0, values[index * 3 + 2] ?? 0);
}

function weldKey(values: readonly number[], index: number): string {
  return [0, 1, 2].map((axis: number): number => Math.round((values[index * 3 + axis] ?? 0) * FIT.weldGrid)).join(',');
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function prepareBody(surface: BodySurface): PreparedBody {
  const keys: string[] = Array.from({ length: surface.positions.length / 3 }, (_value: unknown, index: number): string => weldKey(surface.positions, index));
  const uses: Map<string, number> = new Map<string, number>();
  const cornersOf = (start: number): [number, number, number] => [surface.indices[start] ?? 0, surface.indices[start + 1] ?? 0, surface.indices[start + 2] ?? 0];
  const keyOf = (corner: number): string => keys[corner] ?? '';
  const edgesOf = (corners: readonly [number, number, number]): [string, string, string] => [edgeKey(keyOf(corners[0]), keyOf(corners[1])), edgeKey(keyOf(corners[1]), keyOf(corners[2])), edgeKey(keyOf(corners[2]), keyOf(corners[0]))];
  for (let start: number = 0; start + 2 < surface.indices.length; start += FIT.corners) {
    for (const edge of edgesOf(cornersOf(start))) uses.set(edge, (uses.get(edge) ?? 0) + 1);
  }
  const triangles: BodyTriangle[] = [];
  const point: Vector3 = new Vector3();
  const face: Triangle = new Triangle();
  const welded: Map<string, Vector3> = new Map<string, Vector3>();
  for (let start: number = 0; start + 2 < surface.indices.length; start += FIT.corners) {
    const corners: [number, number, number] = cornersOf(start);
    const edges: [string, string, string] = edgesOf(corners);
    face.set(vertexAt(surface.positions, corners[0], new Vector3()), vertexAt(surface.positions, corners[1], new Vector3()), vertexAt(surface.positions, corners[2], new Vector3()));
    const weighted: Vector3 = face.getNormal(new Vector3()).multiplyScalar(face.getArea());
    for (const corner of corners) {
      const key: string = keyOf(corner);
      welded.set(key, (welded.get(key) ?? new Vector3()).add(weighted));
    }
    const min: Vector3 = new Vector3(Infinity, Infinity, Infinity);
    const max: Vector3 = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const corner of corners) {
      vertexAt(surface.positions, corner, point);
      min.min(point);
      max.max(point);
    }
    triangles.push({ corners, open: [uses.get(edges[0]) === 1, uses.get(edges[1]) === 1, uses.get(edges[2]) === 1], min, max });
  }
  const normals: Vector3[] = keys.map((key: string): Vector3 => (welded.get(key) ?? new Vector3()).clone().normalize());
  return { surface, normals, triangles };
}

function distanceToBox(point: Vector3, min: Vector3, max: Vector3): number {
  const dx: number = Math.max(min.x - point.x, 0, point.x - max.x);
  const dy: number = Math.max(min.y - point.y, 0, point.y - max.y);
  const dz: number = Math.max(min.z - point.z, 0, point.z - max.z);
  return Math.hypot(dx, dy, dz);
}

function onSegment(point: Vector3, a: Vector3, b: Vector3): boolean {
  const along: Vector3 = b.clone().sub(a);
  const length: number = along.lengthSq();
  const share: number = length === 0 ? 0 : Math.min(1, Math.max(0, point.clone().sub(a).dot(along) / length));
  return a.clone().addScaledVector(along, share).distanceToSquared(point) < FIT.onEdge * FIT.onEdge;
}

interface Nearest {
  distance: number;
  corners: readonly [number, number, number];
  shares: Vector3;
  closest: Vector3;
  open: boolean;
}

function nearestOn(body: PreparedBody, point: Vector3, reach: number): Nearest | null {
  const triangle: Triangle = new Triangle();
  const closest: Vector3 = new Vector3();
  const corners: [Vector3, Vector3, Vector3] = [new Vector3(), new Vector3(), new Vector3()];
  let nearest: Nearest | null = null;
  for (const candidate of body.triangles) {
    const best: number = (nearest?.distance ?? reach) + FIT.tie;
    if (distanceToBox(point, candidate.min, candidate.max) >= best) continue;
    candidate.corners.forEach((corner: number, slot: number): void => {
      vertexAt(body.surface.positions, corner, corners[slot] ?? new Vector3());
    });
    triangle.set(corners[0], corners[1], corners[2]);
    triangle.closestPointToPoint(point, closest);
    const distance: number = closest.distanceTo(point);
    if (distance >= best || (nearest === null && distance >= reach)) continue;
    const open: boolean = candidate.open.some((isOpen: boolean, side: number): boolean => isOpen && onSegment(closest, corners[side] ?? closest, corners[(side + 1) % FIT.corners] ?? closest));
    if (nearest !== null && distance > nearest.distance - FIT.tie) {
      nearest.open = nearest.open || open;
      continue;
    }
    const shares: Vector3 = triangle.getBarycoord(closest, new Vector3()) ?? new Vector3(1 / 3, 1 / 3, 1 / 3);
    nearest = { distance, corners: candidate.corners, shares, closest: closest.clone(), open };
  }
  return nearest;
}

export function contactWith(body: PreparedBody, point: Vector3, reach: number): Contact | null {
  const nearest: Nearest | null = nearestOn(body, point, reach);
  if (nearest === null) return null;
  const normal: Vector3 = new Vector3();
  const fallback: Vector3 = new Vector3(0, 0, 0);
  nearest.corners.forEach((index: number, slot: number): void => {
    normal.addScaledVector(body.normals[index] ?? fallback, nearest.shares.getComponent(slot));
  });
  if (normal.lengthSq() === 0) return null;
  normal.normalize();
  const depth: number = point.clone().sub(nearest.closest).dot(normal);
  if (nearest.open && -depth < FIT.underEdge * nearest.distance) return null;
  return { depth, normal };
}

export function followSkin(points: readonly number[], own: readonly (readonly Influence[])[], body: PreparedBody, options: FitOptions): Influence[][] {
  const point: Vector3 = new Vector3();
  return own.map((influences: readonly Influence[], index: number): Influence[] => {
    const nearest: Nearest | null = nearestOn(body, vertexAt(points, index, point), options.gap + options.follow);
    const pull: number = nearest === null ? 0 : Math.min(1, Math.max(0, 1 - (nearest.distance - options.gap) / options.follow));
    if (nearest === null || pull === 0) return [...influences];
    const mixed: Map<string, number> = new Map<string, number>();
    for (const { joint, weight } of influences) mixed.set(joint, (mixed.get(joint) ?? 0) + weight * (1 - pull));
    nearest.corners.forEach((corner: number, slot: number): void => {
      for (const { joint, weight } of body.surface.influences[corner] ?? []) mixed.set(joint, (mixed.get(joint) ?? 0) + weight * pull * nearest.shares.getComponent(slot));
    });
    const strongest: Influence[] = [...mixed]
      .map(([joint, weight]: [string, number]): Influence => ({ joint, weight }))
      .filter((influence: Influence): boolean => influence.weight > 0)
      .toSorted((a: Influence, b: Influence): number => (b.weight === a.weight ? a.joint.localeCompare(b.joint) : b.weight - a.weight))
      .slice(0, FIT.influences);
    const total: number = strongest.reduce((sum: number, influence: Influence): number => sum + influence.weight, 0);
    return total === 0 ? [...influences] : strongest.map((influence: Influence): Influence => ({ joint: influence.joint, weight: influence.weight / total }));
  });
}

const SAMPLES: readonly (readonly [number, number, number])[] = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.5, 0.5, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [2 / 3, 1 / 6, 1 / 6],
  [1 / 6, 2 / 3, 1 / 6],
  [1 / 6, 1 / 6, 2 / 3],
];

interface Pushes {
  readonly amounts: number[];
  readonly normals: (Vector3 | null)[];
}

function emptyPushes(count: number): Pushes {
  return { amounts: Array.from({ length: count }, (): number => 0), normals: Array.from({ length: count }, (): Vector3 | null => null) };
}

function press(pushes: Pushes, index: number, contact: Contact, options: FitOptions): void {
  const amount: number = options.gap - contact.depth;
  if (contact.depth < -options.depth || amount <= (pushes.amounts[index] ?? 0)) return;
  pushes.amounts[index] = amount;
  pushes.normals[index] = contact.normal;
}

function vertexPushes(points: readonly number[], body: PreparedBody, options: FitOptions): Pushes {
  const pushes: Pushes = emptyPushes(points.length / 3);
  const point: Vector3 = new Vector3();
  for (let index: number = 0; index * 3 < points.length; index += 1) {
    const contact: Contact | null = contactWith(body, vertexAt(points, index, point), options.reach);
    if (contact !== null) press(pushes, index, contact, options);
  }
  return pushes;
}

function samplePushes(points: readonly number[], indices: readonly number[], body: PreparedBody, options: FitOptions): Pushes {
  const pushes: Pushes = emptyPushes(points.length / 3);
  const point: Vector3 = new Vector3();
  const corner: Vector3 = new Vector3();
  const face: Triangle = new Triangle();
  const facing: Vector3 = new Vector3();
  for (let start: number = 0; start + 2 < indices.length; start += FIT.corners) {
    const corners: readonly number[] = [indices[start] ?? 0, indices[start + 1] ?? 0, indices[start + 2] ?? 0];
    face.set(vertexAt(points, corners[0] ?? 0, new Vector3()), vertexAt(points, corners[1] ?? 0, new Vector3()), vertexAt(points, corners[2] ?? 0, new Vector3())).getNormal(facing);
    for (const weights of SAMPLES) {
      point.set(0, 0, 0);
      corners.forEach((index: number, slot: number): void => {
        point.addScaledVector(vertexAt(points, index, corner), weights[slot] ?? 0);
      });
      const contact: Contact | null = contactWith(body, point, options.reach);
      if (contact === null || contact.normal.dot(facing) <= 0) continue;
      for (const index of corners) press(pushes, index, contact, options);
    }
  }
  return pushes;
}

function spread(points: readonly number[], pushes: Pushes, blend: number): number[] {
  const pushing: number[] = pushes.amounts.flatMap((amount: number, index: number): number[] => (amount > 0 ? [index] : []));
  const moved: number[] = [...points];
  const point: Vector3 = new Vector3();
  const other: Vector3 = new Vector3();
  for (let index: number = 0; index * 3 < points.length; index += 1) {
    vertexAt(points, index, point);
    let amount: number = 0;
    let direction: Vector3 | null = null;
    for (const source of pushing) {
      const reached: number = (pushes.amounts[source] ?? 0) * (1 - vertexAt(points, source, other).distanceTo(point) / blend);
      if (reached <= amount) continue;
      amount = reached;
      direction = pushes.normals[source] ?? null;
    }
    if (direction === null) continue;
    point.addScaledVector(direction, amount);
    moved[index * 3] = point.x;
    moved[index * 3 + 1] = point.y;
    moved[index * 3 + 2] = point.z;
  }
  return moved;
}

export function fitOver(points: readonly number[], indices: readonly number[], body: PreparedBody, options: FitOptions): number[] {
  const settled: number[] = spread(points, vertexPushes(points, body, options), options.blend);
  return spread(settled, samplePushes(settled, indices, body, options), options.blend);
}

export function elementsOf(accessor: Accessor | null, width: number): number[] {
  const values: number[] = [];
  if (accessor === null) return values;
  const element: number[] = [];
  for (let index: number = 0; index < accessor.getCount(); index += 1) {
    accessor.getElement(index, element);
    for (let slot: number = 0; slot < width; slot += 1) values.push(element[slot] ?? 0);
  }
  return values;
}

export function meshNodes(document: Document): Node[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node: Node): boolean => node.getMesh() !== null);
}

interface Placed {
  readonly primitive: Primitive;
  readonly world: Matrix4;
  readonly joints: readonly string[];
}

function placedPrimitives(document: Document): Placed[] {
  return meshNodes(document).flatMap((node: Node): Placed[] => {
    const world: Matrix4 = new Matrix4().fromArray(node.getWorldMatrix());
    const joints: string[] = (node.getSkin()?.listJoints() ?? []).map((joint: Node): string => joint.getName());
    return (node.getMesh()?.listPrimitives() ?? []).map((primitive: Primitive): Placed => ({ primitive, world, joints }));
  });
}

function worldValues(accessor: Accessor | null, world: Matrix4): number[] {
  const values: number[] = elementsOf(accessor, 3);
  const point: Vector3 = new Vector3();
  for (let index: number = 0; index * 3 < values.length; index += 1) point.fromArray(values, index * 3).applyMatrix4(world).toArray(values, index * 3);
  return values;
}

function influencesOf(primitive: Primitive, names: readonly string[]): Influence[][] {
  const joints: number[] = elementsOf(primitive.getAttribute('JOINTS_0'), FIT.influences);
  const weights: number[] = elementsOf(primitive.getAttribute('WEIGHTS_0'), FIT.influences);
  const count: number = primitive.getAttribute('POSITION')?.getCount() ?? 0;
  return Array.from({ length: count }, (_value: unknown, vertex: number): Influence[] =>
    Array.from({ length: FIT.influences }, (_slot: unknown, slot: number): Influence => ({ joint: names[joints[vertex * FIT.influences + slot] ?? 0] ?? '', weight: weights[vertex * FIT.influences + slot] ?? 0 })).filter((influence: Influence): boolean => influence.weight > 0 && influence.joint !== ''),
  );
}

function indicesOf(primitive: Primitive, count: number): number[] {
  const source: Accessor | null = primitive.getIndices();
  return source === null ? Array.from({ length: count }, (_value: unknown, index: number): number => index) : elementsOf(source, 1);
}

export function bodySurface(document: Document, material: string, where: string): BodySurface {
  const positions: number[] = [];
  const indices: number[] = [];
  const influences: Influence[][] = [];
  for (const { primitive, world, joints } of placedPrimitives(document)) {
    if (primitive.getMaterial()?.getName() !== material) continue;
    const offset: number = positions.length / 3;
    const position: Accessor | null = primitive.getAttribute('POSITION');
    positions.push(...worldValues(position, world));
    influences.push(...influencesOf(primitive, joints));
    indices.push(...indicesOf(primitive, position?.getCount() ?? 0).map((index: number): number => index + offset));
  }
  if (indices.length === 0) throw new Error(`${where}: the body has no primitive with the material "${material}"`);
  return { positions, indices, influences };
}

interface Shape {
  readonly world: Matrix4;
  readonly indices: number[];
  readonly skinned: Placed[];
}

function writeInfluences(placed: Placed, influences: readonly (readonly Influence[])[]): void {
  const jointAccessor: Accessor | null = placed.primitive.getAttribute('JOINTS_0');
  const weightAccessor: Accessor | null = placed.primitive.getAttribute('WEIGHTS_0');
  if (jointAccessor === null || weightAccessor === null) return;
  const slots: number = influences.length * FIT.influences;
  const joints: Uint16Array = new Uint16Array(slots);
  const weights: Float32Array = new Float32Array(slots);
  influences.forEach((vertex: readonly Influence[], index: number): void => {
    const known: Influence[] = vertex.filter((influence: Influence): boolean => placed.joints.includes(influence.joint));
    const total: number = known.reduce((sum: number, influence: Influence): number => sum + influence.weight, 0);
    known.forEach((influence: Influence, slot: number): void => {
      joints[index * FIT.influences + slot] = placed.joints.indexOf(influence.joint);
      weights[index * FIT.influences + slot] = total === 0 ? 0 : influence.weight / total;
    });
  });
  jointAccessor.setArray(joints);
  weightAccessor.setNormalized(false).setArray(weights);
}

export function fitDocument(document: Document, body: PreparedBody, options: FitOptions): void {
  const shapes: Map<Accessor, Shape> = new Map<Accessor, Shape>();
  for (const placed of placedPrimitives(document)) {
    const position: Accessor | null = placed.primitive.getAttribute('POSITION');
    if (position === null) continue;
    const shape: Shape = shapes.get(position) ?? { world: placed.world, indices: [], skinned: [] };
    shape.indices.push(...indicesOf(placed.primitive, position.getCount()));
    if (placed.joints.length > 0 && !shape.skinned.some((other: Placed): boolean => other.primitive.getAttribute('WEIGHTS_0') === placed.primitive.getAttribute('WEIGHTS_0'))) shape.skinned.push(placed);
    shapes.set(position, shape);
  }
  for (const [position, { world, indices, skinned }] of shapes) {
    const moved: number[] = fitOver(worldValues(position, world), indices, body, options);
    for (const placed of skinned) writeInfluences(placed, followSkin(moved, influencesOf(placed.primitive, placed.joints), body, options));
    const back: Matrix4 = world.clone().invert();
    const point: Vector3 = new Vector3();
    const local: Float32Array = new Float32Array(moved.length);
    for (let index: number = 0; index * 3 < moved.length; index += 1) point.fromArray(moved, index * 3).applyMatrix4(back).toArray(local, index * 3);
    position.setArray(local);
  }
}
