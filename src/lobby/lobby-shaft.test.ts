import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { createLobbyShaft, LOBBY_SHAFT, SHAFT_FRAGMENT, shaftPlace } from './lobby-shaft.ts';

void test('the shaft of light stands on one spot of the floor, just behind the hero from wherever the view is, and faces the view', (): void => {
  for (const turn of [0, 0.7, 1.9, 3.1, 4.4, 5.6]) {
    const cameraX: number = Math.sin(turn) * 10;
    const cameraZ: number = Math.cos(turn) * 10;
    const place = shaftPlace(cameraX, cameraZ);
    assert.ok(Math.abs(Math.hypot(place.x, place.z) - LOBBY_SHAFT.behind) < 1e-9, 'the shaft left its spot');
    assert.ok(place.x * cameraX + place.z * cameraZ < 0, 'the shaft is in front of the hero');
    assert.ok(Math.abs(Math.sin(place.yaw - turn)) < 1e-9 && Math.cos(place.yaw - turn) > 0, `the shaft is edge-on at ${turn}`);
  }
  assert.deepEqual(shaftPlace(0, 0), { x: 0, z: 0, yaw: 0 });
});

void test('the shaft does not follow the hero\'s head or anything else that moves: only the view turning moves it, and only around its spot', (): void => {
  const shaft = createLobbyShaft();
  const camera: PerspectiveCamera = new PerspectiveCamera();
  camera.position.set(3, 1.4, 9);
  shaft.step(0.016, camera);
  const first: readonly number[] = shaft.mesh.position.toArray();
  camera.position.y = 5;
  shaft.step(0.016, camera);
  assert.deepEqual(shaft.mesh.position.toArray(), first);
  assert.equal(shaft.mesh.material.depthWrite, false);
  assert.equal(shaft.mesh.material.depthTest, true);
});

void test('the shaft fades out at its foot, its top and both sides, so the sheet it is drawn on never shows an edge', (): void => {
  assert.ok(SHAFT_FRAGMENT.includes('smoothstep(-0.4, 0.35, high)'));
  assert.ok(SHAFT_FRAGMENT.includes('(1.0 - smoothstep(6.4, 8.3, high))'));
  assert.ok(SHAFT_FRAGMENT.includes('(1.0 - smoothstep(0.0, 1.0, abs(angle)))'));
  const sheet: { readonly tall: number; readonly below: number; readonly across: number } = LOBBY_SHAFT;
  assert.ok(sheet.tall - sheet.below > 8.3, 'the sheet ends before the shaft has faded at its top');
  assert.ok(sheet.below >= 0.4, 'the sheet ends before the shaft has faded at its foot');
  assert.ok(sheet.across / 2 > 1.3, 'the sheet is narrower than the shaft');
});

void test('the shaft shader has no unclamped pow and no reversed smoothstep', (): void => {
  assert.deepEqual(unsafeGlsl(SHAFT_FRAGMENT), []);
});
