import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef, XpCurve } from './content/types.ts';
import { adoptLearned, applyXp, gapBand, gapScale, canAllocate, canRefund, findNode, holdingParts, holdingTrunk, joinBlock, placeLinks, reachablePlaces, bankedReset, refundBlock, refundCost, refundState, respecCost, respecState, activeChange, changesHeld, heldChanges, offersChange, startingPlaces, xpToNextLevel } from './progression.ts';
import type { HeldChange, XpResult } from './progression.ts';
import { createWorld } from './world/create.ts';
import { monsterXpScale } from './world/monster-xp.ts';
import type { World } from './world/types.ts';
import { wornPowers } from './powers.ts';
import { earnedPoints, parseSaveText, readSave, toSave } from './save.ts';
import type { SaveData } from './save.ts';
import { must } from '../test/support.ts';
import { made, played, roundTrip, saveContent } from '../test/save-support.ts';

const content: Content = loadContent();
const curve: XpCurve = { base: 60, growth: 1.42, after: null, maxLevel: 30, gap: { band: 5, widenEvery: 10, soft: 2, power: 3, floor: 0.05, above: true } };

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

void test('a second growth takes over above its level and leaves the levels below as they were', (): void => {
  const bent: XpCurve = { ...curve, after: { from: 3, growth: 1.1 } };
  assert.equal(xpToNextLevel(bent, 2), xpToNextLevel(curve, 2));
  assert.equal(xpToNextLevel(bent, 3), xpToNextLevel(curve, 3));
  assert.equal(xpToNextLevel(bent, 4), Math.round(60 * 1.42 * 1.42 * 1.1));
  assert.equal(xpToNextLevel(bent, 6), Math.round(60 * 1.42 * 1.42 * Math.pow(1.1, 3)));
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

const STARTS: readonly string[] = ['storm_storm_bolt', 'blade_thunderhead', 'wind_ghost_wave', 'stone_thunderclap', 'echo_forkline'];

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

void test('a second changed form of a skill is taken like any joined place', (): void => {
  const storm: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4'];
  assert.ok(canAllocate(content, storm, 1, 'twice_told_bolt'));
  assert.equal(joinBlock(content, [...storm, 'storm_lance'], node('twice_told_bolt')), null);
  assert.ok(canAllocate(content, [...storm, 'storm_lance'], 1, 'twice_told_bolt'));
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
  assert.equal(respecState(content, { allocated, gold: all, level: 5, freeReset: false }), 'ready');
  assert.equal(respecState(content, { allocated, gold: all - 1, level: 5, freeReset: false }), 'no_gold');
  assert.equal(respecState(content, { allocated, gold: 0, level: 5, freeReset: true }), 'ready');
  assert.equal(respecCost(content, { allocated, gold: 0, level: 5, freeReset: true }), 0);
  assert.equal(respecCost(content, { allocated, gold: 0, level: 5, freeReset: false }), all);
  assert.equal(respecState(content, { allocated: [], gold: 0, level: 5, freeReset: true }), 'not_allowed');
});

void test('a holding made before the rule keeps every place, grows only from its largest part, and gives back from the leaves', (): void => {
  const legacy: readonly string[] = ['storm_storm_bolt', 'blade_thunderhead', 'heavy_hands', 'wind_ghost_wave', 'stone_thunderclap', 'echo_forkline'];
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
  assert.equal(respecState(content, { allocated: legacy, gold: refundCost(content, 5, legacy.length), level: 5, freeReset: false }), 'ready');
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
  assert.deepEqual(adoptLearned(content, ['cleave', 'thunderclap', 'held_breath'], ['storm_storm_bolt']), { allocated: ['storm_storm_bolt', 'stone_thunderclap'], refund: 1 });
  assert.deepEqual(adoptLearned(content, ['storm_bolt'], ['storm_storm_bolt']), { allocated: ['storm_storm_bolt'], refund: 0 });
  assert.deepEqual(adoptLearned(content, 'junk', []), { allocated: [], refund: 0 });
  assert.deepEqual(adoptLearned(content, ['held_breath'], ['stone_thunderclap'], ['stone_thunderclap', 'stone_held_breath']), { allocated: ['stone_thunderclap'], refund: 0 });
});

void test('a second change of a skill can be taken beside the first', (): void => {
  const storm: readonly string[] = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4'];
  assert.ok(canAllocate(content, [...storm, 'twice_told_bolt'], 1, 'storm_lance'));
  assert.ok(canAllocate(content, [...storm, 'storm_lance'], 1, 'twice_told_bolt'));
});

void test('only a held place offers its change, and choices no held place offers are dropped', (): void => {
  assert.ok(offersChange(content, ['twice_told_bolt', 'storm_lance'], 'storm_bolt', 'storm_bolt_lance'));
  assert.ok(!offersChange(content, ['twice_told_bolt'], 'storm_bolt', 'storm_bolt_lance'));
  assert.ok(!offersChange(content, ['storm_lance'], 'cleave', 'storm_bolt_lance'));
  assert.deepEqual(heldChanges(content, ['storm_lance'], { storm_bolt: 'storm_bolt_lance', cleave: 'cleave_whirl' }), { storm_bolt: 'storm_bolt_lance' });
  assert.deepEqual(heldChanges(content, [], { storm_bolt: 'storm_bolt_lance' }), {});
});

void test('the changes a skill holds come in the order they were taken, and the first is active until another is chosen, whatever weapon is in hand', (): void => {
  const both: readonly string[] = ['storm_lance', 'twice_told_bolt'];
  assert.deepEqual(changesHeld(content, both, 'storm_bolt').map((entry: HeldChange): string => `${entry.becomes}@${entry.place.id}`), ['storm_bolt_lance@storm_lance', 'storm_bolt_echo@twice_told_bolt']);
  assert.deepEqual(changesHeld(content, ['twice_told_bolt'], 'cleave'), []);
  assert.equal(activeChange(content, both, {}, 'storm_bolt'), 'storm_bolt_lance');
  assert.equal(activeChange(content, both, { storm_bolt: 'storm_bolt_echo' }, 'storm_bolt'), 'storm_bolt_echo');
  assert.equal(activeChange(content, ['twice_told_bolt'], { storm_bolt: 'storm_bolt_lance' }, 'storm_bolt'), 'storm_bolt_echo');
  assert.equal(activeChange(content, [], {}, 'storm_bolt'), null);
});

const GAP_CHECK = { cliff: 0.5, drastic: 0.25 } as const;

void test('a foe within the band either side of the hero gives full xp, and the band widens with the hero level', (): void => {
  const gap = curve.gap;
  assert.equal(gapBand(gap, 9), gap.band);
  assert.equal(gapBand(gap, 10), gap.band + 1);
  assert.ok(gapBand(gap, 25) > gapBand(gap, 15));
  for (let foe: number = 4; foe <= 14; foe += 1) assert.equal(gapScale(gap, 9, foe), 1, `foe ${foe}`);
  for (let foe: number = 14; foe <= 26; foe += 1) assert.equal(gapScale(gap, 20, foe), 1, `foe ${foe}`);
});

void test('past the band the share falls smoothly and steeply on both sides, to a floor that is never zero', (): void => {
  const gap = curve.gap;
  for (const side of [-1, 1]) {
    const shares: number[] = Array.from({ length: 30 }, (_: unknown, step: number): number => gapScale(gap, 40, 40 + side * step));
    shares.forEach((share: number, step: number): void => {
      const before: number | undefined = shares[step - 1];
      if (before === undefined) return;
      assert.ok(share <= before, `side ${side} step ${step}`);
      assert.ok(before - share <= GAP_CHECK.cliff, `side ${side} step ${step} falls ${before - share}`);
    });
    assert.ok(shares.some((share: number): boolean => share < 1 && share > gap.floor));
    assert.equal(shares.at(-1), gap.floor);
    assert.ok(gap.floor > 0);
  }
  assert.ok(gapScale(gap, 9, 1) < GAP_CHECK.drastic);
  assert.ok(gapScale(gap, 1, 12) < GAP_CHECK.drastic);
});

void test('with above off a foe far above the hero still gives full xp', (): void => {
  const gap = { ...curve.gap, above: false };
  assert.equal(gapScale(gap, 1, 25), 1);
  assert.ok(gapScale(gap, 25, 1) < 1);
});

void test('the shipped curve makes every level take longer than the one before, from start to where the monster experience rule starts', (): void => {
  const shipped: XpCurve = content.player.xp;
  const last: number = content.world.scaling.xpBeyond?.from ?? shipped.maxLevel;
  for (let level: number = 2; level <= last; level += 1) {
    const perFoe: number = monsterXpScale(content.world.scaling, level);
    const earlier: number = monsterXpScale(content.world.scaling, level - 1);
    assert.ok(xpToNextLevel(shipped, level) / perFoe > xpToNextLevel(shipped, level - 1) / earlier, `level ${level}`);
  }
});

void test('past that level no level takes more kills than the one it starts at, so the climb to the cap does not slow down', (): void => {
  const shipped: XpCurve = content.player.xp;
  const from: number = content.world.scaling.xpBeyond?.from ?? shipped.maxLevel;
  const kills = (level: number): number => xpToNextLevel(shipped, level) / monsterXpScale(content.world.scaling, level);
  for (let level: number = from + 1; level < shipped.maxLevel; level += 1) assert.ok(kills(level) <= kills(from), `level ${level}`);
});

void test('a free start over is banked when the save last saw an older tree revision or none, and kept until it is spent', (): void => {
  assert.equal(bankedReset(2, 1, false), true);
  assert.equal(bankedReset(2, undefined, undefined), true);
  assert.equal(bankedReset(2, 2, false), false);
  assert.equal(bankedReset(2, 2, true), true);
  assert.equal(bankedReset(2, 3, false), false);
});

void test('a stored save from before the tree revision loads with one free start over banked, and a spent one stays spent', (): void => {
  const stored: Record<string, unknown> = Object.fromEntries(Object.entries(toSave(played())).filter(([key]: [string, unknown]): boolean => key !== 'treeRevision' && key !== 'freeReset'));
  const old: SaveData = must(parseSaveText(saveContent, JSON.stringify(stored)), 'old save');
  assert.equal(old.freeReset, true);
  assert.equal(old.treeRevision, saveContent.chart.revision);
  const spent: World = played();
  spent.player.freeReset = false;
  assert.equal(roundTrip(spent).freeReset, false);
  const kept: World = played();
  assert.equal(roundTrip(kept).freeReset, true);
});

void test('a save written at an older tree revision is granted the free start over again', (): void => {
  const world: World = played();
  world.player.freeReset = false;
  const older: SaveData = { ...toSave(world), treeRevision: saveContent.chart.revision - 1 };
  assert.equal(must(parseSaveText(saveContent, JSON.stringify(older)), 'save').freeReset, true);
});

void test('a place the tree no longer has is handed back as a point on load, and the rest of the save loads', (): void => {
  const world: World = played();
  world.player.allocated = ['stone_thunderclap', 'tempered_body', 'a_place_that_was_removed'];
  const save: SaveData = roundTrip(world);
  assert.deepEqual(save.allocated, ['stone_thunderclap', 'tempered_body']);
  assert.equal(save.skillPoints, 3);
  const restored: World = createWorld(saveContent, { seed: 2, save });
  assert.deepEqual(restored.player.allocated, ['stone_thunderclap', 'tempered_body']);
});

void test('made-up place names in a save hand back no more points than the character could have earned', (): void => {
  const world: World = played();
  world.player.allocated = ['stone_thunderclap', 'tempered_body', 'blade_thunderhead', 'heavy_hands', 'junk_a', 'junk_b', 'junk_c', 'junk_d', 'junk_e'];
  const save: SaveData = roundTrip(world);
  assert.deepEqual(save.allocated, ['stone_thunderclap', 'tempered_body', 'blade_thunderhead', 'heavy_hands']);
  assert.equal(save.skillPoints + save.allocated.length, earnedPoints(saveContent, save.level, save.grants));
});

void test('the chosen change of a skill survives a save, and a choice no held place gives is dropped', (): void => {
  const world: World = played();
  world.player.allocated = ['storm_storm_bolt', 'stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'storm_lance', 'echo_storm_mid', 'twice_told_bolt'];
  world.player.changes = { storm_bolt: 'storm_bolt_echo' };
  assert.deepEqual(roundTrip(world).changes, { storm_bolt: 'storm_bolt_echo' });
  assert.deepEqual(must(readSave(saveContent, { ...toSave(world), changes: { storm_bolt: 'cleave_whirl', cleave: 7, nonsense: 'storm_bolt_echo' } }), 'save').changes, {});
  assert.deepEqual(must(readSave(saveContent, { ...toSave(world), changes: 'lance' }), 'save').changes, {});
  const { changes: _changes, ...older } = toSave(world);
  assert.deepEqual(must(readSave(saveContent, older), 'save').changes, {});
});

const STORMCALLER_BEFORE: readonly string[] = ['echo_forkline', 'first_echo', 'echo_1', 'long_squall', 'echo_squall', 'echo_2', 'echo_3', 'echo_4', 'twice_told_bolt', 'echo_storm_mid', 'echo_storm_near', 'storm_1', 'stormcallers_focus', 'storm_storm_bolt', 'forked_bolt', 'storm_living_wire', 'storm_2', 'storm_3', 'storm_4', 'echo_7', 'echo_5', 'between_heartbeats', 'storm_blade_near', 'blade_1', 'echo_8', 'echo_10'];

function castsOf(world: World): string[] {
  return wornPowers(saveContent, world.player.equipped).flatMap((power) => power.triggers.flatMap((trigger) => (trigger.effect.type === 'cast' ? [trigger.effect.skill] : [])));
}

void test('a Stormcaller saved before the Gathering Storm loads with a free start over, every point it spent, and its Forkline items still casting', (): void => {
  const world: World = played();
  world.player.level = 14;
  world.player.skillPoints = 0;
  world.player.allocated = [...STORMCALLER_BEFORE];
  world.player.learned = ['cleave', 'forkline', 'squall', 'storm_bolt', 'living_wire', 'dodge_roll'];
  world.player.bar = ['cleave', 'forkline', 'squall', 'storm_bolt', 'living_wire', 'dodge_roll'];
  world.player.freeReset = false;
  world.player.equipped.weapon = made('stormcaller_stave', 'rare', 8);
  world.player.equipped.head = made('crown_of_the_struck_hour', 'stormtouched', 9);
  world.player.equipped.hands = made('wirethread_gloves', 'stormtouched', 10);
  world.player.equipped.charm = made('lantern_of_second_sounds', 'stormtouched', 11);
  const before: number = castsOf(world).filter((id: string): boolean => id === 'forkline').length;
  const stored: SaveData = { ...toSave(world), treeRevision: 1 };
  const save: SaveData = must(parseSaveText(saveContent, JSON.stringify(stored)), 'save');
  assert.equal(save.freeReset, true);
  assert.equal(save.treeRevision, saveContent.chart.revision);
  assert.ok(!save.allocated.includes('storm_living_wire'));
  assert.equal(save.allocated.length + save.skillPoints, STORMCALLER_BEFORE.length);
  assert.ok(['echo_squall', 'long_squall', 'twice_told_bolt', 'storm_4'].every((id: string): boolean => save.allocated.includes(id)));
  assert.ok(!save.learned.includes('living_wire') && !save.bar.includes('living_wire'));
  assert.ok(save.learned.includes('squall') && save.learned.includes('static_field') && save.bar.includes('static_field'));
  const restored: World = createWorld(saveContent, { seed: 9, save });
  assert.ok(before > 0);
  assert.equal(castsOf(restored).filter((id: string): boolean => id === 'forkline').length, before);
  assert.equal(restored.player.freeReset, true);
});

void test('an Echo holding that ran through Squall before it moved to the storm keeps what still joins and gets the rest back as points', (): void => {
  const world: World = played();
  world.player.skillPoints = 0;
  world.player.allocated = ['echo_forkline', 'first_echo', 'echo_1', 'long_squall', 'echo_squall'];
  world.player.learned = ['cleave', 'forkline', 'squall'];
  world.player.bar = ['cleave', 'forkline', 'squall', null, null, 'dodge_roll'];
  const save: SaveData = must(parseSaveText(saveContent, JSON.stringify({ ...toSave(world), treeRevision: 1 })), 'save');
  assert.deepEqual(save.allocated, ['echo_forkline', 'first_echo', 'echo_1']);
  assert.equal(save.skillPoints, 2);
  assert.ok(!save.learned.includes('squall'));
  assert.equal(save.freeReset, true);
});

void test('a windrunner saved before the Long Shadow loads with a free start over, Mist Step gone and every point back to spend', (): void => {
  const world: World = played();
  world.player.level = 6;
  world.player.skillPoints = 0;
  world.player.allocated = ['wind_mist_step', 'windborne', 'wind_1', 'drag_of_the_deep', 'wind_downdraught', 'wind_2', 'wind_4', 'slip_through', 'wind_7', 'through_the_mist'];
  world.player.learned = ['cleave', 'mist_step', 'downdraught', 'dodge_roll'];
  world.player.bar = ['cleave', 'mist_step', 'downdraught', null, null, 'dodge_roll'];
  world.player.freeReset = false;
  const save: SaveData = must(parseSaveText(saveContent, JSON.stringify({ ...toSave(world), treeRevision: saveContent.chart.revision - 1 })), 'save');
  assert.equal(save.freeReset, true);
  assert.deepEqual(save.allocated, []);
  assert.equal(save.skillPoints, 10);
  assert.ok(!save.learned.includes('mist_step') && !save.bar.includes('mist_step'));
  assert.ok(!save.learned.includes('downdraught'));
  assert.ok(canAllocate(saveContent, save.allocated, save.skillPoints, 'wind_ghost_wave'));
});

void test('a character saved before the Turning Tide loads with a free start over, keeps what still joins, and gets back what it spent on the Downdraught in the wind', (): void => {
  const world: World = played();
  world.player.level = 9;
  world.player.skillPoints = 0;
  const edge: readonly string[] = ['blade_thunderhead', 'heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave', 'blade_wind_near', 'wind_1'];
  const undertow: readonly string[] = ['drag_of_the_deep', 'wind_downdraught', 'updraught'];
  world.player.allocated = [...edge, ...undertow];
  world.player.learned = ['cleave', 'thunderhead', 'downdraught', 'dodge_roll'];
  world.player.bar = ['cleave', 'thunderhead', 'downdraught', null, null, 'dodge_roll'];
  world.player.freeReset = false;
  const stored = (allocated: readonly string[]): SaveData => must(parseSaveText(saveContent, JSON.stringify({ ...toSave(world), allocated, treeRevision: saveContent.chart.revision - 1 })), 'save');
  const save: SaveData = stored(world.player.allocated);
  assert.equal(save.freeReset, true);
  assert.deepEqual(save.allocated, edge);
  assert.equal(save.skillPoints, undertow.length);
  assert.ok(!save.learned.includes('downdraught') && !save.bar.includes('downdraught'));
  const turning: readonly string[] = [...edge, 'endless_turn', 'millstone', ...undertow];
  const kept: SaveData = stored(turning);
  assert.deepEqual(kept.allocated, turning);
  assert.ok(kept.learned.includes('downdraught'));
  assert.ok(canAllocate(saveContent, kept.allocated, 1, 'riptide'));
});

void test('a character saved before the Banked Fire loads with a free start over and keeps every stone place it held', (): void => {
  const world: World = played();
  world.player.level = 12;
  world.player.skillPoints = 0;
  const stone: readonly string[] = ['stone_thunderclap', 'tempered_body', 'stone_1', 'bedrock', 'stone_held_breath', 'stone_2', 'stone_4', 'gathered_clap', 'stone_5', 'stone_6', 'heaving_cleave'];
  world.player.allocated = [...stone];
  world.player.learned = ['cleave', 'thunderclap', 'held_breath', 'dodge_roll'];
  world.player.bar = ['cleave', 'thunderclap', 'held_breath', null, null, 'dodge_roll'];
  world.player.freeReset = false;
  const save: SaveData = must(parseSaveText(saveContent, JSON.stringify({ ...toSave(world), treeRevision: saveContent.chart.revision - 1 })), 'save');
  assert.equal(save.freeReset, true);
  assert.deepEqual(save.allocated, stone);
  assert.equal(save.skillPoints, 0);
  assert.ok(canAllocate(saveContent, save.allocated, 1, 'shoulder_through'));
  assert.ok(canAllocate(saveContent, save.allocated, 1, 'stone_fire_burst'));
});

const ECHO_BEFORE: readonly string[] = ['echo_forkline', 'first_echo', 'echo_1', 'echo_15', 'echo_4', 'twice_swung', 'echo_5', 'echo_6', 'echoing_fork', 'stone_echo_near', 'stone_1', 'bedrock', 'stone_held_breath', 'blade_thunderhead', 'heavy_hands', 'blade_1', 'whetstone', 'blade_static_brand'];

void test('a character saved before the Echo loads with a free start over, keeps Held Breath on the Stone path, gets back Echoing Fork and the Static Brand it can no longer reach, and its Forkline items still cast', (): void => {
  const world: World = played();
  world.player.level = 12;
  world.player.skillPoints = 0;
  world.player.allocated = [...ECHO_BEFORE];
  world.player.learned = ['cleave', 'forkline', 'held_breath', 'static_brand', 'thunderhead', 'dodge_roll'];
  world.player.bar = ['cleave', 'forkline', 'held_breath', 'static_brand', 'thunderhead', 'dodge_roll'];
  world.player.freeReset = false;
  world.player.equipped.head = made('crown_of_the_struck_hour', 'stormtouched', 9);
  world.player.equipped.hands = made('wirethread_gloves', 'stormtouched', 10);
  const before: number = castsOf(world).filter((id: string): boolean => id === 'forkline').length;
  const save: SaveData = must(parseSaveText(saveContent, JSON.stringify({ ...toSave(world), treeRevision: saveContent.chart.revision - 1 })), 'save');
  const gone: readonly string[] = ['echoing_fork', 'blade_static_brand'];
  assert.equal(save.freeReset, true);
  assert.deepEqual(save.allocated, ECHO_BEFORE.filter((id: string): boolean => !gone.includes(id)));
  assert.equal(save.skillPoints, gone.length);
  assert.ok(!save.learned.includes('static_brand') && !save.bar.includes('static_brand'));
  assert.ok(['static_field', 'held_breath', 'thunderhead'].every((id: string): boolean => save.bar.includes(id)));
  assert.ok(canAllocate(saveContent, save.allocated, 1, 'forked'));
  const restored: World = createWorld(saveContent, { seed: 9, save });
  assert.ok(before > 0);
  assert.equal(castsOf(restored).filter((id: string): boolean => id === 'forkline').length, before);
});
