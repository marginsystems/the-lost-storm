import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapMatrix, mapRadii, toMap } from './projection.ts';

void test('the moment rim meets the projected gameplay boundary at every heading and zoom', (): void => {
  const radius: number = 6;
  for (const scale of [1.6, 3.6, 9]) {
    const matrix = mapMatrix({ scale, squash: 0.77, centreX: 110, centreY: 72, focusX: 22, focusZ: 15 });
    const centre = toMap(matrix, 30, 24);
    const radii = mapRadii(matrix, radius);
    for (let spoke: number = 0; spoke < 16; spoke += 1) {
      const angle: number = spoke * Math.PI / 8;
      const point = toMap(matrix, 30 + radius * Math.cos(angle), 24 + radius * Math.sin(angle));
      const length: number = Math.hypot((point.x - centre.x) / radii.horizontal, (point.y - centre.y) / radii.vertical);
      assert.ok(Math.abs(length - 1) < 1e-9);
    }
  }
});
