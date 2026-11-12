import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WakeStage } from '../../sim/world/wake.ts';
import { WAKE_SHOT } from '../opening/wake-shot.ts';
import type { LampOffset } from './wake-light.ts';
import { createWakeLights, lampOffset, WAKE_LIGHT, wakeLit } from './wake-light.ts';

function stage(settle: number): WakeStage {
  return { phase: settle > 0 ? 'settle' : 'rise', stir: 1, rise: settle > 0 ? 1 : 0.5, front: 0.5, settle, through: 0.5 };
}

function cameraSide(offset: LampOffset): { readonly toward: number; readonly right: number } {
  const yaw: number = (WAKE_SHOT.start.yawDegrees * Math.PI) / 180;
  return { toward: offset.x * Math.sin(yaw) + offset.z * Math.cos(yaw), right: offset.x * Math.cos(yaw) - offset.z * Math.sin(yaw) };
}

void test('the wake lights hold full through the rise and ease out over the settle, so play is never lit by them', (): void => {
  assert.equal(wakeLit(null), 0);
  assert.equal(wakeLit(stage(0)), 1);
  assert.equal(wakeLit(stage(1)), 0);
  let before: number = 1;
  for (let settle: number = 0; settle <= 1; settle += 0.01) {
    const lit: number = wakeLit(stage(settle));
    assert.ok(lit <= before + 1e-12);
    assert.ok(Math.abs(lit - before) < 0.02, `the light jumps at settle ${settle}`);
    before = lit;
  }
});

void test('the key comes from in front of the camera and to its left, the rim from behind him', (): void => {
  const key = cameraSide(lampOffset(WAKE_LIGHT.key));
  const rim = cameraSide(lampOffset(WAKE_LIGHT.rim));
  assert.ok(key.toward > 0);
  assert.ok(key.right < 0);
  assert.ok(rim.toward < 0);
  assert.ok(lampOffset(WAKE_LIGHT.key).y > 0 && lampOffset(WAKE_LIGHT.rim).y > 0);
});

void test('the lights follow him and keep their count when they go dark, so no material recompiles at control', (): void => {
  const lights = createWakeLights();
  lights.update({ x: 4, z: -2 }, 0, 1);
  const key = lights.group.children[0];
  assert.ok(key !== undefined);
  const offset: LampOffset = lampOffset(WAKE_LIGHT.key);
  assert.ok(Math.abs(key.position.x - (4 + offset.x)) < 1e-9);
  const before: number = lights.group.children.length;
  lights.update({ x: 4, z: -2 }, 0, 0);
  assert.equal(lights.group.children.length, before);
  assert.ok(lights.group.children.every((child): boolean => child.visible));
  lights.dispose();
});
