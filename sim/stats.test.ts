import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef, StatBlock } from './content/types.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { applyMods, armourReduction, averageHit, computeStats, damagePerSecond, resolveSkill, resolveSkillBar } from './stats.ts';
import type { Equipment, ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const bare: Equipment = { weapon: null, armour: null, charm: null };

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

void test('skills without matching modifiers are returned untouched', (): void => {
  const cleave: SkillDef = skillOf('cleave');
  assert.equal(resolveSkill(content, cleave, ['rolling_thunder', 'forked_bolt']), cleave);
  const bar: SkillDef[] = resolveSkillBar(content, []);
  assert.deepEqual(
    bar.map((skill: SkillDef): string => skill.id),
    content.player.skillBar.map((binding): string => binding.skill),
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
