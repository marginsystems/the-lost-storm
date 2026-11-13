import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Object3D, Quaternion, Vector3 } from 'three';
import type { AttachmentGrip } from '../../sim/content/types.ts';
import type { Digit, FingerChain, GripCylinder, GripHand } from './grip-closure.ts';
import { chainClearance, chainNames, clampFlexion, closeOnGrip, cylinderInHand, flexionOf, GRIP_CLOSURE, gripHand, JOINT_LIMITS } from './grip-closure.ts';

const DEGREES: number = Math.PI / 180;
const CLIP_FIST: number = 78 * DEGREES;
const SEGMENTS: readonly [number, number, number] = [0.045, 0.028, 0.022];
const FINGERS: readonly (readonly [Digit, number])[] = [['index', 0.03], ['middle', 0.01], ['ring', -0.01], ['pinky', -0.028]];
const GRIP: AttachmentGrip = { radius: 0.0175, halfLength: 0.085 };
const PASSING_GAP: number = 0.005;

interface Rig {
  readonly model: Object3D;
  readonly holder: Object3D;
}

function bone(name: string, parent: Object3D, x: number, y: number): Object3D {
  const made: Object3D = new Object3D();
  made.name = name;
  made.position.set(x, y, 0);
  parent.add(made);
  return made;
}

function fistRig(): Rig {
  const model: Object3D = new Object3D();
  const hand: Object3D = bone('DEF-hand.R', model, 0, 0);
  for (const [digit, x] of FINGERS) {
    const [first, second, third] = chainNames(digit, 'R');
    bone(third, bone(second, bone(first, hand, x, 0.1), 0, SEGMENTS[0]), 0, SEGMENTS[1]);
  }
  const holder: Object3D = new Object3D();
  holder.position.set(0, 0.12, 0.028);
  holder.rotation.set(0, 0, -90 * DEGREES);
  hand.add(holder);
  return { model, holder };
}

function clipFist(hand: GripHand): void {
  for (const chain of hand.chains) for (const joint of chain.bones) joint.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), CLIP_FIST);
}

function pointsOf(chain: FingerChain): Vector3[] {
  const points: Vector3[] = chain.bones.map((joint: Object3D): Vector3 => new Vector3().setFromMatrixPosition(joint.matrixWorld));
  const last: Object3D = chain.bones[2];
  return [...points, chain.tip.clone().applyMatrix4(last.matrixWorld)];
}

interface HoldRow {
  readonly digit: Digit;
  readonly gapMm: number;
  readonly flexDegrees: readonly number[];
  readonly pass: boolean;
}

function holdTable(hand: GripHand, cylinder: GripCylinder): HoldRow[] {
  hand.hand.updateWorldMatrix(true, true);
  return hand.chains.map((chain: FingerChain): HoldRow => {
    const gap: number = chainClearance(chain, pointsOf(chain), cylinder);
    const flex: number[] = chain.bones.map((joint: Object3D, index: number): number => flexionOf(chain.rest[index] ?? joint.quaternion, joint.quaternion));
    const inRange: boolean = flex.every((angle: number, index: number): boolean => angle >= -1e-6 && angle <= (JOINT_LIMITS[chain.digit][index] ?? 0) + 1e-6);
    return { digit: chain.digit, gapMm: gap * 1000, flexDegrees: flex.map((angle: number): number => Math.round(angle / DEGREES)), pass: inRange && gap >= GRIP_CLOSURE.gap * 0.5 && gap <= PASSING_GAP };
  });
}

void test('the clip fist sinks into the grip, and contact closure stops every finger between 1 and 5 mm from it', (): void => {
  const rig: Rig = fistRig();
  const hand: GripHand | null = gripHand(rig.model, 'R');
  assert.ok(hand !== null);
  const cylinder: GripCylinder = cylinderInHand(hand.hand, rig.holder, GRIP);
  clipFist(hand);
  const before: HoldRow[] = holdTable(hand, cylinder);
  assert.ok(before.some((row: HoldRow): boolean => row.gapMm < 0), `the plain clip fist should cut into the grip: ${JSON.stringify(before)}`);
  closeOnGrip(hand, rig.holder, GRIP, 1);
  const after: HoldRow[] = holdTable(hand, cylinder);
  assert.deepEqual(
    after.filter((row: HoldRow): boolean => !row.pass),
    [],
    after.map((row: HoldRow): string => `${row.digit} ${row.gapMm.toFixed(1)} mm ${row.flexDegrees.join('/')} ${row.pass ? 'PASS' : 'FAIL'}`).join('\n'),
  );
});

void test('closure at weight zero leaves the clip pose alone, and half weight lands between clip and contact', (): void => {
  const rig: Rig = fistRig();
  const hand: GripHand | null = gripHand(rig.model, 'R');
  assert.ok(hand !== null);
  clipFist(hand);
  closeOnGrip(hand, rig.holder, GRIP, 0);
  for (const chain of hand.chains) for (const joint of chain.bones) assert.ok(Math.abs(flexionOf(new Quaternion(), joint.quaternion) - CLIP_FIST) < 1e-6);
  closeOnGrip(hand, rig.holder, GRIP, 0.5);
  const tip: Object3D | undefined = hand.chains[0]?.bones[2];
  assert.ok(tip !== undefined);
  const flex: number = flexionOf(new Quaternion(), tip.quaternion);
  assert.ok(flex > 0 && flex <= CLIP_FIST * GRIP_CLOSURE.overclose);
});

void test('a finger joint never bends backward and never flexes past its anatomical limit', (): void => {
  const rest: Quaternion = new Quaternion();
  const backward: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -30 * DEGREES);
  clampFlexion(rest, backward, JOINT_LIMITS.index[1]);
  assert.ok(Math.abs(flexionOf(rest, backward)) < 1e-6);
  const over: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 150 * DEGREES);
  clampFlexion(rest, over, JOINT_LIMITS.index[2]);
  assert.ok(Math.abs(flexionOf(rest, over) - JOINT_LIMITS.index[2]) < 1e-6);
  const fine: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 40 * DEGREES);
  const kept: Quaternion = fine.clone();
  clampFlexion(rest, fine, JOINT_LIMITS.index[0]);
  assert.ok(fine.angleTo(kept) < 1e-9);
});

void test('a hand with no finger bones is found with no chains, and a body with no hand bone gives none', (): void => {
  const model: Object3D = new Object3D();
  assert.equal(gripHand(model, 'R'), null);
  bone('DEF-hand.L', model, 0, 0);
  assert.deepEqual(gripHand(model, 'L')?.chains, []);
});
