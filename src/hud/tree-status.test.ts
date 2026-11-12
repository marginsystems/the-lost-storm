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
  assert.deepEqual(treeNodeStatus(CONTENT, [], 1, node('stone_thunderclap')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 0, node('stone_thunderclap')), { kind: 'no_points' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['tempered_body'], 3, node('tempered_body')), { kind: 'allocated' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('bedrock')), { kind: 'locked', missing: [node('stone_1').name], mode: 'all' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('storm_blade_near')), { kind: 'locked', missing: [node('storm_1').name, node('blade_1').name], mode: 'any' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['heavy_hands', 'blade_1'], 1, node('storm_blade_near')), { kind: 'available' });
});

void test('the tooltip lines name the requirement, the cost and the reason', (): void => {
  assert.equal(requirementLine(CONTENT, node('stone_thunderclap')), null);
  assert.equal(requirementLine(CONTENT, node('tempered_body')), `Requires ${node('stone_thunderclap').name}`);
  assert.equal(requirementLine(CONTENT, node('storm_blade_near')), `Requires ${node('storm_1').name} or ${node('blade_1').name}`);
  assert.equal(costLine(), 'Cost 1 skill point');
  assert.equal(statusLine({ kind: 'locked', missing: ['Heavy Hands', 'Forked Bolt'], mode: 'any' }, false), 'Locked: allocate Heavy Hands or Forked Bolt first');
  assert.equal(statusLine({ kind: 'no_points' }, false), 'No skill points to spend');
  assert.equal(statusLine({ kind: 'available' }, false), 'Click to allocate');
  assert.equal(statusLine({ kind: 'available' }, true), 'Tap to allocate');
  assert.equal(statusLine({ kind: 'allocated' }, false), 'Allocated');
});
