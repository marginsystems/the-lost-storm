import type { Object3D } from 'three';
import { Matrix4, PropertyBinding, Quaternion, Vector3 } from 'three';
import type { AttachmentGrip } from '../../sim/content/types.ts';

export type Digit = 'index' | 'middle' | 'ring' | 'pinky' | 'thumb';
export type HandSide = 'L' | 'R';
export type JointTriple = readonly [number, number, number];

export const DIGITS: readonly Digit[] = ['index', 'middle', 'ring', 'pinky', 'thumb'];

export const GRIP_CLOSURE = {
  gap: 0.002,
  tipShare: 0.85,
  samples: 6,
  steps: 10,
  overclose: 1.25,
  still: 0.001,
} as const;

export const FINGER_RADIUS: Readonly<Record<Digit, number>> = { index: 0.0085, middle: 0.009, ring: 0.0085, pinky: 0.0075, thumb: 0.0095 };

export const JOINT_LIMITS: Readonly<Record<Digit, JointTriple>> = {
  index: [1.6, 1.95, 1.4],
  middle: [1.6, 1.95, 1.4],
  ring: [1.6, 1.95, 1.4],
  pinky: [1.65, 1.95, 1.4],
  thumb: [0.9, 1.2, 1.6],
};

const PHASES: readonly (readonly number[])[] = [[0, 1, 2], [1, 2], [2]];
const FLEX_AXIS: Vector3 = new Vector3(1, 0, 0);

export interface FingerChain {
  readonly digit: Digit;
  readonly bones: readonly [Object3D, Object3D, Object3D];
  readonly rest: readonly [Quaternion, Quaternion, Quaternion];
  readonly tip: Vector3;
}

export interface GripHand {
  readonly hand: Object3D;
  readonly side: HandSide;
  readonly chains: readonly FingerChain[];
}

export interface GripCylinder {
  readonly origin: Vector3;
  readonly axis: Vector3;
  readonly radius: number;
  readonly halfLength: number;
}

interface Flex {
  readonly axis: Vector3;
  readonly target: number;
}

function boneNamed(model: Object3D, name: string): Object3D | undefined {
  return model.getObjectByName(PropertyBinding.sanitizeNodeName(name)) ?? model.getObjectByName(name);
}

export function chainNames(digit: Digit, side: HandSide): readonly [string, string, string] {
  const stem: string = digit === 'thumb' ? 'DEF-thumb' : `DEF-f_${digit}`;
  return [`${stem}.01.${side}`, `${stem}.02.${side}`, `${stem}.03.${side}`];
}

export function gripHand(model: Object3D, side: HandSide): GripHand | null {
  const hand: Object3D | undefined = boneNamed(model, `DEF-hand.${side}`);
  if (hand === undefined) return null;
  const chains: FingerChain[] = DIGITS.flatMap((digit: Digit): FingerChain[] => {
    const [first, second, third] = chainNames(digit, side).map((name: string): Object3D | undefined => boneNamed(model, name));
    if (first === undefined || second === undefined || third === undefined) return [];
    return [{ digit, bones: [first, second, third], rest: [first.quaternion.clone(), second.quaternion.clone(), third.quaternion.clone()], tip: new Vector3(0, third.position.length() * GRIP_CLOSURE.tipShare, 0) }];
  });
  return { hand, side, chains };
}

const scratchDelta: Quaternion = new Quaternion();
const scratchTwist: Quaternion = new Quaternion();
const scratchSwing: Quaternion = new Quaternion();
const scratchTurn: Quaternion = new Quaternion();

export function flexionOf(rest: Quaternion, pose: Quaternion): number {
  const delta: Quaternion = scratchDelta.copy(rest).invert().multiply(pose);
  const sign: number = delta.w < 0 ? -1 : 1;
  return 2 * Math.atan2(delta.x * sign, delta.w * sign);
}

export function clampFlexion(rest: Quaternion, pose: Quaternion, limit: number): void {
  const delta: Quaternion = scratchDelta.copy(rest).invert().multiply(pose);
  const sign: number = delta.w < 0 ? -1 : 1;
  const flex: number = 2 * Math.atan2(delta.x * sign, delta.w * sign);
  const kept: number = Math.min(limit, Math.max(0, flex));
  if (kept === flex) return;
  scratchTwist.set(delta.x, 0, 0, delta.w);
  if (scratchTwist.lengthSq() < 1e-12) return;
  scratchTwist.normalize();
  scratchSwing.copy(delta).multiply(scratchTwist.invert());
  pose.copy(rest).multiply(scratchSwing).multiply(scratchTurn.setFromAxisAngle(FLEX_AXIS, kept));
}

export function clampHand(hand: GripHand): void {
  for (const chain of hand.chains) {
    const limits: JointTriple = JOINT_LIMITS[chain.digit];
    chain.bones.forEach((bone: Object3D, joint: number): void => clampFlexion(chain.rest[joint] ?? bone.quaternion, bone.quaternion, limits[joint] ?? 0));
  }
}

const scratchHandInverse: Matrix4 = new Matrix4();
const scratchToHand: Matrix4 = new Matrix4();

export function cylinderInHand(hand: Object3D, holder: Object3D, grip: AttachmentGrip): GripCylinder {
  hand.updateWorldMatrix(true, false);
  holder.updateWorldMatrix(true, false);
  scratchToHand.copy(scratchHandInverse.copy(hand.matrixWorld).invert()).multiply(holder.matrixWorld);
  const origin: Vector3 = new Vector3().setFromMatrixPosition(scratchToHand);
  const along: Vector3 = new Vector3(0, 1, 0).applyMatrix4(scratchToHand).sub(origin);
  const scale: number = along.length();
  return { origin, axis: along.normalize(), radius: grip.radius * scale, halfLength: grip.halfLength * scale };
}

function flexOf(rest: Quaternion, pose: Quaternion, limit: number): Flex {
  const delta: Quaternion = scratchDelta.copy(rest).invert().multiply(pose);
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  const angle: number = 2 * Math.acos(Math.min(1, delta.w));
  const axis: Vector3 = angle < GRIP_CLOSURE.still ? FLEX_AXIS.clone() : new Vector3(delta.x, delta.y, delta.z).normalize();
  const bent: number = axis.x < 0 ? 0 : angle;
  return { axis, target: Math.min(limit, bent * GRIP_CLOSURE.overclose) };
}

const scratchLocal: readonly [Matrix4, Matrix4, Matrix4] = [new Matrix4(), new Matrix4(), new Matrix4()];
const scratchJoint: Matrix4 = new Matrix4();
const scratchPoints: readonly Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const scratchOne: Vector3 = new Vector3(1, 1, 1);
const scratchSample: Vector3 = new Vector3();
const scratchQuaternion: Quaternion = new Quaternion();

function poseQuaternion(rest: Quaternion, flex: Flex, angle: number, out: Quaternion): Quaternion {
  return out.copy(rest).multiply(scratchTurn.setFromAxisAngle(flex.axis, angle));
}

function fingerPoints(chain: FingerChain, flexes: readonly Flex[], angles: readonly number[]): readonly Vector3[] {
  scratchJoint.identity();
  chain.bones.forEach((bone: Object3D, joint: number): void => {
    const rest: Quaternion | undefined = chain.rest[joint];
    const flex: Flex | undefined = flexes[joint];
    const local: Matrix4 | undefined = scratchLocal[joint];
    const point: Vector3 | undefined = scratchPoints[joint];
    if (rest === undefined || flex === undefined || local === undefined || point === undefined) return;
    local.compose(bone.position, poseQuaternion(rest, flex, angles[joint] ?? 0, scratchQuaternion), scratchOne);
    scratchJoint.multiply(local);
    point.setFromMatrixPosition(scratchJoint);
  });
  scratchPoints[3]?.copy(chain.tip).applyMatrix4(scratchJoint);
  return scratchPoints;
}

export function clearance(point: Vector3, cylinder: GripCylinder, reach: number): number {
  scratchSample.copy(point).sub(cylinder.origin);
  const along: number = scratchSample.dot(cylinder.axis);
  if (Math.abs(along) > cylinder.halfLength + reach) return Number.POSITIVE_INFINITY;
  return scratchSample.addScaledVector(cylinder.axis, -along).length() - cylinder.radius;
}

export function probeSegments(digit: Digit): readonly (readonly [number, number])[] {
  return digit === 'thumb' ? [[2, 3]] : [[1, 2], [2, 3]];
}

export function chainClearance(chain: FingerChain, points: readonly Vector3[], cylinder: GripCylinder): number {
  const reach: number = FINGER_RADIUS[chain.digit];
  let nearest: number = Number.POSITIVE_INFINITY;
  for (const [from, to] of probeSegments(chain.digit)) {
    const start: Vector3 | undefined = points[from];
    const end: Vector3 | undefined = points[to];
    if (start === undefined || end === undefined) continue;
    for (let index: number = 0; index <= GRIP_CLOSURE.samples; index += 1) {
      const sample: Vector3 = new Vector3().lerpVectors(start, end, index / GRIP_CLOSURE.samples);
      nearest = Math.min(nearest, clearance(sample, cylinder, reach) - reach);
    }
  }
  return nearest;
}

function touches(chain: FingerChain, flexes: readonly Flex[], angles: readonly number[], cylinder: GripCylinder): boolean {
  return chainClearance(chain, fingerPoints(chain, flexes, angles), cylinder) < GRIP_CLOSURE.gap;
}

export function closedAngles(chain: FingerChain, cylinder: GripCylinder): readonly number[] {
  const limits: JointTriple = JOINT_LIMITS[chain.digit];
  const flexes: readonly Flex[] = chain.bones.map((bone: Object3D, joint: number): Flex => flexOf(chain.rest[joint] ?? bone.quaternion, bone.quaternion, limits[joint] ?? 0));
  const angles: number[] = [0, 0, 0];
  if (touches(chain, flexes, angles, cylinder)) return angles;
  for (const phase of PHASES) {
    const from: readonly number[] = [...angles];
    const at = (share: number): readonly number[] => angles.map((angle: number, joint: number): number => (phase.includes(joint) ? (from[joint] ?? 0) + share * ((flexes[joint]?.target ?? 0) - (from[joint] ?? 0)) : angle));
    let low: number = 0;
    let high: number = 1;
    if (!touches(chain, flexes, at(1), cylinder)) low = 1;
    else {
      for (let step: number = 0; step < GRIP_CLOSURE.steps; step += 1) {
        const middle: number = (low + high) / 2;
        if (touches(chain, flexes, at(middle), cylinder)) high = middle;
        else low = middle;
      }
    }
    at(low).forEach((angle: number, joint: number): void => {
      angles[joint] = angle;
    });
  }
  return angles;
}

export function closeOnGrip(hand: GripHand, holder: Object3D, grip: AttachmentGrip, weight: number): void {
  if (weight <= 0) return;
  const cylinder: GripCylinder = cylinderInHand(hand.hand, holder, grip);
  const share: number = Math.min(1, weight);
  for (const chain of hand.chains) {
    const limits: JointTriple = JOINT_LIMITS[chain.digit];
    const flexes: readonly Flex[] = chain.bones.map((bone: Object3D, joint: number): Flex => flexOf(chain.rest[joint] ?? bone.quaternion, bone.quaternion, limits[joint] ?? 0));
    const angles: readonly number[] = closedAngles(chain, cylinder);
    chain.bones.forEach((bone: Object3D, joint: number): void => {
      const rest: Quaternion | undefined = chain.rest[joint];
      const flex: Flex | undefined = flexes[joint];
      if (rest === undefined || flex === undefined) return;
      bone.quaternion.slerp(poseQuaternion(rest, flex, angles[joint] ?? 0, scratchQuaternion), share);
    });
  }
}
