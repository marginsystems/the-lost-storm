import type { Object3D } from 'three';
import { Euler, PropertyBinding, Quaternion } from 'three';

export type PoseTurn = readonly [bone: string, x: number, y: number, z: number];

export interface PosedBone {
  readonly bone: Object3D;
  readonly rest: Quaternion;
  readonly turn: Quaternion;
}

const DEGREES: number = Math.PI / 180;

function boneNamed(root: Object3D, name: string): Object3D | undefined {
  return root.getObjectByName(PropertyBinding.sanitizeNodeName(name)) ?? root.getObjectByName(name);
}

export function poseBones(root: Object3D, turns: readonly PoseTurn[]): PosedBone[] {
  const posed: PosedBone[] = [];
  for (const [name, x, y, z] of turns) {
    const bone: Object3D | undefined = boneNamed(root, name);
    if (bone === undefined) continue;
    posed.push({ bone, rest: bone.quaternion.clone(), turn: new Quaternion().setFromEuler(new Euler(x * DEGREES, y * DEGREES, z * DEGREES)) });
  }
  return posed;
}

export function settlePose(posed: readonly PosedBone[]): void {
  for (const entry of posed) entry.bone.quaternion.copy(entry.rest);
}

export function turnPose(posed: readonly PosedBone[]): void {
  for (const entry of posed) entry.bone.quaternion.multiply(entry.turn);
}
