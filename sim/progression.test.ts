import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, XpCurve } from './content/types.ts';
import { applyXp, canAllocate, canRefund, refundCost, findNode, requirementsMet, xpToNextLevel } from './progression.ts';
import type { XpResult } from './progression.ts';

const content: Content = loadContent();
const curve: XpCurve = content.player.xp;

function node(requires: readonly string[], requireMode: 'all' | 'any'): SkillTreeNodeDef {
  return { id: 'test', name: 'Test', description: '', icon: 'lightning', kind: 'minor', path: 'storm', column: 0, row: 0, requires, requireMode, statMods: [], skillMods: [], variant: null };
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
  assert.ok(!canAllocate(content, [], 1, 'bedrock'));
  assert.ok(canAllocate(content, ['tempered_body', 'stone_1'], 1, 'bedrock'));
  assert.ok(!canAllocate(content, ['tempered_body'], 1, 'tempered_body'));
  assert.ok(!canAllocate(content, [], 5, 'unknown_node'));
});

void test('a crossing between two paths opens from either side', (): void => {
  assert.ok(!canAllocate(content, [], 1, 'storm_blade_near'));
  assert.ok(canAllocate(content, ['stormcallers_focus', 'storm_1'], 1, 'storm_blade_near'));
  assert.ok(canAllocate(content, ['heavy_hands', 'blade_1'], 1, 'storm_blade_near'));
  assert.ok(canAllocate(content, ['heavy_hands', 'blade_1', 'storm_blade_near'], 1, 'storm_1'));
});

void test('a skill takes one changed form at a time', (): void => {
  const storm: readonly string[] = ['stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'storm_lance'];
  const echo: readonly string[] = ['first_echo', 'echo_1', 'long_squall', 'echo_4'];
  assert.ok(canAllocate(content, echo, 1, 'twice_told_bolt'));
  assert.ok(!canAllocate(content, [...storm, ...echo], 1, 'twice_told_bolt'));
});

void test('a place can be given back only while everything taken after it still stands', (): void => {
  const taken: readonly string[] = ['tempered_body', 'stone_1', 'bedrock'];
  assert.ok(canRefund(content, taken, 'bedrock'));
  assert.ok(!canRefund(content, taken, 'stone_1'));
  assert.ok(!canRefund(content, taken, 'old_oak'));
  assert.equal(refundCost(content, 5, 2), 2 * (content.chart.respec.goldPerPoint + content.chart.respec.goldPerLevel * 5));
});
