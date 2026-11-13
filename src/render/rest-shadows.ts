import type { Mesh, Object3D } from 'three';
import { MeshBasicMaterial, Vector3 } from 'three';
import { CONTACT_SHADOW, contactShadow } from './contact-shadow.ts';

export const REST_SHADOW = {
  reach: 0.3,
  opacity: 0.8,
  spread: 4.2,
  nearSpread: 2.6,
  fadeFrom: 0.72,
  fadeTo: 1,
} as const;

export interface RestJoint {
  readonly bone: Object3D;
  readonly radius: number;
}

export interface RestShadows {
  place(parent: Object3D | null, floor: number, scale: number, share: number): void;
  hide(): void;
  detach(): void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function ease(value: number): number {
  const t: number = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function restShade(gap: number, reach: number): number {
  const near: number = 1 - clamp01(gap / reach);
  return near * near;
}

export function restFade(share: number): number {
  return 1 - ease((share - REST_SHADOW.fadeFrom) / (REST_SHADOW.fadeTo - REST_SHADOW.fadeFrom));
}

export function restSpread(shade: number): number {
  return REST_SHADOW.spread + (REST_SHADOW.nearSpread - REST_SHADOW.spread) * shade;
}

interface Patch {
  readonly joint: RestJoint;
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
}

export function createRestShadows(joints: readonly RestJoint[]): RestShadows {
  const patches: Patch[] = [];
  for (const joint of joints) {
    const mesh: Mesh = contactShadow();
    if (!(mesh.material instanceof MeshBasicMaterial)) continue;
    const material: MeshBasicMaterial = mesh.material.clone();
    material.opacity = 0;
    mesh.material = material;
    mesh.visible = false;
    patches.push({ joint, mesh, material });
  }
  const at: Vector3 = new Vector3();
  return {
    place(parent: Object3D | null, floor: number, scale: number, share: number): void {
      const fade: number = restFade(share);
      for (const patch of patches) {
        if (parent !== null && patch.mesh.parent !== parent) parent.add(patch.mesh);
        patch.joint.bone.getWorldPosition(at);
        const radius: number = patch.joint.radius * scale;
        const shade: number = restShade(at.y - radius - floor, REST_SHADOW.reach * scale);
        patch.material.opacity = REST_SHADOW.opacity * shade * fade;
        patch.mesh.visible = patch.material.opacity > 0;
        patch.mesh.position.set(at.x, floor + CONTACT_SHADOW.lift, at.z);
        patch.mesh.scale.setScalar((radius * restSpread(shade)) / CONTACT_SHADOW.radius);
      }
    },
    hide(): void {
      for (const patch of patches) {
        patch.material.opacity = 0;
        patch.mesh.visible = false;
      }
    },
    detach(): void {
      for (const patch of patches) {
        patch.mesh.removeFromParent();
        patch.material.dispose();
      }
    },
  };
}
