import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIC_BAR, must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef, SkillMod, StatBlock } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { applyMods, armourReduction, averageHit, computeStats, damagePerSecond, damageTakenScale, resistanceOf, resolveSkill, resolveSkillBar } from './stats.ts';
import type { Equipment, ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const bare: Equipment = emptyEquipment();

function skillOf(id: string): SkillDef {
  return must(content.skills.get(id), id);
}

function item(base: string, level: number = 1): ItemInstance {
  return must(generateItem(content, createRng(1), 1, level, base, 'common'), base);
}

void test('an unequipped level 1 character has exactly the base stats', (): void => {
  assert.deepEqual(computeStats(content, 1, bare, []), content.player.baseStats);
});

void test('levels add the per-level modifiers', (): void => {
  const stats: StatBlock = computeStats(content, 5, bare, []);
  assert.equal(stats.maxLife, 100 + 12 * 4);
  assert.equal(stats.damageMax, 4 + 1 * 4);
});

void test('equipping a weapon raises damageMin and damageMax', (): void => {
  const before: StatBlock = computeStats(content, 1, bare, []);
  const after: StatBlock = computeStats(content, 1, { ...bare, weapon: item('rusted_blade') }, []);
  assert.equal(after.damageMin, before.damageMin + 3);
  assert.equal(after.damageMax, before.damageMax + 6);
});

void test('percent modifiers multiply the total of the flat ones', (): void => {
  const base: StatBlock = content.player.baseStats;
  const mixed: StatBlock = applyMods(base, [
    { stat: 'maxLife', op: 'add', value: 50 },
    { stat: 'maxLife', op: 'percent', value: 0.5 },
    { stat: 'maxLife', op: 'percent', value: 0.5 },
  ]);
  assert.equal(mixed.maxLife, (100 + 50) * 2);
  assert.ok(Math.abs(applyMods(base, [{ stat: 'maxLife', op: 'percent', value: 0.1 }]).maxLife - 110) < 1e-9);
  assert.equal(applyMods(base, [{ stat: 'armour', op: 'add', value: 7 }]).armour, 7);
  assert.equal(base.maxLife, 100);
});

void test('allocated nodes add stat modifiers', (): void => {
  const stats: StatBlock = computeStats(content, 1, bare, ['tempered_body', 'heavy_hands']);
  assert.equal(stats.maxLife, 130);
  assert.ok(Math.abs(stats.damagePercent - 0.2) < 1e-9);
});

void test('the maximum damage never falls below the minimum', (): void => {
  const stats: StatBlock = applyMods(content.player.baseStats, [{ stat: 'damageMin', op: 'add', value: 20 }]);
  assert.ok(stats.damageMin > stats.damageMax);
  const bumped: StatBlock = computeStats({ ...content, player: { ...content.player, perLevel: [{ stat: 'damageMin', op: 'add', value: 20 }] } }, 2, bare, []);
  assert.ok(bumped.damageMax >= bumped.damageMin);
});

void test('Forked Bolt gives Storm Bolt three projectiles and one more pierce', (): void => {
  const plain: SkillDef = skillOf('storm_bolt');
  const forked: SkillDef = resolveSkill(content, plain, ['stormcallers_focus', 'forked_bolt']);
  assert.equal(plain.delivery.type, 'projectile');
  assert.equal(forked.delivery.type, 'projectile');
  assert.equal(forked.delivery.count, plain.delivery.count + 2);
  assert.equal(forked.delivery.count, 3);
  assert.equal(forked.delivery.pierce, plain.delivery.pierce + 1);
});

void test('Rolling Thunder widens Thunderclap and shortens its cooldown', (): void => {
  const plain: SkillDef = skillOf('thunderclap');
  const rolling: SkillDef = resolveSkill(content, plain, ['rolling_thunder']);
  assert.equal(plain.delivery.type, 'nova');
  assert.equal(rolling.delivery.type, 'nova');
  assert.ok(Math.abs(rolling.delivery.radius - plain.delivery.radius * 1.35) < 1e-9);
  assert.ok(Math.abs(rolling.cooldown - plain.cooldown * 0.75) < 1e-9);
  assert.ok(Math.abs(rolling.knockback - plain.knockback * 1.5) < 1e-9);
});

void test('a modifier on a group of skills reaches every skill in the group and nothing else', (): void => {
  const taken: readonly string[] = ['stormcallers_focus', 'storm_1'];
  const lightning: number = must(content.chart.groups.find((group): boolean => group.id === 'lightning'), 'lightning').skills.length;
  assert.ok(lightning > 3);
  for (const id of ['storm_bolt', 'thunderclap', 'forkline']) {
    const plain: SkillDef = skillOf(id);
    assert.ok(resolveSkill(content, plain, taken).damage.weaponPercent > plain.damage.weaponPercent, id);
  }
  assert.equal(resolveSkill(content, skillOf('cleave'), taken), skillOf('cleave'));
});

function probe(skillMods: readonly SkillMod[]): Content {
  return { ...content, skillTree: [{ ...must(content.skillTree[0], 'node'), id: 'probe', skillMods, statMods: [] }] };
}

void test('range, duration, jumps and stagger modifiers reach the delivery', (): void => {
  const squall: SkillDef = resolveSkill(probe([{ target: { type: 'skill', skill: 'squall' }, field: 'durationPercent', value: 0.5 }, { target: { type: 'skill', skill: 'squall' }, field: 'rangePercent', value: 0.2 }]), skillOf('squall'), ['probe']);
  assert.ok(squall.delivery.type === 'area');
  assert.equal(squall.delivery.duration, 6);
  assert.ok(Math.abs(squall.delivery.range - 11 * 1.2) < 1e-9);
  const fork: SkillDef = resolveSkill(probe([{ target: { type: 'skill', skill: 'forkline' }, field: 'chains', value: 2 }, { target: { type: 'skill', skill: 'forkline' }, field: 'staggerPercent', value: 1 }]), skillOf('forkline'), ['probe']);
  assert.ok(fork.delivery.type === 'chain' && fork.delivery.jumps === 6);
  assert.ok(Math.abs(fork.stagger - skillOf('forkline').stagger * 2) < 1e-9);
});

void test('a variant place swaps how a skill is delivered but keeps its id and slot', (): void => {
  const lance: SkillDef = resolveSkill(content, skillOf('storm_bolt'), ['stormcallers_focus', 'storm_1', 'forked_bolt', 'storm_4', 'storm_lance']);
  assert.equal(lance.id, 'storm_bolt');
  assert.equal(lance.name, 'Storm Lance');
  assert.equal(lance.delivery.type, 'beam');
  const whirl: SkillDef = resolveSkill(content, skillOf('cleave'), ['heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave']);
  assert.equal(whirl.delivery.type, 'nova');
  assert.equal(whirl.combo, null);
  const echoed: SkillDef = resolveSkill(content, skillOf('storm_bolt'), ['first_echo', 'echo_1', 'long_squall', 'echo_4', 'twice_told_bolt']);
  assert.ok(echoed.echo > 0);
  for (const node of content.skillTree) {
    if (node.variant === null) continue;
    const base: SkillDef = skillOf(node.variant.skill);
    const changed: SkillDef = resolveSkill(content, base, [node.id]);
    assert.equal(changed.id, base.id, node.id);
    assert.notEqual(changed.name, base.name, node.id);
  }
});

void test('skills without matching modifiers are returned untouched', (): void => {
  const cleave: SkillDef = skillOf('cleave');
  assert.equal(resolveSkill(content, cleave, ['rolling_thunder', 'forked_bolt']), cleave);
  const bar: (SkillDef | null)[] = resolveSkillBar(content, CLASSIC_BAR, []);
  assert.deepEqual(
    bar.map((skill: SkillDef | null): string | null => skill?.id ?? null),
    [...CLASSIC_BAR],
  );
});

void test('armour and damage helpers behave sensibly', (): void => {
  assert.equal(armourReduction(0), 0);
  assert.equal(armourReduction(100), 0.5);
  assert.equal(armourReduction(-50), 0);
  const stats: StatBlock = content.player.baseStats;
  assert.ok(averageHit(stats) > (stats.damageMin + stats.damageMax) / 2);
  assert.ok(damagePerSecond(stats, skillOf('cleave')) > 0);
  assert.ok(damagePerSecond({ ...stats, attackSpeed: 2 }, skillOf('cleave')) > damagePerSecond(stats, skillOf('cleave')));
});

void test('every equipment slot adds its item to the stats', (): void => {
  const before: StatBlock = computeStats(content, 1, bare, []);
  const dressed: Equipment = {
    ...bare,
    head: item('wayfarer_hood'),
    chest: item('drowned_leathers'),
    hands: item('strapped_bracers'),
    legs: item('stalker_leggings'),
    feet: item('strider_boots'),
  };
  const after: StatBlock = computeStats(content, 1, dressed, []);
  assert.equal(after.armour, before.armour + 6 + 12 + 6 + 9 + 6);
  assert.equal(after.maxLife, before.maxLife + 14 + 10);
  assert.ok(Math.abs(after.critChance - (before.critChance + 0.02)) < 1e-9);
  assert.ok(Math.abs(after.attackSpeed - (before.attackSpeed + 0.05)) < 1e-9);
  assert.ok(Math.abs(after.moveSpeed - before.moveSpeed * 1.08) < 1e-9);
  const heavy: StatBlock = computeStats(content, 1, { ...bare, chest: item('squall_plate') }, []);
  assert.ok(heavy.moveSpeed < before.moveSpeed);
  assert.ok(heavy.armour > after.armour - 6 - 6 - 9 - 6);
  for (const slot of ITEM_SLOTS) {
    if (dressed[slot] === null) continue;
    const without: StatBlock = computeStats(content, 1, { ...dressed, [slot]: null }, []);
    assert.notDeepEqual(without, after, slot);
  }
});

void test('a resistance is capped, lowered by each storm tier, and never falls below the floor', (): void => {
  const rules = content.player.resistance;
  const stats: StatBlock = { ...computeStats(content, 1, bare, []), stormResist: 0.9, frostResist: 0.3 };
  assert.equal(resistanceOf(stats, 'storm', rules, 0), rules.cap);
  assert.equal(resistanceOf(stats, 'frost', rules, 0), 0.3);
  assert.ok(Math.abs(resistanceOf(stats, 'frost', rules, 1) - (0.3 - rules.tierPenalty)) < 1e-9);
  assert.equal(resistanceOf(stats, 'frost', rules, 50), rules.floor);
});

void test('armour cuts every hit, and storm and frost hits are cut again by their own resistance', (): void => {
  const rules = content.player.resistance;
  const stats: StatBlock = { ...computeStats(content, 1, bare, []), armour: 100, stormResist: 0.5, frostResist: 0 };
  assert.equal(damageTakenScale(stats, 'physical', rules, 0), 1 - armourReduction(100));
  assert.equal(damageTakenScale(stats, 'storm', rules, 0), (1 - armourReduction(100)) * 0.5);
  assert.equal(damageTakenScale(stats, 'frost', rules, 0), 1 - armourReduction(100));
  assert.ok(damageTakenScale(stats, 'frost', rules, 1) > 1 - armourReduction(100));
});
