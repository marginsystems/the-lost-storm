import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { cardSpot, nodeAt, nodeDiameter, nodeFace, TREE_NODES } from './tree-nodes.ts';
import type { CardRoom, CardSize, CardSpot, NodeSpot } from './tree-nodes.ts';

const content: Content = loadContent();

void test('no two places on the tree touch: every pair sits further apart than their sizes plus a gap', (): void => {
  const nodes: readonly SkillTreeNodeDef[] = content.skillTree;
  for (let i: number = 0; i < nodes.length; i += 1) {
    for (let j: number = i + 1; j < nodes.length; j += 1) {
      const a: SkillTreeNodeDef | undefined = nodes[i];
      const b: SkillTreeNodeDef | undefined = nodes[j];
      if (a === undefined || b === undefined) continue;
      const apart: number = Math.hypot(a.column - b.column, a.row - b.row) * TREE_NODES.unit;
      const needed: number = (nodeDiameter(a) + nodeDiameter(b)) / 2 + TREE_NODES.gap;
      assert.ok(apart > needed, `${a.id} and ${b.id} are ${apart.toFixed(1)} apart, need ${needed.toFixed(1)}`);
    }
  }
});

void test('a taken place, a named place and an ability are no more than slightly larger than a plain place', (): void => {
  for (const node of content.skillTree) assert.ok(nodeDiameter(node) <= TREE_NODES.minor * 1.35, `${node.id} is ${nodeDiameter(node)} across`);
  assert.ok(content.skillTree.every((node: SkillTreeNodeDef): boolean => nodeFace(node) <= nodeDiameter(node)));
});

void test('the pointer on one of two neighbouring places names that place, never the other', (): void => {
  const a: NodeSpot = { id: 'a', x: 100, y: 100, radius: 16 };
  const b: NodeSpot = { id: 'b', x: 100, y: 140, radius: 16 };
  for (let y: number = 84; y <= 116; y += 2) assert.equal(nodeAt([a, b], 100, y), 'a', `at y ${y}`);
  for (let y: number = 124; y <= 156; y += 2) assert.equal(nodeAt([a, b], 100, y), 'b', `at y ${y}`);
  assert.equal(nodeAt([b, a], 100, 110), 'a');
  assert.equal(nodeAt([a, b], 100, 120), null);
  assert.equal(nodeAt([a, b], 130, 120), null);
  assert.equal(nodeAt([{ ...a, id: 'under' }, a], 100, 100), 'a');
});

void test('the card keeps clear of its place and the places beside it, and stays on screen', (): void => {
  const room: CardRoom = { width: 800, height: 600, edge: 10, gap: 8 };
  const size: CardSize = { width: 220, height: 120 };
  const node: NodeSpot = { id: 'n', x: 400, y: 300, radius: 15 };
  const right: NodeSpot = { id: 'r', x: 446, y: 300, radius: 15 };
  const clear = (spot: CardSpot, circle: NodeSpot): boolean => {
    const nearX: number = Math.max(spot.x, Math.min(circle.x, spot.x + size.width));
    const nearY: number = Math.max(spot.y, Math.min(circle.y, spot.y + size.height));
    return Math.hypot(circle.x - nearX, circle.y - nearY) >= circle.radius + room.gap;
  };
  const alone: CardSpot = cardSpot(node, size, [], room);
  assert.ok(clear(alone, node));
  assert.ok(alone.x > node.x);
  const crowded: CardSpot = cardSpot(node, size, [right], room);
  assert.ok(clear(crowded, node) && clear(crowded, right));
  const edge: CardSpot = cardSpot({ ...node, x: 780 }, size, [], room);
  assert.ok(edge.x >= room.edge && edge.x + size.width <= room.width - room.edge);
  assert.ok(clear(edge, { ...node, x: 780 }));
});
