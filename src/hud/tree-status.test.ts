import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { findNode } from '../../sim/progression.ts';
import { costLine, lockedLine, pointsPrompt, statusLine, takenLine, treeNodeStatus } from './tree-status.ts';

const CONTENT: Content = loadContent();

function node(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | null = findNode(CONTENT, id);
  if (found === null) throw new Error(`no tree node ${id}`);
  return found;
}

void test('before the first pick only the starting places are open, and every other place reads as locked until it can begin', (): void => {
  assert.deepEqual(treeNodeStatus(CONTENT, [], 1, node('stone_thunderclap')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 0, node('stone_thunderclap')), { kind: 'no_points' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('bedrock')), { kind: 'locked', needs: 'begin' });
  assert.deepEqual(treeNodeStatus(CONTENT, [], 3, node('storm_blade_near')), { kind: 'locked', needs: 'begin' });
  assert.equal(statusLine({ kind: 'locked', needs: 'begin' }, false), 'Begin at a starting place first');
  assert.equal(pointsPrompt(2, 0), 'Choose where you begin');
  assert.equal(pointsPrompt(2, 1), '2 points: choose a place');
  assert.equal(pointsPrompt(1, 3), '1 point: choose a place');
});

void test('after the first pick a place is open only beside what is held, and the other centres lock', (): void => {
  const held: readonly string[] = ['stone_thunderclap'];
  assert.deepEqual(treeNodeStatus(CONTENT, held, 3, node('stone_thunderclap')), { kind: 'allocated' });
  assert.deepEqual(treeNodeStatus(CONTENT, held, 3, node('tempered_body')), { kind: 'available' });
  assert.deepEqual(treeNodeStatus(CONTENT, held, 3, node('storm_storm_bolt')), { kind: 'locked', needs: 'connect' });
  assert.deepEqual(treeNodeStatus(CONTENT, ['blade_thunderhead', 'heavy_hands', 'blade_1'], 1, node('storm_blade_near')), { kind: 'available' });
  assert.equal(statusLine({ kind: 'locked', needs: 'connect' }, false), 'Connect to a place you hold');
  assert.deepEqual(treeNodeStatus(CONTENT, ['storm_storm_bolt', 'blade_thunderhead', 'heavy_hands'], 1, node('stormcallers_focus')), { kind: 'locked', needs: 'branch' });
  assert.equal(statusLine({ kind: 'locked', needs: 'branch' }, false), 'Only your largest group of places can grow');
  assert.equal(lockedLine({ kind: 'locked', needs: 'connect' }, 3, false), 'Connect to a place you hold · 3 points along the lit route');
  assert.equal(lockedLine({ kind: 'locked', needs: 'connect' }, 0, false), 'Connect to a place you hold');
});

void test('a taken place says why it cannot be given back', (): void => {
  assert.equal(takenLine(null), 'Taken');
  assert.equal(takenLine('split'), 'Taken · giving it back would cut off places beyond it');
  assert.equal(takenLine('root'), 'Taken · everything you hold grows from here');
});

void test('the card lines name the cost and the reason', (): void => {
  assert.equal(costLine(), 'Cost 1 skill point');
  assert.equal(statusLine({ kind: 'no_points' }, false), 'No skill points to spend');
  assert.equal(statusLine({ kind: 'available' }, false), 'Click to allocate');
  assert.equal(statusLine({ kind: 'available' }, true), 'Tap to allocate');
  assert.equal(statusLine({ kind: 'allocated' }, false), 'Allocated');
});
