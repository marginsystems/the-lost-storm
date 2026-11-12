import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChartPath } from '../sim/content/types.ts';
import type { MilestoneRule } from '../sim/measure.ts';
import { planFor, POLICIES, readPolicies } from './simulate-policies.ts';
import { CONTENT } from './simulate-run.ts';

void test('every build names real chart paths and real skills, and one build follows each path', (): void => {
  const paths: string[] = CONTENT.chart.paths.map((path: ChartPath): string => path.id);
  for (const build of POLICIES.builds.values()) {
    for (const path of build.paths) assert.ok(paths.includes(path), `${build.name} names ${path}`);
    for (const skill of build.skills) assert.ok(CONTENT.skills.has(skill), `${build.name} names ${skill}`);
  }
  for (const path of paths) assert.ok([...POLICIES.builds.values()].some((build): boolean => build.paths.length === 1 && build.paths[0] === path), `no build for ${path}`);
});

void test('the skill policies span careful to poor and the milestones end on the end card', (): void => {
  for (const name of ['careful', 'average', 'poor']) assert.ok(POLICIES.skills.has(name), name);
  assert.equal(POLICIES.skills.get('poor')?.habits.dodges, false);
  assert.ok(CONTENT.rarities.some((rarity): boolean => rarity.id === POLICIES.rare));
  assert.equal(POLICIES.milestones.at(-1)?.name, POLICIES.endCard);
  assert.ok(POLICIES.milestones.some((rule: MilestoneRule): boolean => rule.name === 'found_blade'));
  const careful = POLICIES.skills.get('careful');
  const mixed = POLICIES.builds.get('mixed');
  assert.ok(careful !== undefined && mixed !== undefined);
  assert.equal(planFor(careful, mixed).name, 'careful/mixed');
});

void test('a policy file with a missing field is refused', (): void => {
  assert.throws((): unknown => readPolicies({ skills: { x: { dodges: true } }, builds: {}, milestones: [], endCard: 'e', rare: 'rare', windows: [], sampleMinutes: 5 }));
});

void test('sample minutes and drop windows must be above zero', (): void => {
  const base = { skills: {}, builds: {}, milestones: [], endCard: 'e', rare: 'rare', windows: [10], sampleMinutes: 5 };
  assert.doesNotThrow((): unknown => readPolicies(base));
  assert.throws((): unknown => readPolicies({ ...base, sampleMinutes: 0 }));
  assert.throws((): unknown => readPolicies({ ...base, windows: [10, -1] }));
});
