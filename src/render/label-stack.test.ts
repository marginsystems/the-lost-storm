import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldPiles, stackLabels } from './label-stack.ts';
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

void test('a pile of many labels keeps the three rarest and counts the rest on the last kept one', (): void => {
  const pile = Array.from({ length: 10 }, (_: unknown, index: number) => ({ id: index + 1, x: 400 + index * 6, y: 300 + (index % 3) * 4, width: 120, height: 20, rank: index === 4 ? 3 : index % 3 === 0 ? 2 : 1 }));
  const folding = foldPiles(pile, 36, 3);
  assert.equal(folding.folded.size, 7);
  assert.ok(!folding.folded.has(5));
  assert.ok(!folding.folded.has(1));
  assert.ok(!folding.folded.has(4));
  assert.deepEqual([...folding.more.entries()], [[4, 7]]);
});

void test('three or fewer labels together, or labels far apart, are never folded', (): void => {
  const few = [1, 2, 3].map((id: number) => ({ id, x: 400, y: 300 + id * 3, width: 120, height: 20, rank: 1 }));
  assert.equal(foldPiles(few, 36, 3).folded.size, 0);
  const apart = [1, 2, 3, 4, 5].map((id: number) => ({ id, x: id * 300, y: 300, width: 120, height: 20, rank: 1 }));
  const folding = foldPiles(apart, 36, 3);
  assert.equal(folding.folded.size, 0);
  assert.equal(folding.more.size, 0);
});
