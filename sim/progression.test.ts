import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, XpCurve } from './content/types.ts';
import { applyXp, canAllocate, canRefund, refundCost, refundState, respecState, findNode, requirementsMet, adoptLearned, reachablePlaces, rivalVariant, xpToNextLevel } from './progression.ts';
import type { XpResult } from './progression.ts';

const content: Content = loadContent();
const curve: XpCurve = content.player.xp;

function node(requires: readonly string[], requireMode: 'all' | 'any'): SkillTreeNodeDef {
  return { id: 'test', name: 'Test', description: '', icon: 'lightning', kind: 'minor', path: 'storm', column: 0, row: 0, requires, requireMode, statMods: [], skillMods: [], variants: [], unlock: null };
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
  assert.ok(canAllocate(content, [], 1, 'stone_thunderclap'));
  assert.ok(!canAllocate(content, [], 0, 'stone_thunderclap'));
  assert.ok(!canAllocate(content, [], 1, 'tempered_body'));
  assert.ok(!canAllocate(content, [], 1, 'bedrock'));
  assert.ok(canAllocate(content, ['stone_thunderclap', 'tempered_body', 'stone_1'], 1, 'bedrock'));
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
  const taken: readonly string[] = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock'];
  assert.ok(canRefund(content, taken, 'bedrock'));
  assert.ok(!canRefund(content, taken, 'stone_1'));
  assert.ok(!canRefund(content, taken, 'old_oak'));
  assert.equal(refundCost(content, 5, 2), 2 * (content.chart.respec.goldPerPoint + content.chart.respec.goldPerLevel * 5));
});

void test('giving a place back or starting over is ready, not allowed, or short of gold, and the price is the one refundCost names', (): void => {
  const allocated: readonly string[] = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock'];
  const one: number = refundCost(content, 5, 1);
  const all: number = refundCost(content, 5, allocated.length);
  assert.equal(refundState(content, { allocated, gold: one, level: 5 }, 'bedrock'), 'ready');
  assert.equal(refundState(content, { allocated, gold: one - 1, level: 5 }, 'bedrock'), 'no_gold');
  assert.equal(refundState(content, { allocated, gold: one, level: 5 }, 'stone_1'), 'not_allowed');
  assert.equal(refundState(content, { allocated, gold: 0, level: 5 }, 'old_oak'), 'not_allowed');
  assert.equal(respecState(content, { allocated, gold: all, level: 5 }), 'ready');
  assert.equal(respecState(content, { allocated, gold: all - 1, level: 5 }), 'no_gold');
  assert.equal(respecState(content, { allocated: [], gold: 0, level: 5 }), 'not_allowed');
});

void test('places whose way in is gone are dropped in the order they were taken, and the rest stay', (): void => {
  assert.deepEqual(reachablePlaces(content, ['stormcallers_focus', 'storm_1', 'stone_thunderclap', 'tempered_body']), ['stone_thunderclap', 'tempered_body']);
  assert.deepEqual(reachablePlaces(content, ['tempered_body', 'stone_thunderclap']), ['tempered_body', 'stone_thunderclap']);
  assert.deepEqual(reachablePlaces(content, []), []);
});

void test('a skill learned before the chart gave abilities takes its place when the way is open, and returns a point when it is not', (): void => {
  assert.deepEqual(adoptLearned(content, ['cleave', 'thunderclap', 'living_wire'], ['storm_storm_bolt']), { allocated: ['storm_storm_bolt', 'stone_thunderclap'], refund: 1 });
  assert.deepEqual(adoptLearned(content, ['storm_bolt'], ['storm_storm_bolt']), { allocated: ['storm_storm_bolt'], refund: 0 });
  assert.deepEqual(adoptLearned(content, 'junk', []), { allocated: [], refund: 0 });
});

void test('two nodes are rivals when any of the skills they change is the same', (): void => {
  const heaving: SkillTreeNodeDef | null = findNode(content, 'heaving_cleave');
  assert.ok(heaving !== null);
  assert.equal(rivalVariant(content, ['whirling_cleave'], heaving)?.id, 'whirling_cleave');
  const onlyShot: SkillTreeNodeDef = { ...heaving, id: 'only_shot', variants: [{ skill: 'quarrel', becomes: 'quarrel_heave' }] };
  assert.equal(rivalVariant(content, ['whirling_cleave'], onlyShot)?.id, 'whirling_cleave');
  assert.equal(rivalVariant(content, ['storm_lance'], onlyShot), null);
});
