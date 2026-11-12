import type { Object3D, Skeleton } from 'three';
import { SkinnedMesh } from 'three';

export function disposeSkeletons(root: Object3D): number {
  const skeletons: Set<Skeleton> = new Set<Skeleton>();
  root.traverse((object: Object3D): void => {
    if (object instanceof SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  return skeletons.size;
}
