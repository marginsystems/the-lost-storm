import type { Material, Object3D } from 'three';
import { Color, Mesh, MeshBasicMaterial } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

export interface Ghost {
  readonly root: Object3D;
  setOpacity(opacity: number): void;
  copyPose(): void;
  dispose(): void;
}

function bonesOf(root: Object3D): Object3D[] {
  const bones: Object3D[] = [];
  root.traverse((object: Object3D): void => {
    if (object.type === 'Bone') bones.push(object);
  });
  return bones;
}

export function createGhost(source: Object3D, tint: number, opacity: number): Ghost {
  const root: Object3D = clone(source);
  const materials: MeshBasicMaterial[] = [];
  const color: Color = new Color(tint);
  root.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const worn: Material = new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: true });
    if (worn instanceof MeshBasicMaterial) materials.push(worn);
    object.material = worn;
    object.castShadow = false;
    object.receiveShadow = false;
  });
  const bones: Object3D[] = bonesOf(root);
  const sources: Object3D[] = bonesOf(source);
  return {
    root,
    setOpacity(next: number): void {
      for (const material of materials) material.opacity = next;
      root.visible = next > 0;
    },
    copyPose(): void {
      bones.forEach((bone: Object3D, index: number): void => {
        const match: Object3D | undefined = sources[index];
        if (match === undefined) return;
        bone.position.copy(match.position);
        bone.quaternion.copy(match.quaternion);
        bone.scale.copy(match.scale);
      });
    },
    dispose(): void {
      root.removeFromParent();
      for (const material of materials) material.dispose();
    },
  };
}
