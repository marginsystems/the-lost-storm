import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, XpCurve } from './content/types.ts';
import { adoptLearned, applyXp, gapScale, canAllocate, canRefund, findNode, holdingParts, holdingTrunk, joinBlock, placeLinks, reachablePlaces, refundBlock, refundCost, refundState, respecState, rivalVariant, startingPlaces, xpToNextLevel } from './progression.ts';
import type { XpResult } from './progression.ts';

const content: Content = loadContent();
const curve: XpCurve = { base: 60, growth: 1.42, maxLevel: 30, gap: { grace: 2, perLevel: 0.1, floor: 0.2 } };

function node(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | null = findNode(content, id);
  assert.ok(found !== null, id);
  return found;
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

const STARTS: readonly string[] = ['storm_storm_bolt', 'blade_thunderhead', 'wind_mist_step', 'stone_thunderclap', 'echo_forkline'];

function takeAll(order: readonly string[]): string[] {
  const taken: string[] = [];
  for (const id of order) {
    assert.ok(canAllocate(content, taken, 1, id), `${id} after ${taken.join(', ')}`);
    taken.push(id);
  }
  return taken;
}

void test('the starting places are the nodes that list no links, one on each path', (): void => {
  assert.deepEqual(startingPlaces(content).toSorted(), [...STARTS].toSorted());
  assert.equal(placeLinks(content).get('heavy_hands')?.includes('blade_thunderhead'), true);
  assert.equal(placeLinks(content).get('blade_thunderhead')?.includes('heavy_hands'), true);
});

void test('with nothing held only a starting place can be taken, and a point and a known untaken node are needed', (): void => {
  for (const start of STARTS) assert.ok(canAllocate(content, [], 1, start), start);
  assert.ok(!canAllocate(content, [], 0, 'stone_thunderclap'));
  assert.ok(!canAllocate(content, [], 1, 'tempered_body'));
  assert.ok(!canAllocate(content, [], 1, 'storm_blade_near'));
  assert.ok(!canAllocate(content, [], 5, 'unknown_node'));
  assert.ok(!canAllocate(content, ['stone_thunderclap'], 1, 'stone_thunderclap'));
  assert.equal(joinBlock(content, [], node('tempered_body')), 'begin');
  assert.equal(joinBlock(content, [], node('stone_thunderclap')), null);
});

void test('after the first pick every place must link to one already held, and the other centres are closed', (): void => {
  const taken: string[] = takeAll(['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock']);
  assert.equal(taken.length, 4);
  for (const start of STARTS.filter((id: string): boolean => id !== 'stone_thunderclap')) {
    assert.ok(!canAllocate(content, taken, 1, start), start);
    assert.equal(joinBlock(content, taken, node(start)), 'connect');
  }
  assert.ok(!canAllocate(content, ['stone_thunderclap'], 1, 'stone_1'));
  assert.ok(!canAllocate(content, ['stone_thunderclap'], 1, 'gathered_clap'));
  assert.ok(canAllocate(content, ['stone_thunderclap'], 1, 'tempered_body'));
});

void test('a ring crosses to another path and the walk can turn inward to that path\'s centre', (): void => {
  const taken: string[] = takeAll(['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'storm_blade_near', 'blade_1', 'heavy_hands', 'blade_thunderhead']);
  assert.ok(taken.includes('blade_thunderhead'));
  assert.ok(canAllocate(content, taken, 1, 'whetstone'));
  assert.ok(canAllocate(content, ['blade_thunderhead', 'heavy_hands', 'blade_1'], 1, 'storm_blade_near'));
  assert.ok(canAllocate(content, ['blade_thunderhead', 'heavy_hands', 'blade_1', 'storm_blade_near'], 1, 'storm_1'));
});

void test('a skill takes one changed form at a time', (): void => {
  const storm: readonly string[] = ['stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'storm_lance'];
  const echo: readonly string[] = ['echo_forkline', 'first_echo', 'echo_1', 'long_squall', 'echo_4'];
  assert.ok(canAllocate(content, echo, 1, 'twice_told_bolt'));
  assert.equal(joinBlock(content, [...echo, ...storm], node('twice_told_bolt')), null);
  assert.ok(!canAllocate(content, [...echo, ...storm], 1, 'twice_told_bolt'));
});

void test('a place can be given back only while what is left stays joined to its start', (): void => {
  const taken: readonly string[] = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock'];
  assert.ok(canRefund(content, taken, 'bedrock'));
  assert.equal(refundBlock(content, taken, 'stone_1'), 'split');
  assert.equal(refundBlock(content, taken, 'stone_thunderclap'), 'root');
  assert.equal(refundBlock(content, taken, 'old_oak'), 'not_held');
  assert.ok(canRefund(content, ['stone_thunderclap'], 'stone_thunderclap'));
  const crossed: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'storm_blade_near', 'blade_1', 'heavy_hands', 'blade_thunderhead'];
  assert.ok(canRefund(content, crossed, 'blade_thunderhead'));
  assert.equal(refundBlock(content, crossed, 'storm_blade_near'), 'split');
  assert.ok(canRefund(content, crossed, 'storm_storm_bolt'));
  assert.equal(refundBlock(content, crossed.slice(0, -1), 'storm_storm_bolt'), 'root');
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

void test('a holding made before the rule keeps every place, grows only from its largest part, and gives back from the leaves', (): void => {
  const legacy: readonly string[] = ['storm_storm_bolt', 'blade_thunderhead', 'heavy_hands', 'wind_mist_step', 'stone_thunderclap', 'echo_forkline'];
  assert.deepEqual(reachablePlaces(content, legacy), legacy);
  assert.equal(holdingParts(content, legacy).length, 5);
  assert.deepEqual(holdingTrunk(content, legacy).toSorted(), ['blade_thunderhead', 'heavy_hands']);
  assert.ok(canAllocate(content, legacy, 1, 'blade_1'));
  assert.ok(!canAllocate(content, legacy, 1, 'stormcallers_focus'));
  assert.equal(joinBlock(content, legacy, node('tempered_body')), 'branch');
  assert.equal(joinBlock(content, legacy, node('bedrock')), 'connect');
  assert.deepEqual(holdingTrunk(content, ['storm_storm_bolt', 'stone_thunderclap']), ['storm_storm_bolt']);
  assert.ok(canRefund(content, legacy, 'echo_forkline'));
  assert.ok(canRefund(content, legacy, 'heavy_hands'));
  assert.equal(refundBlock(content, legacy, 'blade_thunderhead'), 'root');
  assert.equal(respecState(content, { allocated: legacy, gold: refundCost(content, 5, legacy.length), level: 5 }), 'ready');
});

void test('on load a place stays when its part of the holding reaches a starting place, in the order it was taken', (): void => {
  assert.deepEqual(reachablePlaces(content, ['stormcallers_focus', 'storm_1', 'stone_thunderclap', 'tempered_body']), ['stone_thunderclap', 'tempered_body']);
  assert.deepEqual(reachablePlaces(content, ['tempered_body', 'stone_thunderclap']), ['tempered_body', 'stone_thunderclap']);
  const crossed: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'storm_blade_near', 'blade_1', 'heavy_hands', 'blade_thunderhead'];
  assert.deepEqual(reachablePlaces(content, crossed), crossed);
  assert.deepEqual(reachablePlaces(content, ['blade_1', 'heavy_hands']), []);
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

void test('a foe far below the hero gives less xp, falling smoothly to a floor with no cliff', (): void => {
  const gap = curve.gap;
  assert.equal(gapScale(gap, 10, 10), 1);
  assert.equal(gapScale(gap, 10, 8), 1);
  assert.equal(gapScale(gap, 5, 9), 1);
  const scales: number[] = Array.from({ length: 20 }, (_: unknown, below: number): number => gapScale(gap, 30, 30 - below));
  scales.forEach((scale: number, index: number): void => {
    const before: number | undefined = scales[index - 1];
    if (before !== undefined) assert.ok(scale <= before && before - scale <= gap.perLevel + 1e-9);
  });
  assert.equal(scales.at(-1), gap.floor);
});

void test('the shipped curve makes every level take longer than the one before, from start to the cap', (): void => {
  const shipped: XpCurve = content.player.xp;
  for (let level: number = 2; level < shipped.maxLevel; level += 1) {
    const perFoe: number = 1 + content.world.scaling.xpPerLevel * (level - 1);
    const earlier: number = 1 + content.world.scaling.xpPerLevel * (level - 2);
    assert.ok(xpToNextLevel(shipped, level) / perFoe > xpToNextLevel(shipped, level - 1) / earlier, `level ${level}`);
  }
});
