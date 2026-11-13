import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { chartDef, chartProblems, skillMod } from './parse-chart.ts';
import type { Content, SkillTreeNodeDef } from './types.ts';

const content: Content = loadContent();
const first: SkillTreeNodeDef = must(content.skillTree[0], 'node');

function withNode(extra: Partial<SkillTreeNodeDef>): Content {
  return { ...content, skillTree: [...content.skillTree, { ...first, id: 'probe', column: 99, row: 99, requires: [], ...extra }] };
}

void test('the shipped chart has no problems', (): void => {
  assert.deepEqual(chartProblems(content), []);
});

void test('a modifier names a skill or a group, never both or neither', (): void => {
  assert.deepEqual(skillMod({ skill: 'cleave', field: 'damagePercent', value: 0.1 }, 'm').target, { type: 'skill', skill: 'cleave' });
  assert.deepEqual(skillMod({ group: 'lightning', field: 'chains', value: 1 }, 'm').target, { type: 'group', group: 'lightning' });
  assert.throws((): unknown => skillMod({ skill: 'cleave', group: 'lightning', field: 'damagePercent', value: 0.1 }, 'm'), /exactly one/);
  assert.throws((): unknown => skillMod({ field: 'damagePercent', value: 0.1 }, 'm'), /exactly one/);
});

void test('unknown paths, groups and variant skills are problems', (): void => {
  assert.ok(chartProblems(withNode({ path: 'nowhere' })).some((line: string): boolean => line.includes('unknown path nowhere')));
  assert.ok(chartProblems(withNode({ skillMods: [{ target: { type: 'group', group: 'nothing' }, field: 'damagePercent', value: 1 }] })).some((line: string): boolean => line.includes('unknown skill group nothing')));
  assert.ok(chartProblems(withNode({ variants: [{ skill: 'cleave', becomes: 'no_such' }] })).some((line: string): boolean => line.includes('unknown skill no_such')));
  assert.ok(chartProblems(withNode({ variants: [{ skill: 'cleave', becomes: 'cleave' }] })).some((line: string): boolean => line.includes('into itself')));
  assert.ok(chartProblems(withNode({ variants: [{ skill: 'cleave', becomes: 'cleave_whirl' }, { skill: 'cleave', becomes: 'cleave_heave' }] })).some((line: string): boolean => line.includes('two ways')));
});

void test('the chart needs whole points per level and a plain colour for each path', (): void => {
  const base = { title: 'The Skill Tree', pointsPerLevel: 2, respec: { goldPerPoint: 1, goldPerLevel: 1 }, grants: [], twist: 0.08, paths: [{ id: 'a', name: 'A', tint: '#aabbcc', description: '' }], groups: [] };
  assert.equal(chartDef(base, 'chart').pointsPerLevel, 2);
  assert.throws((): unknown => chartDef({ ...base, pointsPerLevel: 1.5 }, 'chart'), /whole number/);
  assert.throws((): unknown => chartDef({ ...base, paths: [{ id: 'a', name: 'A', tint: 'blue', description: '' }] }, 'chart'), /colour/);
});
