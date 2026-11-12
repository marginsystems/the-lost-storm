import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeMod, isRatio, roundStat, statLabel } from './stat-text.ts';

void test('flat mods read as signed numbers with the stat label', (): void => {
  assert.equal(describeMod({ stat: 'maxLife', op: 'add', value: 30 }), '+30 Maximum Life');
  assert.equal(describeMod({ stat: 'lifeRegen', op: 'add', value: 1.5 }), '+1.5 Life Regenerated per Second');
});

void test('ratio stats and percent mods read as percentages', (): void => {
  assert.equal(describeMod({ stat: 'moveSpeed', op: 'percent', value: 0.1 }), '+10% Movement Speed');
  assert.equal(describeMod({ stat: 'critChance', op: 'add', value: 0.04 }), '+4% Critical Strike Chance');
  assert.equal(describeMod({ stat: 'attackSpeed', op: 'add', value: -0.15 }), '−15% Attack Speed');
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
