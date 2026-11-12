import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA } from '../render/iso-camera.ts';
import type { ArrowPlacement, ArrowView, GroundPoint, Point, Projector } from './arrow-geometry.ts';
import { arrowAlong, arrowToward } from './arrow-geometry.ts';

const VIEW: ArrowView = { width: 1440, height: 900, margin: 56, gap: 14, blockers: [] };

function isoProjector(player: GroundPoint, view: ArrowView): Projector {
  const camera: PerspectiveCamera = new PerspectiveCamera(CAMERA.fov, view.width / view.height, 0.1, 400);
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / 180;
  const pitch: number = (CAMERA.pitchDegrees * Math.PI) / 180;
  const look: Vector3 = new Vector3(player.x, CAMERA.lookHeight, player.z);
  camera.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * CAMERA.distance, look.y + Math.sin(pitch) * CAMERA.distance, look.z + Math.cos(yaw) * Math.cos(pitch) * CAMERA.distance);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  const projected: Vector3 = new Vector3();
  return (x: number, y: number, z: number): Point | null => {
    projected.set(x, y, z).project(camera);
    if (!(projected.z > -1 && projected.z < 1)) return null;
    return { x: (projected.x * 0.5 + 0.5) * view.width, y: (-projected.y * 0.5 + 0.5) * view.height };
  };
}

function screenAngleOf(player: GroundPoint, heading: number): number {
  const project: Projector = isoProjector(player, VIEW);
  const from: Point | null = project(player.x, 0, player.z);
  const step: Point | null = project(player.x + Math.cos(heading) * 0.01, 0, player.z + Math.sin(heading) * 0.01);
  assert.ok(from !== null && step !== null);
  return Math.atan2(step.y - from.y, step.x - from.x);
}

function turn(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

void test('a target inside the inset screen needs no arrow', (): void => {
  const player: GroundPoint = { x: 40, z: 30 };
  assert.equal(arrowToward(isoProjector(player, VIEW), player, { x: 42, z: 31 }, 0, VIEW), null);
});

void test('the arrow points the way the target lies at every distance and heading, behind the camera included', (): void => {
  const player: GroundPoint = { x: 8, z: 30 };
  const project: Projector = isoProjector(player, VIEW);
  let behind: number = 0;
  for (let step = 0; step < 16; step++) {
    const heading: number = (step / 16) * Math.PI * 2;
    for (const distance of [20, 46, 56, 62, 120, 300]) {
      const target: GroundPoint = { x: player.x + Math.cos(heading) * distance, z: player.z + Math.sin(heading) * distance };
      if (project(target.x, 0, target.z) === null) behind += 1;
      const placed: ArrowPlacement | null = arrowToward(project, player, target, 0, VIEW);
      assert.ok(placed !== null, `heading ${step}, distance ${distance}: an arrow`);
      assert.ok(turn(placed.angle, screenAngleOf(player, heading)) < 0.05, `heading ${step}, distance ${distance}: angle ${placed.angle}`);
    }
  }
  assert.ok(behind > 0, 'some targets project behind the camera');
});

void test('the arrival point in the Hall sends the arrow toward the waypoint, not away from it', (): void => {
  const player: GroundPoint = { x: 8, z: 30 };
  const waypoint: GroundPoint = { x: 70, z: 25.5 };
  const placed: ArrowPlacement | null = arrowToward(isoProjector(player, VIEW), player, waypoint, 0, VIEW);
  assert.ok(placed !== null);
  assert.ok(turn(placed.angle, screenAngleOf(player, Math.atan2(waypoint.z - player.z, waypoint.x - player.x))) < 0.05);
});

void test('a target far to the right pins the arrow to the right edge pointing right', (): void => {
  const placed: ArrowPlacement | null = arrowAlong({ x: 720, y: 450 }, { x: 1, y: 0 }, VIEW);
  assert.ok(placed !== null);
  assert.equal(placed.x, 1384);
  assert.equal(placed.y, 450);
  assert.equal(placed.angle, 0);
});

void test('an arrow that would sit on a HUD piece stops short of it, on the same line', (): void => {
  const bar = { left: 500, top: 800, right: 940, bottom: 900 };
  const placed: ArrowPlacement | null = arrowAlong({ x: 720, y: 450 }, { x: 0, y: 1 }, { ...VIEW, blockers: [bar] });
  assert.ok(placed !== null);
  assert.equal(placed.x, 720);
  assert.equal(placed.y, bar.top - VIEW.gap);
  assert.equal(placed.angle, Math.PI / 2);
});

void test('a HUD piece off the line leaves the arrow at the edge', (): void => {
  const placed: ArrowPlacement | null = arrowAlong({ x: 720, y: 450 }, { x: 0, y: 1 }, { ...VIEW, blockers: [{ left: 0, top: 800, right: 300, bottom: 900 }] });
  assert.ok(placed !== null);
  assert.equal(placed.y, VIEW.height - VIEW.margin);
});
