import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Quaternion, Vector3 } from 'three';
import { plantHeld } from './held-plant.ts';

const TILT: number = Math.PI / 5;

function hung(): { readonly bone: Group; readonly holder: Group; readonly rest: Quaternion } {
  const bone: Group = new Group();
  bone.rotation.set(0.9, -0.4, 1.3);
  const holder: Group = new Group();
  holder.rotation.set(TILT, 1.2, 0);
  bone.add(holder);
  bone.updateMatrixWorld(true);
  return { bone, holder, rest: holder.quaternion.clone() };
}

function axisOf(holder: Group): Vector3 {
  holder.updateWorldMatrix(true, false);
  return new Vector3(0, 1, 0).applyQuaternion(holder.getWorldQuaternion(new Quaternion()));
}

void test('with no weight a held piece keeps the way its socket holds it', (): void => {
  const { holder, rest } = hung();
  holder.rotation.set(2, 2, 2);
  plantHeld(holder, rest, 0);
  assert.ok(holder.quaternion.angleTo(rest) < 1e-9);
});

void test('with full weight a held piece stands straight up in the world, whatever way the hand is turned', (): void => {
  const { holder, rest } = hung();
  plantHeld(holder, rest, 1);
  const up: Vector3 = axisOf(holder);
  assert.ok(up.distanceTo(new Vector3(0, 1, 0)) < 1e-6, `axis ${up.toArray().join(', ')}`);
});

void test('half the weight leans the piece part of the way, so the change is a glide and not a jump', (): void => {
  const { holder, rest } = hung();
  const loose: number = axisOf(holder).angleTo(new Vector3(0, 1, 0));
  plantHeld(holder, rest, 0.5);
  const leaning: number = axisOf(holder).angleTo(new Vector3(0, 1, 0));
  assert.ok(leaning > 0 && leaning < loose, `${leaning} against ${loose}`);
});

void test('a piece with nothing to hang from is left as its socket holds it', (): void => {
  const holder: Group = new Group();
  holder.rotation.set(1, 0, 0);
  const rest: Quaternion = holder.quaternion.clone();
  holder.rotation.set(0, 1, 0);
  plantHeld(holder, rest, 1);
  assert.ok(holder.quaternion.angleTo(rest) < 1e-9);
});
