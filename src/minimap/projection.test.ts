import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { loadContent } from '../../sim/content/content.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { stepWorld } from '../../sim/world/step.ts';
import type { World } from '../../sim/world/types.ts';
import { must, worldIn } from '../../test/support.ts';
import { CAMERA } from '../render/iso-camera.ts';
import { edgeMark, headingOnMap, mapMatrix, toMap, toWorld } from './projection.ts';
import type { MapMatrix } from './projection.ts';

const matrix: MapMatrix = mapMatrix({ scale: 4, squash: 0.8, centreX: 100, centreY: 100, focusX: 20, focusZ: 30 });

void test('the focus sits in the centre and a point maps back to where it came from', (): void => {
  assert.deepEqual(toMap(matrix, 20, 30), { x: 100, y: 100 });
  const point = toMap(matrix, 27.5, 12.25);
  const back = toWorld(matrix, point.x, point.y);
  assert.ok(Math.abs(back.x - 27.5) < 1e-9 && Math.abs(back.z - 12.25) < 1e-9);
});

void test('away from the camera is up on the map, and the camera right is right', (): void => {
  const away = toMap(matrix, 19, 29);
  assert.ok(Math.abs(away.x - 100) < 1e-9 && away.y < 100);
  const right = toMap(matrix, 21, 29);
  assert.ok(right.x > 100 && Math.abs(right.y - 100) < 1e-9);
  assert.ok(Math.abs(headingOnMap(matrix, Math.atan2(-1, -1)) + Math.PI / 2) < 1e-9);
});

void test('a point off the map is pinned to its edge, pointing at it', (): void => {
  assert.deepEqual(edgeMark({ x: 120, y: 90 }, 200, 200, 8), { x: 120, y: 90, angle: Math.atan2(-10, 20), inside: true });
  const off = edgeMark({ x: 500, y: 100 }, 200, 200, 8);
  assert.equal(off.inside, false);
  assert.equal(off.x, 192);
  assert.equal(off.y, 100);
  assert.equal(off.angle, 0);
});

interface Flat {
  readonly x: number;
  readonly y: number;
}

function cameraView(focusX: number, focusZ: number): (x: number, z: number) => Flat {
  const camera: PerspectiveCamera = new PerspectiveCamera(CAMERA.fov, 16 / 9, 0.1, 400);
  const yaw: number = (CAMERA.yawDegrees * Math.PI) / 180;
  const pitch: number = (CAMERA.pitchDegrees * Math.PI) / 180;
  const look: Vector3 = new Vector3(focusX, CAMERA.lookHeight, focusZ);
  camera.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * CAMERA.distance, look.y + Math.sin(pitch) * CAMERA.distance, look.z + Math.cos(yaw) * Math.cos(pitch) * CAMERA.distance);
  camera.lookAt(look);
  camera.updateMatrixWorld();
  return (x: number, z: number): Flat => {
    const point: Vector3 = new Vector3(x, 0, z).project(camera);
    return { x: point.x * camera.aspect, y: -point.y };
  };
}

const SQUASH: number = Math.sin((CAMERA.pitchDegrees * Math.PI) / 180);

void test('a step in any direction goes the same way on the map as on the camera screen', (): void => {
  const view = cameraView(40, 25);
  const map: MapMatrix = mapMatrix({ scale: 5, squash: SQUASH, centreX: 0, centreY: 0, focusX: 40, focusZ: 25 });
  const origin: Flat = view(40, 25);
  for (let turn: number = 0; turn < 16; turn += 1) {
    const angle: number = (turn / 16) * Math.PI * 2;
    const dx: number = Math.cos(angle) * 0.6;
    const dz: number = Math.sin(angle) * 0.6;
    const seen: Flat = view(40 + dx, 25 + dz);
    const drawn = toMap(map, 40 + dx, 25 + dz);
    const difference: number = Math.atan2(seen.y - origin.y, seen.x - origin.x) - Math.atan2(drawn.y, drawn.x);
    assert.ok(Math.abs(Math.atan2(Math.sin(difference), Math.cos(difference))) < 0.05, `turn ${turn} off by ${difference}`);
  }
});

const content = loadContent();
const voidZone: ZoneDef = must([...content.zones.values()].find((zone: ZoneDef): boolean => zone.kind === 'void'), 'void zone');

void test('the hero marker sits where the hero is and points the way he walks, across turns and recentres', (): void => {
  const world: World = worldIn(content, voidZone.id, 4);
  world.wake = null;
  const legs = [{ x: 20, z: -6 }, { x: -4, z: 18 }, { x: -15, z: -9 }];
  let last = { ...world.player.pos };
  let lastShift = { ...world.shift };
  let lastFacing: number = world.player.facing;
  let checked: number = 0;
  let recentres: number = 0;
  for (let step: number = 0; step < 60 * 36; step += 1) {
    const leg = must(legs[Math.min(legs.length - 1, Math.floor(step / (60 * 12)))], 'leg');
    stepWorld(world, [{ type: 'move', held: true, dest: { x: world.player.pos.x + leg.x, z: world.player.pos.z + leg.z } }], 1 / 60);
    const shiftedBy = { x: world.shift.x - lastShift.x, z: world.shift.z - lastShift.z };
    const crossed: boolean = shiftedBy.x !== 0 || shiftedBy.z !== 0;
    if (crossed) recentres += 1;
    const map: MapMatrix = mapMatrix({ scale: 4, squash: SQUASH, centreX: 94, centreY: 104, focusX: world.player.pos.x, focusZ: world.player.pos.z });
    const centre = toMap(map, world.player.pos.x, world.player.pos.z);
    assert.ok(Math.abs(centre.x - 94) < 1e-9 && Math.abs(centre.y - 104) < 1e-9);
    const travelled = { x: world.player.pos.x - (last.x + shiftedBy.x), z: world.player.pos.z - (last.z + shiftedBy.z) };
    const steady: boolean = Math.abs(world.player.facing - lastFacing) < 1e-6 && Math.hypot(travelled.x, travelled.z) > 0.05 && !crossed;
    if (steady) {
      const from = toMap(map, world.player.pos.x - travelled.x, world.player.pos.z - travelled.z);
      const to = toMap(map, world.player.pos.x, world.player.pos.z);
      const walked: number = Math.atan2(to.y - from.y, to.x - from.x);
      const drawn: number = headingOnMap(map, world.player.facing);
      const difference: number = walked - drawn;
      assert.ok(Math.abs(Math.atan2(Math.sin(difference), Math.cos(difference))) < 0.02, `step ${step} walked ${walked} drawn ${drawn}`);
      checked += 1;
    }
    last = { ...world.player.pos };
    lastShift = { ...world.shift };
    lastFacing = world.player.facing;
  }
  assert.ok(checked > 600, `checked ${checked}`);
  assert.ok(recentres >= 2, `recentred ${recentres} times`);
});
