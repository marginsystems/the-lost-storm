import type { Object3D } from 'three';
import { BufferAttribute, BufferGeometry, Mesh, Quaternion, Vector3 } from 'three';

export type BoxAxis = 'x' | 'y' | 'z';

export function facingAxis(normal: Vector3): BoxAxis {
  const x: number = Math.abs(normal.x);
  const y: number = Math.abs(normal.y);
  const z: number = Math.abs(normal.z);
  if (x >= y && x >= z) return 'x';
  return y >= z ? 'y' : 'z';
}

export function boxUv(point: Vector3, axis: BoxAxis): readonly [number, number] {
  let uv: readonly [number, number];
  switch (axis) {
    case 'x':
      uv = [point.z, point.y];
      break;
    case 'y':
      uv = [point.x, point.z];
      break;
    case 'z':
      uv = [point.x, point.y];
      break;
  }
  return uv;
}

export function withBoxUvs(geometry: BufferGeometry, scale: Vector3): BufferGeometry {
  if (geometry.hasAttribute('uv') || !geometry.hasAttribute('position')) return geometry;
  const flat: BufferGeometry = geometry.index === null ? geometry : geometry.toNonIndexed();
  const position = flat.getAttribute('position');
  const uvs: Float32Array = new Float32Array(position.count * 2);
  const corners: [Vector3, Vector3, Vector3] = [new Vector3(), new Vector3(), new Vector3()];
  const along: Vector3 = new Vector3();
  const across: Vector3 = new Vector3();
  for (let first: number = 0; first + 2 < position.count; first += 3) {
    corners.forEach((corner: Vector3, offset: number): void => {
      corner.fromBufferAttribute(position, first + offset).multiply(scale);
    });
    along.subVectors(corners[1], corners[0]);
    across.subVectors(corners[2], corners[0]);
    const axis: BoxAxis = facingAxis(along.cross(across));
    corners.forEach((corner: Vector3, offset: number): void => {
      const [u, v] = boxUv(corner, axis);
      uvs[(first + offset) * 2] = u;
      uvs[(first + offset) * 2 + 1] = v;
    });
  }
  flat.setAttribute('uv', new BufferAttribute(uvs, 2));
  return flat;
}

function isGeometry(value: unknown): value is BufferGeometry {
  return value instanceof BufferGeometry;
}

export function addBoxUvs(root: Object3D): void {
  root.updateMatrixWorld(true);
  const where: Vector3 = new Vector3();
  const turn: Quaternion = new Quaternion();
  root.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const geometry: unknown = object.geometry;
    if (!isGeometry(geometry)) return;
    const scale: Vector3 = new Vector3();
    object.matrixWorld.decompose(where, turn, scale);
    object.geometry = withBoxUvs(geometry, scale);
  });
}
