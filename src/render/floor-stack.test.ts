import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CornerAlphas, FloorCorner, FloorStack, ShapedFloor } from './floor-stack.ts';
import { createFloorStack, FLOOR_STACK, floorQuad, shapedFloor, surfaceLayer } from './floor-stack.ts';

function corner(x: number, z: number): FloorCorner {
  return { x, y: 0, z, nx: 0, ny: 1, nz: 0 };
}

const CORNERS: [FloorCorner, FloorCorner, FloorCorner, FloorCorner] = [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)];
const UVS: number[] = [0, 0, 1, 0, 0, 1, 1, 1];
const SHADES: number[] = [1, 0.9, 0.8, 0.7];

void test('every surface the floor can show has one array layer, solids first, and no surface twice', (): void => {
  const stack: FloorStack | null = createFloorStack(['mud', 'stone'], ['gravel', 'mud'], ['lichen', 'gravel']);
  if (stack === null) throw new Error('stack');
  assert.deepEqual(stack.surfaces, ['mud', 'stone', 'gravel', 'lichen']);
  assert.equal(surfaceLayer(stack, 'lichen'), 3);
  assert.equal(surfaceLayer(stack, 'water'), null);
});

void test('a floor with more slots or surfaces than the shader holds is left to the layered meshes', (): void => {
  const many: string[] = Array.from({ length: FLOOR_STACK.slots + 1 }, (_: unknown, at: number): string => `s${at}`);
  assert.equal(createFloorStack([], many, []), null);
  assert.equal(createFloorStack([], [], many), null);
  const solids: string[] = Array.from({ length: FLOOR_STACK.most + 1 }, (_: unknown, at: number): string => `solid${at}`);
  assert.equal(createFloorStack(solids, [], []), null);
});

void test('a quad carries its solid layer and each slot weight at every corner, in slot order', (): void => {
  const stack: FloorStack | null = createFloorStack(['mud'], ['a', 'b', 'c', 'd', 'e'], ['f']);
  if (stack === null) throw new Error('stack');
  const fifth: CornerAlphas = [0.1, 0.2, 0.3, 0.4];
  const blend: CornerAlphas = [1, 1, 0.5, 0];
  assert.equal(floorQuad(stack, CORNERS, UVS, SHADES, 'mud', [null, null, null, null, fifth], [blend]), true);
  const shaped: ShapedFloor = shapedFloor(stack);
  assert.equal(shaped.positions.length, 12);
  assert.deepEqual([...shaped.solid], [0, 0, 0, 0]);
  assert.deepEqual([...shaped.shades].map((v: number): number => Math.round(v * 10) / 10), SHADES);
  assert.deepEqual([...shaped.fringeLow].slice(0, 4), [0, 0, 0, 0]);
  assert.deepEqual([...shaped.fringeHigh].filter((_: number, at: number): boolean => at % 4 === 0).map((v: number): number => Math.round(v * 10) / 10), [0.1, 0.2, 0.3, 0.4]);
  assert.deepEqual([...shaped.blendLow].filter((_: number, at: number): boolean => at % 4 === 0), [1, 1, 0.5, 0]);
  assert.deepEqual([...shaped.indices], [0, 2, 1, 1, 2, 3]);
});

void test('a quad on a surface the floor did not plan for is refused, so the caller can draw it the old way', (): void => {
  const stack: FloorStack | null = createFloorStack(['mud'], [], []);
  if (stack === null) throw new Error('stack');
  assert.equal(floorQuad(stack, CORNERS, UVS, SHADES, 'water', [], []), false);
  assert.equal(stack.positions.length, 0);
});

void test('layers are laid in the order each first shows on the floor, as their separate meshes were drawn', (): void => {
  const stack: FloorStack | null = createFloorStack(['mud'], ['a', 'b'], ['c', 'd', 'e']);
  if (stack === null) throw new Error('stack');
  const some: CornerAlphas = [0.5, 0.5, 0.5, 0.5];
  floorQuad(stack, CORNERS, UVS, SHADES, 'mud', [null, some], [null, null, some]);
  floorQuad(stack, CORNERS, UVS, SHADES, 'mud', [some, some], [some, null, some]);
  assert.deepEqual(shapedFloor(stack).fringeOrder, [1, 0]);
  assert.deepEqual(shapedFloor(stack).blendOrder, [2, 0]);
});
