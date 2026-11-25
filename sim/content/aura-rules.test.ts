import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { auraOf, auraProblems } from './aura-rules.ts';
import { loadContent } from './content.ts';
import type { Content, SkillDef } from './types.ts';

const content: Content = loadContent();

void test('the shipped auras name only skills and groups that exist, and a skill that is not an area has no aura', (): void => {
  assert.deepEqual(auraProblems(content), []);
  assert.notEqual(auraOf(must(content.skills.get('static_field'), 'static_field')), null);
  assert.equal(auraOf(must(content.skills.get('storm_bolt'), 'storm_bolt')), null);
  assert.equal(auraOf(must(content.skills.get('standing_storm'), 'standing_storm')), null);
});

void test('an aura that names an unknown skill group or skill is reported', (): void => {
  const heavy: SkillDef = must(content.skills.get('static_field'), 'static_field');
  if (heavy.delivery.type !== 'area' || heavy.delivery.aura === null) throw new Error('static_field is an aura');
  const broken: SkillDef = { ...heavy, id: 'broken_air', delivery: { ...heavy.delivery, aura: { statMods: [], skillMods: [{ target: { type: 'skill', skill: 'no_such_skill' }, field: 'damagePercent', value: 0.1 }], exposes: [{ target: { type: 'group', group: 'no_such_group' }, value: 0.1 }] } } };
  const skills: Map<string, SkillDef> = new Map<string, SkillDef>([...content.skills, ['broken_air', broken]]);
  assert.deepEqual(auraProblems({ ...content, skills }), ["skill broken_air's aura names unknown skill no_such_skill", "skill broken_air's aura names unknown skill group no_such_group"]);
});
