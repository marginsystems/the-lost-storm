import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, Group, Mesh, MeshBasicMaterial } from 'three';
import type { Object3D } from 'three';
import { CONTACT_SHADOW_NAME } from './contact-shadow.ts';
import { createRestShadows, REST_SHADOW, restFade, restShade, restSpread } from './rest-shadows.ts';

const FLOOR: number = 0;
const RADIUS: number = 0.05;

function patches(parent: Object3D): Object3D[] {
  const found: Object3D[] = [];
  parent.traverse((node: Object3D): void => {
    if (node.name === CONTACT_SHADOW_NAME) found.push(node);
  });
  return found;
}

function opacityOf(node: Object3D): number {
  if (!(node instanceof Mesh)) return -1;
  const material: unknown = node.material;
  return material instanceof MeshBasicMaterial ? material.opacity : -1;
}

void test('a part touching the ground is fully shaded and the shade falls away smoothly to nothing at its reach', (): void => {
  assert.equal(restShade(0, REST_SHADOW.reach), 1);
  assert.equal(restShade(-0.02, REST_SHADOW.reach), 1);
  assert.equal(restShade(REST_SHADOW.reach, REST_SHADOW.reach), 0);
  assert.equal(restShade(REST_SHADOW.reach * 3, REST_SHADOW.reach), 0);
  let before: number = 1;
  for (let gap: number = 0; gap <= REST_SHADOW.reach; gap += REST_SHADOW.reach / 40) {
    const now: number = restShade(gap, REST_SHADOW.reach);
    assert.ok(now <= before && before - now < 0.06, `shade steps at ${gap}`);
    before = now;
  }
});

void test('the shadows hold through the push-up and are gone by the time he stands', (): void => {
  assert.equal(restFade(0), 1);
  assert.equal(restFade(REST_SHADOW.fadeFrom), 1);
  assert.equal(restFade(1), 0);
  assert.ok(restFade((REST_SHADOW.fadeFrom + 1) / 2) > 0 && restFade((REST_SHADOW.fadeFrom + 1) / 2) < 1);
});

void test('a shadow tightens as its part comes down onto the ground', (): void => {
  assert.equal(restSpread(0), REST_SHADOW.spread);
  assert.equal(restSpread(1), REST_SHADOW.nearSpread);
  assert.ok(restSpread(0.5) < restSpread(0) && restSpread(0.5) > restSpread(1));
});

void test('each resting joint gets its own shadow on the floor under it, dark when it touches and absent when it is lifted', (): void => {
  const scene: Group = new Group();
  const hand: Bone = new Bone();
  const head: Bone = new Bone();
  hand.position.set(0.4, FLOOR + RADIUS, -0.2);
  head.position.set(-0.6, FLOOR + RADIUS + REST_SHADOW.reach * 2, 0.1);
  scene.add(hand, head);
  scene.updateMatrixWorld(true);
  const shadows = createRestShadows([
    { bone: hand, radius: RADIUS },
    { bone: head, radius: RADIUS },
  ]);
  shadows.place(scene, FLOOR, 1, 0);
  const [under, lifted] = patches(scene);
  assert.ok(under !== undefined && lifted !== undefined);
  assert.equal(under.visible, true);
  assert.equal(opacityOf(under), REST_SHADOW.opacity);
  assert.equal(under.position.x, 0.4);
  assert.equal(under.position.z, -0.2);
  assert.equal(lifted.visible, false);
  shadows.place(scene, FLOOR, 1, 1);
  assert.equal(under.visible, false);
  shadows.place(scene, FLOOR, 1, 0);
  shadows.hide();
  assert.equal(under.visible, false);
});
