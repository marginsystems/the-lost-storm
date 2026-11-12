import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillMod, StatMod } from './content/types.ts';
import { STAT_IDS } from './content/types.ts';
import { describeMod, describeSkillMod, isRatio, roundStat, statLabel } from './stat-text.ts';
import { createRng } from './rng.ts';
import { generateItem, itemLines } from './items.ts';

void test('flat mods read as signed numbers with the stat label', (): void => {
  assert.equal(describeMod({ stat: 'maxLife', op: 'add', value: 30 }), '+30 Maximum Life');
  assert.equal(describeMod({ stat: 'lifeRegen', op: 'add', value: 1.5 }), '+1.5 Life Regenerated per Second');
});

void test('ratio stats and percent mods read as percentages', (): void => {
  assert.equal(describeMod({ stat: 'moveSpeed', op: 'percent', value: 0.1 }), '+10% Movement Speed');
  assert.equal(describeMod({ stat: 'critChance', op: 'add', value: 0.04 }), '+4% Critical Strike Chance');
  assert.equal(describeMod({ stat: 'attackSpeed', op: 'add', value: -0.15 }), '-15% Attack Speed');
});

void test('rounding follows the stat kind', (): void => {
  assert.equal(roundStat('maxLife', 'add', 12.6), 13);
  assert.equal(roundStat('manaRegen', 'add', 1.26), 1.3);
  assert.equal(roundStat('critChance', 'add', 0.0456), 0.05);
  assert.equal(roundStat('moveSpeed', 'percent', 0.0449), 0.04);
  assert.ok(isRatio('goldFind', 'add'));
  assert.ok(!isRatio('armour', 'add'));
  assert.equal(statLabel('armour'), 'Armour');
});

const content: Content = loadContent();

void test('every stat reads with its label, a sign and no stray numbers', (): void => {
  for (const stat of STAT_IDS) {
    for (const value of [0.25, -0.25, 4, -4]) {
      for (const op of ['add', 'percent'] as const) {
        const text: string = describeMod({ stat, op, value });
        assert.ok(text.includes(statLabel(stat)), text);
        assert.ok(/^[+-]\d/.test(text) && !text.includes('NaN') && !text.includes('undefined'), text);
        assert.equal(text.includes('%'), isRatio(stat, op), text);
      }
    }
  }
});

void test('new modifiers read plainly', (): void => {
  assert.equal(describeMod({ stat: 'lightningDamage', op: 'add', value: 0.25 }), '+25% Lightning Skill Damage');
  assert.equal(describeMod({ stat: 'dodgeCooldown', op: 'add', value: -0.2 }), '-20% Dodge Roll Cooldown');
  assert.equal(describeMod({ stat: 'lifeOnKill', op: 'add', value: 6 }), '+6 Life Gained on Kill');
  assert.equal(describeMod({ stat: 'skillRepeat', op: 'add', value: 0.12 }), '+12% Chance to Repeat Skills');
  assert.equal(describeMod({ stat: 'flaskCharges', op: 'add', value: 0.4 }), '+40% Flask Charges Gained');
  assert.equal(describeMod({ stat: 'itemFind', op: 'add', value: 0.1 }), '+10% Item Rarity');
});

void test('skill modifiers name their skill', (): void => {
  const mod: SkillMod = { skill: 'storm_bolt', field: 'projectiles', value: 2 };
  assert.equal(describeSkillMod(content, mod), '+2 projectiles (Storm Bolt)');
  assert.equal(describeSkillMod(content, { skill: 'thunderclap', field: 'cooldownPercent', value: -0.35 }), '-35% cooldown (Thunderclap)');
});

void test('every affix and every unique shows readable lines on the item', (): void => {
  const rng = createRng(2);
  for (const affix of content.affixes.values()) {
    const mod: StatMod = { stat: affix.stat, op: affix.op, value: affix.max };
    assert.ok(describeMod(mod).includes(statLabel(affix.stat)), affix.id);
  }
  for (const base of content.itemBases.values()) {
    if (base.uniqueWeight === 0) continue;
    const item = must(generateItem(content, rng, 1, 30, base.id, null), base.id);
    const lines = itemLines(content, item);
    assert.equal(lines.filter((line): boolean => line.source === 'flavour').length, 1, base.id);
    assert.equal(lines.filter((line): boolean => line.source === 'skill').length, base.skillMods.length, base.id);
    for (const line of lines) assert.ok(line.text.length > 0 && !line.text.includes('NaN') && !line.text.includes('undefined'), `${base.id}: ${line.text}`);
  }
});
