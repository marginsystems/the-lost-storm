export interface TriangleMesh {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export interface BodyMesh extends TriangleMesh {
  readonly normals: Float32Array;
}

export interface CoverReach {
  readonly reach: number;
  readonly lift: number;
  readonly margin: number;
  readonly island: number;
  readonly weld: number;
}

export type TriangleRange = readonly [first: number, last: number];

export const COVER_REACH: CoverReach = { reach: 0.15, lift: 0.03, margin: 2, island: 24, weld: 1e-4 };

const EPSILON: number = 1e-9;

function at(values: Float32Array, index: number): number {
  return values[index] ?? 0;
}

function corner(indices: Uint32Array, index: number): number {
  return indices[index] ?? 0;
}

function rayHits(cover: TriangleMesh, origin: readonly [number, number, number], direction: readonly [number, number, number], reach: number): boolean {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = direction;
  const { positions, indices } = cover;
  for (let face: number = 0; face + 2 < indices.length; face += 3) {
    const a: number = corner(indices, face) * 3;
    const b: number = corner(indices, face + 1) * 3;
    const c: number = corner(indices, face + 2) * 3;
    const ax: number = at(positions, a);
    const ay: number = at(positions, a + 1);
    const az: number = at(positions, a + 2);
    const e1x: number = at(positions, b) - ax;
    const e1y: number = at(positions, b + 1) - ay;
    const e1z: number = at(positions, b + 2) - az;
    const e2x: number = at(positions, c) - ax;
    const e2y: number = at(positions, c + 1) - ay;
    const e2z: number = at(positions, c + 2) - az;
    const px: number = dy * e2z - dz * e2y;
    const py: number = dz * e2x - dx * e2z;
    const pz: number = dx * e2y - dy * e2x;
    const det: number = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < EPSILON) continue;
    const inverse: number = 1 / det;
    const tx: number = ox - ax;
    const ty: number = oy - ay;
    const tz: number = oz - az;
    const u: number = (tx * px + ty * py + tz * pz) * inverse;
    if (u < 0 || u > 1) continue;
    const qx: number = ty * e1z - tz * e1y;
    const qy: number = tz * e1x - tx * e1z;
    const qz: number = tx * e1y - ty * e1x;
    const v: number = (dx * qx + dy * qy + dz * qz) * inverse;
    if (v < 0 || u + v > 1) continue;
    const distance: number = (e2x * qx + e2y * qy + e2z * qz) * inverse;
    if (distance >= 0 && distance <= reach) return true;
  }
  return false;
}

export function coveredVertices(body: BodyMesh, cover: TriangleMesh, reach: CoverReach): boolean[] {
  const count: number = body.positions.length / 3;
  return Array.from({ length: count }, (_: unknown, vertex: number): boolean => {
    const nx: number = at(body.normals, vertex * 3);
    const ny: number = at(body.normals, vertex * 3 + 1);
    const nz: number = at(body.normals, vertex * 3 + 2);
    const length: number = Math.hypot(nx, ny, nz);
    if (length < EPSILON) return false;
    const direction: readonly [number, number, number] = [nx / length, ny / length, nz / length];
    const origin: readonly [number, number, number] = [
      at(body.positions, vertex * 3) - direction[0] * reach.lift,
      at(body.positions, vertex * 3 + 1) - direction[1] * reach.lift,
      at(body.positions, vertex * 3 + 2) - direction[2] * reach.lift,
    ];
    return rayHits(cover, origin, direction, reach.reach + reach.lift);
  });
}

export function weldedVertices(positions: Float32Array, weld: number): number[] {
  const seen: Map<string, number> = new Map<string, number>();
  const count: number = positions.length / 3;
  return Array.from({ length: count }, (_: unknown, vertex: number): number => {
    const key: string = [0, 1, 2].map((axis: number): number => Math.round(at(positions, vertex * 3 + axis) / weld)).join(',');
    const found: number | undefined = seen.get(key);
    if (found !== undefined) return found;
    seen.set(key, vertex);
    return vertex;
  });
}

function fillIslands(hidden: boolean[], roots: (face: number) => number[], island: number): void {
  const owner: Map<number, number[]> = new Map<number, number[]>();
  hidden.forEach((flag: boolean, face: number): void => {
    if (flag) return;
    for (const root of roots(face)) owner.set(root, [...(owner.get(root) ?? []), face]);
  });
  const seen: Set<number> = new Set<number>();
  hidden.forEach((flag: boolean, start: number): void => {
    if (flag || seen.has(start)) return;
    const group: number[] = [start];
    seen.add(start);
    for (let cursor: number = 0; cursor < group.length; cursor += 1) {
      for (const root of roots(group[cursor] ?? start)) {
        for (const face of owner.get(root) ?? []) {
          if (seen.has(face)) continue;
          seen.add(face);
          group.push(face);
        }
      }
    }
    if (group.length < island) for (const face of group) hidden[face] = true;
  });
}

export function coveredTriangles(body: BodyMesh, vertices: readonly boolean[], reach: CoverReach): boolean[] {
  const welded: readonly number[] = weldedVertices(body.positions, reach.weld);
  const covered: boolean[] = welded.map((): boolean => false);
  vertices.forEach((hit: boolean, vertex: number): void => {
    const root: number = welded[vertex] ?? vertex;
    covered[root] = (covered[root] ?? false) || hit;
  });
  const faces: number = Math.floor(body.indices.length / 3);
  const roots = (face: number): number[] => [0, 1, 2].map((offset: number): number => welded[corner(body.indices, face * 3 + offset)] ?? 0);
  const hidden: boolean[] = Array.from({ length: faces }, (_: unknown, face: number): boolean => roots(face).every((root: number): boolean => covered[root] === true));
  fillIslands(hidden, roots, reach.island);
  let open: Set<number> = new Set<number>();
  hidden.forEach((flag: boolean, face: number): void => {
    if (!flag) for (const root of roots(face)) open.add(root);
  });
  for (let ring: number = 0; ring < reach.margin; ring += 1) {
    const next: Set<number> = new Set<number>(open);
    for (let face: number = 0; face < faces; face += 1) {
      if (hidden[face] !== true) continue;
      const touches: number[] = roots(face);
      if (!touches.some((root: number): boolean => open.has(root))) continue;
      hidden[face] = false;
      for (const root of touches) next.add(root);
    }
    open = next;
  }
  return hidden;
}

export function triangleRanges(hidden: readonly boolean[]): TriangleRange[] {
  const ranges: TriangleRange[] = [];
  let first: number = -1;
  hidden.forEach((flag: boolean, face: number): void => {
    if (flag && first < 0) first = face;
    if (!flag && first >= 0) {
      ranges.push([first, face - 1]);
      first = -1;
    }
  });
  if (first >= 0) ranges.push([first, hidden.length - 1]);
  return ranges;
}
