import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { nodeDiameter, nodeFace, TREE_NODES } from './tree-nodes.ts';

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
