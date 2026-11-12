import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DITHER, ditheredOutputPass, ditherFragment, ditherOffset, pixelHash } from './output-dither.ts';

void test('the dither stays within half a step either way, centres on zero and is triangular', (): void => {
  const limit: number = DITHER.spread / DITHER.levels;
  let sum: number = 0;
  let near: number = 0;
  let count: number = 0;
  for (let y: number = 0; y < 400; y += 1) {
    for (let x: number = 0; x < 400; x += 1) {
      const offset: number = ditherOffset(x, y);
      assert.ok(Math.abs(offset) <= limit + 1e-12, `${x},${y} gave ${offset}`);
      sum += offset;
      if (Math.abs(offset) < limit / 2) near += 1;
      count += 1;
    }
  }
  assert.ok(Math.abs(sum / count) < limit * 0.02);
  assert.ok(near / count > 0.7);
});

void test('each pixel keeps its own offset, so a still frame does not shimmer, and neighbours differ', (): void => {
  assert.equal(ditherOffset(17, 9), ditherOffset(17, 9));
  const row: Set<number> = new Set<number>(Array.from({ length: 64 }, (_: unknown, x: number): number => ditherOffset(x, 3)));
  assert.ok(row.size > 60);
  for (let x: number = 0; x < 2000; x += 37) {
    const value: number = pixelHash(x, x * 3, DITHER.scaleA[0], DITHER.scaleA[1]);
    assert.ok(value >= 0 && value < 1);
  }
});

void test('the dither runs after the sRGB conversion in the real output pass', (): void => {
  const fragment: string = ditheredOutputPass().material.fragmentShader;
  const convert: number = fragment.indexOf('gl_FragColor = sRGBTransferOETF( gl_FragColor );');
  assert.ok(convert > 0);
  assert.ok(fragment.indexOf('gl_FragColor.rgb = ditherOutput( gl_FragColor.rgb );') > convert);
  assert.doesNotMatch(fragment, /sin\(/);
  assert.throws((): string => ditherFragment('void main() {}'));
});
