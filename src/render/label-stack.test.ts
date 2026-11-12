import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearOfRects, stackLabels } from './label-stack.ts';
import type { LabelBox } from './label-stack.ts';

function box(id: number, x: number, y: number): LabelBox {
  return { id, x, y, width: 80, height: 18 };
}

void test('labels far apart are left alone', (): void => {
  const lifts: Map<number, number> = stackLabels([box(1, 0, 100), box(2, 300, 100)], 2);
  assert.equal(lifts.get(1), 0);
  assert.equal(lifts.get(2), 0);
});

void test('labels on the same spot stack upward without overlapping', (): void => {
  const boxes: LabelBox[] = [box(1, 50, 100), box(2, 50, 100), box(3, 55, 104)];
  const lifts: Map<number, number> = stackLabels(boxes, 2);
  const placed: LabelBox[] = boxes.map((entry: LabelBox): LabelBox => box(entry.id, entry.x, entry.y + (lifts.get(entry.id) ?? 0)));
  for (const a of placed) {
    for (const b of placed) {
      if (a.id >= b.id) continue;
      assert.ok(Math.abs(a.y - b.y) >= 18 + 2, `${a.id} and ${b.id} overlap`);
    }
  }
});

void test('the lowest label on screen keeps its place', (): void => {
  const lifts: Map<number, number> = stackLabels([box(1, 50, 100), box(2, 50, 90)], 2);
  assert.equal(lifts.get(1), 0);
  assert.ok((lifts.get(2) ?? 0) < 0);
});

void test('a name tag that would enter a control sits just above it, and one beside or above it stays put', (): void => {
  const roll = { left: 300, top: 760, right: 348, bottom: 808 };
  const attack = { left: 312, top: 700, right: 376, bottom: 750 };
  const tag = { id: 1, x: 320, y: 790, width: 110, height: 24 };
  assert.equal(clearOfRects(tag, [roll], 8), 752);
  assert.equal(clearOfRects(tag, [roll, attack], 8), 692);
  assert.equal(clearOfRects({ ...tag, x: 100 }, [roll, attack], 8), 790);
  assert.equal(clearOfRects({ ...tag, y: 400 }, [roll, attack], 8), 400);
});
