import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, PropertyBinding } from 'three';
import { createLobbyLife, LOBBY_LIFE, lifeOffsets } from './lobby-life.ts';

const FRAME: number = 1 / 60;

void test('the lobby hero breathes with the chest only, within its small amplitude', (): void => {
  for (let t: number = 0; t < 8; t += 0.05) assert.ok(Math.abs(lifeOffsets(t, 1).lean) <= LOBBY_LIFE.breathRadians + 1e-9);
  assert.deepEqual(lifeOffsets(1, 0), { lean: 0, headYaw: 0, headPitch: 0 });
});

void test('the head glances slowly around and never jumps between frames', (): void => {
  let maxYaw: number = 0;
  let maxPitch: number = 0;
  let maxJump: number = 0;
  let prev = lifeOffsets(0, 1);
  for (let t: number = FRAME; t < 120; t += FRAME) {
    const o = lifeOffsets(t, 1);
    maxYaw = Math.max(maxYaw, Math.abs(o.headYaw));
    maxPitch = Math.max(maxPitch, Math.abs(o.headPitch));
    maxJump = Math.max(maxJump, Math.abs(o.headYaw - prev.headYaw), Math.abs(o.headPitch - prev.headPitch));
    prev = o;
  }
  assert.ok(maxYaw > LOBBY_LIFE.glanceYawRadians * 0.6 && maxYaw <= LOBBY_LIFE.glanceYawRadians * 1.01, `peak head yaw ${maxYaw.toFixed(3)}`);
  assert.ok(maxPitch > LOBBY_LIFE.glancePitchRadians * 0.5 && maxPitch <= LOBBY_LIFE.glancePitchRadians * 1.01, `peak head pitch ${maxPitch.toFixed(3)}`);
  assert.ok(maxJump < 0.0008, `the head moved ${maxJump.toFixed(5)} rad in one frame`);
});

void test('the life layer never piles up on a bone the idle clip leaves alone', (): void => {
  const root: Bone = new Bone();
  const head: Bone = new Bone();
  head.name = PropertyBinding.sanitizeNodeName(LOBBY_LIFE.head);
  root.add(head);
  const life = createLobbyLife(root, 0.3);
  const angles: number[] = [];
  for (let frame: number = 0; frame < 60 * 30; frame += 1) {
    life.step(FRAME);
    angles.push(2 * Math.acos(Math.min(1, Math.abs(head.quaternion.w))));
  }
  const widest: number = Math.max(...angles);
  assert.ok(widest <= Math.hypot(LOBBY_LIFE.glanceYawRadians, LOBBY_LIFE.glancePitchRadians) * 1.05, `the head turned ${widest.toFixed(3)} rad`);
});
