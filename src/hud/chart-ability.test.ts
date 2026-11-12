import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillDef, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { findNode } from '../../sim/progression.ts';
import { abilityCard, CATEGORY_NAMES, costWords, damageWord } from './chart-ability.ts';
import type { AbilityCard } from './chart-ability.ts';

const content: Content = loadContent();

function place(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | null = findNode(content, id);
  if (found === null) throw new Error(`no place ${id}`);
  return found;
}

function skill(id: string): SkillDef {
  const found: SkillDef | undefined = content.skills.get(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
}

void test('an ability place names its kind, its damage, its cost and the slot it goes on', (): void => {
  const card: AbilityCard | null = abilityCard(content, place('storm_storm_bolt'), ['cleave', null, null, null, null, 'dodge_roll']);
  assert.ok(card !== null);
  assert.equal(card.skill.id, 'storm_bolt');
  assert.equal(card.tags, `${CATEGORY_NAMES.single} · ${damageWord(skill('storm_bolt'))}`);
  assert.equal(card.cost, costWords(skill('storm_bolt')));
  assert.equal(card.slot, 1);
});

void test('a place that gives no skill has no ability card, and a full bar gives no slot', (): void => {
  assert.equal(abilityCard(content, place('stormcallers_focus'), []), null);
  assert.equal(abilityCard(content, place('storm_storm_bolt'), ['a', 'b'])?.slot, null);
});

void test('every ability place in the data has a kind and a cost line', (): void => {
  for (const node of content.skillTree) {
    if (node.unlock === null) continue;
    const card: AbilityCard | null = abilityCard(content, node, []);
    assert.ok(card !== null && card.tags.length > 0 && card.cost.length > 0, node.id);
    assert.notEqual(card.skill.category, 'none', node.id);
  }
});

void test('costs read as mana and a cooldown in whole tenths, and damage reads by where it comes from', (): void => {
  const base: SkillDef = skill('storm_bolt');
  assert.equal(costWords({ ...base, manaCost: 12, cooldown: 2.25 }), '12 mana · 2.3s cooldown');
  assert.equal(costWords({ ...base, manaCost: 0, cooldown: 0 }), 'No mana');
  assert.equal(damageWord({ ...base, damage: { type: 'physical', weaponPercent: 1, flatMin: 0, flatMax: 0 } }), 'Weapon damage');
  assert.equal(damageWord({ ...base, damage: { type: 'physical', weaponPercent: 0, flatMin: 0, flatMax: 0 } }), 'No damage');
});
