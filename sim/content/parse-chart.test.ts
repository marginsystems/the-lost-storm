import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { chartDef, chartProblems } from './parse-chart.ts';
import { skillMod } from './parse-mods.ts';
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

void test('a skill the tree makes from another is turned again by one place only, so a rival to the Millwheel turn is refused', (): void => {
  assert.ok(chartProblems(withNode({ variants: [{ skill: 'cleave_whirl', becomes: 'cleave_heave' }] })).some((line: string): boolean => line.includes('cleave_whirl is made on the tree and turned again by more than one place: endless_turn, probe')));
  assert.deepEqual(chartProblems(withNode({ variants: [{ skill: 'storm_bolt', becomes: 'cleave_heave' }] })), []);
});

void test('the chart needs whole points per level and a plain colour for each path', (): void => {
  const base = { title: 'The Skill Tree', pointsPerLevel: 2, revision: 1, respec: { goldPerPoint: 1, goldPerLevel: 1 }, grants: [], twist: 0.08, paths: [{ id: 'a', name: 'A', tint: '#aabbcc', description: '' }], groups: [], weaponGroups: [{ id: 'blade', name: 'Blade', kinds: ['blade'], starter: 'warden_shortsword', needs: 'a blade', icon: 'sword', holds: 'swords', path: 'blade' }] };
  assert.equal(chartDef(base, 'chart').pointsPerLevel, 2);
  assert.throws((): unknown => chartDef({ ...base, pointsPerLevel: 1.5 }, 'chart'), /whole number/);
  assert.throws((): unknown => chartDef({ ...base, paths: [{ id: 'a', name: 'A', tint: 'blue', description: '' }] }, 'chart'), /colour/);
  assert.throws((): unknown => chartDef({ ...base, weaponGroups: [{ id: 'blade', name: 'Blade', kinds: ['wand'], starter: 'warden_shortsword', needs: 'a blade', icon: 'sword', holds: 'swords', path: 'blade' }] }, 'chart'), /kinds/);
});

void test('a place and a skill name weapon groups the chart knows, and every weapon kind sits in exactly one group', (): void => {
  assert.equal(chartDef({ title: 'T', pointsPerLevel: 2, revision: 1, respec: { goldPerPoint: 1, goldPerLevel: 1 }, grants: [], twist: 0, paths: [], groups: [], weaponGroups: [] }, 'chart').weaponGroups.length, 0);
  assert.ok(chartProblems(withNode({ weapon: 'wand' })).some((line: string): boolean => line.includes('tree node probe leans on unknown weapon group wand')));
  assert.deepEqual(chartProblems(withNode({ weapon: 'staff' })), []);
  const cleave = must(content.skills.get('cleave'), 'cleave');
  const skills = new Map(content.skills);
  skills.set('cleave', { ...cleave, empowered: { weapon: 'wand', mods: [{ field: 'damagePercent', value: 0.25 }] } });
  const lines: string[] = chartProblems({ ...content, skills });
  assert.ok(lines.includes('skill cleave is empowered by unknown weapon group wand'));
  const loose = { ...content, chart: { ...content.chart, weaponGroups: [...content.chart.weaponGroups.filter((group): boolean => group.id !== 'staff'), { id: 'rods', name: 'Rods', kinds: ['staff' as const, 'blade' as const], starter: 'driftwood_staff', needs: 'a rod', icon: 'staff', holds: 'rods', path: 'storm' }] } };
  assert.ok(chartProblems(loose).includes('weapon kind blade is in more than one weapon group'));
  const missing = { ...content, chart: { ...content.chart, weaponGroups: content.chart.weaponGroups.filter((group): boolean => group.id !== 'staff') } };
  assert.ok(chartProblems(missing).includes('weapon kind staff is in no weapon group'));
  const others = content.chart.weaponGroups.filter((group): boolean => group.id !== 'staff' && group.id !== 'blade');
  const starters = { ...content, chart: { ...content.chart, weaponGroups: [...others, { id: 'staff', name: 'Staff', kinds: ['staff' as const], starter: 'warden_shortsword', needs: 'a staff', icon: 'staff', holds: 'staves', path: 'storm' }, { id: 'blade', name: 'Blade', kinds: ['blade' as const, 'axe' as const], starter: 'no_such_blade', needs: 'a blade', icon: 'sword', holds: 'swords', path: 'blade' }] } };
  assert.ok(chartProblems(starters).includes('weapon group staff starts with warden_shortsword, which is not one of its weapons'));
  assert.ok(chartProblems(starters).includes('weapon group blade starts with unknown item no_such_blade'));
});

void test('a retired place or skill names what took its place, and one still in use or pointing at nothing is a problem', (): void => {
  assert.equal(content.chart.retired.places.get('blade_still_water'), 'blade_millrace');
  assert.equal(content.chart.retired.skills.get('still_water'), 'millrace');
  const bare = { title: 'T', pointsPerLevel: 2, revision: 1, respec: { goldPerPoint: 1, goldPerLevel: 1 }, grants: [], twist: 0, paths: [], groups: [], weaponGroups: [] };
  assert.equal(chartDef(bare, 'chart').retired.places.size, 0);
  assert.throws((): unknown => chartDef({ ...bare, retired: { skills: { old: 3 } } }, 'chart'), /chart\.retired\.skills/);
  const wrong = { ...content, chart: { ...content.chart, retired: { places: new Map<string, string>([['blade_millrace', 'nowhere']]), skills: new Map<string, string>([['cleave', 'no_such']]) } } };
  const lines: string[] = chartProblems(wrong);
  assert.ok(lines.includes('retired place blade_millrace is still on the chart'));
  assert.ok(lines.includes('retired place blade_millrace becomes unknown place nowhere'));
  assert.ok(lines.includes('retired skill cleave can still be learned'));
  assert.ok(lines.includes('retired skill cleave becomes unknown skill no_such'));
});
