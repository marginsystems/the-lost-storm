import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Raster, ReliefFaces } from './flatten-relief.ts';
import { flattened, RELIEF, reliefMask } from './flatten-relief.ts';

const RASTER: Raster = { width: 200, height: 200 };

const QUAD = {
  uvs: [0.3, 0.3, 0.7, 0.3, 0.7, 0.7, 0.3, 0.7],
  indices: [0, 1, 2, 0, 2, 3],
} as const;

function texel(u: number, v: number): number {
  return Math.floor(v * RASTER.height) * RASTER.width + Math.floor(u * RASTER.width);
}

function quad(shift: number): ReliefFaces {
  return { uvs: QUAD.uvs, indices: QUAD.indices, shifts: [shift, shift, shift, shift] };
}

void test('the relief under cloth the fit moved far is flattened in full, with a feathered edge and nothing far away', (): void => {
  const mask: Float32Array = reliefMask([quad(RELIEF.to * 2)], RASTER);
  assert.equal(mask[texel(0.5, 0.5)], 1);
  assert.equal(mask[texel(0.05, 0.05)], 0);
  const edge: number = mask[texel(0.3 + RELIEF.feather * 1.5, 0.5)] ?? 0;
  assert.equal(edge, 1);
  const outside: number = mask[texel(0.3 - RELIEF.feather * 1.5, 0.5)] ?? 0;
  assert.ok(outside > 0 && outside < 1, `just outside the moved cloth the mask is ${String(outside)}`);
});

void test('cloth the fit left where it was keeps all of its relief', (): void => {
  const mask: Float32Array = reliefMask([quad(RELIEF.from / 2)], RASTER);
  assert.ok(mask.every((amount: number): boolean => amount === 0));
});

void test('a flattened texel faces straight out and an untouched texel keeps its value', (): void => {
  const pixels: Uint8Array = new Uint8Array([200, 90, 180, 200, 90, 180]);
  const out: Uint8Array = flattened(pixels, { width: 2, height: 1 }, new Float32Array([1, 1, 0, 0]), { width: 4, height: 1 });
  assert.deepEqual([...out], [128, 128, 255, 200, 90, 180]);
});
