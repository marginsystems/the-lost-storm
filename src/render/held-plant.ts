import { Quaternion } from 'three';
import type { Object3D } from 'three';

const parentWorld: Quaternion = new Quaternion();
const standing: Quaternion = new Quaternion();

export function plantHeld(holder: Object3D, rest: Quaternion, weight: number): void {
  const parent: Object3D | null = holder.parent;
  if (parent === null || weight <= 0) {
    holder.quaternion.copy(rest);
    return;
  }
  parent.getWorldQuaternion(parentWorld);
  standing.copy(parentWorld).invert();
  holder.quaternion.copy(rest).slerp(standing, Math.min(1, weight));
}
