import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { findNode } from '../../sim/progression.ts';
import { costLine, requirementLine, statusLine, treeNodeStatus } from './tree-status.ts';

const CONTENT: Content = loadContent();

function node(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | null = findNode(CONTENT, id);
  if (found === null) throw new Error(`no tree node ${id}`);
  return found;
}

void test('a node reports why it can or cannot be taken', (): void => {
  assert.deepEqual(treeNodeStatus(CONTENT, [], 1, node('tempered_body')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 0, node('tempered_body')), { kind: 'no_points' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['tempered_body'], 3, node('tempered_body')), { kind: 'allocated' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('heavy_hands')), { kind: 'locked', missing: ['Tempered Body'], mode: 'all' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('eye_of_the_storm')), { kind: 'locked', missing: ['Heavy Hands', 'Forked Bolt'], mode: 'any' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['tempered_body', 'heavy_hands'], 1, node('eye_of_the_storm')), { kind: 'available' });
});

void test('the tooltip lines name the requirement, the cost and the reason', (): void => {
  assert.equal(requirementLine(CONTENT, node('tempered_body')), null);
  assert.equal(requirementLine(CONTENT, node('eye_of_the_storm')), 'Requires Heavy Hands or Forked Bolt');
  assert.equal(costLine(), 'Cost 1 skill point');
  assert.equal(statusLine({ kind: 'locked', missing: ['Heavy Hands', 'Forked Bolt'], mode: 'any' }), 'Locked: allocate Heavy Hands or Forked Bolt first');
  assert.equal(statusLine({ kind: 'no_points' }), 'No skill points to spend');
  assert.equal(statusLine({ kind: 'available' }), 'Click to allocate');
  assert.equal(statusLine({ kind: 'allocated' }), 'Allocated');
});
