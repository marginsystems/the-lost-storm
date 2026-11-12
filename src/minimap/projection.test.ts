import assert from 'node:assert/strict';
import { test } from 'node:test';
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
