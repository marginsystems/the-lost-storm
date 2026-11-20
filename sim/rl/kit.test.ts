import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ItemBaseDef } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { BUILD } from './build.ts';
import type { DuelKit } from './kit.ts';
import { DUEL_KIT, kitProblems, readKit, weaponGroupOf } from './kit.ts';

const CONTENT: Content = loadContent();

void test('the standard kit names real plain gear the duel level can wear', (): void => {
  assert.deepEqual(kitProblems(CONTENT, DUEL_KIT, BUILD.level), []);
});

void test('the standard kit has one weapon for each weapon group', (): void => {
  const groups: string[] = DUEL_KIT.weapons.map((id: string): string => must(weaponGroupOf(CONTENT, must(CONTENT.itemBases.get(id), id)), id).id);
  assert.deepEqual(groups.toSorted(), CONTENT.chart.weaponGroups.map((group): string => group.id).toSorted());
});

void test('the standard armour covers every armour slot but the charm', (): void => {
  assert.deepEqual(DUEL_KIT.armour.map((piece): string => piece.slot), ['head', 'chest', 'hands', 'legs', 'feet']);
});

void test('a kit with two weapons of a group, a missing group or a magic rarity is refused', (): void => {
  const broken: DuelKit = { ...DUEL_KIT, rarity: 'magic', weapons: ['warden_broadsword', 'stormglass_longsword'] };
  const found: readonly string[] = kitProblems(CONTENT, broken, BUILD.level);
  assert.ok(found.some((problem: string): boolean => /rolls affixes/.test(problem)));
  assert.ok(found.some((problem: string): boolean => /stormglass_longsword is a second Blade/.test(problem)));
  assert.ok(found.some((problem: string): boolean => /no standard weapon is a Staff/.test(problem)));
});

void test('a kit file with an unknown field or a weapon in the armour is refused', (): void => {
  assert.throws((): unknown => readKit({ ...DUEL_KIT, extra: 1 }, 'kit'), /unknown field extra/);
  assert.throws((): unknown => readKit({ rarity: 'common', weapons: [], armour: { weapon: 'iron_maul' } }, 'kit'), /weapon is not an armour slot/);
  const sword: ItemBaseDef = must(CONTENT.itemBases.get('warden_broadsword'), 'sword');
  assert.equal(weaponGroupOf(CONTENT, sword)?.id, 'blade');
});
