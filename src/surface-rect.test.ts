import assert from 'node:assert/strict';
import { test } from 'node:test';
import { surfaceRect } from './surface-rect.ts';
import type { SurfaceRect } from './surface-rect.ts';

function box(width: number): DOMRect {
  return { x: 0, y: 0, width, height: width, top: 0, left: 0, right: width, bottom: width, toJSON: (): null => null };
}

void test('the canvas box is measured once and reused every frame until the page says it may have moved', (): void => {
  let reads: number = 0;
  let width: number = 800;
  const rect: SurfaceRect = surfaceRect({
    getBoundingClientRect: (): DOMRect => {
      reads += 1;
      return box(width);
    },
  });
  for (let frame: number = 0; frame < 120; frame += 1) assert.equal(rect.read().width, 800);
  assert.equal(reads, 1);
  width = 1200;
  assert.equal(rect.read().width, 800);
  rect.stale();
  assert.equal(rect.read().width, 1200);
  assert.equal(rect.read().width, 1200);
  assert.equal(reads, 2);
});
