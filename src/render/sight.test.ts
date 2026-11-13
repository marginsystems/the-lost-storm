import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera } from 'three';
import type { Sight } from './sight.ts';
import { cameraSight, SEES_ALL, SIGHT } from './sight.ts';

function looking(): PerspectiveCamera {
  const camera: PerspectiveCamera = new PerspectiveCamera(30, 1.6, 1, 220);
  camera.position.set(0, 30, 30);
  camera.lookAt(0, 0, 0);
  return camera;
}

void test('a rig in front of the camera is seen and one far behind it is not', (): void => {
  const sight: Sight = cameraSight(looking());
  sight.refresh();
  assert.equal(sight.sees(0, 1, 0, 1), true);
  assert.equal(sight.sees(0, 1, 120, 1), false);
  assert.equal(sight.sees(80, 1, 0, 1), false);
});

void test('a rig just past the edge of the view is still seen inside the margin, so it is posed before it enters', (): void => {
  const camera: PerspectiveCamera = looking();
  const tight: Sight = cameraSight(camera, 0);
  const loose: Sight = cameraSight(camera);
  tight.refresh();
  loose.refresh();
  let edge: number = 0;
  while (tight.sees(edge, 1, 0, 0.5)) edge += 0.25;
  assert.equal(loose.sees(edge + SIGHT.margin / 2, 1, 0, 0.5), true);
});

void test('the camera moving is picked up on refresh', (): void => {
  const camera: PerspectiveCamera = looking();
  const sight: Sight = cameraSight(camera);
  sight.refresh();
  assert.equal(sight.sees(200, 1, 0, 1), false);
  camera.position.set(200, 30, 30);
  camera.lookAt(200, 0, 0);
  sight.refresh();
  assert.equal(sight.sees(200, 1, 0, 1), true);
});

void test('without a camera every rig counts as seen', (): void => {
  assert.equal(SEES_ALL.sees(1e6, 0, 1e6, 0), true);
});
