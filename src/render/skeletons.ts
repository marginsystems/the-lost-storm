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
