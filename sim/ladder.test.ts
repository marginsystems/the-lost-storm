import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Fields } from './content/read.ts';
import type { Content, SkillDef, StatBlock } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { bounded, chainOf, DAMAGE_EXPLAINED, LADDER, ladderFigures, mainAttack, mainSlot, sustainedDamage } from './ladder.ts';
import type { LadderFigures, LadderSubject } from './ladder.ts';
import { createRng } from './rng.ts';
import { readSave, SAVE_VERSION } from './save.ts';
import type { SaveData } from './save.ts';
import { computeStats, damagePerSecond, expectedHit, skillCycle } from './stats.ts';
import type { Equipment, ItemInstance, RolledAffix } from './world/types.ts';

const content: Content = loadContent();
const bare: Equipment = emptyEquipment();

function subject(overrides: Partial<LadderSubject> = {}): LadderSubject {
  return { level: 1, equipped: bare, allocated: [], bar: ['cleave', null, null, null, null, null], ...overrides };
}

function item(base: string, level: number = 1): ItemInstance {
  return must(generateItem(content, createRng(1), 1, level, base, 'common'), base);
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}

function sane(figures: LadderFigures): void {
  for (const value of [figures.damage, figures.life]) {
    assert.ok(Number.isFinite(value), `${value} is not finite`);
    assert.ok(Number.isInteger(value), `${value} is not whole`);
    assert.ok(value >= 0 && value <= LADDER.ceiling, `${value} is out of bounds`);
  }
}

void test('the main attack is the skill on the button bound to the left mouse button', (): void => {
  assert.equal(mainSlot(content), 0);
  assert.equal(mainAttack(content, subject())?.id, 'cleave');
  assert.equal(mainAttack(content, subject({ bar: ['thunderclap', null, null, null, null, null] }))?.damage.weaponPercent, must(content.skills.get('thunderclap'), 'thunderclap').damage.weaponPercent);
});

void test('an empty main slot falls back to the skill the data keeps there', (): void => {
  assert.equal(mainAttack(content, subject({ bar: [null, null, null, null, null, null] }))?.id, 'cleave');
});

void test('a combo is measured over its whole chain held down', (): void => {
  const cleave: SkillDef = must(mainAttack(content, subject()), 'cleave');
  const stats: StatBlock = computeStats(content, 1, bare, []);
  const chain: readonly SkillDef[] = chainOf(cleave);
  assert.equal(chain.length, 1 + (cleave.combo?.steps.length ?? 0));
  assert.ok(chain.length > 1);
  const hits: number = chain.reduce((sum: number, step: SkillDef): number => sum + expectedHit(stats, step), 0);
  const cycle: number = chain.reduce((sum: number, step: SkillDef): number => sum + skillCycle(stats, step), 0);
  close(sustainedDamage(stats, cleave), hits / cycle);
  assert.ok(sustainedDamage(stats, cleave) > damagePerSecond(stats, cleave));
});

void test('a skill with no combo is its own per-second figure', (): void => {
  const clap: SkillDef = must(content.skills.get('thunderclap'), 'thunderclap');
  const stats: StatBlock = computeStats(content, 3, bare, []);
  assert.equal(clap.combo, null);
  close(sustainedDamage(stats, clap), damagePerSecond(stats, clap));
});

void test('a fresh character has the base life and a positive damage figure', (): void => {
  const figures: LadderFigures = ladderFigures(content, subject());
  assert.equal(figures.life, content.player.baseStats.maxLife);
  assert.ok(figures.damage > 0);
  sane(figures);
});

void test('levels, gear and the Skill Tree raise the figures', (): void => {
  const fresh: LadderFigures = ladderFigures(content, subject());
  const levelled: LadderFigures = ladderFigures(content, subject({ level: 10 }));
  const armed: LadderFigures = ladderFigures(content, subject({ equipped: { ...bare, weapon: item('rusted_blade') } }));
  const tree: LadderFigures = ladderFigures(content, subject({ allocated: ['tempered_body', 'heavy_hands'] }));
  assert.ok(levelled.life > fresh.life && levelled.damage > fresh.damage);
  assert.ok(armed.damage > fresh.damage);
  assert.equal(tree.life, fresh.life + 30);
  assert.ok(tree.damage > fresh.damage);
});

void test('a crossbow measures the shot it turns the main attack into', (): void => {
  const crossbow: ItemInstance = item('worn_crossbow');
  const held: LadderSubject = subject({ equipped: { ...bare, weapon: crossbow } });
  const shot: SkillDef = must(mainAttack(content, held), 'shot');
  const quarrel: SkillDef = must(content.skills.get('quarrel'), 'quarrel');
  assert.equal(shot.windup, quarrel.windup);
  assert.equal(shot.damage.weaponPercent, quarrel.damage.weaponPercent);
  const stats: StatBlock = computeStats(content, 1, held.equipped, []);
  assert.equal(ladderFigures(content, held).damage, Math.floor(sustainedDamage(stats, shot)));
});

void test('a skill that deals no damage on the main button counts as no damage', (): void => {
  assert.equal(ladderFigures(content, subject({ bar: ['dodge_roll', null, null, null, null, null] })).damage, 0);
});

void test('the figures are deterministic', (): void => {
  const held: LadderSubject = subject({ level: 7, equipped: { ...bare, weapon: item('rusted_blade', 5) }, allocated: ['heavy_hands'] });
  assert.deepEqual(ladderFigures(content, held), ladderFigures(content, held));
});

void test('bounded keeps every number whole and between zero and the ceiling', (): void => {
  assert.equal(bounded(Number.NaN), 0);
  assert.equal(bounded(-5), 0);
  assert.equal(bounded(Number.NEGATIVE_INFINITY), 0);
  assert.equal(bounded(Number.POSITIVE_INFINITY), LADDER.ceiling);
  assert.equal(bounded(12.9), 12);
});

function plainSave(): Fields {
  return { version: SAVE_VERSION, level: 1, xp: 0, gold: 0, kills: 0, skillPoints: 0, surge: 1, nextItemUid: 2, allocated: [], inventory: [] };
}

function forged(base: Fields, level: number, affixes: readonly RolledAffix[]): SaveData {
  const weapon: ItemInstance = item('rusted_blade');
  const value: unknown = { ...base, level, bar: ['cleave', null, null, null, null, null], equipped: { weapon: { ...weapon, affixes } } };
  return must(readSave(content, value), 'forged save');
}

void test('a save with absurd but valid values gives finite, whole, bounded figures', (): void => {
  const base: Fields = plainSave();
  const affixes: readonly string[] = [...content.affixes.keys()];
  assert.ok(affixes.length > 0);
  const values: readonly number[] = [Number.MAX_VALUE, -Number.MAX_VALUE, 1e300, -1e300, 1e9, -1e9, -1, 0, Number.MIN_VALUE];
  for (const value of values) sane(ladderFigures(content, forged(base, Number.MAX_SAFE_INTEGER, affixes.map((affix: string): RolledAffix => ({ affix, value })))));
  for (const affix of affixes) {
    for (const value of [Number.MAX_VALUE, -Number.MAX_VALUE]) sane(ladderFigures(content, forged(base, Number.MAX_SAFE_INTEGER, [{ affix, value }, { affix, value }])));
  }
});

void test('the damage figure is explained in one line', (): void => {
  assert.ok(DAMAGE_EXPLAINED.length > 0 && !DAMAGE_EXPLAINED.includes('\n'));
});
