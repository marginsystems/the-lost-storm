import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { ExportedHold, SavedPose } from './hold-pose.ts';
import { exportHold, formatRigs, heldBones, parentOf, readSavedPose, seatIn, sideOf, withHold } from './hold-pose.ts';

const DEGREES: number = Math.PI / 180;
const GLTF_TO_BLENDER_LOCAL: Matrix4 = new Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function rows(matrix: Matrix4): number[][] {
  const e: number[] = matrix.elements;
  return [0, 1, 2, 3].map((row: number): number[] => [e[row] ?? 0, e[row + 4] ?? 0, e[row + 8] ?? 0, e[row + 12] ?? 0]);
}

function turn(axis: Vector3, angle: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis.normalize(), angle);
}

function savedPose(locals: ReadonlyMap<string, Quaternion>, weapon: Matrix4 | null): unknown {
  const world: Map<string, Matrix4> = new Map<string, Matrix4>([['DEF-spine.003', new Matrix4().makeRotationFromQuaternion(turn(new Vector3(0, 0, 1), 0.3)).setPosition(0, 0, 1.4)]]);
  for (const bone of heldBones('R')) {
    const parent: Matrix4 | undefined = world.get(parentOf(bone, 'R'));
    assert.ok(parent !== undefined);
    world.set(bone, parent.clone().multiply(new Matrix4().compose(new Vector3(0, 0.1, 0), locals.get(bone) ?? new Quaternion(), new Vector3(1, 1, 1))));
  }
  return { bones_world: Object.fromEntries([...world].map(([name, matrix]: [string, Matrix4]): [string, number[][]] => [name, rows(matrix)])), gun: weapon === null ? undefined : { matrix_world: rows(weapon) } };
}

void test('a saved pose exports each arm and finger bone as its turn from its parent, the way the rig nests them', (): void => {
  const locals: Map<string, Quaternion> = new Map<string, Quaternion>(heldBones('R').map((bone: string, index: number): [string, Quaternion] => [bone, turn(new Vector3(1, index % 3, 0.5), 0.1 + index * 0.05)]));
  const hold: ExportedHold = exportHold(readSavedPose(savedPose(locals, null)), 'R', false);
  assert.deepEqual(Object.keys(hold.bones), [...heldBones('R')]);
  for (const [bone, expected] of locals) {
    const [x, y, z, w] = hold.bones[bone] ?? [0, 0, 0, 0];
    const sign: number = expected.w < 0 ? -1 : 1;
    assert.ok(Math.max(Math.abs(x - expected.x * sign), Math.abs(y - expected.y * sign), Math.abs(z - expected.z * sign), Math.abs(w - expected.w * sign)) < 1e-5, bone);
  }
  assert.equal(hold.seat, null);
});

void test('the held weapon becomes a seat in the hand bone, turned from Blender\'s object axes to the game\'s', (): void => {
  const pose: SavedPose = readSavedPose(savedPose(new Map<string, Quaternion>(), null));
  const hand: Matrix4 | undefined = pose.bonesWorld.get('DEF-hand.R');
  assert.ok(hand !== undefined);
  const inHand: Matrix4 = new Matrix4().compose(new Vector3(0.01, 0.09, -0.02), turn(new Vector3(0.2, 1, 0.3), 1.1), new Vector3(0.9, 0.9, 0.9));
  const weapon: Matrix4 = hand.clone().multiply(inHand).multiply(GLTF_TO_BLENDER_LOCAL.clone().invert());
  const seat = seatIn(hand, weapon);
  assert.deepEqual(seat.position, [0.01, 0.09, -0.02]);
  assert.equal(seat.scale, 0.9);
  const [x, y, z] = seat.rotationDegrees;
  const placed: Quaternion = new Quaternion().setFromEuler(new Euler(x * DEGREES, y * DEGREES, z * DEGREES, 'XYZ'));
  assert.ok(placed.angleTo(turn(new Vector3(0.2, 1, 0.3), 1.1)) < 1e-3);
});

void test('an unevenly scaled weapon and a pose without a bone the hold needs are refused', (): void => {
  const pose: SavedPose = readSavedPose(savedPose(new Map<string, Quaternion>(), null));
  const hand: Matrix4 | undefined = pose.bonesWorld.get('DEF-hand.R');
  assert.ok(hand !== undefined);
  assert.throws((): void => {
    seatIn(hand, hand.clone().scale(new Vector3(1, 2, 1)));
  });
  assert.throws((): void => {
    exportHold(readSavedPose({ bones_world: {} }), 'R', false);
  });
  assert.throws((): void => {
    readSavedPose({ bones_world: { 'DEF-hand.R': [[1, 0, 0]] } });
  });
});

void test('rigs keep their layout, and a hold goes under its attachment with the seat only when asked', (): void => {
  const rigs: unknown = [{ id: 'hero', base: ['hair'], sockets: { hand_r: { bone: 'DEF-hand.R', position: [0, 1, 2], rotationDegrees: [0, 0, 0], scale: 1 } }, restHands: { hand_r: { 'DEF-f_index.01.R': [-4, 0, 1] } } }];
  const attachments: unknown = [{ id: 'rusted_blade', socket: 'hand_r' }, { id: 'staff', socket: 'hand_r' }];
  const hold: ExportedHold = { bones: { 'DEF-hand.R': [0, 0, 0, 1] }, seat: { position: [0.1, 0.2, 0.3], rotationDegrees: [10, 20, 30], scale: 0.9 } };
  assert.equal(sideOf(rigs, attachments, 'hero', 'rusted_blade'), 'R');
  const kept: string = formatRigs(withHold(rigs, 'hero', 'rusted_blade', hold, false));
  assert.ok(kept.includes('"base": ["hair"]'));
  assert.ok(kept.includes('"DEF-f_index.01.R": [-4, 0, 1]'));
  assert.ok(kept.includes('"DEF-hand.R": [0, 0, 0, 1]'));
  assert.ok(kept.includes('"seat": null'));
  assert.ok(kept.includes('"position": [\n'));
  const seated: unknown = withHold(rigs, 'hero', 'rusted_blade', hold, true);
  const text: string = formatRigs(seated);
  assert.ok(text.includes('"rusted_blade": {'));
  assert.ok(text.includes('"scale": 0.9'));
  assert.ok(!text.includes('"staff"'));
  assert.ok(formatRigs(withHold(seated, 'hero', 'rusted_blade', hold, false)).includes('"scale": 0.9'));
  assert.throws((): void => {
    withHold(rigs, 'nobody', 'rusted_blade', hold, false);
  });
  assert.throws((): void => {
    sideOf(rigs, attachments, 'hero', 'absent');
  });
});
