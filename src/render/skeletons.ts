import type { Euler, Matrix4, Object3D, Skeleton } from 'three';
import { Bone, SkinnedMesh } from 'three';

function keepAngles(angles: Euler): void {
  angles.setFromQuaternion = (): Euler => angles;
}

export function quietBones(root: Object3D): number {
  let quieted: number = 0;
  root.traverse((object: Object3D): void => {
    if (!(object instanceof Bone)) return;
    keepAngles(object.rotation);
    quieted += 1;
  });
  return quieted;
}

export function disposeSkeletons(root: Object3D): number {
  const skeletons: Set<Skeleton> = new Set<Skeleton>();
  root.traverse((object: Object3D): void => {
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  return skeletons.size;
}

const boundTemplates: WeakSet<Object3D> = new WeakSet<Object3D>();

export function boundSkins(template: Object3D): number {
  if (boundTemplates.has(template)) return 0;
  boundTemplates.add(template);
  template.updateMatrixWorld(true);
  let bounded: number = 0;
  template.traverse((object: Object3D): void => {
    if (!(object instanceof SkinnedMesh)) return;
    object.computeBoundingSphere();
    bounded += 1;
  });
  return bounded;
}

function sameSkin(kept: Skeleton, other: Skeleton): boolean {
  if (kept === other) return true;
  if (kept.bones.length !== other.bones.length || kept.boneInverses.length !== other.boneInverses.length) return false;
  return kept.bones.every((bone: Bone, index: number): boolean => {
    const keptInverse: Matrix4 | undefined = kept.boneInverses[index];
    const otherInverse: Matrix4 | undefined = other.boneInverses[index];
    return bone === other.bones[index] && keptInverse !== undefined && otherInverse !== undefined && keptInverse.equals(otherInverse);
  });
}

export function shareSkeletons(root: Object3D): number {
  const kept: Skeleton[] = [];
  let shared: number = 0;
  root.traverse((object: Object3D): void => {
    if (!(object instanceof SkinnedMesh)) return;
    const same: Skeleton | undefined = kept.find((skeleton: Skeleton): boolean => sameSkin(skeleton, object.skeleton));
    if (same === undefined) {
      kept.push(object.skeleton);
      return;
    }
    if (same === object.skeleton) return;
    object.bind(same, object.bindMatrix);
    shared += 1;
  });
  return shared;
}

let poseTick: number = 0;
const posedOnce: WeakSet<Skeleton> = new WeakSet<Skeleton>();

export function nextPoseTick(): void {
  poseTick += 1;
}

export function poseOncePerTick(root: Object3D): number {
  let held: number = 0;
  root.traverse((object: Object3D): void => {
    if (!(object instanceof SkinnedMesh) || posedOnce.has(object.skeleton)) return;
    const skeleton: Skeleton = object.skeleton;
    const pose: () => void = skeleton.update.bind(skeleton);
    let posedAt: number = poseTick - 1;
    skeleton.update = (): void => {
      if (posedAt === poseTick) return;
      posedAt = poseTick;
      pose();
    };
    posedOnce.add(skeleton);
    held += 1;
  });
  return held;
}
