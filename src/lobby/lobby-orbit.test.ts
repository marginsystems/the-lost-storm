import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLobbyOrbit, grab, LOBBY_ORBIT, orbitBy, release, stepOrbit, zoomBy } from './lobby-orbit.ts';
import type { LobbyOrbit } from './lobby-orbit.ts';

const FRAME: number = 1 / 60;

function run(orbit: LobbyOrbit, seconds: number): void {
  for (let t: number = 0; t < seconds; t += FRAME) stepOrbit(orbit, FRAME);
}

void test('left alone, the camera slowly circles the hero at one turn per orbit period, easing in', (): void => {
  const orbit: LobbyOrbit = createLobbyOrbit();
  stepOrbit(orbit, FRAME);
  assert.ok(orbit.auto.x < LOBBY_ORBIT.autoRadiansPerSecond * 0.1, `started at ${orbit.auto.x.toFixed(4)} rad/s`);
  run(orbit, 6);
  assert.ok(Math.abs(orbit.auto.x - LOBBY_ORBIT.autoRadiansPerSecond) < 0.01, `turning at ${orbit.auto.x.toFixed(4)} rad/s`);
});

void test('a drag stops the slow orbit, and it only comes back after the hero has been left alone', (): void => {
  const orbit: LobbyOrbit = createLobbyOrbit();
  run(orbit, 6);
  grab(orbit);
  stepOrbit(orbit, FRAME);
  assert.equal(orbit.auto.x, 0);
  release(orbit);
  run(orbit, LOBBY_ORBIT.resumeAfterSeconds * 0.5);
  assert.ok(Math.abs(orbit.auto.x) < 1e-6);
  run(orbit, LOBBY_ORBIT.resumeAfterSeconds + 3);
  assert.ok(orbit.auto.x > LOBBY_ORBIT.autoRadiansPerSecond * 0.5);
});

void test('a quick drag flings the camera on and friction brings it to rest; a drag that stopped before letting go does not fling', (): void => {
  const orbit: LobbyOrbit = createLobbyOrbit();
  grab(orbit);
  orbitBy(orbit, -40, 0, FRAME);
  release(orbit);
  assert.ok(orbit.yaw.v > 1, `fling ${orbit.yaw.v.toFixed(2)} rad/s`);
  assert.ok(orbit.yaw.v <= LOBBY_ORBIT.flingMaxSpeed);
  run(orbit, 3);
  assert.equal(orbit.yaw.v, 0);
  grab(orbit);
  orbitBy(orbit, -40, 0, FRAME);
  run(orbit, 0.3);
  release(orbit);
  assert.equal(orbit.yaw.v, 0);
});

void test('the camera never moves more than a small step in one frame while circling or flung', (): void => {
  const orbit: LobbyOrbit = createLobbyOrbit();
  let last = stepOrbit(orbit, FRAME);
  let jump: number = 0;
  for (let t: number = 0; t < 20; t += FRAME) {
    const view = stepOrbit(orbit, FRAME);
    jump = Math.max(jump, Math.hypot(view.x - last.x, view.y - last.y, view.z - last.z));
    last = view;
  }
  assert.ok(jump < 0.03, `moved ${jump.toFixed(4)} m in a frame`);
});

void test('zoom springs toward its target within the near and far framing', (): void => {
  const orbit: LobbyOrbit = createLobbyOrbit();
  zoomBy(orbit, 5);
  assert.equal(orbit.zoomTarget, 1);
  run(orbit, 3);
  assert.ok(Math.abs(stepOrbit(orbit, FRAME).zoom - 1) < 0.01);
  zoomBy(orbit, -5);
  assert.equal(orbit.zoomTarget, 0);
});

void test('the fling follows the speed of the whole drag, not one jittery last pointer sample', (): void => {
  const orbit: LobbyOrbit = createLobbyOrbit();
  grab(orbit);
  for (let sample: number = 0; sample < 6; sample += 1) orbitBy(orbit, -10, 0, FRAME);
  const steady: number = orbit.yaw.v;
  orbitBy(orbit, -2, 0, 0.001);
  assert.ok(orbit.yaw.v < LOBBY_ORBIT.flingMaxSpeed * 0.6, `a 2 px nudge took the fling to ${orbit.yaw.v.toFixed(2)} rad/s`);
  orbitBy(orbit, -10, 0, 0);
  assert.ok(orbit.yaw.v > steady * 0.5, `a move sharing the last timestamp dropped the fling to ${orbit.yaw.v.toFixed(2)} rad/s`);
  release(orbit);
  assert.ok(orbit.yaw.v > 0.5);
});
