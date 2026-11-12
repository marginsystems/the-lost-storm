import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centredPan, clampPan, layoutTree, linkPath } from './tree-layout.ts';
import type { TreeLayout, TreePlacement } from './tree-layout.ts';

const METRICS = { cell: 50, pad: 20 } as const;

void test('the board is only as large as the nodes need', (): void => {
  const layout: TreeLayout = layoutTree(
    [
      { id: 'a', column: 2, row: 1 },
      { id: 'b', column: 4, row: 1.5 },
      { id: 'c', column: 3, row: 3 },
    ],
    METRICS,
  );
  assert.equal(layout.width, 140);
  assert.equal(layout.height, 140);
  assert.deepEqual(layout.centres.get('a'), { x: 20, y: 20 });
  assert.deepEqual(layout.centres.get('b'), { x: 120, y: 45 });
  assert.deepEqual(layout.centres.get('c'), { x: 70, y: 120 });
});

void test('an empty tree is just its padding', (): void => {
  const layout: TreeLayout = layoutTree([], METRICS);
  assert.equal(layout.width, 40);
  assert.equal(layout.height, 40);
  assert.equal(layout.centres.size, 0);
});

void test('a large tree keeps every node inside the board', (): void => {
  const nodes: TreePlacement[] = [];
  for (let index: number = 0; index < 36; index += 1) nodes.push({ id: `n${index}`, column: index % 6, row: Math.floor(index / 6) });
  const layout: TreeLayout = layoutTree(nodes, METRICS);
  assert.equal(layout.centres.size, 36);
  for (const centre of layout.centres.values()) {
    assert.ok(centre.x >= METRICS.pad && centre.x <= layout.width - METRICS.pad);
    assert.ok(centre.y >= METRICS.pad && centre.y <= layout.height - METRICS.pad);
  }
});

void test('links run straight along a row or column and curve otherwise', (): void => {
  assert.equal(linkPath({ x: 10, y: 10 }, { x: 10, y: 60 }), 'M10 10L10 60');
  assert.equal(linkPath({ x: 10, y: 10 }, { x: 80, y: 10 }), 'M10 10L80 10');
  assert.equal(linkPath({ x: 0, y: 0 }, { x: 40, y: 40 }), 'M0 0Q10 30 40 40');
});

void test('panning never shows past the edge of the board', (): void => {
  assert.equal(clampPan(-30, 100, 200), 0);
  assert.equal(clampPan(40, 500, 200), 0);
  assert.equal(clampPan(-120, 500, 200), -120);
  assert.equal(clampPan(-900, 500, 200), -300);
  assert.equal(centredPan(500, 200), -150);
  assert.equal(centredPan(100, 200), 0);
});
