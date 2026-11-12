import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLASSIC_BAR, must, worldIn } from '../test/support.ts';
import { characterSheet } from './character-sheet.ts';
import type { CharacterSheet, SheetSubject, SkillOffence } from './character-sheet.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { emptyEquipment, generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { computeStats, resolveSkillBar, skillCycle } from './stats.ts';
import type { World } from './world/types.ts';

const content: Content = loadContent();

function subject(level: number, allocated: readonly string[], weapon: boolean): SheetSubject {
  const equipped = emptyEquipment();
  if (weapon) equipped.weapon = must(generateItem(content, createRng(1), 1, 1, 'rusted_blade', 'common'), 'blade');
  return { level, xp: 0, equipped, allocated: [...allocated], skills: resolveSkillBar(content, CLASSIC_BAR, allocated) };
}

function near(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);
}

function skill(sheet: CharacterSheet, id: string): SkillOffence {
  return must(sheet.skills.find((entry: SkillOffence): boolean => entry.id === id), id);
}

void test('a bare level 1 character shows the base stats and a cleave of 2 to 4', (): void => {
  const sheet: CharacterSheet = characterSheet(content, subject(1, [], false));
  assert.equal(sheet.figures.maxLife.total, 100);
  assert.equal(sheet.figures.maxLife.base, 100);
  assert.equal(sheet.figures.maxLife.gear, 0);
  assert.equal(sheet.figures.maxLife.tree, 0);
  assert.equal(sheet.armourReduction, 0);
  const cleave: SkillOffence = skill(sheet, 'cleave');
  near(cleave.hitMin, 2);
  near(cleave.hitMax, 4);
  near(cleave.cycle, 0.34);
  near(cleave.perSecond, (3 * (1 + 0.06 * 0.6)) / 0.34);
});

void test('levels count as base and tree nodes as tree', (): void => {
  const sheet: CharacterSheet = characterSheet(content, subject(5, ['tempered_body', 'heavy_hands'], false));
  assert.equal(sheet.figures.maxLife.base, 148);
  assert.equal(sheet.figures.maxLife.tree, 30);
  assert.equal(sheet.figures.maxLife.total, 178);
  near(sheet.figures.lifeRegen.tree, 1);
  near(sheet.figures.damagePercent.tree, 0.2);
  near(skill(sheet, 'cleave').hitMax, 8 * 1.2);
});

void test('a weapon is gear: its damage lands in the gear column and the hit range', (): void => {
  const sheet: CharacterSheet = characterSheet(content, subject(1, [], true));
  assert.equal(sheet.figures.damageMin.gear, 3);
  assert.equal(sheet.figures.damageMax.gear, 6);
  near(skill(sheet, 'cleave').hitMin, 5);
  near(skill(sheet, 'cleave').hitMax, 10);
  near(skill(sheet, 'thunderclap').hitMin, 5 * 1.5 + 4);
  near(skill(sheet, 'thunderclap').hitMax, 10 * 1.5 + 8);
  assert.ok(sheet.bonuses.some((bonus): boolean => bonus.source === 'gear'));
});

void test('base, gear and tree always add up to the total', (): void => {
  const sheet: CharacterSheet = characterSheet(content, subject(7, ['tempered_body', 'heavy_hands', 'eye_of_the_storm'], true));
  for (const figure of Object.values(sheet.figures)) near(figure.base + figure.gear + figure.tree, figure.total);
});

void test('tree skill modifiers reach the skill figures and the bonus list', (): void => {
  const sheet: CharacterSheet = characterSheet(content, subject(1, ['stormcallers_focus', 'rolling_thunder'], false));
  near(skill(sheet, 'thunderclap').cycle, 3);
  const texts: string[] = sheet.bonuses.filter((bonus): boolean => bonus.source === 'tree').map((bonus): string => bonus.text);
  assert.equal(texts.length, 2);
  assert.equal(texts[1]?.startsWith('Rolling Thunder'), true);
});

void test('experience reads against the next level and armour reduces by its own curve', (): void => {
  const sheet: CharacterSheet = characterSheet(content, { ...subject(3, [], false), xp: 10 });
  assert.equal(sheet.xp, 10);
  assert.equal(sheet.xpToNext, Math.round(content.player.xp.base * Math.pow(content.player.xp.growth, 2)));
  assert.equal(sheet.atMaxLevel, false);
});

void test('the sheet agrees with the stats the world fights with', (): void => {
  const world: World = worldIn(content, 'shallows', 3);
  const sheet: CharacterSheet = characterSheet(content, world.player);
  assert.deepEqual(
    { life: sheet.figures.maxLife.total, mana: sheet.figures.maxMana.total, armour: sheet.figures.armour.total, crit: sheet.figures.critChance.total },
    { life: world.player.stats.maxLife, mana: world.player.stats.maxMana, armour: world.player.stats.armour, crit: world.player.stats.critChance },
  );
  assert.equal(sheet.skills.length, world.player.skills.filter((owned): boolean => owned !== null && owned.delivery.type !== 'dash').length);
  assert.ok(sheet.skills.every((entry: SkillOffence): boolean => entry.id !== 'dodge_roll'));
});

void test('flat skill damage is multiplied by critical hits like combat does', (): void => {
  const sheet: CharacterSheet = characterSheet(content, subject(1, [], false));
  near(skill(sheet, 'thunderclap').perSecond, ((3 * 1.5 + 6) * (1 + 0.06 * 0.6)) / 4);
});

void test('attack speed below the floor is clamped the way combat clamps it', (): void => {
  const slowed: SheetSubject = subject(1, [], false);
  const stats = computeStats(content, 1, slowed.equipped, []);
  near(skillCycle({ ...stats, attackSpeed: -1 }, must(content.skills.get('cleave'), 'cleave')), 0.34 / 0.2);
});

void test('a character at the level cap is flagged as maxed', (): void => {
  const sheet: CharacterSheet = characterSheet(content, subject(content.player.xp.maxLevel, [], false));
  assert.equal(sheet.atMaxLevel, true);
});
