import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { must } from '../../test/support.ts';
import { carriedClip, carryJoints } from './carry-arm.ts';

const AXIS: Vector3 = new Vector3(1, 0, 0);
const SWING_DEGREES: number = 60;
const KEEP: number = 0.25;
const TOLERANCE: number = 1e-5;

function turn(degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(AXIS, (degrees * Math.PI) / 180);
}

function degreesOf(turned: Quaternion): number {
  return (2 * Math.acos(Math.min(1, Math.abs(turned.w))) * 180) / Math.PI;
}

function swing(joint: string, from: number, to: number): QuaternionKeyframeTrack {
  return new QuaternionKeyframeTrack(`${joint}.quaternion`, [0, 1], [...turn(from).toArray(), ...turn(to).toArray()]);
}

function body(): Group {
  const root: Group = new Group();
  const chain: Bone[] = ['spine', 'upperarm_r', 'lowerarm_r', 'hand_r', 'index_01_r'].map((name: string): Bone => {
    const bone: Bone = new Bone();
    bone.name = name;
    return bone;
  });
  chain.forEach((bone: Bone, index: number): void => {
    (chain[index - 1] ?? root).add(bone);
  });
  return root;
}

void test('the holding arm is the hand and the arm joints above it, and stops at the body', (): void => {
  assert.deepEqual([...carryJoints(body(), ['hand_r'], ['upperarm_r', 'lowerarm_r', 'upperarm_l', 'lowerarm_l'])].toSorted(), ['hand_r', 'lowerarm_r', 'upperarm_r']);
  assert.deepEqual([...carryJoints(body(), ['hand_l'], ['upperarm_r'])], []);
});

void test('a holding arm keeps only a share of the gait\'s swing round the pose it holds in, and every other joint is untouched', (): void => {
  const gait: AnimationClip = new AnimationClip('Jog', 1, [swing('upperarm_r', -SWING_DEGREES, SWING_DEGREES), swing('spine', -10, 10)]);
  const held: AnimationClip = new AnimationClip('Idle', 1, [swing('upperarm_r', 0, 0)]);
  const carried: AnimationClip = carriedClip(gait, held, new Set<string>(['upperarm_r']), KEEP);
  const arm = must(carried.tracks.find((track): boolean => track.name === 'upperarm_r.quaternion'), 'arm track');
  assert.ok(Math.abs(degreesOf(new Quaternion().fromArray(arm.values, 0)) - SWING_DEGREES * KEEP) < TOLERANCE * 1e3);
  assert.ok(Math.abs(degreesOf(new Quaternion().fromArray(arm.values, 4)) - SWING_DEGREES * KEEP) < TOLERANCE * 1e3);
  assert.equal(carried.tracks.find((track): boolean => track.name === 'spine.quaternion'), gait.tracks[1]);
  assert.equal(carried.duration, gait.duration);
});

void test('a gait with nothing to steady comes back untouched', (): void => {
  const gait: AnimationClip = new AnimationClip('Jog', 1, [swing('spine', -10, 10)]);
  const held: AnimationClip = new AnimationClip('Idle', 1, [swing('upperarm_r', 0, 0)]);
  assert.equal(carriedClip(gait, held, new Set<string>(['upperarm_r']), KEEP), gait);
  assert.equal(carriedClip(gait, new AnimationClip('Idle', 1, []), new Set<string>(['spine']), KEEP), gait);
});
