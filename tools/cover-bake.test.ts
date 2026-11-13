import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coveredTriangles, coveredVertices, triangleRanges, weldedVertices } from './cover-bake.ts';
import type { BodyMesh, CoverReach, TriangleMesh } from './cover-bake.ts';

const REACH: CoverReach = { reach: 0.05, lift: 0.001, margin: 0, island: 0, weld: 1e-4 };

function strip(columns: number): BodyMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  for (let column: number = 0; column <= columns; column += 1) {
    positions.push(column, 0, 0, column, 1, 0);
    normals.push(0, 0, 1, 0, 0, 1);
  }
  const indices: number[] = [];
  for (let column: number = 0; column < columns; column += 1) {
    const left: number = column * 2;
    indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices) };
}

function sheet(from: number, to: number, height: number): TriangleMesh {
  return {
    positions: new Float32Array([from, -1, height, to, -1, height, from, 2, height, to, 2, height]),
    indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
  };
}

void test('a body vertex is covered when the garment lies just outside it along its normal, and not when it is out of reach', (): void => {
  const body: BodyMesh = strip(2);
  assert.deepEqual(coveredVertices(body, sheet(-0.5, 1.5, 0.03), REACH), [true, true, true, true, false, false]);
  assert.deepEqual(coveredVertices(body, sheet(-0.5, 2.5, 0.2), REACH), [false, false, false, false, false, false]);
});

void test('a triangle hides only when every corner is covered', (): void => {
  const body: BodyMesh = strip(2);
  const hidden: boolean[] = coveredTriangles(body, coveredVertices(body, sheet(-0.5, 1.5, 0.03), REACH), REACH);
  assert.deepEqual(hidden, [true, true, false, false]);
});

void test('a margin keeps a ring of triangles visible next to the opening', (): void => {
  const body: BodyMesh = strip(4);
  const all: boolean[] = [true, true, true, true, true, true, true, true, false, false];
  assert.deepEqual(coveredTriangles(body, all, REACH), [true, true, true, true, true, true, false, false]);
  assert.deepEqual(coveredTriangles(body, all, { ...REACH, margin: 1 }), [true, true, true, true, false, false, false, false]);
});

void test('a small uncovered speck inside the covered region is filled, and an opening is not', (): void => {
  const body: BodyMesh = strip(4);
  const speck: boolean[] = [true, true, true, true, false, true, true, true, true, true];
  assert.deepEqual(coveredTriangles(body, speck, { ...REACH, island: 5 }), [true, true, true, true, true, true, true, true]);
  const opening: boolean[] = [true, true, true, true, true, true, false, false, false, false];
  assert.deepEqual(coveredTriangles(body, opening, { ...REACH, island: 3 }), [true, true, true, true, false, false, false, false]);
});

void test('split copies of a vertex at a seam count as one point', (): void => {
  assert.deepEqual(weldedVertices(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 0]), 1e-4), [0, 1, 0]);
});

void test('hidden triangles are written as inclusive ranges', (): void => {
  assert.deepEqual(triangleRanges([true, true, false, true, false, false, true]), [[0, 1], [3, 3], [6, 6]]);
  assert.deepEqual(triangleRanges([false, false]), []);
});
