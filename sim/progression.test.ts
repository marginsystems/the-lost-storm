import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, XpCurve } from './content/types.ts';
import { applyXp, canAllocate, findNode, requirementsMet, xpToNextLevel } from './progression.ts';
import type { XpResult } from './progression.ts';

const content: Content = loadContent();
const curve: XpCurve = content.player.xp;

function node(requires: readonly string[], requireMode: 'all' | 'any'): SkillTreeNodeDef {
  return { id: 'test', name: 'Test', description: '', icon: 'lightning', kind: 'minor', column: 0, row: 0, requires, requireMode, statMods: [], skillMods: [] };
}

void test('the xp curve grows level by level', (): void => {
  assert.equal(xpToNextLevel(curve, 1), 60);
  assert.equal(xpToNextLevel(curve, 2), 85);
  assert.ok(xpToNextLevel(curve, 10) > xpToNextLevel(curve, 9));
});

void test('xp below the threshold changes nothing but the total', (): void => {
  assert.deepEqual(applyXp(curve, 1, 10, 20), { level: 1, xp: 30, levelsGained: 0 });
});

void test('one large gain levels up several times and keeps the remainder', (): void => {
  const needed: number = xpToNextLevel(curve, 1) + xpToNextLevel(curve, 2) + xpToNextLevel(curve, 3);
  const result: XpResult = applyXp(curve, 1, 0, needed + 5);
  assert.deepEqual(result, { level: 4, xp: 5, levelsGained: 3 });
});

void test('leftover xp carries into the gain', (): void => {
  const result: XpResult = applyXp(curve, 1, 50, 20);
  assert.deepEqual(result, { level: 2, xp: 10, levelsGained: 1 });
});

void test('levelling stops at the maximum level', (): void => {
  const result: XpResult = applyXp(curve, 1, 0, 1e12);
  assert.equal(result.level, curve.maxLevel);
  assert.equal(result.levelsGained, curve.maxLevel - 1);
  assert.ok(result.xp <= xpToNextLevel(curve, curve.maxLevel));
  assert.equal(applyXp(curve, curve.maxLevel, 0, 1e12).levelsGained, 0);
});

void test('findNode finds shipped nodes and nothing else', (): void => {
  assert.equal(findNode(content, 'heavy_hands')?.name, 'Heavy Hands');
  assert.equal(findNode(content, 'nope'), null);
});

void test('requirementsMet honours the all and any modes', (): void => {
  assert.ok(requirementsMet(node([], 'all'), []));
  assert.ok(!requirementsMet(node(['a', 'b'], 'all'), ['a']));
  assert.ok(requirementsMet(node(['a', 'b'], 'all'), ['b', 'a']));
  assert.ok(!requirementsMet(node(['a', 'b'], 'any'), ['c']));
  assert.ok(requirementsMet(node(['a', 'b'], 'any'), ['b']));
});

void test('canAllocate needs a point, the requirements and an unallocated known node', (): void => {
  assert.ok(canAllocate(content, [], 1, 'tempered_body'));
  assert.ok(!canAllocate(content, [], 0, 'tempered_body'));
  assert.ok(!canAllocate(content, [], 1, 'heavy_hands'));
  assert.ok(canAllocate(content, ['tempered_body'], 1, 'heavy_hands'));
  assert.ok(!canAllocate(content, ['tempered_body'], 1, 'tempered_body'));
  assert.ok(!canAllocate(content, [], 5, 'unknown_node'));
});

void test('an any-mode node opens with either parent', (): void => {
  assert.ok(!canAllocate(content, [], 1, 'eye_of_the_storm'));
  assert.ok(canAllocate(content, ['heavy_hands'], 1, 'eye_of_the_storm'));
  assert.ok(canAllocate(content, ['forked_bolt'], 1, 'eye_of_the_storm'));
});
