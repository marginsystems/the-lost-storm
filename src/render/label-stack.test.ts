import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearOfHud, stackLabels } from './label-stack.ts';
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

void test('a name tag that would fall under the bottom HUD sits just above it, and one clear of it stays put', (): void => {
  assert.equal(clearOfHud(700, 650, 8), 642);
  assert.equal(clearOfHud(300, 650, 8), 300);
  assert.equal(clearOfHud(700, null, 8), 700);
});
