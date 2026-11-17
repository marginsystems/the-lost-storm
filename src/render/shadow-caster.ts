import type { BufferGeometry, InterleavedBufferAttribute, Matrix4 } from 'three';
import { BufferAttribute, BufferGeometry as Geometry, DoubleSide, Matrix4 as Transform, MeshDepthMaterial, ShaderMaterial, SkinnedMesh, Vector3 } from 'three';

export const SHADOW_CASTER = {
  mark: 'shadowCaster',
  jointsPerVertex: 4,
  drawNothing: -1,
  idleKept: 6,
  offScreen: 'void main() {\n  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);\n}',
  noColour: 'void main() {\n  gl_FragColor = vec4(0.0);\n}',
} as const;

export interface CasterRange {
  readonly start: number;
  readonly count: number;
}

export interface CasterPiece {
  readonly geometry: BufferGeometry;
  readonly bindMatrix: Matrix4;
  readonly ranges: readonly CasterRange[] | null;
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;

interface Skinned {
  readonly position: Attribute;
  readonly joints: Attribute;
  readonly weights: Attribute;
}

function skinned(geometry: BufferGeometry): Skinned | null {
  const position: Attribute | undefined = geometry.attributes['position'];
  const joints: Attribute | undefined = geometry.attributes['skinIndex'];
  const weights: Attribute | undefined = geometry.attributes['skinWeight'];
  if (position === undefined || joints === undefined || weights === undefined) return null;
  return { position, joints, weights };
}

export function castsTogether(geometry: BufferGeometry): boolean {
  return skinned(geometry) !== null;
}

function drawnIndices(geometry: BufferGeometry, vertices: number, ranges: readonly CasterRange[] | null): number[] {
  const index: BufferAttribute | null = geometry.index;
  const length: number = index === null ? vertices : index.count;
  const spans: readonly CasterRange[] = ranges ?? [{ start: 0, count: length }];
  const drawn: number[] = [];
  for (const span of spans) {
    const end: number = Math.min(length, span.start + span.count);
    for (let at: number = Math.max(0, span.start); at < end; at += 1) drawn.push(index === null ? at : index.getX(at));
  }
  return drawn;
}

export function casterGeometry(pieces: readonly CasterPiece[], anchorBind: Matrix4): BufferGeometry {
  const usable: { readonly piece: CasterPiece; readonly parts: Skinned }[] = pieces.flatMap((piece: CasterPiece): { readonly piece: CasterPiece; readonly parts: Skinned }[] => {
    const parts: Skinned | null = skinned(piece.geometry);
    return parts === null ? [] : [{ piece, parts }];
  });
  const total: number = usable.reduce((sum: number, entry: { readonly parts: Skinned }): number => sum + entry.parts.position.count, 0);
  const positions: Float32Array = new Float32Array(total * 3);
  const joints: Uint16Array = new Uint16Array(total * SHADOW_CASTER.jointsPerVertex);
  const weights: Float32Array = new Float32Array(total * SHADOW_CASTER.jointsPerVertex);
  const indices: number[] = [];
  const toAnchor: Transform = new Transform();
  const fromAnchor: Transform = new Transform().copy(anchorBind).invert();
  const point: Vector3 = new Vector3();
  let offset: number = 0;
  for (const { piece, parts } of usable) {
    toAnchor.multiplyMatrices(fromAnchor, piece.bindMatrix);
    for (let vertex: number = 0; vertex < parts.position.count; vertex += 1) {
      point.fromBufferAttribute(parts.position, vertex).applyMatrix4(toAnchor);
      const at: number = offset + vertex;
      positions[at * 3] = point.x;
      positions[at * 3 + 1] = point.y;
      positions[at * 3 + 2] = point.z;
      for (let joint: number = 0; joint < SHADOW_CASTER.jointsPerVertex; joint += 1) {
        joints[at * SHADOW_CASTER.jointsPerVertex + joint] = parts.joints.getComponent(vertex, joint);
        weights[at * SHADOW_CASTER.jointsPerVertex + joint] = parts.weights.getComponent(vertex, joint);
      }
    }
    for (const drawn of drawnIndices(piece.geometry, parts.position.count, piece.ranges)) indices.push(offset + drawn);
    offset += parts.position.count;
  }
  const merged: Geometry = new Geometry();
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setAttribute('skinIndex', new BufferAttribute(joints, SHADOW_CASTER.jointsPerVertex));
  merged.setAttribute('skinWeight', new BufferAttribute(weights, SHADOW_CASTER.jointsPerVertex));
  merged.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  return merged;
}

let unseen: ShaderMaterial | null = null;

function unseenMaterial(): ShaderMaterial {
  unseen ??= new ShaderMaterial({ vertexShader: SHADOW_CASTER.offScreen, fragmentShader: SHADOW_CASTER.noColour, colorWrite: false, depthWrite: false, depthTest: false, side: DoubleSide });
  return unseen;
}

let depth: MeshDepthMaterial | null = null;

export function casterDepth(): MeshDepthMaterial {
  depth ??= new MeshDepthMaterial();
  return depth;
}

export function isShadowCaster(object: { readonly userData: Record<string, unknown> }): boolean {
  return object.userData[SHADOW_CASTER.mark] === true;
}

export function drawWhole(geometry: BufferGeometry): void {
  geometry.setDrawRange(0, Infinity);
}

export function drawNothing(geometry: BufferGeometry): void {
  geometry.setDrawRange(0, SHADOW_CASTER.drawNothing);
}

export function createShadowCaster(anchor: SkinnedMesh): SkinnedMesh {
  const caster: SkinnedMesh = new SkinnedMesh(new Geometry(), unseenMaterial());
  caster.name = SHADOW_CASTER.mark;
  caster.userData[SHADOW_CASTER.mark] = true;
  caster.castShadow = true;
  caster.customDepthMaterial = casterDepth();
  caster.receiveShadow = false;
  caster.frustumCulled = false;
  caster.raycast = (): void => undefined;
  caster.onBeforeShadow = (): void => drawWhole(caster.geometry);
  caster.onBeforeRender = (): void => drawNothing(caster.geometry);
  caster.position.copy(anchor.position);
  caster.quaternion.copy(anchor.quaternion);
  caster.scale.copy(anchor.scale);
  caster.bind(anchor.skeleton, anchor.bindMatrix);
  return caster;
}

export interface CasterCache {
  take(key: string, build: () => BufferGeometry): BufferGeometry;
  leave(key: string): void;
  readonly size: number;
}

interface SharedCaster {
  readonly geometry: BufferGeometry;
  users: number;
}

export function createCasterCache(idleKept: number = SHADOW_CASTER.idleKept): CasterCache {
  const made: Map<string, SharedCaster> = new Map<string, SharedCaster>();
  const idle: string[] = [];
  const forget = (key: string): void => {
    const at: number = idle.indexOf(key);
    if (at >= 0) idle.splice(at, 1);
  };
  return {
    take(key: string, build: () => BufferGeometry): BufferGeometry {
      const found: SharedCaster = made.get(key) ?? { geometry: build(), users: 0 };
      made.set(key, found);
      found.users += 1;
      forget(key);
      return found.geometry;
    },
    leave(key: string): void {
      const found: SharedCaster | undefined = made.get(key);
      if (found === undefined) return;
      found.users = Math.max(0, found.users - 1);
      if (found.users > 0) return;
      forget(key);
      idle.push(key);
      while (idle.length > idleKept) {
        const oldest: string | undefined = idle.shift();
        const gone: SharedCaster | undefined = oldest === undefined ? undefined : made.get(oldest);
        if (oldest === undefined || gone === undefined) continue;
        gone.geometry.dispose();
        made.delete(oldest);
      }
    },
    get size(): number {
      return made.size;
    },
  };
}

