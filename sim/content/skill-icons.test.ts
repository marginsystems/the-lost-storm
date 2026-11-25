import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { barSkills, changeRoots, sharedBarIcons } from './skill-icons.ts';
import type { Content, SkillDef } from './types.ts';

const content: Content = loadContent();

function withIcon(id: string, icon: string): Content {
  const skill: SkillDef = must(content.skills.get(id), id);
  return { ...content, skills: new Map<string, SkillDef>([...content.skills, [id, { ...skill, icon }]]) };
}

void test('the bar skills are the ones the player can learn, unlock, hold through a weapon or change on the tree, never a monster skill', (): void => {
  const ids: ReadonlySet<string> = barSkills(content);
  for (const id of ['cleave', 'dodge_roll', 'spell_strike', 'quarrel', 'static_field', 'squall', 'standing_storm', 'umbra', 'ghost_wave', 'cleave_whirl', 'cleave_millwheel']) assert.ok(ids.has(id), id);
  for (const id of ['brute_haymaker', 'rival_bolt', 'volatile_burst', 'static_brand_burst']) assert.ok(!ids.has(id), id);
});

void test('a change of a change goes back to the skill it started as', (): void => {
  assert.deepEqual([...changeRoots(content, 'cleave_millwheel')], ['cleave']);
  assert.deepEqual([...changeRoots(content, 'quarrel_fan')], ['quarrel']);
  assert.deepEqual([...changeRoots(content, 'forkline')], ['forkline']);
});

void test('two bar skills with one icon are named, unless both are changes of the same skill', (): void => {
  assert.deepEqual(sharedBarIcons(withIcon('spell_strike', 'static_field')), ['skills spell_strike and static_field can both sit on the bar but share the icon static_field']);
  assert.deepEqual(sharedBarIcons(withIcon('cleave_whirl', 'cleave')), []);
  assert.deepEqual(sharedBarIcons(withIcon('brute_haymaker', 'static_field')), []);
});
