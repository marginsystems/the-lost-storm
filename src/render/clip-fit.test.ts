import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, AnimationMixer, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { must } from '../../test/support.ts';
import { fitClip } from './clip-fit.ts';

const RIG = {
  hipsHeight: 1,
  tallHipsHeight: 1.2,
  armReach: 0.3,
  turnTolerance: 1e-5,
  moveTolerance: 1e-5,
} as const;

const AXIS_X: Vector3 = new Vector3(1, 0, 0);
const AXIS_Y: Vector3 = new Vector3(0, 1, 0);
const AXIS_Z: Vector3 = new Vector3(0, 0, 1);

interface Skeleton {
  readonly root: Group;
  readonly hips: Bone;
  readonly arm: Bone;
  readonly hand: Bone;
}

function skeleton(hipsHeight: number, armRest: Quaternion, handRest: Quaternion): Skeleton {
  const root: Group = new Group();
  const hips: Bone = new Bone();
  const arm: Bone = new Bone();
  const hand: Bone = new Bone();
  hips.name = 'hips';
  arm.name = 'arm';
  hand.name = 'hand';
  hips.position.set(0, hipsHeight, 0);
  arm.position.set(0, RIG.armReach, 0);
  arm.quaternion.copy(armRest);
  hand.position.set(0, RIG.armReach, 0);
  hand.quaternion.copy(handRest);
  root.add(hips);
  hips.add(arm);
  arm.add(hand);
  root.updateWorldMatrix(true, true);
  return { root, hips, arm, hand };
}

function turn(axis: Vector3, degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis, (degrees * Math.PI) / 180);
}

function worldTurn(bone: Bone): Quaternion {
  return bone.getWorldQuaternion(new Quaternion());
}

function swingFromRest(rig: Skeleton, clip: AnimationClip, pick: (rig: Skeleton) => Bone): Quaternion {
  const rest: Quaternion = worldTurn(pick(rig));
  const mixer: AnimationMixer = new AnimationMixer(rig.root);
  mixer.clipAction(clip).play();
  mixer.setTime(0);
  rig.root.updateWorldMatrix(true, true);
  const posed: Quaternion = worldTurn(pick(rig));
  mixer.stopAllAction();
  mixer.uncacheRoot(rig.root);
  return posed.multiply(rest.invert());
}

function angleBetween(a: Quaternion, b: Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}

function clipOf(source: Skeleton, arm: Quaternion, hand: Quaternion, hips: Vector3): AnimationClip {
  const armPose: Quaternion = source.arm.quaternion.clone().multiply(arm);
  const handPose: Quaternion = source.hand.quaternion.clone().multiply(hand);
  return new AnimationClip('swing', 1, [
    new QuaternionKeyframeTrack('arm.quaternion', [0, 1], [...armPose.toArray(), ...armPose.toArray()]),
    new QuaternionKeyframeTrack('hand.quaternion', [0, 1], [...handPose.toArray(), ...handPose.toArray()]),
    new VectorKeyframeTrack('hips.position', [0, 1], [...hips.toArray(), ...hips.toArray()]),
  ]);
}

void test('a clip played on a body whose joints rest at other angles turns every joint through the same world swing as on the body it was made for', (): void => {
  const source: Skeleton = skeleton(RIG.hipsHeight, turn(AXIS_Z, 40), turn(AXIS_X, 5));
  const target: Skeleton = skeleton(RIG.hipsHeight, turn(AXIS_Z, 62), turn(AXIS_Y, 17));
  const clip: AnimationClip = clipOf(source, turn(AXIS_X, 70), turn(AXIS_Z, -35), new Vector3(0, RIG.hipsHeight, 0));
  const fitted: AnimationClip = fitClip(clip, source.root, target.root);
  for (const pick of [(rig: Skeleton): Bone => rig.arm, (rig: Skeleton): Bone => rig.hand]) {
    const made: Quaternion = swingFromRest(source, clip, pick);
    const played: Quaternion = swingFromRest(target, fitted, pick);
    assert.ok(angleBetween(made, played) < RIG.turnTolerance, `${pick(target).name} swings ${angleBetween(made, played)} rad away from the source`);
  }
});

void test('a clip that leaves a joint at its rest angle leaves the other body at its own rest angle', (): void => {
  const source: Skeleton = skeleton(RIG.hipsHeight, turn(AXIS_Z, 40), turn(AXIS_X, 5));
  const target: Skeleton = skeleton(RIG.hipsHeight, turn(AXIS_Z, 62), turn(AXIS_Y, 17));
  const fitted: AnimationClip = fitClip(clipOf(source, new Quaternion(), new Quaternion(), new Vector3(0, RIG.hipsHeight, 0)), source.root, target.root);
  const swing: Quaternion = swingFromRest(target, fitted, (rig: Skeleton): Bone => rig.hand);
  assert.ok(angleBetween(swing, new Quaternion()) < RIG.turnTolerance);
});

void test('the hips of a taller body travel further by the ratio of the two hip heights, measured from each body\'s own rest', (): void => {
  const source: Skeleton = skeleton(RIG.hipsHeight, new Quaternion(), new Quaternion());
  const target: Skeleton = skeleton(RIG.tallHipsHeight, new Quaternion(), new Quaternion());
  const crouch: Vector3 = new Vector3(0.1, RIG.hipsHeight - 0.4, 0.2);
  const fitted: AnimationClip = fitClip(clipOf(source, new Quaternion(), new Quaternion(), crouch), source.root, target.root);
  const track = must(fitted.tracks.find((candidate): boolean => candidate.name === 'hips.position'), 'hips track');
  const ratio: number = RIG.tallHipsHeight / RIG.hipsHeight;
  const expected: Vector3 = new Vector3(0.1 * ratio, RIG.tallHipsHeight - 0.4 * ratio, 0.2 * ratio);
  assert.ok(new Vector3().fromArray(track.values, 0).distanceTo(expected) < RIG.moveTolerance);
});

void test('a clip made for the same skeleton comes back untouched, and a track for a joint the body lacks is dropped', (): void => {
  const source: Skeleton = skeleton(RIG.hipsHeight, turn(AXIS_Z, 40), turn(AXIS_X, 5));
  const same: Skeleton = skeleton(RIG.hipsHeight, turn(AXIS_Z, 40), turn(AXIS_X, 5));
  const clip: AnimationClip = clipOf(source, turn(AXIS_X, 70), turn(AXIS_Z, -35), new Vector3(0, RIG.hipsHeight - 0.2, 0));
  assert.equal(fitClip(clip, source.root, same.root), clip);
  same.hand.removeFromParent();
  const fitted: AnimationClip = fitClip(clip, source.root, same.root);
  assert.deepEqual(fitted.tracks.map((track): string => track.name), ['arm.quaternion', 'hips.position']);
});
