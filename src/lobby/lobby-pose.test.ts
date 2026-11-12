import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Quaternion, Vector3 } from 'three';
import { poseBones, settlePose, turnPose } from './lobby-pose.ts';
import type { PosedBone } from './lobby-pose.ts';

function rig(): { readonly root: Object3D; readonly arm: Object3D } {
  const root: Object3D = new Object3D();
  const arm: Object3D = new Object3D();
  arm.name = 'DEF-upper_armL';
  root.add(arm);
  return { root, arm };
}

void test('a pose finds bones by their rig name and skips the ones the body lacks', (): void => {
  const { root, arm } = rig();
  const posed: readonly PosedBone[] = poseBones(root, [['DEF-upper_arm.L', 0, 0, 10], ['DEF-tail', 0, 0, 10]]);
  assert.equal(posed.length, 1);
  assert.equal(posed[0]?.bone, arm);
});

void test('a turn lands on top of the clip once per frame and never piles up on a bone the clip leaves alone', (): void => {
  const { root, arm } = rig();
  const posed: readonly PosedBone[] = poseBones(root, [['DEF-upper_arm.L', 0, 0, 90]]);
  for (let frame: number = 0; frame < 3; frame += 1) {
    settlePose(posed);
    turnPose(posed);
  }
  const quarter: Quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  assert.ok(arm.quaternion.angleTo(quarter) < 1e-6);
});
