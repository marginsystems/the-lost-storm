import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef, ZoneDef } from '../content/types.ts';
import { levelFamilies, levelKinds, pickChoices } from './run-picks.ts';
import type { PickChoice } from './run-picks.ts';

const content: Content = loadContent();

function familyIds(zone: string): string[] {
  return levelFamilies(content, zoneOf(content, zone)).map((family: PickChoice): string => family.id);
}

void test('a level offers only the families with at least two members living there', (): void => {
  assert.deepEqual(familyIds('under_hall'), ['many_legs', 'fur_and_fang', 'rot_and_ooze', 'echoes', 'risen', 'scales_and_stings']);
  assert.deepEqual(familyIds('under_hall_2'), ['many_legs', 'dark_wings', 'rot_and_ooze', 'echoes', 'risen', 'scales_and_stings']);
  assert.deepEqual(familyIds('ledger_hall'), ['blades', 'learned', 'risen']);
  assert.deepEqual(familyIds('lava_depths'), ['imps_and_embers']);
});

void test('a family offered on a level lists only the members that live there', (): void => {
  const wings: PickChoice | undefined = levelFamilies(content, zoneOf(content, 'under_hall_2')).find((family: PickChoice): boolean => family.id === 'dark_wings');
  assert.deepEqual(wings?.monsters, ['bat', 'cave_shade', 'drifter']);
  const fur: PickChoice | undefined = levelFamilies(content, zoneOf(content, 'under_hall')).find((family: PickChoice): boolean => family.id === 'fur_and_fang');
  assert.deepEqual(fur?.monsters, ['wolf', 'rat']);
});

void test('a monster pick offers each kind once, and no pick offers nothing', (): void => {
  const cave: ZoneDef = zoneOf(content, 'under_hall');
  assert.deepEqual(
    pickChoices(content, 'monster', cave).map((choice: PickChoice): string => choice.id),
    levelKinds(content, cave).map((monster: MonsterDef): string => monster.id),
  );
  assert.deepEqual(pickChoices(content, 'none', cave), []);
});
