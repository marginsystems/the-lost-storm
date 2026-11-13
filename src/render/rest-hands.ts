import type { AnimationAction, AnimationClip, AnimationMixer, Object3D } from 'three';
import { Euler, PropertyBinding, Quaternion } from 'three';
import type { RigDef } from '../../sim/content/types.ts';

export interface RestFinger {
  readonly bone: Object3D;
  readonly rest: Quaternion;
}

export interface RestHand {
  readonly socket: string;
  readonly fingers: readonly RestFinger[];
}

const DEGREES: number = Math.PI / 180;

function boneNamed(model: Object3D, name: string): Object3D | undefined {
  return model.getObjectByName(PropertyBinding.sanitizeNodeName(name)) ?? model.getObjectByName(name);
}

export function restHands(model: Object3D, def: RigDef): RestHand[] {
  return Object.entries(def.restHands).map(([socket, turns]: [string, RigDef['restHands'][string]]): RestHand => ({
    socket,
    fingers: Object.entries(turns).flatMap(([name, [x, y, z]]: [string, readonly [number, number, number]]): RestFinger[] => {
      const bone: Object3D | undefined = boneNamed(model, name);
      if (bone === undefined) return [];
      return [{ bone, rest: bone.quaternion.clone().multiply(new Quaternion().setFromEuler(new Euler(x * DEGREES, y * DEGREES, z * DEGREES))) }];
    }),
  }));
}

export function idleWeight(mixer: AnimationMixer, idles: readonly AnimationClip[]): number {
  const weight: number = idles.reduce((sum: number, clip: AnimationClip): number => {
    const action: AnimationAction | null = mixer.existingAction(clip);
    return action !== null && action.isRunning() ? sum + action.getEffectiveWeight() : sum;
  }, 0);
  return Math.min(1, Math.max(0, weight));
}

export function relaxHands(hands: readonly RestHand[], weight: number, holding: ReadonlySet<string>): void {
  if (weight <= 0) return;
  for (const hand of hands) {
    if (holding.has(hand.socket)) continue;
    for (const finger of hand.fingers) finger.bone.quaternion.slerp(finger.rest, weight);
  }
}

export interface HeldBone {
  readonly bone: Object3D;
  readonly pose: Quaternion;
}

export interface HeldPose {
  readonly attachment: string;
  readonly bones: readonly HeldBone[];
}

export function heldPoses(model: Object3D, def: Pick<RigDef, 'holds'>): HeldPose[] {
  return Object.entries(def.holds).map(([attachment, hold]: [string, RigDef['holds'][string]]): HeldPose => ({
    attachment,
    bones: Object.entries(hold.bones).flatMap(([name, [x, y, z, w]]: [string, readonly [number, number, number, number]]): HeldBone[] => {
      const bone: Object3D | undefined = boneNamed(model, name);
      return bone === undefined ? [] : [{ bone, pose: new Quaternion(x, y, z, w).normalize() }];
    }),
  }));
}

export function holdPoses(poses: readonly HeldPose[], weights: ReadonlyMap<string, number>): void {
  for (const pose of poses) {
    const weight: number = Math.min(1, Math.max(0, weights.get(pose.attachment) ?? 0));
    if (weight <= 0) continue;
    for (const held of pose.bones) held.bone.quaternion.slerp(held.pose, weight);
  }
}
